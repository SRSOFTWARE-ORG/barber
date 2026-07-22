-- =====================================================================
-- FASE 11 — Notificações internas, e-mail e preferências de comunicação
-- =====================================================================
-- Pré-requisitos: Fases 1–10 aplicadas.
-- Idempotente: pode ser reexecutado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.notif_channel AS ENUM ('in_app','email','whatsapp','sms','push');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notif_category AS ENUM (
    'transactional','reminder','marketing','security','system','financial','support'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notif_status AS ENUM (
    'queued','sending','sent','delivered','read','failed','canceled','skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notif_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.email_template_status AS ENUM ('draft','active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. TEMPLATES DE E-MAIL (por empresa)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code         text NOT NULL,
  name         text NOT NULL,
  category     public.notif_category NOT NULL DEFAULT 'transactional',
  status       public.email_template_status NOT NULL DEFAULT 'draft',
  locale       text NOT NULL DEFAULT 'pt-BR',
  subject      text NOT NULL,
  body_html    text NOT NULL,
  body_text    text,
  variables    text[] NOT NULL DEFAULT ARRAY[]::text[],
  version      integer NOT NULL DEFAULT 1,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code, version, locale)
);
CREATE INDEX IF NOT EXISTS idx_email_tpl_company ON public.email_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_email_tpl_status  ON public.email_templates(company_id, status);

-- ---------------------------------------------------------------------
-- 3. PREFERÊNCIAS DE COMUNICAÇÃO (por usuário x empresa x categoria)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_preferences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  category     public.notif_category NOT NULL,
  in_app       boolean NOT NULL DEFAULT true,
  email        boolean NOT NULL DEFAULT true,
  whatsapp     boolean NOT NULL DEFAULT false,
  sms          boolean NOT NULL DEFAULT false,
  push        boolean NOT NULL DEFAULT true,
  quiet_hours_start time,
  quiet_hours_end   time,
  timezone     text NOT NULL DEFAULT 'America/Sao_Paulo',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, category)
);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_user    ON public.communication_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_company ON public.communication_preferences(company_id);

