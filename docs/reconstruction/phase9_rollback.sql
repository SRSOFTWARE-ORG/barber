-- =====================================================================
-- FASE 9 — Rollback idempotente
-- =====================================================================
drop trigger if exists trg_fae_receipts_ins   on public.payout_receipts;
drop trigger if exists trg_fae_receipts_del   on public.payout_receipts;
drop trigger if exists trg_fae_payouts        on public.payouts;
drop trigger if exists trg_fae_period_closings on public.period_closings;
drop trigger if exists trg_fae_revenue_splits on public.revenue_splits;

drop function if exists public.tg_fae_receipts()        cascade;
drop function if exists public.tg_fae_payouts()         cascade;
drop function if exists public.tg_fae_period_closings() cascade;
drop function if exists public.tg_fae_revenue_splits()  cascade;
drop function if exists public.tg_fae_no_mutate()       cascade;

drop function if exists public.register_accounting_export(uuid, date, date, public.export_format, text, text, text) cascade;
drop function if exists public.accounting_ledger(uuid, date, date) cascade;

drop view  if exists public.v_financial_timeline;
drop table if exists public.accounting_exports       cascade;
drop table if exists public.financial_audit_events   cascade;

do $$
begin
  if exists (select 1 from pg_type where typname='export_format')  then drop type public.export_format;  end if;
  if exists (select 1 from pg_type where typname='fin_audit_kind') then drop type public.fin_audit_kind; end if;
end$$;
