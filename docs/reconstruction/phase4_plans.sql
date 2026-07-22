-- =====================================================================
-- BARBER SHOP — FASE 4: PLANOS DE ASSINATURA
-- =====================================================================
-- Pré-requisitos: phase1_core.sql, phase2_catalog.sql, phase3_bookings.sql
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- CONTEÚDO:
--   1. Enums: plan_billing_cycle, subscription_status, plan_service_mode,
--             plan_usage_kind
--   2. subscription_plans        (catálogo de planos por empresa)
--   3. plan_services             (serviços cobertos + limite por serviço)
--   4. client_subscriptions      (assinatura ativa do cliente)
--   5. subscription_usage        (consumo por período — 1 linha por serviço/ciclo)
--   6. subscription_events       (renovações, pausas, cancelamentos, cobranças)
--   7. Coluna bookings.subscription_id + trigger que:
--         - valida cobertura do serviço pelo plano
--         - decrementa saldo (subscription_usage)
--         - marca preço = 0 e origem = 'subscription' no snapshot
--   8. View v_subscription_balance  (saldo restante por assinatura/serviço)
--   9. Função current_period(sub_id) -> (start, end)
--  10. Grants, RLS, updated_at, auditoria
--
-- REGRA DE NEGÓCIO (pote 60/40) — implementada na FASE 5 (financeiro).
-- Aqui gravamos a receita mensal do plano; a divisão vai para phase5.
-- =====================================================================

