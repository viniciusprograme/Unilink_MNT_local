-- idempotente: aplica em bancos existentes e em novas instalações
create table if not exists grupos_servico (
    id        uuid primary key default gen_random_uuid(),
    codigo    text not null unique,
    nome      text not null,
    ativo     boolean not null default true,
    criado_em timestamptz not null default now()
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

alter table admin_auditoria drop constraint if exists admin_auditoria_acao_check;
alter table admin_auditoria add constraint admin_auditoria_acao_check
    check (acao in (
        'CRIAR_USUARIO','EXCLUIR_USUARIO','RESET_SENHA',
        'ALTERAR_PAPEL','ALTERAR_GRUPOS','SUSPENDER_USUARIO','REATIVAR_USUARIO',
        'DESBLOQUEAR_USUARIO','ATUALIZAR_USUARIO','PROMOVER','DESATIVAR'));

-- Migração de bancos existentes: atendentes recebam acesso amplo e reduzam depois.
insert into usuario_grupos (user_id, grupo_id, criado_por)
select p.user_id, gs.id, p.user_id
from perfis_usuario p
join grupos_servico gs on true
where p.papel = 'atendente'
on conflict (user_id, grupo_id) do nothing;
