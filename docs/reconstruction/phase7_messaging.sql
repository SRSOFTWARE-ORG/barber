-- =====================================================================
-- BARBER SHOP — FASE 7: MENSAGERIA (WhatsApp Evolution + Push + Email)
-- =====================================================================
-- Pré-requisitos: phase1..phase6 executados.
-- Execute no SQL Editor. Idempotente.
--
-- CONTEÚDO:
--   1. Enums: message_channel, message_status, message_direction,
--             template_kind
--   2. messaging_settings   (config por empresa: Evolution instance, remetentes)
--   3. push_devices          (tokens Web Push / FCM / APNs por usuário)
--   4. message_templates    (templates parametrizados por empresa/canal/kind)
--   5. notification_prefs   (opt-in/opt-out por usuário e canal)
--   6. message_outbox       (fila de envio com retries e agendamento)
--   7. message_events       (log detalhado: enqueued, sent, delivered, read,
--                            failed, bounced, replied)
--   8. whatsapp_conversations + whatsapp_messages
--                           (histórico bidirecional com Evolution API)
--   9. Trigger: enfileira lembretes automáticos ao criar/confirmar booking
--  10. Função: enqueue_message(...) — helper para outras partes do sistema
--  11. Grants, RLS, updated_at, auditoria
--
-- OBSERVAÇÃO IMPORTANTE:
--   O worker que consome a `message_outbox` é uma **Edge Function**:
--   `supabase/functions/messaging-dispatcher/index.ts` (código-fonte em
--   `docs/reconstruction/edge-functions/`). Você faz o deploy manualmente
--   via `supabase functions deploy messaging-dispatcher --project-ref
--   ddrwahpcbsbxhflhskuh` e agenda um cron (pg_cron ou externo) para
--   invocá-la a cada 30–60 segundos.
--
--   Segredos necessários no Supabase (Project Settings → Edge Functions →
--   Secrets):
--     EVOLUTION_API_URL       (ex.: https://evo.suaempresa.com)
--     EVOLUTION_API_KEY       (apikey global da instância Evolution)
--     RESEND_API_KEY          (ou provedor SMTP; opcional para e-mail)
--     WEBPUSH_VAPID_PUBLIC    (opcional para Web Push)
--     WEBPUSH_VAPID_PRIVATE   (opcional para Web Push)
--     WEBPUSH_VAPID_SUBJECT   (mailto:contato@empresa.com)
-- =====================================================================

-- 1. ENUMS ---------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.message_channel AS ENUM
  ('whatsapp','email','push','sms','in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.message_status AS ENUM
  ('queued','sending','sent','delivered','read','failed','cancelled','bounced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.message_direction AS ENUM ('outbound','inbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.template_kind AS ENUM
  ('booking_created','booking_reminder','booking_cancelled','booking_confirmed',
   'booking_completed','payment_received','subscription_renewed',
   'subscription_expiring','review_request','marketing','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. MESSAGING_SETTINGS --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messaging_settings (
  company_id            uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  evolution_instance    text,              -- nome da instância na Evolution
  evolution_number      text,              -- número WhatsApp remetente (E.164)
  email_from_name       text,
  email_from_address    text,
  push_enabled          boolean NOT NULL DEFAULT true,
  whatsapp_enabled      boolean NOT NULL DEFAULT true,
  email_enabled         boolean NOT NULL DEFAULT true,
  reminder_hours_before integer NOT NULL DEFAULT 24 CHECK (reminder_hours_before BETWEEN 0 AND 240),
  send_review_request   boolean NOT NULL DEFAULT true,
  quiet_hours_start     time,              -- ex.: '21:00'
  quiet_hours_end       time,              -- ex.: '08:00'
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3. PUSH_DEVICES --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform     text NOT NULL,        -- web|android|ios
  endpoint     text NOT NULL,        -- Web Push endpoint OU FCM/APNs token
  p256dh       text,                 -- Web Push
  auth         text,                 -- Web Push
  user_agent   text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_devices(user_id) WHERE is_active;

-- 4. MESSAGE_TEMPLATES ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel        public.message_channel NOT NULL,
  kind           public.template_kind NOT NULL,
  locale         text NOT NULL DEFAULT 'pt-BR',
  name           text NOT NULL,
  subject        text,                    -- e-mail/push
  body           text NOT NULL,           -- com placeholders {{client_name}} etc.
  variables      jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, channel, kind, locale)
);

-- 5. NOTIFICATION_PREFS --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel         public.message_channel NOT NULL,
  kind            public.template_kind NOT NULL,
  opted_in        boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id, channel, kind)
);