-- ---------------------------------------------------------------------
-- 4. NOTIFICAÇÕES (registro unificado in-app / e-mail / etc.)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel        public.notif_channel  NOT NULL,
  category       public.notif_category NOT NULL DEFAULT 'transactional',
  priority       public.notif_priority NOT NULL DEFAULT 'normal',
  status         public.notif_status   NOT NULL DEFAULT 'queued',
  template_code  text,
  subject        text,
  body           text NOT NULL,
  variables      jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_address     text,           -- e-mail, telefone ou push token
  entity_type    text,           -- ex: 'booking','payout','client','wa_message'
  entity_id      uuid,
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
CREATE INDEX IF NOT EXISTS idx_notif_user      ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_company   ON public.notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notif_status    ON public.notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notif_channel   ON public.notifications(channel, status);
CREATE INDEX IF NOT EXISTS idx_notif_entity    ON public.notifications(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread    ON public.notifications(user_id, channel) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. AUDITORIA DE NOTIFICAÇÕES (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status     public.notif_status,
  to_status       public.notif_status NOT NULL,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_audit_notif   ON public.notification_audit(notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_audit_company ON public.notification_audit(company_id);

CREATE OR REPLACE FUNCTION public.tg_notification_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notification_audit(notification_id, company_id, user_id, from_status, to_status, actor_id, metadata)
    VALUES (NEW.id, NEW.company_id, NEW.user_id, NULL, NEW.status, auth.uid(),
            jsonb_build_object('channel', NEW.channel, 'category', NEW.category, 'scheduled_for', NEW.scheduled_for));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notification_audit(notification_id, company_id, user_id, from_status, to_status, actor_id, metadata)
    VALUES (NEW.id, NEW.company_id, NEW.user_id, OLD.status, NEW.status, auth.uid(),
            jsonb_build_object('attempts', NEW.attempts, 'last_error', NEW.last_error));
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notification_audit ON public.notifications;
CREATE TRIGGER trg_notification_audit
  AFTER INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_notification_audit();

CREATE OR REPLACE FUNCTION public.tg_notification_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'notification_audit é append-only';
END $$;

DROP TRIGGER IF EXISTS trg_notification_audit_immutable ON public.notification_audit;
CREATE TRIGGER trg_notification_audit_immutable
  BEFORE UPDATE OR DELETE ON public.notification_audit
  FOR EACH ROW EXECUTE FUNCTION public.tg_notification_audit_immutable();

-- ---------------------------------------------------------------------
-- 6. HELPERS
-- ---------------------------------------------------------------------

-- Render simples {{var}} → valor
CREATE OR REPLACE FUNCTION public.notif_render(_text text, _vars jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text; v text;
  out_text text := _text;
BEGIN
  IF _vars IS NULL THEN RETURN out_text; END IF;
  FOR k, v IN SELECT key, value::text FROM jsonb_each_text(_vars) LOOP
    out_text := replace(out_text, '{{' || k || '}}', v);
  END LOOP;
  RETURN out_text;
END $$;

-- Verifica se usuário aceita canal + categoria (considera preferência específica da empresa e default global)
CREATE OR REPLACE FUNCTION public.notif_channel_allowed(
  _user_id uuid, _company_id uuid, _category public.notif_category, _channel public.notif_channel
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pref public.communication_preferences%ROWTYPE;
BEGIN
  SELECT * INTO v_pref FROM public.communication_preferences
    WHERE user_id = _user_id AND company_id = _company_id AND category = _category
    LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_pref FROM public.communication_preferences
      WHERE user_id = _user_id AND company_id IS NULL AND category = _category
      LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    -- Defaults: transacional/segurança/sistema/financeiro sempre permitidos
    RETURN _channel IN ('in_app','email') OR _category IN ('security','system','transactional','financial');
  END IF;
  RETURN CASE _channel
    WHEN 'in_app'   THEN v_pref.in_app
    WHEN 'email'    THEN v_pref.email
    WHEN 'whatsapp' THEN v_pref.whatsapp
    WHEN 'sms'      THEN v_pref.sms
    WHEN 'push'     THEN v_pref.push
  END;
END $$;

-- Enfileirar notificação (respeita preferências; retorna id ou NULL se skipped)
CREATE OR REPLACE FUNCTION public.notif_enqueue(
  _company_id   uuid,
  _user_id      uuid,
  _channel      public.notif_channel,
  _category     public.notif_category,
  _body         text,
  _subject      text DEFAULT NULL,
  _to_address   text DEFAULT NULL,
  _template_code text DEFAULT NULL,
  _variables    jsonb DEFAULT '{}'::jsonb,
  _priority     public.notif_priority DEFAULT 'normal',
  _entity_type  text DEFAULT NULL,
  _entity_id    uuid DEFAULT NULL,
  _scheduled_for timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_allowed boolean;
BEGIN
  -- Autorização: platform_admin, membro da empresa, ou o próprio usuário
  IF NOT (
    public.has_role(auth.uid(), 'platform_admin')
    OR (_company_id IS NOT NULL AND public.is_member_of(auth.uid(), _company_id))
    OR auth.uid() = _user_id
  ) THEN
    RAISE EXCEPTION 'not authorized to enqueue notification';
  END IF;

  -- Verifica preferência (categorias críticas sempre passam)
  IF _user_id IS NOT NULL AND _category NOT IN ('security','system','financial') THEN
    v_allowed := public.notif_channel_allowed(_user_id, _company_id, _category, _channel);
    IF NOT v_allowed THEN
      INSERT INTO public.notifications(
        company_id, user_id, channel, category, priority, status,
        template_code, subject, body, variables, to_address,
        entity_type, entity_id, scheduled_for, created_by
      ) VALUES (
        _company_id, _user_id, _channel, _category, _priority, 'skipped',
        _template_code, _subject, _body, COALESCE(_variables,'{}'::jsonb), _to_address,
        _entity_type, _entity_id, _scheduled_for, auth.uid()
      ) RETURNING id INTO v_id;
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.notifications(
    company_id, user_id, channel, category, priority, status,
    template_code, subject, body, variables, to_address,
    entity_type, entity_id, scheduled_for, created_by
  ) VALUES (
    _company_id, _user_id, _channel, _category, _priority, 'queued',
    _template_code, _subject, _body, COALESCE(_variables,'{}'::jsonb), _to_address,
    _entity_type, _entity_id, _scheduled_for, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Marca in-app como lida
CREATE OR REPLACE FUNCTION public.notif_mark_read(_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.notifications WHERE id = _notification_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'notif % não encontrada', _notification_id; END IF;
  IF v_user IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.notifications
    SET read_at = COALESCE(read_at, now()),
        status  = CASE WHEN status IN ('sent','delivered') THEN 'read' ELSE status END,
        updated_at = now()
    WHERE id = _notification_id;
END $$;

-- Marca todas as in-app do usuário como lidas (opcional filtro por empresa)
CREATE OR REPLACE FUNCTION public.notif_mark_all_read(_company_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.notifications
    SET read_at = now(),
        status = 'read',
        updated_at = now()
    WHERE user_id = auth.uid()
      AND channel = 'in_app'
      AND read_at IS NULL
      AND (_company_id IS NULL OR company_id = _company_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Cancelar notificação pendente
CREATE OR REPLACE FUNCTION public.notif_cancel(_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid; v_status public.notif_status; v_user uuid;
BEGIN
  SELECT company_id, status, user_id INTO v_company, v_status, v_user
    FROM public.notifications WHERE id = _notification_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'notif % não encontrada', _notification_id; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'platform_admin')
    OR (v_company IS NOT NULL AND public.is_member_of(auth.uid(), v_company))
    OR auth.uid() = v_user
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_status NOT IN ('queued','sending') THEN
    RAISE EXCEPTION 'notif em status % não pode ser cancelada', v_status;
  END IF;
  UPDATE public.notifications SET status='canceled', updated_at=now() WHERE id=_notification_id;
END $$;

-- ---------------------------------------------------------------------
-- 7. VIEW: contagem de não lidas por usuário
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_notifications_unread_count AS
SELECT user_id, company_id, count(*)::integer AS unread_count
FROM public.notifications
WHERE channel = 'in_app' AND read_at IS NULL AND status NOT IN ('canceled','skipped','failed')
GROUP BY user_id, company_id;

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.email_templates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_audit         ENABLE ROW LEVEL SECURITY;

-- email_templates: staff da empresa; owner/manager escreve
DROP POLICY IF EXISTS email_tpl_select ON public.email_templates;
CREATE POLICY email_tpl_select ON public.email_templates
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR public.is_member_of(auth.uid(), company_id)
  );
DROP POLICY IF EXISTS email_tpl_write ON public.email_templates;
CREATE POLICY email_tpl_write ON public.email_templates
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_company_role(auth.uid(), company_id,'owner')
    OR public.has_company_role(auth.uid(), company_id,'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_company_role(auth.uid(), company_id,'owner')
    OR public.has_company_role(auth.uid(), company_id,'manager')
  );

-- communication_preferences: usuário só vê/edita as suas; platform admin vê tudo
DROP POLICY IF EXISTS comm_prefs_select ON public.communication_preferences;
CREATE POLICY comm_prefs_select ON public.communication_preferences
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
  );
DROP POLICY IF EXISTS comm_prefs_write ON public.communication_preferences;
CREATE POLICY comm_prefs_write ON public.communication_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'platform_admin'));

-- notifications: destinatário lê/atualiza (read); staff da empresa lê/gerencia
DROP POLICY IF EXISTS notif_select ON public.notifications;
CREATE POLICY notif_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR (company_id IS NOT NULL AND (
         public.has_company_role(auth.uid(), company_id,'owner')
      OR public.has_company_role(auth.uid(), company_id,'manager')
    ))
  );

DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'platform_admin')
    OR (company_id IS NOT NULL AND (
         public.has_company_role(auth.uid(), company_id,'owner')
      OR public.has_company_role(auth.uid(), company_id,'manager')
    ))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'platform_admin')
    OR (company_id IS NOT NULL AND (
         public.has_company_role(auth.uid(), company_id,'owner')
      OR public.has_company_role(auth.uid(), company_id,'manager')
    ))
  );

DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'platform_admin')
    OR (company_id IS NOT NULL AND public.is_member_of(auth.uid(), company_id))
    OR user_id = auth.uid()
  );

