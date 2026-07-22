-- =====================================================================
-- FASE 10 — WhatsApp / Evolution API
-- Fila de mensagens, templates, disparos, webhooks e auditoria
-- =====================================================================
-- Pré-requisitos: Fases 1–9 aplicadas.
-- Idempotente: pode ser reexecutado.
-- Execute integralmente no SQL Editor do Supabase.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.wa_channel_status AS ENUM ('disconnected','connecting','connected','error','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_message_direction AS ENUM ('outbound','inbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_message_status AS ENUM (
    'queued','sending','sent','delivered','read','failed','received','canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_template_category AS ENUM (
    'transactional','marketing','reminder','notification','support','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_template_status AS ENUM ('draft','active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. CANAIS (instâncias Evolution por empresa/unidade)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id       uuid REFERENCES public.units(id) ON DELETE SET NULL,
  name          text NOT NULL,
  instance_key  text NOT NULL,
  phone_e164    text,
  status        public.wa_channel_status NOT NULL DEFAULT 'disconnected',
  webhook_secret text,
  last_seen_at  timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, instance_key)
);
CREATE INDEX IF NOT EXISTS idx_wa_channels_company ON public.wa_channels(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_channels_unit    ON public.wa_channels(unit_id);

-- ---------------------------------------------------------------------
-- 3. TEMPLATES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code         text NOT NULL,
  name         text NOT NULL,
  category     public.wa_template_category NOT NULL DEFAULT 'transactional',
  status       public.wa_template_status NOT NULL DEFAULT 'draft',
  locale       text NOT NULL DEFAULT 'pt-BR',
  body         text NOT NULL,
  variables    text[] NOT NULL DEFAULT ARRAY[]::text[],
  version      integer NOT NULL DEFAULT 1,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code, version)
);
CREATE INDEX IF NOT EXISTS idx_wa_templates_company ON public.wa_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_templates_status  ON public.wa_templates(company_id, status);

