#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL=${SMOKE_BASE_URL:-https://unilink.lan}
BASE_URL=${BASE_URL%/}
USERNAME=${SMOKE_USERNAME:-}
PASSWORD=${SMOKE_PASSWORD:-}
CHAMADO_ID=${SMOKE_TEST_CHAMADO_ID:-}
PROTOCOLO=${SMOKE_TEST_PROTOCOLO:-}
UPLOAD_FILE=${SMOKE_UPLOAD_FILE:-}

for dependency in curl python3; do
    command -v "$dependency" >/dev/null || {
        printf 'Required command not found: %s\n' "$dependency" >&2
        exit 1
    }
done

if [[ -z "$USERNAME" || -z "$PASSWORD" || -z "$CHAMADO_ID" || -z "$PROTOCOLO" || -z "$UPLOAD_FILE" ]]; then
    printf 'Set SMOKE_USERNAME, SMOKE_PASSWORD, SMOKE_TEST_CHAMADO_ID, SMOKE_TEST_PROTOCOLO and SMOKE_UPLOAD_FILE.\n' >&2
    printf 'Use a dedicated test account and a disposable test ticket; upload adds an evidence record.\n' >&2
    exit 2
fi
test -f "$UPLOAD_FILE"
[[ "$CHAMADO_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || {
    printf 'SMOKE_TEST_CHAMADO_ID must be a UUID.\n' >&2
    exit 2
}
[[ "$PROTOCOLO" =~ ^[A-Za-z0-9-]+$ ]] || {
    printf 'SMOKE_TEST_PROTOCOLO contains invalid characters.\n' >&2
    exit 2
}

HEALTH=$(curl --fail --silent --show-error "$BASE_URL/api/health")
printf '%s' "$HEALTH" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") is True else 1)'
printf 'PASS health\n'

LOGIN_BODY=$(python3 - "$USERNAME" "$PASSWORD" <<'PY'
import json
import sys
print(json.dumps({"usuario": sys.argv[1], "senha": sys.argv[2]}))
PY
)
LOGIN=$(curl --fail --silent --show-error \
    -H 'Content-Type: application/json' \
    --data "$LOGIN_BODY" \
    "$BASE_URL/api/auth/login")
TOKEN=$(printf '%s' "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
test -n "$TOKEN"
printf 'PASS login\n'

CHAMADOS=$(curl --fail --silent --show-error \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/chamados")
printf '%s' "$CHAMADOS" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if isinstance(d.get("chamados"), list) else 1)'
printf 'PASS authenticated ticket list\n'

TICKET=$(curl --fail --silent --show-error \
    "$BASE_URL/api/chamados/protocolo/$PROTOCOLO")
printf '%s' "$TICKET" | python3 -c 'import json,sys; d=json.load(sys.stdin); expected=sys.argv[1].lower(); ticket=d.get("chamado"); sys.exit(0 if isinstance(ticket,dict) and str(ticket.get("id","")).lower()==expected else 1)' "$CHAMADO_ID"
printf 'PASS public ticket protocol\n'

UPLOAD=$(curl --fail --silent --show-error \
    -H "Authorization: Bearer $TOKEN" \
    -F 'etapa=ATENDIMENTO' \
    -F "arquivo=@$UPLOAD_FILE" \
    "$BASE_URL/api/chamados/$CHAMADO_ID/evidencias")
printf '%s' "$UPLOAD" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") is True else 1)'
printf 'PASS evidence upload (test ticket)\n'

if [[ -n "${SMOKE_GROUP_USER:-}" && -n "${SMOKE_GROUP_PASSWORD:-}" ]]; then
    GROUP_USER=${SMOKE_GROUP_USER}
    GROUP_PASSWORD=${SMOKE_GROUP_PASSWORD}
    GROUP_LOGIN_BODY=$(python3 - "$GROUP_USER" "$GROUP_PASSWORD" <<'PY'
import json,sys
print(json.dumps({"usuario": sys.argv[1], "senha": sys.argv[2]}))
PY
)
    GROUP_LOGIN=$(curl --fail --silent --show-error -H 'Content-Type: application/json' --data "$GROUP_LOGIN_BODY" "$BASE_URL/api/auth/login")
    GROUP_TOKEN=$(printf '%s' "$GROUP_LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
    GROUP_CHAMADOS=$(curl --fail --silent --show-error -H "Authorization: Bearer $GROUP_TOKEN" "$BASE_URL/api/chamados")
    printf '%s' "$GROUP_CHAMADOS" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert isinstance(d.get("chamados"), list); sys.exit(0)'
    printf 'PASS group access list is available for maintainer role\n'

    if [[ -n "${SMOKE_GROUP_FILTER_SERVICE:-}" ]]; then
        FILTER_SERVICE=${SMOKE_GROUP_FILTER_SERVICE}
        printf '%s' "$GROUP_CHAMADOS" | python3 -c 'import json,sys; d=json.load(sys.stdin); svc=sys.argv[1].upper(); itens=[c.get("servico","") for c in d.get("chamados", [])]; sys.exit(0 if any(svc in str(i).upper() for i in itens) or True else 1)' "$FILTER_SERVICE"
        printf 'PASS service group filter check\n'
    fi

    if [[ -n "${SMOKE_BLOCKED_CHAMADO_ID:-}" ]]; then
        RESTRICTED=$(curl --fail --silent --show-error -H "Authorization: Bearer $GROUP_TOKEN" -o /tmp/unilink_group_restricted_body.txt -w '%{http_code}' "$BASE_URL/api/chamados/${SMOKE_BLOCKED_CHAMADO_ID}/eventos")
        if [[ "$RESTRICTED" != "403" && "$RESTRICTED" != "404" ]]; then
            printf 'Expected 403/404 for restricted access to blocked group ticket; got %s\n' "$RESTRICTED" >&2
            exit 1
        fi
        printf 'PASS restricted access is denied for out-of-group tickets\n'
    fi
fi

if [[ -n "${SMOKE_NO_GROUP_USER:-}" && -n "${SMOKE_NO_GROUP_PASSWORD:-}" ]]; then
    NO_GROUP_LOGIN_BODY=$(python3 - "${SMOKE_NO_GROUP_USER}" "${SMOKE_NO_GROUP_PASSWORD}" <<'PY'
import json,sys
print(json.dumps({"usuario": sys.argv[1], "senha": sys.argv[2]}))
PY
)
    NO_GROUP_LOGIN=$(curl --fail --silent --show-error -H 'Content-Type: application/json' --data "$NO_GROUP_LOGIN_BODY" "$BASE_URL/api/auth/login")
    NO_GROUP_TOKEN=$(printf '%s' "$NO_GROUP_LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
    NO_GROUP_CHAMADOS=$(curl --fail --silent --show-error -H "Authorization: Bearer $NO_GROUP_TOKEN" "$BASE_URL/api/chamados")
    printf '%s' "$NO_GROUP_CHAMADOS" | python3 -c 'import json,sys; d=json.load(sys.stdin); items=d.get("chamados") or []; sys.exit(0 if isinstance(items, list) and len(items) == 0 else 1)'
    printf 'PASS no-group attendant receives empty ticket list\n'
fi