-- =====================================================================
-- FASE 12 — Fila de envio: workers, retries e observabilidade
-- =====================================================================
-- Pré-requisitos: Fases 1–11 aplicadas.
-- Idempotente.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.dispatch_kind AS ENUM ('notification','wa_message','email','webhook','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.worker_status AS ENUM ('idle','busy','offline','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dispatch_result AS ENUM ('success','retryable_error','permanent_error','timeout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. WORKERS registrados (edge functions / cron jobs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_workers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  kind         public.dispatch_kind NOT NULL,
  status       public.worker_status NOT NULL DEFAULT 'idle',
  hostname     text,
  version      text,
  last_heartbeat timestamptz,
  last_error   text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workers_kind ON public.dispatch_workers(kind, status);

-- ---------------------------------------------------------------------
-- 3. FILA UNIFICADA de despachos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  kind           public.dispatch_kind NOT NULL,
  ref_table      text NOT NULL,        -- ex: 'notifications', 'wa_messages'
  ref_id         uuid NOT NULL,
  priority       public.notif_priority NOT NULL DEFAULT 'normal',
  status         public.notif_status   NOT NULL DEFAULT 'queued',
  attempts       integer NOT NULL DEFAULT 0,
  max_attempts   integer NOT NULL DEFAULT 5,
  scheduled_for  timestamptz NOT NULL DEFAULT now(),
  locked_by      uuid REFERENCES public.dispatch_workers(id) ON DELETE SET NULL,
  locked_at      timestamptz,
  lock_expires_at timestamptz,
  last_error     text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ref_table, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_dq_ready
  ON public.dispatch_queue(kind, priority, scheduled_for)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_dq_locked   ON public.dispatch_queue(locked_by, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_dq_company  ON public.dispatch_queue(company_id);

-- ---------------------------------------------------------------------
-- 4. LOG de tentativas (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id      uuid NOT NULL REFERENCES public.dispatch_queue(id) ON DELETE CASCADE,
  worker_id     uuid REFERENCES public.dispatch_workers(id) ON DELETE SET NULL,
  attempt_no    integer NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  duration_ms   integer,
  result        public.dispatch_result,
  http_status   integer,
  error         text,
  response_meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_dq_attempts_queue  ON public.dispatch_attempts(queue_id);
CREATE INDEX IF NOT EXISTS idx_dq_attempts_worker ON public.dispatch_attempts(worker_id);
CREATE INDEX IF NOT EXISTS idx_dq_attempts_result ON public.dispatch_attempts(result, started_at);

-- Bloqueia mutação (append-only)
CREATE OR REPLACE FUNCTION public.tg_dispatch_attempts_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dispatch_attempts é append-only';
  END IF;
  -- Permite completar a linha (finished_at, duration_ms, result, http_status, error, response_meta)
  IF TG_OP = 'UPDATE' AND (
    NEW.queue_id  IS DISTINCT FROM OLD.queue_id  OR
    NEW.worker_id IS DISTINCT FROM OLD.worker_id OR
    NEW.attempt_no IS DISTINCT FROM OLD.attempt_no OR
    NEW.started_at IS DISTINCT FROM OLD.started_at
  ) THEN
    RAISE EXCEPTION 'dispatch_attempts: campos base são imutáveis';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_dispatch_attempts_immutable ON public.dispatch_attempts;
CREATE TRIGGER trg_dispatch_attempts_immutable
  BEFORE UPDATE OR DELETE ON public.dispatch_attempts
  FOR EACH ROW EXECUTE FUNCTION public.tg_dispatch_attempts_immutable();

-- ---------------------------------------------------------------------
-- 5. DEAD LETTER QUEUE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_dead_letter (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  kind         public.dispatch_kind NOT NULL,
  ref_table    text NOT NULL,
  ref_id       uuid NOT NULL,
  attempts     integer NOT NULL,
  last_error   text,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  moved_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dq_dead_company ON public.dispatch_dead_letter(company_id);
CREATE INDEX IF NOT EXISTS idx_dq_dead_kind    ON public.dispatch_dead_letter(kind, moved_at);

-- ---------------------------------------------------------------------
-- 6. HELPERS
-- ---------------------------------------------------------------------

-- Registrar/atualizar worker (heartbeat)
CREATE OR REPLACE FUNCTION public.dispatch_worker_heartbeat(
  _name text, _kind public.dispatch_kind,
  _status public.worker_status DEFAULT 'idle',
  _hostname text DEFAULT NULL, _version text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.dispatch_workers(name, kind, status, hostname, version, last_heartbeat, metadata)
  VALUES (_name, _kind, _status, _hostname, _version, now(), COALESCE(_metadata,'{}'::jsonb))
  ON CONFLICT (name) DO UPDATE
    SET kind = EXCLUDED.kind,
        status = EXCLUDED.status,
        hostname = COALESCE(EXCLUDED.hostname, public.dispatch_workers.hostname),
        version = COALESCE(EXCLUDED.version, public.dispatch_workers.version),
        last_heartbeat = now(),
        metadata = public.dispatch_workers.metadata || COALESCE(EXCLUDED.metadata,'{}'::jsonb)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Enfileirar despacho
CREATE OR REPLACE FUNCTION public.dispatch_enqueue(
  _company_id uuid,
  _kind public.dispatch_kind,
  _ref_table text,
  _ref_id uuid,
  _priority public.notif_priority DEFAULT 'normal',
  _scheduled_for timestamptz DEFAULT now(),
  _max_attempts integer DEFAULT 5,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.dispatch_queue(company_id, kind, ref_table, ref_id, priority, scheduled_for, max_attempts, payload)
  VALUES (_company_id, _kind, _ref_table, _ref_id, _priority, _scheduled_for, _max_attempts, COALESCE(_payload,'{}'::jsonb))
  ON CONFLICT (ref_table, ref_id) DO UPDATE
    SET status = 'queued',
        scheduled_for = EXCLUDED.scheduled_for,
        priority = EXCLUDED.priority,
        max_attempts = EXCLUDED.max_attempts,
        payload = EXCLUDED.payload,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Reservar próximos itens (lock com expiração) — usado pelo worker
CREATE OR REPLACE FUNCTION public.dispatch_claim(
  _worker_id uuid,
  _kind public.dispatch_kind,
  _batch integer DEFAULT 10,
  _lock_seconds integer DEFAULT 60
) RETURNS SETOF public.dispatch_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.dispatch_queue
    WHERE kind = _kind
      AND status = 'queued'
      AND scheduled_for <= now()
      AND (locked_by IS NULL OR lock_expires_at < now())
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT _batch
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.dispatch_queue q
     SET status = 'sending',
         locked_by = _worker_id,
         locked_at = now(),
         lock_expires_at = now() + make_interval(secs => _lock_seconds),
         attempts = q.attempts + 1,
         updated_at = now()
    FROM picked
   WHERE q.id = picked.id
  RETURNING q.*;
END $$;

-- Backoff exponencial com jitter (segundos)
CREATE OR REPLACE FUNCTION public.dispatch_backoff_seconds(_attempt integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST( 3600, (POWER(2, GREATEST(_attempt,1))::integer * 15)
       + (floor(random()*10))::integer );
$$;

-- Reportar resultado de um attempt e reagendar ou mover p/ DLQ
CREATE OR REPLACE FUNCTION public.dispatch_complete(
  _queue_id uuid,
  _worker_id uuid,
  _result public.dispatch_result,
  _http_status integer DEFAULT NULL,
  _error text DEFAULT NULL,
  _response_meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q public.dispatch_queue%ROWTYPE;
  v_next timestamptz;
BEGIN
  SELECT * INTO v_q FROM public.dispatch_queue WHERE id = _queue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue % não encontrado', _queue_id; END IF;

  INSERT INTO public.dispatch_attempts(
    queue_id, worker_id, attempt_no, started_at, finished_at, duration_ms,
    result, http_status, error, response_meta
  ) VALUES (
    _queue_id, _worker_id, v_q.attempts, COALESCE(v_q.locked_at, now()), now(),
    GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(v_q.locked_at, now())))::int * 1000),
    _result, _http_status, _error, COALESCE(_response_meta,'{}'::jsonb)
  );

  IF _result = 'success' THEN
    UPDATE public.dispatch_queue
      SET status='sent', locked_by=NULL, locked_at=NULL, lock_expires_at=NULL,
          last_error=NULL, updated_at=now()
      WHERE id = _queue_id;

  ELSIF _result = 'permanent_error' OR v_q.attempts >= v_q.max_attempts THEN
    INSERT INTO public.dispatch_dead_letter(company_id, kind, ref_table, ref_id, attempts, last_error, payload)
    VALUES (v_q.company_id, v_q.kind, v_q.ref_table, v_q.ref_id, v_q.attempts, COALESCE(_error, v_q.last_error), v_q.payload);
    UPDATE public.dispatch_queue
      SET status='failed', locked_by=NULL, locked_at=NULL, lock_expires_at=NULL,
          last_error=COALESCE(_error, v_q.last_error), updated_at=now()
      WHERE id = _queue_id;

  ELSE
    v_next := now() + make_interval(secs => public.dispatch_backoff_seconds(v_q.attempts));
    UPDATE public.dispatch_queue
      SET status='queued', locked_by=NULL, locked_at=NULL, lock_expires_at=NULL,
          scheduled_for = v_next, last_error = _error, updated_at = now()
      WHERE id = _queue_id;
  END IF;
END $$;

-- Recuperar locks expirados (chamar via cron)
CREATE OR REPLACE FUNCTION public.dispatch_reap_locks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.dispatch_queue
     SET status = 'queued',
         locked_by = NULL,
         locked_at = NULL,
         lock_expires_at = NULL,
         last_error = COALESCE(last_error,'') || ' [lock_expired]',
         updated_at = now()
   WHERE status = 'sending'
     AND lock_expires_at IS NOT NULL
     AND lock_expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Reprocessar item da DLQ
CREATE OR REPLACE FUNCTION public.dispatch_requeue_from_dlq(_dlq_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.dispatch_dead_letter%ROWTYPE;
  v_new uuid;
BEGIN
  SELECT * INTO v_row FROM public.dispatch_dead_letter WHERE id = _dlq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DLQ % não encontrado', _dlq_id; END IF;

  IF NOT (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR (v_row.company_id IS NOT NULL AND (
         public.has_company_role(auth.uid(), v_row.company_id,'owner')
      OR public.has_company_role(auth.uid(), v_row.company_id,'manager')
    ))
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_new := public.dispatch_enqueue(
    v_row.company_id, v_row.kind, v_row.ref_table, v_row.ref_id,
    'high'::public.notif_priority, now(), 5, v_row.payload
  );
  DELETE FROM public.dispatch_dead_letter WHERE id = _dlq_id;
  RETURN v_new;
END $$;

-- ---------------------------------------------------------------------
-- 7. AUTO-ENFILEIRAMENTO a partir de notifications / wa_messages
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_notifications_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'queued' THEN
    PERFORM public.dispatch_enqueue(
      NEW.company_id, 'notification'::public.dispatch_kind,
      'notifications', NEW.id, NEW.priority, NEW.scheduled_for, 5,
      jsonb_build_object('channel', NEW.channel, 'category', NEW.category)
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notifications_dispatch ON public.notifications;
CREATE TRIGGER trg_notifications_dispatch
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_notifications_dispatch();

CREATE OR REPLACE FUNCTION public.tg_wa_messages_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'outbound' AND NEW.status = 'queued' THEN
    PERFORM public.dispatch_enqueue(
      NEW.company_id, 'wa_message'::public.dispatch_kind,
      'wa_messages', NEW.id, 'normal'::public.notif_priority,
      NEW.scheduled_for, 5,
      jsonb_build_object('channel_id', NEW.channel_id, 'to', NEW.to_phone)
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_wa_messages_dispatch ON public.wa_messages;
CREATE TRIGGER trg_wa_messages_dispatch
  AFTER INSERT ON public.wa_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_messages_dispatch();

-- ---------------------------------------------------------------------
-- 8. OBSERVABILIDADE (views)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_dispatch_queue_stats AS
SELECT
  kind,
  status,
  count(*)::integer AS total,
  min(scheduled_for) AS next_scheduled,
  max(attempts)      AS max_attempts_seen,
  count(*) FILTER (WHERE attempts > 0)::integer AS retried
FROM public.dispatch_queue
GROUP BY kind, status;

CREATE OR REPLACE VIEW public.v_dispatch_worker_health AS
SELECT
  id, name, kind, status, version, hostname, last_heartbeat, last_error,
  CASE
    WHEN last_heartbeat IS NULL THEN 'never'
    WHEN last_heartbeat > now() - interval '2 minutes' THEN 'healthy'
    WHEN last_heartbeat > now() - interval '10 minutes' THEN 'stale'
    ELSE 'offline'
  END AS health
FROM public.dispatch_workers;

CREATE OR REPLACE VIEW public.v_dispatch_recent_failures AS
SELECT
  a.id, a.queue_id, q.kind, q.ref_table, q.ref_id, q.company_id,
  a.attempt_no, a.result, a.http_status, a.error, a.duration_ms, a.started_at
FROM public.dispatch_attempts a
JOIN public.dispatch_queue    q ON q.id = a.queue_id
WHERE a.result IN ('retryable_error','permanent_error','timeout')
  AND a.started_at > now() - interval '24 hours'
ORDER BY a.started_at DESC;

CREATE OR REPLACE VIEW public.v_dispatch_throughput_hourly AS
SELECT
  date_trunc('hour', a.started_at) AS hour,
  q.kind,
  a.result,
  count(*)::integer AS total,
  avg(a.duration_ms)::integer AS avg_ms
FROM public.dispatch_attempts a
JOIN public.dispatch_queue    q ON q.id = a.queue_id
WHERE a.started_at > now() - interval '7 days'
GROUP BY 1,2,3
ORDER BY 1 DESC;

-- ---------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.dispatch_workers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_queue        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_dead_letter  ENABLE ROW LEVEL SECURITY;

-- Workers: apenas platform staff
DROP POLICY IF EXISTS dw_select ON public.dispatch_workers;
CREATE POLICY dw_select ON public.dispatch_workers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin')
      OR public.has_role(auth.uid(),'platform_support'));

-- Queue: staff da empresa lê o que é da empresa; platform staff tudo
DROP POLICY IF EXISTS dq_select ON public.dispatch_queue;
CREATE POLICY dq_select ON public.dispatch_queue FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR (company_id IS NOT NULL AND (
         public.has_company_role(auth.uid(), company_id,'owner')
      OR public.has_company_role(auth.uid(), company_id,'manager')
    ))
  );

DROP POLICY IF EXISTS dq_update ON public.dispatch_queue;
CREATE POLICY dq_update ON public.dispatch_queue FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR (company_id IS NOT NULL AND public.has_company_role(auth.uid(), company_id,'owner'))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'platform_admin')
    OR (company_id IS NOT NULL AND public.has_company_role(auth.uid(), company_id,'owner'))
  );

-- Attempts: staff da empresa e platform staff
DROP POLICY IF EXISTS da_select ON public.dispatch_attempts;
CREATE POLICY da_select ON public.dispatch_attempts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR EXISTS (
      SELECT 1 FROM public.dispatch_queue q
      WHERE q.id = dispatch_attempts.queue_id
        AND q.company_id IS NOT NULL
        AND (public.has_company_role(auth.uid(), q.company_id,'owner')
          OR public.has_company_role(auth.uid(), q.company_id,'manager'))
    )
  );

-- DLQ: idem
DROP POLICY IF EXISTS dlq_select ON public.dispatch_dead_letter;
CREATE POLICY dlq_select ON public.dispatch_dead_letter FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR (company_id IS NOT NULL AND (
         public.has_company_role(auth.uid(), company_id,'owner')
      OR public.has_company_role(auth.uid(), company_id,'manager')
    ))
  );

DROP POLICY IF EXISTS dlq_delete ON public.dispatch_dead_letter;
CREATE POLICY dlq_delete ON public.dispatch_dead_letter FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR (company_id IS NOT NULL AND public.has_company_role(auth.uid(), company_id,'owner'))
  );

-- ---------------------------------------------------------------------
-- 10. GRANTS
-- ---------------------------------------------------------------------
GRANT SELECT                          ON public.dispatch_workers      TO authenticated;
GRANT SELECT, UPDATE                  ON public.dispatch_queue        TO authenticated;
GRANT SELECT                          ON public.dispatch_attempts     TO authenticated;
GRANT SELECT, DELETE                  ON public.dispatch_dead_letter  TO authenticated;
GRANT SELECT ON public.v_dispatch_queue_stats        TO authenticated;
GRANT SELECT ON public.v_dispatch_worker_health      TO authenticated;
GRANT SELECT ON public.v_dispatch_recent_failures    TO authenticated;
GRANT SELECT ON public.v_dispatch_throughput_hourly  TO authenticated;

GRANT ALL ON public.dispatch_workers     TO service_role;
GRANT ALL ON public.dispatch_queue       TO service_role;
GRANT ALL ON public.dispatch_attempts    TO service_role;
GRANT ALL ON public.dispatch_dead_letter TO service_role;

GRANT EXECUTE ON FUNCTION public.dispatch_worker_heartbeat(text,public.dispatch_kind,public.worker_status,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_enqueue(uuid,public.dispatch_kind,text,uuid,public.notif_priority,timestamptz,integer,jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_claim(uuid,public.dispatch_kind,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_complete(uuid,uuid,public.dispatch_result,integer,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_backoff_seconds(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_reap_locks() TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_requeue_from_dlq(uuid) TO authenticated, service_role;

COMMIT;

-- =====================================================================
-- FIM — FASE 12
-- =====================================================================
