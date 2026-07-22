-- =====================================================================
-- FASE 7 — Rollback idempotente
-- =====================================================================
drop trigger if exists trg_booking_split on public.bookings;
drop function if exists public.tg_booking_generate_split() cascade;
drop function if exists public.check_coverage(uuid, uuid, date) cascade;
drop function if exists public.active_subscription_for_client(uuid) cascade;

drop view if exists public.v_monthly_barber_split;
drop view if exists public.v_monthly_coverage_report;

drop table if exists public.revenue_splits       cascade;
drop table if exists public.subscription_usage   cascade;
drop table if exists public.client_subscriptions cascade;
drop table if exists public.plan_services        cascade;
drop table if exists public.subscription_plans   cascade;

do $$
begin
  if exists (select 1 from pg_type where typname='subscription_status') then
    drop type public.subscription_status;
  end if;
  if exists (select 1 from pg_type where typname='billing_cycle') then
    drop type public.billing_cycle;
  end if;
end$$;