-- 1. ENUMS ---------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.plan_billing_cycle AS ENUM ('monthly','quarterly','semiannual','annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM
    ('trialing','active','past_due','paused','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Como o plano cobre cada serviço:
--   unlimited     -> uso ilimitado no ciclo
--   quota         -> N usos por ciclo (max_uses_per_cycle)
--   discount_only -> não zera preço, aplica percentual de desconto
DO $$ BEGIN
  CREATE TYPE public.plan_service_mode AS ENUM ('unlimited','quota','discount_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_usage_kind AS ENUM ('consume','refund','adjust');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. SUBSCRIPTION_PLANS --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  price_cents     integer NOT NULL CHECK (price_cents >= 0),
  billing_cycle   public.plan_billing_cycle NOT NULL DEFAULT 'monthly',
  trial_days      integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  -- Distribuição pote (default 60% barbeiro / 40% empresa) — consumido na fase 5
  barber_share_bps integer NOT NULL DEFAULT 6000 CHECK (barber_share_bps BETWEEN 0 AND 10000),
  is_active       boolean NOT NULL DEFAULT true,
  is_public       boolean NOT NULL DEFAULT true,  -- aparece na vitrine para clientes
  badge_label     text NOT NULL DEFAULT 'PLANO',  -- selo exibido no app
  color_hex       text,                            -- para UI (opcional)
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_company ON public.subscription_plans(company_id) WHERE is_active;

-- 3. PLAN_SERVICES -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_services (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  service_id           uuid NOT NULL REFERENCES public.services(id)          ON DELETE RESTRICT,
  mode                 public.plan_service_mode NOT NULL DEFAULT 'quota',
  max_uses_per_cycle   integer,                -- obrigatório quando mode='quota'
  discount_bps         integer,                -- obrigatório quando mode='discount_only' (0..10000)
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, service_id),
  CHECK (
    (mode = 'quota'         AND max_uses_per_cycle IS NOT NULL AND max_uses_per_cycle > 0)
    OR (mode = 'unlimited'  AND max_uses_per_cycle IS NULL)
    OR (mode = 'discount_only' AND discount_bps IS NOT NULL AND discount_bps BETWEEN 1 AND 10000)
  )
);
CREATE INDEX IF NOT EXISTS idx_plan_services_plan    ON public.plan_services(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_services_service ON public.plan_services(service_id);

-- 4. CLIENT_SUBSCRIPTIONS ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id             uuid NOT NULL REFERENCES public.clients(id)   ON DELETE RESTRICT,
  plan_id               uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status                public.subscription_status NOT NULL DEFAULT 'active',
  started_at            timestamptz NOT NULL DEFAULT now(),
  trial_ends_at         timestamptz,
  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz NOT NULL,
  cancel_at_period_end  boolean NOT NULL DEFAULT false,
  cancelled_at          timestamptz,
  external_ref          text,   -- id gateway pagamento (Stripe/Paddle/etc.)
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_company ON public.client_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subs_client  ON public.client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subs_status  ON public.client_subscriptions(status);
-- Um cliente só pode ter UMA assinatura ativa por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_sub_per_client
  ON public.client_subscriptions(company_id, client_id)
  WHERE status IN ('trialing','active','past_due');

-- 5. SUBSCRIPTION_USAGE (saldo por serviço/ciclo) ------------------------
CREATE TABLE IF NOT EXISTS public.subscription_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES public.client_subscriptions(id) ON DELETE CASCADE,
  service_id        uuid NOT NULL REFERENCES public.services(id)             ON DELETE RESTRICT,
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  used_count        integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  max_allowed       integer,          -- NULL = ilimitado; snapshot do plan_services
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, service_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_usage_sub ON public.subscription_usage(subscription_id);

-- 6. SUBSCRIPTION_EVENTS -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES public.client_subscriptions(id) ON DELETE CASCADE,
  kind             text NOT NULL,     -- created|renewed|paused|resumed|cancelled|payment_ok|payment_failed|adjustment
  amount_cents     integer,
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_events_sub  ON public.subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_kind ON public.subscription_events(kind);

-- 7. LIGAÇÃO BOOKING <-> ASSINATURA --------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS subscription_id uuid
    REFERENCES public.client_subscriptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_subscription
  ON public.bookings(subscription_id) WHERE subscription_id IS NOT NULL;

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS covered_by_plan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_discount_bps integer;

-- 8. FUNÇÕES DE APOIO ----------------------------------------------------

-- Período atual da assinatura (start,end)
CREATE OR REPLACE FUNCTION public.subscription_current_period(_sub uuid)
RETURNS TABLE(period_start timestamptz, period_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_period_start, current_period_end
  FROM public.client_subscriptions WHERE id = _sub
$$;

-- Trigger em booking_services: valida cobertura, decrementa saldo, zera preço
CREATE OR REPLACE FUNCTION public.apply_subscription_to_booking_service()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub          public.client_subscriptions%ROWTYPE;
  v_ps           public.plan_services%ROWTYPE;
  v_pstart       timestamptz;
  v_pend         timestamptz;
  v_usage_id     uuid;
  v_used         integer;
BEGIN
  -- Só age se o booking pai tem subscription_id
  SELECT * INTO v_sub
  FROM public.client_subscriptions
  WHERE id = (SELECT subscription_id FROM public.bookings WHERE id = NEW.booking_id);

  IF v_sub.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_sub.status NOT IN ('trialing','active') THEN
    RAISE EXCEPTION 'Assinatura % não está ativa (status=%)', v_sub.id, v_sub.status;
  END IF;

  -- Serviço precisa estar no plano
  SELECT ps.* INTO v_ps
  FROM public.plan_services ps
  WHERE ps.plan_id = v_sub.plan_id AND ps.service_id = NEW.service_id;

  IF v_ps.id IS NULL THEN
    RAISE EXCEPTION 'Serviço % não é coberto pelo plano da assinatura', NEW.service_id;
  END IF;

  v_pstart := v_sub.current_period_start;
  v_pend   := v_sub.current_period_end;

  IF v_ps.mode = 'discount_only' THEN
    NEW.covered_by_plan   := false;
    NEW.plan_discount_bps := v_ps.discount_bps;
    NEW.unit_price_cents  := (NEW.unit_price_cents * (10000 - v_ps.discount_bps)) / 10000;
    RETURN NEW;
  END IF;

  -- unlimited ou quota: garante linha de usage
  INSERT INTO public.subscription_usage
    (subscription_id, service_id, period_start, period_end, used_count, max_allowed)
  VALUES
    (v_sub.id, NEW.service_id, v_pstart, v_pend, 0,
     CASE WHEN v_ps.mode='quota' THEN v_ps.max_uses_per_cycle ELSE NULL END)
  ON CONFLICT (subscription_id, service_id, period_start) DO NOTHING;

  SELECT id, used_count INTO v_usage_id, v_used
  FROM public.subscription_usage
  WHERE subscription_id = v_sub.id AND service_id = NEW.service_id AND period_start = v_pstart
  FOR UPDATE;

  IF v_ps.mode = 'quota' AND v_used >= v_ps.max_uses_per_cycle THEN
    RAISE EXCEPTION 'Saldo do plano esgotado para este serviço no ciclo atual';
  END IF;

  UPDATE public.subscription_usage
     SET used_count = used_count + 1, updated_at = now()
   WHERE id = v_usage_id;

  NEW.covered_by_plan  := true;
  NEW.unit_price_cents := 0;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_subscription ON public.booking_services;
CREATE TRIGGER trg_apply_subscription
BEFORE INSERT ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.apply_subscription_to_booking_service();

-- Ao cancelar/estornar item de booking, devolve o saldo
CREATE OR REPLACE FUNCTION public.refund_subscription_usage()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub_id uuid;
  v_pstart timestamptz;
BEGIN
  IF NOT OLD.covered_by_plan THEN RETURN OLD; END IF;

  SELECT subscription_id INTO v_sub_id FROM public.bookings WHERE id = OLD.booking_id;
  IF v_sub_id IS NULL THEN RETURN OLD; END IF;

  SELECT current_period_start INTO v_pstart FROM public.client_subscriptions WHERE id = v_sub_id;

  UPDATE public.subscription_usage
     SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
   WHERE subscription_id = v_sub_id
     AND service_id = OLD.service_id
     AND period_start = v_pstart;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_refund_subscription ON public.booking_services;
CREATE TRIGGER trg_refund_subscription
AFTER DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.refund_subscription_usage();

-- View de saldo restante
CREATE OR REPLACE VIEW public.v_subscription_balance AS
SELECT
  u.subscription_id,
  s.company_id,
  s.client_id,
  u.service_id,
  u.period_start,
  u.period_end,
  u.max_allowed,
  u.used_count,
  CASE WHEN u.max_allowed IS NULL THEN NULL
       ELSE GREATEST(u.max_allowed - u.used_count, 0) END AS remaining
FROM public.subscription_usage u
JOIN public.client_subscriptions s ON s.id = u.subscription_id;

-- 9. UPDATED_AT ----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_plans_upd  ON public.subscription_plans;
CREATE TRIGGER trg_plans_upd  BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_subs_upd   ON public.client_subscriptions;
CREATE TRIGGER trg_subs_upd   BEFORE UPDATE ON public.client_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_usage_upd  ON public.subscription_usage;
CREATE TRIGGER trg_usage_upd  BEFORE UPDATE ON public.subscription_usage
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. AUDITORIA ----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_plans ON public.subscription_plans;
CREATE TRIGGER trg_audit_plans AFTER INSERT OR UPDATE OR DELETE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_plan_services ON public.plan_services;
CREATE TRIGGER trg_audit_plan_services AFTER INSERT OR UPDATE OR DELETE ON public.plan_services
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_subs ON public.client_subscriptions;
CREATE TRIGGER trg_audit_subs AFTER INSERT OR UPDATE OR DELETE ON public.client_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_sub_events ON public.subscription_events;
CREATE TRIGGER trg_audit_sub_events AFTER INSERT OR UPDATE OR DELETE ON public.subscription_events
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 11. GRANTS -------------------------------------------------------------
GRANT SELECT ON public.subscription_plans TO anon, authenticated;  -- vitrine pública
GRANT INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

GRANT SELECT ON public.plan_services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_services TO authenticated;
GRANT ALL ON public.plan_services TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_subscriptions TO authenticated;
GRANT ALL ON public.client_subscriptions TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.subscription_usage TO authenticated;
GRANT ALL ON public.subscription_usage TO service_role;

GRANT SELECT, INSERT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;

GRANT SELECT ON public.v_subscription_balance TO authenticated;
GRANT ALL  ON public.v_subscription_balance TO service_role;

-- 12. RLS ---------------------------------------------------------------
ALTER TABLE public.subscription_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events    ENABLE ROW LEVEL SECURITY;

-- Planos: público pode ver planos ativos+públicos (vitrine); staff da empresa gerencia
DROP POLICY IF EXISTS p_plans_public_read ON public.subscription_plans;
CREATE POLICY p_plans_public_read ON public.subscription_plans
FOR SELECT USING (is_active AND is_public);

DROP POLICY IF EXISTS p_plans_company_read ON public.subscription_plans;
CREATE POLICY p_plans_company_read ON public.subscription_plans
FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS p_plans_manage ON public.subscription_plans;
CREATE POLICY p_plans_manage ON public.subscription_plans
FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- plan_services herda do plano
DROP POLICY IF EXISTS p_plan_services_read ON public.plan_services;
CREATE POLICY p_plan_services_read ON public.plan_services
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.subscription_plans p
          WHERE p.id = plan_id AND (
            (p.is_active AND p.is_public)
            OR public.is_company_member(auth.uid(), p.company_id)
          ))
);

DROP POLICY IF EXISTS p_plan_services_manage ON public.plan_services;
CREATE POLICY p_plan_services_manage ON public.plan_services
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.subscription_plans p
               WHERE p.id = plan_id
                 AND (public.has_company_role(auth.uid(), p.company_id, ARRAY['proprietario','gerente']::text[])
                      OR public.is_platform_admin(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.subscription_plans p
               WHERE p.id = plan_id
                 AND (public.has_company_role(auth.uid(), p.company_id, ARRAY['proprietario','gerente']::text[])
                      OR public.is_platform_admin(auth.uid()))));

-- Assinaturas: cliente vê a própria; staff da empresa vê todas
DROP POLICY IF EXISTS p_subs_read ON public.client_subscriptions;
CREATE POLICY p_subs_read ON public.client_subscriptions
FOR SELECT TO authenticated
USING (
  public.is_company_member(auth.uid(), company_id)
  OR EXISTS (SELECT 1 FROM public.clients c
             WHERE c.id = client_id AND c.user_id = auth.uid())
);

DROP POLICY IF EXISTS p_subs_manage ON public.client_subscriptions;
CREATE POLICY p_subs_manage ON public.client_subscriptions
FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- Usage: leitura para membros da empresa e o cliente dono; escrita só via trigger/service_role/staff
DROP POLICY IF EXISTS p_usage_read ON public.subscription_usage;
CREATE POLICY p_usage_read ON public.subscription_usage
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_subscriptions s
               LEFT JOIN public.clients c ON c.id = s.client_id
               WHERE s.id = subscription_id
                 AND (public.is_company_member(auth.uid(), s.company_id)
                      OR c.user_id = auth.uid())));

