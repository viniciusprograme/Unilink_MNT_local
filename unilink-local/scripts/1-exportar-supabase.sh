#!/usr/bin/env bash
# Exporta dados + usuários do Supabase para ./dump (usa Docker, não precisa instalar pg_dump).
# Antes:  export SUPABASE_DB_URL='postgresql://postgres:SENHA@db.xxxx.supabase.co:5432/postgres'
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL com a string de conexao do Supabase}"
mkdir -p dump

echo ">> Exportando dados do schema public..."
docker run --rm -v "$PWD/dump:/dump" postgres:17 pg_dump "$SUPABASE_DB_URL" \
  --data-only --no-owner --no-privileges -Fc \
  -t public.chamados_unilink -t public.chamado_eventos -t public.chamado_evidencias \
  -t public.chamado_status_historico -t public.perfis_usuario -t public.admin_auditoria \
  -f /dump/public_data.dump

echo ">> Exportando usuarios (auth.users)..."
docker run --rm -v "$PWD/dump:/dump" postgres:17 psql "$SUPABASE_DB_URL" \
  -c "\copy (select id, email, encrypted_password, created_at, last_sign_in_at from auth.users order by created_at) to '/dump/usuarios.csv' csv header"

echo ">> Pronto. Arquivos em ./dump:"
ls -lh dump
echo "(dump/ contem hashes de senha: NAO commitar e apagar depois de migrar)"
