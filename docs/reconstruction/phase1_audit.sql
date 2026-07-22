-- =====================================================================
-- FASE 1 — AUDITORIA E MAPEAMENTO (READ-ONLY)
-- =====================================================================
-- Este script NÃO cria, altera ou apaga nada.
-- Rode no SQL Editor do Supabase e cole aqui a saída de cada bloco.
-- Cada bloco tem um cabeçalho "=== N. TÍTULO ===" para facilitar leitura.
-- =====================================================================

-- === 1. VERSÃO DO POSTGRES E EXTENSIONS ===
select version() as pg_version;

select extname, extversion
from pg_extension
order by extname;

-- === 2. SCHEMAS DE USUÁRIO ===
select nspname as schema
from pg_namespace
where nspname not in ('pg_catalog','information_schema','pg_toast')
  and nspname not like 'pg_temp_%'
  and nspname not like 'pg_toast_temp_%'
order by nspname;

-- === 3. TABELAS EM public + contagem de linhas ===
select
  c.relname as table_name,
  c.reltuples::bigint as approx_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  obj_description(c.oid, 'pg_class') as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- === 4. COLUNAS DE TODAS AS TABELAS public ===
select
  table_name, ordinal_position, column_name, data_type,
  is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- === 5. CHAVES PRIMÁRIAS E ÚNICAS ===
select
  tc.table_name, tc.constraint_name, tc.constraint_type,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.constraint_type in ('PRIMARY KEY','UNIQUE')
group by tc.table_name, tc.constraint_name, tc.constraint_type
order by tc.table_name;

-- === 6. FOREIGN KEYS (relacionamentos) ===
select
  tc.table_name as from_table,
  kcu.column_name as from_column,
  ccu.table_name as to_table,
  ccu.column_name as to_column,
  rc.delete_rule, rc.update_rule,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name
where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
order by from_table, from_column;

-- === 7. CHECK CONSTRAINTS ===
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'c' and connamespace = 'public'::regnamespace
order by table_name, conname;

-- === 8. ÍNDICES ===
select
  schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- === 9. RLS: STATUS POR TABELA ===
select
  n.nspname as schema, c.relname as table_name,
  c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- === 10. POLICIES ===
select
  schemaname, tablename, policyname, permissive, roles, cmd,
  qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- === 11. FUNÇÕES / SECURITY DEFINER ===
select
  n.nspname as schema, p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security,
  l.lanname as language
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
order by function_name;

-- === 12. TRIGGERS ===
select
  event_object_table as table_name, trigger_name,
  string_agg(event_manipulation, ',' order by event_manipulation) as events,
  action_timing, action_statement
from information_schema.triggers
where trigger_schema = 'public'
group by event_object_table, trigger_name, action_timing, action_statement
order by table_name, trigger_name;

-- === 13. VIEWS ===
select table_name, view_definition
from information_schema.views
where table_schema = 'public'
order by table_name;

-- === 14. TIPOS ENUM ===
select
  t.typname as enum_name,
  string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by t.typname
order by t.typname;

-- === 15. SEQUÊNCIAS ===
select sequence_name, data_type, start_value, minimum_value, maximum_value, increment
from information_schema.sequences
where sequence_schema = 'public'
order by sequence_name;

-- === 16. STORAGE BUCKETS ===
select id, name, public, created_at, updated_at, file_size_limit, allowed_mime_types
from storage.buckets
order by name;

-- === 17. POLICIES DE STORAGE ===
select policyname, cmd, qual as using_expr, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- === 18. AUTH: PROVEDORES HABILITADOS (contagem por provider_id) ===
select provider, count(*) as identities
from auth.identities
group by provider
order by provider;

-- === 19. AUTH: USUÁRIOS (contagem total, sem expor emails) ===
select
  count(*) as total_users,
  count(*) filter (where email_confirmed_at is not null) as confirmed,
  count(*) filter (where last_sign_in_at > now() - interval '30 days') as active_30d
from auth.users;

-- === 20. TABELAS ÓRFÃS: sem FK apontando para elas e sem FK saindo ===
with fk_out as (
  select distinct conrelid::regclass::text as t
  from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
),
fk_in as (
  select distinct confrelid::regclass::text as t
  from pg_constraint where contype = 'f' and confrelid::regnamespace = 'public'::regnamespace
)
select c.relname as possible_orphan_table
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and ('public.'||c.relname) not in (select t from fk_out)
  and ('public.'||c.relname) not in (select t from fk_in)
order by c.relname;

-- === 21. TABELAS SEM PRIMARY KEY ===
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and not exists (
    select 1 from pg_constraint pc
    where pc.conrelid = c.oid and pc.contype = 'p'
  )
order by c.relname;

-- === 22. TABELAS COM RLS DESLIGADA (potencial risco) ===
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by c.relname;

-- === 23. CRON JOBS (se pg_cron instalado) ===
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform 1;
    raise notice 'pg_cron presente — rode: select * from cron.job;';
  else
    raise notice 'pg_cron ausente';
  end if;
end $$;

-- Se pg_cron existir, execute manualmente:
-- select jobid, schedule, command, jobname, active from cron.job order by jobid;
