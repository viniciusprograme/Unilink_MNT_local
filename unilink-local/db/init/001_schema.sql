-- ==========================================================
-- UNILINK — Schema PostgreSQL local (consolidado)
-- ----------------------------------------------------------
-- Junta schema.sql + migrations 002–008 do projeto original,
-- SEM nada específico do Supabase (auth.users, RLS, realtime,
-- storage.buckets). A segurança agora é feita pela API.
--
-- Roda automaticamente na PRIMEIRA subida do container "db"
-- (docker-entrypoint-initdb.d). Para recriar do zero:
--   docker compose down -v   (apaga o volume do banco!)
-- ==========================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------
-- USUÁRIOS (substitui auth.users do Supabase)
-- Os hashes bcrypt exportados do Supabase funcionam aqui.
-- ----------------------------------------------------------
create table if not exists usuarios (
    id                uuid primary key default gen_random_uuid(),
    email             text not null,
    senha_hash        text not null,
    criado_em         timestamptz not null default now(),
    ultimo_acesso_em  timestamptz
);
create unique index if not exists idx_usuarios_email_lower on usuarios (lower(email));

-- ----------------------------------------------------------
-- PERFIS (papel, ativo, 1º acesso, tentativas de login)
-- ----------------------------------------------------------
create table if not exists perfis_usuario (
    user_id              uuid primary key references usuarios(id) on delete cascade,
    nome                 text,
    papel                text not null default 'atendente'
                         check (papel in ('solicitante', 'atendente', 'supervisor', 'administrador')),
    ativo                boolean not null default true,
    precisa_trocar_senha boolean not null default false,
    tentativas_login     integer not null default 0,
    bloqueado_ate        timestamptz,
    ultima_tentativa_em  timestamptz,
    mostrar_senha        boolean not null default false,
    criado_em            timestamptz not null default now(),
    atualizado_em        timestamptz not null default now()
);
create index if not exists idx_perfis_bloqueado on perfis_usuario (bloqueado_ate) where bloqueado_ate is not null;
create index if not exists idx_perfis_papel_ativo on perfis_usuario (papel, ativo);

create table if not exists grupos_servico (
    id         uuid primary key default gen_random_uuid(),
    codigo     text not null unique,
    nome       text not null,
    ativo      boolean not null default true,
    criado_em  timestamptz not null default now()
);
create index if not exists idx_grupos_servico_ativo on grupos_servico (ativo, codigo);

create table if not exists usuario_grupos (
    user_id    uuid not null references perfis_usuario(user_id) on delete cascade,
    grupo_id   uuid not null references grupos_servico(id) on delete cascade,
    criado_em  timestamptz not null default now(),
    criado_por uuid references usuarios(id) on delete set null,
    primary key (user_id, grupo_id)
);
create index if not exists idx_usuario_grupos_grupo on usuario_grupos (grupo_id);

insert into grupos_servico (codigo, nome)
values
    ('PINTURA', 'Pintura'),
    ('ELETRICA', 'Elétrica'),
    ('SOLDA', 'Solda'),
    ('MECANICA', 'Mecânica'),
    ('BORRACHARIA', 'Borracharia'),
    ('TRANSLADO', 'Translado')
on conflict (codigo) do nothing;

create or replace function normalizar_servicos(valor text) returns text[] language sql immutable as $$
    select array(
        select upper(trim(item))
        from unnest(string_to_array(coalesce(valor, ''), ',')) as item
        where trim(item) <> '' and upper(trim(item)) <> 'NÃO INFORMADO'
    );
$$;

create or replace function tocar_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end; $$;

drop trigger if exists trg_perfis_atualizado_em on perfis_usuario;
create trigger trg_perfis_atualizado_em before update on perfis_usuario
    for each row execute function tocar_atualizado_em();

-- ----------------------------------------------------------
-- CHAMADOS
-- ----------------------------------------------------------
create table if not exists chamados_unilink (
    id                  uuid primary key default gen_random_uuid(),
    protocolo           text not null,
    unidade             text not null default 'MATRIZ' check (unidade in ('MATRIZ', 'PECÉM')),
    prioridade          text not null check (prioridade in ('Urgente', 'Alta', 'Média', 'Baixa')),
    equipamento         text not null,
    servico             text not null,
    descricao           text not null,
    localizacao         text not null,
    status              text default 'ABERTO'
                        check (status in ('ABERTO','EM_ANALISE','ATRIBUIDO','EM_ATENDIMENTO','AGUARDANDO_USUARIO','RESOLVIDO','FECHADO')),
    em_atendimento      boolean not null default false,
    concluido           boolean not null default false,
    servico_feito       text,
    pendencia           text,
    observacoes         text,
    itens_concluidos    text[] default '{}',
    conclusao_parcial   boolean not null default false,
    data_abertura       timestamptz not null default now(),
    data_encerramento   timestamptz,
    atualizado_em       timestamptz not null default now(),
    atribuido_para      uuid references usuarios(id),
    atribuido_para_nome text,
    atribuido_em        timestamptz,
    criado_por          uuid references usuarios(id),
    encerrado_por       uuid references usuarios(id)
);

