-- =====================================================================
-- FASE 10 — Rollback (idempotente)
-- =====================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_wa_message_audit_immutable ON public.wa_message_audit;
DROP TRIGGER IF EXISTS trg_wa_message_audit           ON public.wa_messages;
DROP TRIGGER IF EXISTS trg_wa_webhook_immutable       ON public.wa_webhook_events;

DROP FUNCTION IF EXISTS public.wa_cancel_message(uuid);
DROP FUNCTION IF EXISTS public.wa_enqueue_message(uuid,text,text,uuid,jsonb,uuid,uuid,uuid,timestamptz);
DROP FUNCTION IF EXISTS public.wa_render_template(text, jsonb);
DROP FUNCTION IF EXISTS public.tg_wa_message_audit_immutable();
DROP FUNCTION IF EXISTS public.tg_wa_message_audit();
DROP FUNCTION IF EXISTS public.tg_wa_webhook_immutable();

DROP TABLE IF EXISTS public.wa_message_audit   CASCADE;
DROP TABLE IF EXISTS public.wa_webhook_events  CASCADE;
DROP TABLE IF EXISTS public.wa_messages        CASCADE;
DROP TABLE IF EXISTS public.wa_templates       CASCADE;
DROP TABLE IF EXISTS public.wa_channels        CASCADE;

DROP TYPE IF EXISTS public.wa_template_status;
DROP TYPE IF EXISTS public.wa_template_category;
DROP TYPE IF EXISTS public.wa_message_status;
DROP TYPE IF EXISTS public.wa_message_direction;
DROP TYPE IF EXISTS public.wa_channel_status;

COMMIT;
