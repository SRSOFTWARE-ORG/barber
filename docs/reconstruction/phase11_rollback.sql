-- =====================================================================
-- FASE 11 — Rollback (idempotente)
-- =====================================================================
BEGIN;

DROP VIEW IF EXISTS public.v_notifications_unread_count;

DROP TRIGGER IF EXISTS trg_notification_audit_immutable ON public.notification_audit;
DROP TRIGGER IF EXISTS trg_notification_audit           ON public.notifications;

DROP FUNCTION IF EXISTS public.notif_cancel(uuid);
DROP FUNCTION IF EXISTS public.notif_mark_all_read(uuid);
DROP FUNCTION IF EXISTS public.notif_mark_read(uuid);
DROP FUNCTION IF EXISTS public.notif_enqueue(uuid,uuid,public.notif_channel,public.notif_category,text,text,text,text,jsonb,public.notif_priority,text,uuid,timestamptz);
DROP FUNCTION IF EXISTS public.notif_channel_allowed(uuid,uuid,public.notif_category,public.notif_channel);
DROP FUNCTION IF EXISTS public.notif_render(text, jsonb);
DROP FUNCTION IF EXISTS public.tg_notification_audit_immutable();
DROP FUNCTION IF EXISTS public.tg_notification_audit();

DROP TABLE IF EXISTS public.notification_audit         CASCADE;
DROP TABLE IF EXISTS public.notifications              CASCADE;
DROP TABLE IF EXISTS public.communication_preferences  CASCADE;
DROP TABLE IF EXISTS public.email_templates            CASCADE;

DROP TYPE IF EXISTS public.email_template_status;
DROP TYPE IF EXISTS public.notif_priority;
DROP TYPE IF EXISTS public.notif_status;
DROP TYPE IF EXISTS public.notif_category;
DROP TYPE IF EXISTS public.notif_channel;

COMMIT;
