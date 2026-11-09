#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

BACKUP_ROOT=${BACKUP_ROOT:-/mnt/backup/unilink}
SNAPSHOT=${1:-}
RESTORE_TMP=
if [[ -z "$SNAPSHOT" ]]; then
    printf 'Usage: %s <daily-snapshot-directory>\n' "$0" >&2
    printf 'Example: %s %s/daily/2026-11-21_204500\n' "$0" "$BACKUP_ROOT" >&2
    exit 2
fi

cleanup() {
    if [[ -n "${RESTORE_PROJECT:-}" ]]; then
        docker compose -p "$RESTORE_PROJECT" down --volumes --remove-orphans >/dev/null 2>&1 || true
    fi
    if [[ -n "$RESTORE_TMP" && -d "$RESTORE_TMP" ]]; then
        rm -rf -- "$RESTORE_TMP"
    fi
}
trap cleanup EXIT

if [[ -f "$SNAPSHOT" && "$SNAPSHOT" == *.tar.gz.age ]]; then
    : "${BACKUP_AGE_IDENTITY:?Set BACKUP_AGE_IDENTITY to the private key for this encrypted snapshot}"
    command -v age >/dev/null
    RESTORE_TMP=$(mktemp -d)
    age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$RESTORE_TMP/snapshot.tar.gz" "$SNAPSHOT"
    mkdir "$RESTORE_TMP/snapshot"
    while IFS= read -r entry; do
        [[ "$entry" == /* || "$entry" == ../* || "$entry" == *'/../'* ]] && {
            printf 'Unsafe path in encrypted archive: %s\n' "$entry" >&2
            exit 1
        }
    done < <(tar -tzf "$RESTORE_TMP/snapshot.tar.gz")
    tar -xzf "$RESTORE_TMP/snapshot.tar.gz" -C "$RESTORE_TMP/snapshot"
    SNAPSHOT="$RESTORE_TMP/snapshot"
else
    if [[ "$SNAPSHOT" != /* ]]; then
        SNAPSHOT="$BACKUP_ROOT/daily/$SNAPSHOT"
    fi
    SNAPSHOT=$(realpath "$SNAPSHOT")
    BACKUP_BASE=$(realpath "$BACKUP_ROOT")
    case "$SNAPSHOT/" in
        "$BACKUP_BASE"/daily/*/) ;;
        *)
            printf 'Restore only accepts snapshots under %s/daily.\n' "$BACKUP_BASE" >&2
            exit 2
            ;;
    esac
fi

DB_DUMP="$SNAPSHOT/database.dump"
UPLOADS_ARCHIVE="$SNAPSHOT/uploads.tar.gz"
test -s "$DB_DUMP"
test -s "$UPLOADS_ARCHIVE"
(cd "$SNAPSHOT" && sha256sum --check SHA256SUMS)
docker run --rm -v "$SNAPSHOT:/backup:ro" postgres:17 pg_restore --list /backup/database.dump >/dev/null
tar -tzf "$UPLOADS_ARCHIVE" >/dev/null

RESTORE_PROJECT="unilink-restore-$(date +%s)-$$"
docker compose -p "$RESTORE_PROJECT" up -d db
ready=false
for _ in $(seq 1 60); do
    if docker compose -p "$RESTORE_PROJECT" exec -T db pg_isready -U unilink -d unilink >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 2
done
if [[ "$ready" != true ]]; then
    docker compose -p "$RESTORE_PROJECT" logs db >&2
    printf 'Temporary restore database did not become ready.\n' >&2
    exit 1
fi

docker compose -p "$RESTORE_PROJECT" exec -T db \
    pg_restore -U unilink -d unilink --clean --if-exists --no-owner --no-privileges --exit-on-error - \
    < "$DB_DUMP"

docker compose -p "$RESTORE_PROJECT" run --rm --no-deps --entrypoint tar api \
    -xzf - -C /app/uploads < "$UPLOADS_ARCHIVE"

docker compose -p "$RESTORE_PROJECT" exec -T db \
    psql -U unilink -d unilink -v ON_ERROR_STOP=1 -c \
    "select 'usuarios' as tabela, count(*) from usuarios
     union all select 'chamados_unilink', count(*) from chamados_unilink
     union all select 'chamado_evidencias', count(*) from chamado_evidencias;"

printf 'Restore test succeeded; the temporary database and uploads will be removed.\n'