create unique index if not exists idx_chamados_protocolo on chamados_unilink (protocolo);
create index if not exists idx_chamados_concluido on chamados_unilink (concluido);
create index if not exists idx_chamados_unidade on chamados_unilink (unidade);
create index if not exists idx_chamados_equipamento on chamados_unilink (lower(equipamento));
create index if not exists idx_chamados_status on chamados_unilink (status);
create index if not exists idx_chamados_data_abertura on chamados_unilink (data_abertura desc);
create index if not exists idx_chamados_atualizado on chamados_unilink (atualizado_em desc);
create index if not exists idx_chamados_atribuido_para on chamados_unilink (atribuido_para);
create index if not exists idx_chamados_criado_por on chamados_unilink (criado_por);
create index if not exists idx_chamados_prioridade on chamados_unilink (prioridade);
create index if not exists idx_chamados_conclusao_parcial on chamados_unilink (conclusao_parcial);

comment on column chamados_unilink.itens_concluidos is 'Serviços já concluídos quando o encerramento é parcial (ex: {PINTURA, ELETRICA})';

-- Protocolo público amigável (ex: UNK-20260825-A1B2C3)
create or replace function gerar_protocolo_chamado() returns trigger language plpgsql as $$
begin
    if new.protocolo is null then
        new.protocolo := 'UNK-' || to_char(coalesce(new.data_abertura, now()), 'YYYYMMDD')
                         || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 6));
    end if;
    return new;
end; $$;
drop trigger if exists trg_gerar_protocolo on chamados_unilink;
create trigger trg_gerar_protocolo before insert on chamados_unilink
    for each row execute function gerar_protocolo_chamado();

-- updated_at
create or replace function tocar_chamado_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end; $$;
drop trigger if exists trg_chamado_atualizado on chamados_unilink;
create trigger trg_chamado_atualizado before update on chamados_unilink
    for each row execute function tocar_chamado_atualizado();

-- STATUS é a fonte da verdade; booleans legados são derivados (versão final da migration 005)
create or replace function sincronizar_status_chamado_v2() returns trigger language plpgsql as $$
begin
    if tg_op = 'INSERT' or new.status is distinct from old.status then
        new.em_atendimento := new.status = 'EM_ATENDIMENTO';
        new.concluido := new.status in ('RESOLVIDO','FECHADO');
        if new.status in ('RESOLVIDO','FECHADO') and new.data_encerramento is null then
            new.data_encerramento := now();
        end if;
        return new;
    end if;
    if new.concluido = true then new.status := 'FECHADO';
    elsif new.em_atendimento = true and (old.status is null or old.status in ('ABERTO','EM_ANALISE','ATRIBUIDO')) then new.status := 'EM_ATENDIMENTO';
    elsif new.status is null then new.status := 'ABERTO';
    end if;
    return new;
end; $$;
drop trigger if exists trg_sincronizar_status_v2 on chamados_unilink;
create trigger trg_sincronizar_status_v2 before insert or update on chamados_unilink
    for each row execute function sincronizar_status_chamado_v2();

-- ----------------------------------------------------------
-- TIMELINE DE EVENTOS
-- ----------------------------------------------------------
create table if not exists chamado_eventos (
    id           uuid primary key default gen_random_uuid(),
    chamado_id   uuid not null references chamados_unilink(id) on delete cascade,
    tipo_evento  text not null check (tipo_evento in (
                     'ABERTURA', 'EM_ATENDIMENTO_INICIADO', 'EM_ATENDIMENTO_PAUSADO',
                     'EVIDENCIA_ADICIONADA', 'ENCERRAMENTO', 'OBSERVACAO')),
    descricao    text,
    usuario_id   uuid references usuarios(id) on delete set null,
    usuario_nome text,
    criado_em    timestamptz not null default now()
);
create index if not exists idx_eventos_chamado on chamado_eventos (chamado_id, criado_em);
create index if not exists idx_eventos_tipo on chamado_eventos (tipo_evento);

