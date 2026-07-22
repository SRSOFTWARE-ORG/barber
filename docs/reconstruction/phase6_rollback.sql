-- =====================================================================
-- FASE 6 — ROLLBACK / LIMPEZA (idempotente)
-- ATENÇÃO: apaga serviços, vínculos e reservas.
-- =====================================================================
begin;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname='public'
       and tablename in ('service_categories','services','barber_services','bookings','booking_services')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

drop trigger if exists trg_recalc_total          on public.booking_services;
drop trigger if exists trg_bsv_coherence         on public.booking_services;
drop trigger if exists trg_booking_coherence     on public.bookings;
drop trigger if exists trg_bs_coherence          on public.barber_services;
drop trigger if exists trg_service_cat_coherence on public.services;
drop trigger if exists trg_svc_cat_updated_at    on public.service_categories;
drop trigger if exists trg_services_updated_at   on public.services;
drop trigger if exists trg_bookings_updated_at   on public.bookings;

drop trigger if exists audit_service_categories on public.service_categories;
drop trigger if exists audit_services           on public.services;
drop trigger if exists audit_barber_services    on public.barber_services;
drop trigger if exists audit_bookings           on public.bookings;
drop trigger if exists audit_booking_services   on public.booking_services;

alter table if exists public.bookings drop constraint if exists bookings_no_overlap_excl;

drop table if exists public.booking_services   cascade;
drop table if exists public.bookings           cascade;
drop table if exists public.barber_services    cascade;
drop table if exists public.services           cascade;
drop table if exists public.service_categories cascade;

drop function if exists public.tg_service_category_coherence() cascade;
drop function if exists public.tg_barber_service_coherence()   cascade;
drop function if exists public.tg_booking_coherence()          cascade;
drop function if exists public.tg_booking_service_coherence()  cascade;
drop function if exists public.tg_recalc_booking_total()       cascade;

do $$
begin
  if exists (select 1 from pg_type where typname='booking_status') then
    begin drop type public.booking_status; exception when dependent_objects_still_exist then
      raise notice 'booking_status ainda em uso — mantido'; end;
  end if;
end$$;

commit;

select 'service_categories removida' as check, to_regclass('public.service_categories') is null as ok
union all
select 'services removida',                    to_regclass('public.services')            is null
union all
select 'barber_services removida',             to_regclass('public.barber_services')     is null
union all
select 'bookings removida',                    to_regclass('public.bookings')            is null
union all
select 'booking_services removida',            to_regclass('public.booking_services')   is null;
