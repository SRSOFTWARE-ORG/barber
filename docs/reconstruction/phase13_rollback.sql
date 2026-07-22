-- =====================================================================
-- FASE 13 — Rollback (idempotente)
-- =====================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_platform_events_immutable ON public.platform_billing_events;

DROP VIEW IF EXISTS public.v_platform_usage_snapshot;
DROP VIEW IF EXISTS public.v_platform_subscription_status;

DROP FUNCTION IF EXISTS public.platform_consume(uuid, text, bigint);
DROP FUNCTION IF EXISTS public.platform_check_quota(uuid, text, bigint);
DROP FUNCTION IF EXISTS public.platform_usage_increment(uuid,text,bigint,timestamptz);
DROP FUNCTION IF EXISTS public.platform_limit_for(uuid, text);
DROP FUNCTION IF EXISTS public.platform_active_subscription(uuid);
DROP FUNCTION IF EXISTS public.tg_platform_events_immutable();

DROP TABLE IF EXISTS public.platform_usage_counters   CASCADE;
DROP TABLE IF EXISTS public.platform_billing_events   CASCADE;
DROP TABLE IF EXISTS public.platform_payments         CASCADE;
DROP TABLE IF EXISTS public.platform_invoice_items    CASCADE;
DROP TABLE IF EXISTS public.platform_invoices         CASCADE;
DROP TABLE IF EXISTS public.platform_subscriptions    CASCADE;
DROP TABLE IF EXISTS public.platform_plan_limits      CASCADE;
DROP TABLE IF EXISTS public.platform_plans            CASCADE;

DROP TYPE IF EXISTS public.platform_provider;
DROP TYPE IF EXISTS public.platform_payment_status;
DROP TYPE IF EXISTS public.platform_invoice_status;
DROP TYPE IF EXISTS public.platform_sub_status;
DROP TYPE IF EXISTS public.platform_billing_cycle;
DROP TYPE IF EXISTS public.platform_plan_status;

COMMIT;
