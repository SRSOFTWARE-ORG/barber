-- =====================================================================
-- FASE 8 — Rollback idempotente
-- =====================================================================
drop function if exists public.reopen_period(uuid) cascade;
drop function if exists public.close_period(uuid) cascade;
drop function if exists public.pay_payout(uuid, public.payout_method, text) cascade;
drop function if exists public.generate_closing(uuid, date, date) cascade;
drop function if exists public.preview_closing(uuid, date, date) cascade;

drop view if exists public.v_closing_summary;

drop table if exists public.payout_receipts cascade;
drop table if exists public.payout_splits   cascade;
drop table if exists public.payouts         cascade;
drop table if exists public.period_closings cascade;

-- Colunas adicionadas em revenue_splits
alter table public.revenue_splits
  drop column if exists paid_payout_id,
  drop column if exists paid_at;

do $$
begin
  if exists (select 1 from pg_type where typname='payout_method')  then drop type public.payout_method;  end if;
  if exists (select 1 from pg_type where typname='payout_status')  then drop type public.payout_status;  end if;
  if exists (select 1 from pg_type where typname='closing_status') then drop type public.closing_status; end if;
end$$;
