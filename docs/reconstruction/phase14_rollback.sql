-- =====================================================================
-- FASE 14 — Rollback (idempotente)
-- =====================================================================
DROP VIEW IF EXISTS public.v_platform_webhook_unprocessed;
DROP VIEW IF EXISTS public.v_platform_webhook_health;

DROP FUNCTION IF EXISTS public.platform_reconcile_payment(
  public.platform_provider,uuid,uuid,text,public.platform_payment_status,
  integer,text,text,timestamptz,jsonb);
DROP FUNCTION IF EXISTS public.platform_reconcile_invoice(
  public.platform_provider,uuid,uuid,text,public.platform_invoice_status,text,
  integer,integer,timestamptz,timestamptz,timestamptz,text,text,jsonb);
DROP FUNCTION IF EXISTS public.platform_reconcile_subscription(
  public.platform_provider,uuid,uuid,text,text,public.platform_sub_status,
  timestamptz,timestamptz,timestamptz,boolean,timestamptz,timestamptz,jsonb);
DROP FUNCTION IF EXISTS public.platform_webhook_mark_processed(uuid,text);
DROP FUNCTION IF EXISTS public.platform_webhook_register_event(
  public.platform_provider,text,text,jsonb);

DROP TABLE IF EXISTS public.platform_provider_customers;
DROP TABLE IF EXISTS public.platform_provider_prices;