-- ---------------------------------------------------------------------
-- 4. FILA / MENSAGENS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id        uuid REFERENCES public.units(id) ON DELETE SET NULL,
  channel_id     uuid REFERENCES public.wa_channels(id) ON DELETE SET NULL,
  template_id    uuid REFERENCES public.wa_templates(id) ON DELETE SET NULL,
  client_id      uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  booking_id     uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  direction      public.wa_message_direction NOT NULL DEFAULT 'outbound',
  status         public.wa_message_status    NOT NULL DEFAULT 'queued',
  to_phone       text,
  from_phone     text,
  body           text NOT NULL,
  variables      jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_msg_id text,
  scheduled_for  timestamptz NOT NULL DEFAULT now(),
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text,
  sent_at        timestamptz,
  delivered_at   timestamptz,
  read_at        timestamptz,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_company     ON public.wa_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_status_sched ON public.wa_messages(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_client      ON public.wa_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_booking     ON public.wa_messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_provider    ON public.wa_messages(provider_msg_id);

-- ---------------------------------------------------------------------
-- 5. EVENTOS DE WEBHOOK (raw, imutáveis)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id   uuid REFERENCES public.wa_channels(id) ON DELETE SET NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  process_error text
);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_company ON public.wa_webhook_events(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_type    ON public.wa_webhook_events(event_type);

-- Bloqueia UPDATE/DELETE (append-only)
CREATE OR REPLACE FUNCTION public.tg_wa_webhook_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'wa_webhook_events é append-only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Permite apenas marcar processed_at / process_error
    IF (NEW.company_id IS DISTINCT FROM OLD.company_id
        OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
        OR NEW.event_type IS DISTINCT FROM OLD.event_type
        OR NEW.payload    IS DISTINCT FROM OLD.payload
        OR NEW.received_at IS DISTINCT FROM OLD.received_at) THEN
      RAISE EXCEPTION 'wa_webhook_events: somente processed_at/process_error podem ser atualizados';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_webhook_immutable ON public.wa_webhook_events;
CREATE TRIGGER trg_wa_webhook_immutable
  BEFORE UPDATE OR DELETE ON public.wa_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_webhook_immutable();

-- ---------------------------------------------------------------------
-- 6. AUDITORIA DE MENSAGENS (transições de status)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_message_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES public.wa_messages(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_status  public.wa_message_status,
  to_status    public.wa_message_status NOT NULL,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note         text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_msg_audit_msg     ON public.wa_message_audit(message_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_audit_company ON public.wa_message_audit(company_id);

-- Trigger para registrar mudança de status
CREATE OR REPLACE FUNCTION public.tg_wa_message_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wa_message_audit(message_id, company_id, from_status, to_status, actor_id, metadata)
    VALUES (NEW.id, NEW.company_id, NULL, NEW.status, auth.uid(),
            jsonb_build_object('scheduled_for', NEW.scheduled_for));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.wa_message_audit(message_id, company_id, from_status, to_status, actor_id, metadata)
    VALUES (NEW.id, NEW.company_id, OLD.status, NEW.status, auth.uid(),
            jsonb_build_object(
              'attempts', NEW.attempts,
              'last_error', NEW.last_error,
              'provider_msg_id', NEW.provider_msg_id
            ));
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_message_audit ON public.wa_messages;
CREATE TRIGGER trg_wa_message_audit
  AFTER INSERT OR UPDATE ON public.wa_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_message_audit();

-- Bloqueia mutação da auditoria
CREATE OR REPLACE FUNCTION public.tg_wa_message_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wa_message_audit é append-only';
END $$;

DROP TRIGGER IF EXISTS trg_wa_message_audit_immutable ON public.wa_message_audit;
CREATE TRIGGER trg_wa_message_audit_immutable
  BEFORE UPDATE OR DELETE ON public.wa_message_audit
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_message_audit_immutable();

-- ---------------------------------------------------------------------
-- 7. HELPERS: enfileirar / cancelar / render template
-- ---------------------------------------------------------------------

-- Substitui {{var}} em um template usando um jsonb de variáveis
CREATE OR REPLACE FUNCTION public.wa_render_template(_body text, _vars jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v text;
  out_text text := _body;
BEGIN
  IF _vars IS NULL THEN RETURN out_text; END IF;
  FOR k, v IN SELECT key, value::text FROM jsonb_each_text(_vars) LOOP
    out_text := replace(out_text, '{{' || k || '}}', v);
  END LOOP;
  RETURN out_text;
END $$;

-- Enfileira mensagem a partir de template ou body livre
CREATE OR REPLACE FUNCTION public.wa_enqueue_message(
  _company_id   uuid,
  _to_phone     text,
  _body         text DEFAULT NULL,
  _template_id  uuid DEFAULT NULL,
  _variables    jsonb DEFAULT '{}'::jsonb,
  _channel_id   uuid DEFAULT NULL,
  _client_id    uuid DEFAULT NULL,
  _booking_id   uuid DEFAULT NULL,
  _scheduled_for timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_body text;
  v_msg_id uuid;
  v_tpl RECORD;
BEGIN
  -- Autorização: só membros da empresa (com papel adequado) podem enfileirar
  IF NOT (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.is_member_of(auth.uid(), _company_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to enqueue messages for company %', _company_id;
  END IF;

  IF _template_id IS NOT NULL THEN
    SELECT * INTO v_tpl FROM public.wa_templates
      WHERE id = _template_id AND company_id = _company_id AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'template % não encontrado/ativo para company %', _template_id, _company_id;
    END IF;
    v_body := public.wa_render_template(v_tpl.body, COALESCE(_variables, '{}'::jsonb));
  ELSE
    IF _body IS NULL OR length(trim(_body)) = 0 THEN
      RAISE EXCEPTION 'body ou template_id é obrigatório';
    END IF;
    v_body := _body;
  END IF;

  INSERT INTO public.wa_messages(
    company_id, channel_id, template_id, client_id, booking_id,
    direction, status, to_phone, body, variables, scheduled_for, created_by
  ) VALUES (
    _company_id, _channel_id, _template_id, _client_id, _booking_id,
    'outbound', 'queued', _to_phone, v_body, COALESCE(_variables, '{}'::jsonb),
    _scheduled_for, auth.uid()
  ) RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END $$;

-- Cancelar mensagem pendente
CREATE OR REPLACE FUNCTION public.wa_cancel_message(_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_status  public.wa_message_status;
BEGIN
  SELECT company_id, status INTO v_company, v_status
  FROM public.wa_messages WHERE id = _message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mensagem % não encontrada', _message_id; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.is_member_of(auth.uid(), v_company)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_status NOT IN ('queued','sending') THEN
    RAISE EXCEPTION 'mensagem em status % não pode ser cancelada', v_status;
  END IF;

  UPDATE public.wa_messages
    SET status = 'canceled', updated_at = now()
    WHERE id = _message_id;
END $$;

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.wa_channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_webhook_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_message_audit   ENABLE ROW LEVEL SECURITY;

-- Channels: staff da empresa gerencia; platform staff enxerga tudo
DROP POLICY IF EXISTS wa_channels_select ON public.wa_channels;
CREATE POLICY wa_channels_select ON public.wa_channels
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'platform_support')
    OR public.is_member_of(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS wa_channels_write ON public.wa_channels;
CREATE POLICY wa_channels_write ON public.wa_channels
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  );

-- Templates
DROP POLICY IF EXISTS wa_templates_select ON public.wa_templates;
CREATE POLICY wa_templates_select ON public.wa_templates
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'platform_support')
    OR public.is_member_of(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS wa_templates_write ON public.wa_templates;
CREATE POLICY wa_templates_write ON public.wa_templates
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  );

-- Messages: membros da empresa veem; escrita apenas via função ou owner/manager
DROP POLICY IF EXISTS wa_messages_select ON public.wa_messages;
CREATE POLICY wa_messages_select ON public.wa_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'platform_support')
    OR public.is_member_of(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS wa_messages_write ON public.wa_messages;
CREATE POLICY wa_messages_write ON public.wa_messages
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_company_role(auth.uid(), company_id, 'owner')
    OR public.has_company_role(auth.uid(), company_id, 'manager')
  );

-- Webhook events: somente platform staff e owners lêem
DROP POLICY IF EXISTS wa_webhook_select ON public.wa_webhook_events;
CREATE POLICY wa_webhook_select ON public.wa_webhook_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'platform_support')
    OR (company_id IS NOT NULL AND public.has_company_role(auth.uid(), company_id, 'owner'))
  );

-- Auditoria: staff da empresa lê; ninguém escreve via API (apenas triggers via service_role)
DROP POLICY IF EXISTS wa_msg_audit_select ON public.wa_message_audit;
CREATE POLICY wa_msg_audit_select ON public.wa_message_audit
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'platform_support')
    OR public.is_member_of(auth.uid(), company_id)
  );

-- ---------------------------------------------------------------------
-- 9. GRANTS
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_channels       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_templates      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_messages       TO authenticated;
GRANT SELECT                          ON public.wa_webhook_events TO authenticated;
GRANT SELECT                          ON public.wa_message_audit  TO authenticated;

GRANT ALL ON public.wa_channels        TO service_role;
GRANT ALL ON public.wa_templates       TO service_role;
GRANT ALL ON public.wa_messages        TO service_role;
GRANT ALL ON public.wa_webhook_events  TO service_role;
GRANT ALL ON public.wa_message_audit   TO service_role;

GRANT EXECUTE ON FUNCTION public.wa_render_template(text, jsonb)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_enqueue_message(uuid,text,text,uuid,jsonb,uuid,uuid,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_cancel_message(uuid)                            TO authenticated;

COMMIT;

-- =====================================================================
-- FIM — FASE 10
-- =====================================================================
