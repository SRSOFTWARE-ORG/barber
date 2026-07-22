-- =====================================================================
-- FASE 4 — ROLLBACK / LIMPEZA (idempotente)
-- Reverte com segurança tudo que a Fase 4 criou.
-- NÃO toca em nada das fases 1/2/3.
-- ATENÇÃO: apaga dados de clientes, endereços e notas.
-- =====================================================================

begin;

-- 1) Triggers específicos
drop trigger if exists trg_clients_updated_at        on public.clients;
drop trigger if exists trg_client_addr_updated_at    on public.client_addresses;
drop trigger if exists trg_client_addr_coherence     on public.client_addresses;
drop trigger if exists trg_client_note_coherence     on public.client_notes;
drop trigger if exists audit_clients                 on public.clients;
drop trigger if exists audit_client_addresses        on public.client_addresses;
drop trigger if exists audit_client_notes            on public.client_notes;

-- 2) Policies (opcional — os DROPs abaixo já removem via CASCADE nas tabelas,
--    mas listamos para caso alguém queira preservar as tabelas.)
do $$
declare r record;
begin
  for r in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public'
       and tablename in ('clients','client_addresses','client_notes')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

-- 3) Tabelas (ordem inversa das FKs)
drop table if exists public.client_notes      cascade;
drop table if exists public.client_addresses  cascade;
drop table if exists public.clients           cascade;

-- 4) Funções auxiliares da Fase 4
drop function if exists public.tg_client_addr_coherence() cascade;
drop function if exists public.tg_client_note_coherence() cascade;

-- 5) Enums (só remove se ninguém mais depende)
do $$
begin
  if exists (select 1 from pg_type where typname = 'client_status') then
    begin
      drop type public.client_status;
    exception when dependent_objects_still_exist then
      raise notice 'client_status ainda em uso — mantido';
    end;
  end if;

  if exists (select 1 from pg_type where typname = 'client_gender') then
    begin
      drop type public.client_gender;
    exception when dependent_objects_still_exist then
      raise notice 'client_gender ainda em uso — mantido';
    end;
  end if;
end$$;

commit;

-- Verificação:
select 'clients removida'  as check, to_regclass('public.clients')          is null as ok
union all
select 'addresses removida',           to_regclass('public.client_addresses')  is null
union all
select 'notes removida',                to_regclass('public.client_notes')      is null;
-- =====================================================================