DROP POLICY IF EXISTS p_usage_manage ON public.subscription_usage;
CREATE POLICY p_usage_manage ON public.subscription_usage
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_subscriptions s
               WHERE s.id = subscription_id
                 AND (public.has_company_role(auth.uid(), s.company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
                      OR public.is_platform_admin(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.client_subscriptions s
               WHERE s.id = subscription_id
                 AND (public.has_company_role(auth.uid(), s.company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
                      OR public.is_platform_admin(auth.uid()))));

-- Events: leitura para staff e cliente dono; inserção só staff/service_role
DROP POLICY IF EXISTS p_sub_events_read ON public.subscription_events;
CREATE POLICY p_sub_events_read ON public.subscription_events
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_subscriptions s
               LEFT JOIN public.clients c ON c.id = s.client_id
               WHERE s.id = subscription_id
                 AND (public.is_company_member(auth.uid(), s.company_id)
                      OR c.user_id = auth.uid())));

DROP POLICY IF EXISTS p_sub_events_insert ON public.subscription_events;
CREATE POLICY p_sub_events_insert ON public.subscription_events
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.client_subscriptions s
               WHERE s.id = subscription_id
                 AND (public.has_company_role(auth.uid(), s.company_id, ARRAY['proprietario','gerente']::text[])
                      OR public.is_platform_admin(auth.uid()))));

-- =====================================================================
-- FIM DA FASE 4
-- =====================================================================