-- 6. MESSAGE_OUTBOX (fila) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel         public.message_channel NOT NULL,
  kind            public.template_kind NOT NULL,
  template_id     uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  -- destinatário (um dos)
  to_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_client_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  to_barber_id    uuid REFERENCES public.barbers(id) ON DELETE SET NULL,
  to_phone        text,                        -- WhatsApp/SMS override
  to_email        text,                        -- Email override
  subject         text,
  body            text NOT NULL,               -- já renderizado (fallback)
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- variáveis + anexos
  -- rastreamento
  booking_id      uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.client_subscriptions(id) ON DELETE SET NULL,
  -- fila
  status          public.message_status NOT NULL DEFAULT 'queued',
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  provider_ref    text,                        -- id do provedor após envio
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  failed_at       timestamptz,
  dedupe_key      text,                        -- evita duplicatas (unique parcial)
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- índice do worker (pega próximos itens prontos)
CREATE INDEX IF NOT EXISTS idx_outbox_ready
  ON public.message_outbox(next_attempt_at)
  WHERE status IN ('queued','sending');

CREATE INDEX IF NOT EXISTS idx_outbox_company ON public.message_outbox(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_booking ON public.message_outbox(booking_id);

-- deduplicação (ex.: 1 lembrete por booking+kind)
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_dedupe
  ON public.message_outbox(company_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 7. MESSAGE_EVENTS ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id    uuid REFERENCES public.message_outbox(id) ON DELETE CASCADE,
  kind         text NOT NULL,           -- enqueued|sending|sent|delivered|read|failed|bounced|replied
  status_code  integer,
  provider_ref text,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_events_outbox ON public.message_events(outbox_id, created_at DESC);

-- 8. WHATSAPP CONVERSAS + MENSAGENS -------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id      uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone          text NOT NULL,          -- E.164
  last_message_at timestamptz,
  unread_count   integer NOT NULL DEFAULT 0,
  is_open        boolean NOT NULL DEFAULT true,
  assigned_to    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_company ON public.whatsapp_conversations(company_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction         public.message_direction NOT NULL,
  provider_ref      text,                 -- id da mensagem no Evolution
  body              text,
  media_url         text,
  media_kind        text,                 -- image|video|audio|document
  status            public.message_status NOT NULL DEFAULT 'sent',
  outbox_id         uuid REFERENCES public.message_outbox(id) ON DELETE SET NULL,
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON public.whatsapp_messages(conversation_id, created_at DESC);

-- 9. HELPER: enqueue_message --------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_message(
  _company_id       uuid,
  _channel          public.message_channel,
  _kind             public.template_kind,
  _body             text,
  _to_user_id       uuid    DEFAULT NULL,
  _to_client_id     uuid    DEFAULT NULL,
  _to_barber_id     uuid    DEFAULT NULL,
  _to_phone         text    DEFAULT NULL,
  _to_email         text    DEFAULT NULL,
  _subject          text    DEFAULT NULL,
  _payload          jsonb   DEFAULT '{}'::jsonb,
  _booking_id       uuid    DEFAULT NULL,
  _subscription_id  uuid    DEFAULT NULL,
  _scheduled_at     timestamptz DEFAULT now(),
  _dedupe_key       text    DEFAULT NULL,
  _template_id      uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.message_outbox
    (company_id, channel, kind, template_id, to_user_id, to_client_id, to_barber_id,
     to_phone, to_email, subject, body, payload, booking_id, subscription_id,
     scheduled_at, next_attempt_at, dedupe_key)
  VALUES
    (_company_id, _channel, _kind, _template_id, _to_user_id, _to_client_id, _to_barber_id,
     _to_phone, _to_email, _subject, _body, _payload, _booking_id, _subscription_id,
     _scheduled_at, _scheduled_at, _dedupe_key)
  ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO public.message_events(outbox_id, kind) VALUES (v_id, 'enqueued');
  END IF;

  RETURN v_id;
END $$;

-- 10. TRIGGER: enfileira notificações automáticas em bookings ----------
CREATE OR REPLACE FUNCTION public.enqueue_booking_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.messaging_settings%ROWTYPE;
  v_client   public.clients%ROWTYPE;
  v_remind_at timestamptz;
BEGIN
  SELECT * INTO v_settings FROM public.messaging_settings WHERE company_id = NEW.company_id;
  SELECT * INTO v_client   FROM public.clients WHERE id = NEW.client_id;

  -- 1) Criação: aviso imediato
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(v_settings.whatsapp_enabled, true) AND v_client.phone IS NOT NULL THEN
      PERFORM public.enqueue_message(
        NEW.company_id, 'whatsapp', 'booking_created',
        'Seu agendamento foi registrado. Aguardando confirmação.',
        NULL, NEW.client_id, NULL, v_client.phone, NULL, NULL,
        jsonb_build_object('booking_id', NEW.id),
        NEW.id, NULL, now(),
        'booking:' || NEW.id::text || ':created:wa'
      );
    END IF;
  END IF;

  -- 2) Confirmado: dispara lembrete (H-N horas)
  IF TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
    v_remind_at := NEW.starts_at - make_interval(hours => COALESCE(v_settings.reminder_hours_before, 24));
    IF v_remind_at < now() THEN v_remind_at := now(); END IF;

    IF COALESCE(v_settings.whatsapp_enabled, true) AND v_client.phone IS NOT NULL THEN
      PERFORM public.enqueue_message(
        NEW.company_id, 'whatsapp', 'booking_reminder',
        'Lembrete: você tem um horário agendado.',
        NULL, NEW.client_id, NULL, v_client.phone, NULL, NULL,
        jsonb_build_object('booking_id', NEW.id, 'starts_at', NEW.starts_at),
        NEW.id, NULL, v_remind_at,
        'booking:' || NEW.id::text || ':reminder:wa'
      );
    END IF;
  END IF;

  -- 3) Cancelado
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF COALESCE(v_settings.whatsapp_enabled, true) AND v_client.phone IS NOT NULL THEN
      PERFORM public.enqueue_message(
        NEW.company_id, 'whatsapp', 'booking_cancelled',
        'Seu agendamento foi cancelado.',
        NULL, NEW.client_id, NULL, v_client.phone, NULL, NULL,
        jsonb_build_object('booking_id', NEW.id),
        NEW.id, NULL, now(),
        'booking:' || NEW.id::text || ':cancelled:wa'
      );
    END IF;
  END IF;

  -- 4) Concluído: pede avaliação
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed'
     AND COALESCE(v_settings.send_review_request, true) THEN
    IF COALESCE(v_settings.whatsapp_enabled, true) AND v_client.phone IS NOT NULL THEN
      PERFORM public.enqueue_message(
        NEW.company_id, 'whatsapp', 'review_request',
        'Como foi seu atendimento? Deixe uma avaliação!',
        NULL, NEW.client_id, NULL, v_client.phone, NULL, NULL,
        jsonb_build_object('booking_id', NEW.id),
        NEW.id, NULL, now() + interval '2 hours',
        'booking:' || NEW.id::text || ':review:wa'
      );
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_notify_ins ON public.bookings;
CREATE TRIGGER trg_bookings_notify_ins
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_notifications();