-- ----------------------------------------------------------
-- EVIDÊNCIAS (metadados; o arquivo fica no volume /app/uploads)
-- storage_path = <chamado_id>/<arquivo>, igual ao que era no bucket
-- ----------------------------------------------------------
create table if not exists chamado_evidencias (
    id                uuid primary key default gen_random_uuid(),
    chamado_id        uuid not null references chamados_unilink(id) on delete cascade,
    storage_path      text not null,
    nome_arquivo      text not null,
    tipo_mime         text not null check (tipo_mime in ('image/jpeg', 'image/png', 'image/webp')),
    tamanho_bytes     integer not null check (tamanho_bytes > 0 and tamanho_bytes <= 8388608),
    enviado_por       uuid references usuarios(id) on delete set null,
    enviado_por_nome  text,
    etapa             text not null default 'ABERTURA' check (etapa in ('ABERTURA', 'ATENDIMENTO', 'RESOLUCAO')),
    criado_em         timestamptz not null default now()
);
create index if not exists idx_evidencias_chamado on chamado_evidencias (chamado_id, criado_em);

-- ----------------------------------------------------------
-- HISTÓRICO DE STATUS (gravado por trigger)
-- ----------------------------------------------------------
create table if not exists chamado_status_historico (
    id               uuid primary key default gen_random_uuid(),
    chamado_id       uuid not null references chamados_unilink(id) on delete cascade,
    status_anterior  text,
    status_novo      text not null check (status_novo in ('ABERTO','EM_ANALISE','ATRIBUIDO','EM_ATENDIMENTO','AGUARDANDO_USUARIO','RESOLVIDO','FECHADO')),
    usuario_id       uuid references usuarios(id) on delete set null,
    usuario_nome     text,
    criado_em        timestamptz not null default now()
);
create index if not exists idx_status_hist_chamado on chamado_status_historico (chamado_id, criado_em desc);

create or replace function registrar_historico_status() returns trigger language plpgsql as $$
declare
    v_user uuid;
begin
    if tg_op = 'INSERT' then
        insert into chamado_status_historico (chamado_id, status_anterior, status_novo, usuario_id, usuario_nome)
        values (new.id, null, new.status, new.criado_por,
                (select email from usuarios where id = new.criado_por));
    elsif old.status is distinct from new.status then
        v_user := coalesce(new.atribuido_para, new.encerrado_por, old.atribuido_para);
        insert into chamado_status_historico (chamado_id, status_anterior, status_novo, usuario_id, usuario_nome)
        values (new.id, old.status, new.status, v_user,
                (select email from usuarios where id = v_user));
    end if;
    return new;
end; $$;
drop trigger if exists trg_historico_status on chamados_unilink;
create trigger trg_historico_status after insert or update of status on chamados_unilink
    for each row execute function registrar_historico_status();

-- ----------------------------------------------------------
-- AUDITORIA ADMINISTRATIVA (só a API escreve/lê)
-- ----------------------------------------------------------
create table if not exists admin_auditoria (
    id                uuid primary key default gen_random_uuid(),
    acao              text not null check (acao in (
                          'CRIAR_USUARIO','EXCLUIR_USUARIO','RESET_SENHA',
                          'ALTERAR_PAPEL','ALTERAR_GRUPOS','SUSPENDER_USUARIO','REATIVAR_USUARIO',
                          'DESBLOQUEAR_USUARIO','ATUALIZAR_USUARIO','PROMOVER','DESATIVAR')),
    alvo_usuario_id   uuid,
    alvo_usuario_nome text,
    feito_por         uuid references usuarios(id) on delete set null,
    feito_por_nome    text,
    detalhe           text,
    ip_origem         text,
    criado_em         timestamptz not null default now()
);
create index if not exists idx_admin_aud_alvo on admin_auditoria (alvo_usuario_id, criado_em desc);
create index if not exists idx_admin_aud_data on admin_auditoria (criado_em desc);
create index if not exists idx_admin_aud_acao on admin_auditoria (acao, criado_em desc);

-- ----------------------------------------------------------
-- VIEWS
-- ----------------------------------------------------------
create or replace view v_chamados_resumo as
select
    count(*) as total,
    count(*) filter (where status = 'ABERTO') as abertos,
    count(*) filter (where status = 'EM_ATENDIMENTO') as em_atendimento,
    count(*) filter (where status in ('RESOLVIDO','FECHADO')) as encerrados,
    count(*) filter (where status = 'AGUARDANDO_USUARIO') as aguardando_usuario,
    avg(extract(epoch from (data_encerramento - data_abertura))/3600) filter (where data_encerramento is not null) as tempo_medio_horas
from chamados_unilink;

create or replace view v_chamados_itens as
select id, protocolo, servico, itens_concluidos, observacoes, conclusao_parcial,
       case when servico is null or servico='' then 0 else array_length(string_to_array(servico, ','),1) end as total_itens,
       coalesce(array_length(itens_concluidos,1),0) as itens_feitos,
       case when servico is null or servico='' then 0
            else array_length(string_to_array(servico, ','),1) - coalesce(array_length(itens_concluidos,1),0) end as itens_pendentes
from chamados_unilink;
