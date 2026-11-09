#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

cd "$(dirname "$0")/.."

BACKUP_ROOT=${BACKUP_ROOT:-/mnt/backup/unilink}
BACKUP_ROOT=$(realpath -m "$BACKUP_ROOT")
BACKUP_MOUNTPOINT=${BACKUP_MOUNTPOINT:-/mnt/backup}
BACKUP_REQUIRE_MOUNT=${BACKUP_REQUIRE_MOUNT:-true}
BACKUP_OFFSITE_DIR=${BACKUP_OFFSITE_DIR:-}
BACKUP_OFFSITE_MOUNTPOINT=${BACKUP_OFFSITE_MOUNTPOINT:-}
BACKUP_AGE_RECIPIENT=${BACKUP_AGE_RECIPIENT:-}
BACKUP_ALERT_COMMAND=${BACKUP_ALERT_COMMAND:-}
TIMESTAMP=$(date +%F_%H%M%S)
TMP_DIR=
OFFSITE_TMP=

cleanup() {
    if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
        rm -rf -- "$TMP_DIR"
    fi
    if [[ -n "$OFFSITE_TMP" && -f "$OFFSITE_TMP" ]]; then
        rm -f -- "$OFFSITE_TMP"
    fi
}

alert_failure() {
    local message=$1
    printf '%s\n' "$message" >&2
    if [[ -n "$BACKUP_ALERT_COMMAND" ]]; then
        if ! "$BACKUP_ALERT_COMMAND" "$message"; then
            printf 'Backup alert command failed: %s\n' "$BACKUP_ALERT_COMMAND" >&2
        fi
    fi
}

on_error() {
    local status=$?
    trap - ERR
    alert_failure "UNILINK backup failed on $(hostname) at $(date --iso-8601=seconds)"
    exit "$status"
}

