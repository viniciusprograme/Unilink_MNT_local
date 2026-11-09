#!/usr/bin/env bash
# Importa ./dump para o Postgres local (container "db"). Rodar DEPOIS de criar o .env.
set -euo pipefail
cd "$(dirname "$0")/.."
test -f dump/public_data.dump || { echo "Falta dump/public_data.dump (rode o script 1)"; exit 1; }
test -f dump/usuarios.csv     || { echo "Falta dump/usuarios.csv (rode o script 1)"; exit 1; }

echo ">> Subindo o banco..."
docker compose up -d db
until docker compose exec -T db pg_isready -U unilink -d unilink >/dev/null 2>&1; do sleep 2; done

PSQL=(docker compose exec -T db psql -U unilink -d unilink -v ON_ERROR_STOP=1)

echo ">> Verificando que o banco esta vazio..."
N=$("${PSQL[@]}" -tAc "select (select count(*) from usuarios) + (select count(*) from chamados_unilink)")
if [ "$N" != "0" ]; then
  echo "O banco local ja tem dados ($N linhas). Para reimportar do zero: docker compose down -v  e suba de novo."
  exit 1
fi

echo ">> Importando usuarios (hash bcrypt preservado)..."
"${PSQL[@]}" <<'SQL'
SET session_replication_role = replica;
\copy usuarios (id, email, senha_hash, criado_em, ultimo_acesso_em) from '/dump/usuarios.csv' csv header
SQL

echo ">> Importando chamados, eventos, evidencias, historico, perfis, auditoria..."
docker compose exec -T db pg_restore -U unilink -d unilink --data-only --disable-triggers --no-owner /dump/public_data.dump

echo ">> Garantindo perfil para todo usuario..."
"${PSQL[@]}" -c "insert into perfis_usuario (user_id, nome, papel) select id, split_part(email,'@',1), 'atendente' from usuarios on conflict do nothing;"

echo ">> Conferencia (compare com o painel do Supabase):"
"${PSQL[@]}" -c "select 'usuarios' as tabela, count(*) from usuarios
 union all select 'perfis_usuario', count(*) from perfis_usuario
 union all select 'chamados_unilink', count(*) from chamados_unilink
 union all select 'chamado_eventos', count(*) from chamado_eventos
 union all select 'chamado_evidencias', count(*) from chamado_evidencias
 union all select 'chamado_status_historico', count(*) from chamado_status_historico
 union all select 'admin_auditoria', count(*) from admin_auditoria;"

echo ">> Administradores ativos:"
"${PSQL[@]}" -c "select u.email, p.papel, p.ativo from perfis_usuario p join usuarios u on u.id=p.user_id where p.papel='administrador';"
