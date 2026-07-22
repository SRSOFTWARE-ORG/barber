-- =====================================================================
-- FASE 12 — Rollback (idempotente)
-- =====================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_wa_messages_dispatch     ON public.wa_messages;
DROP TRIGGER IF EXISTS trg_notifications_dispatch   ON public.notifications;
DROP TRIGGER IF EXISTS trg_dispatch_attempts_immutable ON public.dispatch_attempts;

DROP VIEW IF EXISTS public.v_dispatch_throughput_hourly;
DROP VIEW IF EXISTS public.v_dispatch_recent_failures;
DROP VIEW IF EXISTS public.v_dispatch_worker_health;
DROP VIEW IF EXISTS public.v_dispatch_queue_stats;

DROP FUNCTION IF EXISTS public.dispatch_requeue_from_dlq(uuid);
DROP FUNCTION IF EXISTS public.dispatch_reap_locks();
DROP FUNCTION IF EXISTS public.dispatch_complete(uuid,uuid,public.dispatch_result,integer,text,jsonb);
DROP FUNCTION IF EXISTS public.dispatch_backoff_seconds(integer);
DROP FUNCTION IF EXISTS public.dispatch_claim(uuid,public.dispatch_kind,integer,integer);
DROP FUNCTION IF EXISTS public.dispatch_enqueue(uuid,public.dispatch_kind,text,uuid,public.notif_priority,timestamptz,integer,jsonb);
DROP FUNCTION IF EXISTS public.dispatch_worker_heartbeat(text,public.dispatch_kind,public.worker_status,text,text,jsonb);
DROP FUNCTION IF EXISTS public.tg_wa_messages_dispatch();
DROP FUNCTION IF EXISTS public.tg_notifications_dispatch();
DROP FUNCTION IF EXISTS public.tg_dispatch_attempts_immutable();

DROP TABLE IF EXISTS public.dispatch_dead_letter CASCADE;
DROP TABLE IF EXISTS public.dispatch_attempts    CASCADE;
DROP TABLE IF EXISTS public.dispatch_queue       CASCADE;
DROP TABLE IF EXISTS public.dispatch_workers     CASCADE;

DROP TYPE IF EXISTS public.dispatch_result;
DROP TYPE IF EXISTS public.worker_status;
DROP TYPE IF EXISTS public.dispatch_kind;

COMMIT;