DROP TRIGGER IF EXISTS trg_bookings_notify_upd ON public.bookings;
CREATE TRIGGER trg_bookings_notify_upd
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_notifications();

-- 11. UPDATED_AT + AUDITORIA -------------------------------------------
DROP TRIGGER IF EXISTS trg_msett_upd ON public.messaging_settings;
CREATE TRIGGER trg_msett_upd BEFORE UPDATE ON public.messaging_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mtmpl_upd ON public.message_templates;
CREATE TRIGGER trg_mtmpl_upd BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_outbox_upd ON public.message_outbox;
CREATE TRIGGER trg_outbox_upd BEFORE UPDATE ON public.message_outbox
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_waconv_upd ON public.whatsapp_conversations;
CREATE TRIGGER trg_waconv_upd BEFORE UPDATE ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_outbox ON public.message_outbox;
CREATE TRIGGER trg_audit_outbox AFTER INSERT OR UPDATE OR DELETE ON public.message_outbox
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_msett ON public.messaging_settings;
CREATE TRIGGER trg_audit_msett AFTER INSERT OR UPDATE OR DELETE ON public.messaging_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_mtmpl ON public.message_templates;
CREATE TRIGGER trg_audit_mtmpl AFTER INSERT OR UPDATE OR DELETE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 12. GRANTS -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.messaging_settings, public.push_devices, public.message_templates,
  public.notification_prefs, public.message_outbox, public.message_events,
  public.whatsapp_conversations, public.whatsapp_messages
