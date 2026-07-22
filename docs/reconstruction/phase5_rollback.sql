-- =====================================================================
-- FASE 5 — ROLLBACK / LIMPEZA (idempotente)
-- Reverte tudo que a Fase 5 criou. Não toca em fases anteriores.
-- ATENÇÃO: apaga dados de barbeiros, vínculos, disponibilidades e folgas.
-- =====================================================================
begin;

-- Triggers
drop trigger if exists trg_barbers_updated_at        on public.barbers;
drop trigger if exists trg_avail_updated_at          on public.barber_availability;
drop trigger if exists trg_barber_unit_coherence     on public.barber_units;
drop trigger if exists trg_avail_coherence           on public.barber_availability;
drop trigger if exists trg_time_off_coherence        on public.barber_time_off;
drop trigger if exists audit_barbers                 on public.barbers;
drop trigger if exists audit_barber_units            on public.barber_units;
drop trigger if exists audit_barber_availability     on public.barber_availability;
drop trigger if exists audit_barber_time_off         on public.barber_time_off;

-- Policies
do $$
declare r record;
begin
  for r in
    select policyname, tablename
      from pg_policies
     where schemaname='public'
       and tablename in ('barbers','barber_units','barber_availability','barber_time_off')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

-- Tabelas
drop table if exists public.barber_time_off      cascade;
drop table if exists public.barber_availability  cascade;
drop table if exists public.barber_units         cascade;
drop table if exists public.barbers              cascade;

-- Funções
drop function if exists public.tg_barber_unit_coherence() cascade;
drop function if exists public.tg_avail_coherence()       cascade;
drop function if exists public.tg_time_off_coherence()    cascade;

-- Enums
do $$
begin
  if exists (select 1 from pg_type where typname='barber_status') then
    begin drop type public.barber_status; exception when dependent_objects_still_exist then
      raise notice 'barber_status ainda em uso — mantido'; end;
  end if;
  if exists (select 1 from pg_type where typname='time_off_reason') then
    begin drop type public.time_off_reason; exception when dependent_objects_still_exist then
      raise notice 'time_off_reason ainda em uso — mantido'; end;
  end if;
end$$;

commit;

select 'barbers removida'            as check, to_regclass('public.barbers')             is null as ok
union all
select 'barber_units removida',                to_regclass('public.barber_units')         is null
union all
select 'barber_availability removida',         to_regclass('public.barber_availability')  is null
union all
select 'barber_time_off removida',             to_regclass('public.barber_time_off')      is null;