-- notification_audit: leitura para staff/usuário; escrita bloqueada
DROP POLICY IF EXISTS notif_audit_select ON public.notification_audit;
CREATE POLICY notif_audit_select ON public.notification_audit
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR (company_id IS NOT NULL AND (
         public.has_company_role(auth.uid(), company_id,'owner')
      OR public.has_company_role(auth.uid(), company_id,'manager')
    ))
  );

-- ---------------------------------------------------------------------
-- 9. GRANTS
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.notifications             TO authenticated;
GRANT SELECT                          ON public.notification_audit        TO authenticated;
GRANT SELECT                          ON public.v_notifications_unread_count TO authenticated;

GRANT ALL ON public.email_templates           TO service_role;
GRANT ALL ON public.communication_preferences TO service_role;
GRANT ALL ON public.notifications             TO service_role;
GRANT ALL ON public.notification_audit        TO service_role;

GRANT EXECUTE ON FUNCTION public.notif_render(text, jsonb)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_channel_allowed(uuid,uuid,public.notif_category,public.notif_channel) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_enqueue(uuid,uuid,public.notif_channel,public.notif_category,text,text,text,text,jsonb,public.notif_priority,text,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_mark_read(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_mark_all_read(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_cancel(uuid)                        TO authenticated;

COMMIT;

-- =====================================================================
-- FIM — FASE 11
-- =====================================================================