TO authenticated;

GRANT ALL ON
  public.messaging_settings, public.push_devices, public.message_templates,
  public.notification_prefs, public.message_outbox, public.message_events,
  public.whatsapp_conversations, public.whatsapp_messages
TO service_role;

-- 13. RLS --------------------------------------------------------------
ALTER TABLE public.messaging_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_prefs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_outbox          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages       ENABLE ROW LEVEL SECURITY;

-- messaging_settings, templates: proprietário/gerente + platform_admin
DROP POLICY IF EXISTS p_msett_all ON public.messaging_settings;
CREATE POLICY p_msett_all ON public.messaging_settings FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_mtmpl_read ON public.message_templates;
CREATE POLICY p_mtmpl_read ON public.message_templates FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS p_mtmpl_manage ON public.message_templates;
CREATE POLICY p_mtmpl_manage ON public.message_templates
FOR INSERT TO authenticated
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS p_mtmpl_upd ON public.message_templates;
CREATE POLICY p_mtmpl_upd ON public.message_templates
FOR UPDATE TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS p_mtmpl_del ON public.message_templates;
CREATE POLICY p_mtmpl_del ON public.message_templates
FOR DELETE TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- push_devices e notification_prefs: cada user gerencia os próprios
DROP POLICY IF EXISTS p_push_all ON public.push_devices;
CREATE POLICY p_push_all ON public.push_devices FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p_prefs_all ON public.notification_prefs;
CREATE POLICY p_prefs_all ON public.notification_prefs FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- outbox/events: staff (prop/gerente) da empresa lê; escrita só service_role/staff
DROP POLICY IF EXISTS p_outbox_read ON public.message_outbox;
CREATE POLICY p_outbox_read ON public.message_outbox FOR SELECT TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_outbox_manage ON public.message_outbox;
CREATE POLICY p_outbox_manage ON public.message_outbox FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_msg_events_read ON public.message_events;
CREATE POLICY p_msg_events_read ON public.message_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.message_outbox o
               WHERE o.id = outbox_id
                 AND (public.has_company_role(auth.uid(), o.company_id, ARRAY['proprietario','gerente']::text[])
                      OR public.is_platform_admin(auth.uid()))));

-- WhatsApp conversas/mensagens: staff da empresa
DROP POLICY IF EXISTS p_waconv_all ON public.whatsapp_conversations;
CREATE POLICY p_waconv_all ON public.whatsapp_conversations FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_wamsg_all ON public.whatsapp_messages;
CREATE POLICY p_wamsg_all ON public.whatsapp_messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations c
               WHERE c.id = conversation_id
                 AND (public.has_company_role(auth.uid(), c.company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
                      OR public.is_platform_admin(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.whatsapp_conversations c
               WHERE c.id = conversation_id
                 AND (public.has_company_role(auth.uid(), c.company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
                      OR public.is_platform_admin(auth.uid()))));

-- =====================================================================
-- (Opcional) pg_cron para acionar o dispatcher a cada 30s.
-- Requer extensão pg_net + pg_cron habilitadas.
--
--   select cron.schedule(
--     'messaging-dispatcher',
--     '*/1 * * * *',
--     $$ select net.http_post(
--          url := 'https://ddrwahpcbsbxhflhskuh.functions.supabase.co/messaging-dispatcher',
--          headers := jsonb_build_object('Authorization','Bearer '||current_setting('app.functions_token'))
--        ) $$
--   );
--
-- Alternativa: use um cron externo (GitHub Actions, cron.dev, EasyCron)
-- chamando a Edge Function com um token compartilhado.
-- =====================================================================

-- =====================================================================
-- FIM DA FASE 7 (schema)
-- Deploy da Edge Function em docs/reconstruction/edge-functions/
-- =====================================================================