prune_snapshots() {
    local directory=$1 pattern=$2 retention=$3
    local snapshots=()
    local snapshot
    while IFS= read -r snapshot; do
        [[ "$snapshot" =~ $pattern ]] && snapshots+=("$directory/$snapshot")
    done < <(find "$directory" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)

    while ((${#snapshots[@]} > retention)); do
        rm -rf -- "${snapshots[0]}"
        snapshots=("${snapshots[@]:1}")
    done
}

prune_encrypted_snapshots() {
    local directory=$1 pattern=$2 retention=$3
    local snapshots=()
    local snapshot
    while IFS= read -r snapshot; do
        [[ "$snapshot" =~ $pattern ]] && snapshots+=("$directory/$snapshot")
    done < <(find "$directory" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | sort)

    while ((${#snapshots[@]} > retention)); do
        rm -f -- "${snapshots[0]}"
        snapshots=("${snapshots[@]:1}")
    done
}

encrypt_offsite() {
    local source=$1 directory=$2 filename=$3
    OFFSITE_TMP=$(mktemp "$directory/.${filename}.XXXXXX")
    tar -C "$source" -czf - . | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$OFFSITE_TMP"
    test -s "$OFFSITE_TMP"
    mv "$OFFSITE_TMP" "$directory/$filename"
    OFFSITE_TMP=
}

trap cleanup EXIT
trap on_error ERR

command -v docker >/dev/null
command -v sha256sum >/dev/null
command -v tar >/dev/null

if [[ "$BACKUP_REQUIRE_MOUNT" == true ]] && ! mountpoint -q "$BACKUP_MOUNTPOINT"; then
    alert_failure "UNILINK backup mount is not available: $BACKUP_MOUNTPOINT"
    exit 1
fi

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly"
TMP_DIR=$(mktemp -d "$BACKUP_ROOT/.tmp.XXXXXX")

docker compose exec -T db pg_dump -U unilink -Fc unilink > "$TMP_DIR/database.dump"
test -s "$TMP_DIR/database.dump"
docker run --rm -v "$TMP_DIR:/backup:ro" postgres:17 pg_restore --list /backup/database.dump >/dev/null

docker compose exec -T api tar -C /app/uploads -czf - . > "$TMP_DIR/uploads.tar.gz"
test -s "$TMP_DIR/uploads.tar.gz"
tar -tzf "$TMP_DIR/uploads.tar.gz" >/dev/null

(cd "$TMP_DIR" && sha256sum database.dump uploads.tar.gz > SHA256SUMS)

DAILY_SNAPSHOT="$BACKUP_ROOT/daily/$TIMESTAMP"
test ! -e "$DAILY_SNAPSHOT"
mv "$TMP_DIR" "$DAILY_SNAPSHOT"
TMP_DIR=

if [[ $(date +%u) == 7 ]]; then
    WEEKLY_SNAPSHOT="$BACKUP_ROOT/weekly/$(date +%G-W%V)"
    if [[ ! -e "$WEEKLY_SNAPSHOT" ]]; then
        cp -a "$DAILY_SNAPSHOT" "$WEEKLY_SNAPSHOT"
    fi
fi

if [[ $(date +%d) == 01 ]]; then
    MONTHLY_SNAPSHOT="$BACKUP_ROOT/monthly/$(date +%Y-%m)"
    if [[ ! -e "$MONTHLY_SNAPSHOT" ]]; then
        cp -a "$DAILY_SNAPSHOT" "$MONTHLY_SNAPSHOT"
    fi
fi

prune_snapshots "$BACKUP_ROOT/daily" '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$' 14
prune_snapshots "$BACKUP_ROOT/weekly" '^[0-9]{4}-W[0-9]{2}$' 8
prune_snapshots "$BACKUP_ROOT/monthly" '^[0-9]{4}-[0-9]{2}$' 12

if [[ -n "$BACKUP_OFFSITE_DIR" ]]; then
    BACKUP_OFFSITE_DIR=$(realpath -m "$BACKUP_OFFSITE_DIR")
    command -v age >/dev/null
    if [[ -z "$BACKUP_AGE_RECIPIENT" ]]; then
        alert_failure 'Set BACKUP_AGE_RECIPIENT to the offsite age public recipient.'
        exit 1
    fi
    if [[ -n "$BACKUP_OFFSITE_MOUNTPOINT" ]] && ! mountpoint -q "$BACKUP_OFFSITE_MOUNTPOINT"; then
        alert_failure "UNILINK offsite mount is not available: $BACKUP_OFFSITE_MOUNTPOINT"
        exit 1
    fi
    BACKUP_ROOT_REAL=$(realpath -m "$BACKUP_ROOT")
    BACKUP_OFFSITE_REAL=$(realpath -m "$BACKUP_OFFSITE_DIR")
    case "$BACKUP_OFFSITE_REAL/" in
        "$BACKUP_ROOT_REAL/"* )
            alert_failure 'Offsite destination must not be inside BACKUP_ROOT.'
            exit 1
            ;;
    esac
    case "$BACKUP_ROOT_REAL/" in
        "$BACKUP_OFFSITE_REAL/"* )
            alert_failure 'Offsite destination must not contain BACKUP_ROOT.'
            exit 1
            ;;
    esac
    mkdir -p "$BACKUP_OFFSITE_DIR/daily" "$BACKUP_OFFSITE_DIR/weekly" "$BACKUP_OFFSITE_DIR/monthly"
    encrypt_offsite "$DAILY_SNAPSHOT" "$BACKUP_OFFSITE_DIR/daily" "$TIMESTAMP.tar.gz.age"
    if [[ -n "${WEEKLY_SNAPSHOT:-}" && -e "$WEEKLY_SNAPSHOT" ]]; then
        WEEKLY_NAME=$(basename "$WEEKLY_SNAPSHOT")
        if [[ ! -e "$BACKUP_OFFSITE_DIR/weekly/$WEEKLY_NAME.tar.gz.age" ]]; then
            encrypt_offsite "$WEEKLY_SNAPSHOT" "$BACKUP_OFFSITE_DIR/weekly" "$WEEKLY_NAME.tar.gz.age"
        fi
    fi
    if [[ -n "${MONTHLY_SNAPSHOT:-}" && -e "$MONTHLY_SNAPSHOT" ]]; then
        MONTHLY_NAME=$(basename "$MONTHLY_SNAPSHOT")
        if [[ ! -e "$BACKUP_OFFSITE_DIR/monthly/$MONTHLY_NAME.tar.gz.age" ]]; then
            encrypt_offsite "$MONTHLY_SNAPSHOT" "$BACKUP_OFFSITE_DIR/monthly" "$MONTHLY_NAME.tar.gz.age"
        fi
    fi
    prune_encrypted_snapshots "$BACKUP_OFFSITE_DIR/daily" '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.tar\.gz\.age$' 14
    prune_encrypted_snapshots "$BACKUP_OFFSITE_DIR/weekly" '^[0-9]{4}-W[0-9]{2}\.tar\.gz\.age$' 8
    prune_encrypted_snapshots "$BACKUP_OFFSITE_DIR/monthly" '^[0-9]{4}-[0-9]{2}\.tar\.gz\.age$' 12
else
    printf 'WARNING: BACKUP_OFFSITE_DIR is not configured; this backup has no offsite copy.\n' >&2
fi

printf 'Backup verified: %s\n' "$DAILY_SNAPSHOT"
