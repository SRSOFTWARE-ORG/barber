-- =====================================================================
-- FASE 13 — Assinaturas SaaS da plataforma: planos, cobrança e limites por empresa
-- =====================================================================
-- Pré-requisitos: Fases 1–12 aplicadas.
-- Escopo: Diferente da Fase 7 (assinaturas de CLIENTES DENTRO da barbearia),
-- esta fase modela a assinatura da EMPRESA na PLATAFORMA (SaaS).
-- Idempotente.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.platform_plan_status AS ENUM ('draft','active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_billing_cycle AS ENUM ('monthly','yearly','one_time');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_sub_status AS ENUM (
    'trialing','active','past_due','canceled','unpaid','paused','expired','pending'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_invoice_status AS ENUM (
    'draft','open','paid','void','uncollectible','refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_payment_status AS ENUM (
    'pending','succeeded','failed','refunded','chargeback'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_provider AS ENUM ('stripe','paddle','manual','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. PLANOS SaaS (catálogo global)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  name           text NOT NULL,
  description    text,
  status         public.platform_plan_status NOT NULL DEFAULT 'draft',
  billing_cycle  public.platform_billing_cycle NOT NULL DEFAULT 'monthly',
  price_cents    integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency       char(3) NOT NULL DEFAULT 'BRL',
  trial_days     integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  is_public      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  features       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- lista textual p/ marketing
  provider       public.platform_provider NOT NULL DEFAULT 'manual',
  provider_price_id text,                              -- price_xxx / paddle price
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_plans_status ON public.platform_plans(status, is_public, sort_order);

-- ---------------------------------------------------------------------
-- 3. LIMITES / QUOTAS por plano
-- ---------------------------------------------------------------------
-- Chaves conhecidas: units, barbers, clients, bookings_month, wa_messages_month,
-- storage_mb, email_month, staff_users, subscription_plans_internal, api_calls_month
CREATE TABLE IF NOT EXISTS public.platform_plan_limits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid NOT NULL REFERENCES public.platform_plans(id) ON DELETE CASCADE,
  metric     text NOT NULL,
  max_value  bigint NOT NULL CHECK (max_value >= 0),  -- 0 = ilimitado por convenção? aqui: 0 = zero permitido; NULL abaixo trata ilimitado
  is_unlimited boolean NOT NULL DEFAULT false,
  soft_warn_pct integer NOT NULL DEFAULT 80 CHECK (soft_warn_pct BETWEEN 0 AND 100),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, metric)
);
CREATE INDEX IF NOT EXISTS idx_platform_plan_limits_plan ON public.platform_plan_limits(plan_id);

-- ---------------------------------------------------------------------
-- 4. ASSINATURAS por empresa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id            uuid NOT NULL REFERENCES public.platform_plans(id) ON DELETE RESTRICT,
  status             public.platform_sub_status NOT NULL DEFAULT 'pending',
  provider           public.platform_provider   NOT NULL DEFAULT 'manual',
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  trial_end_at       timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at        timestamptz,
  paused_at          timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_subs_company ON public.platform_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_platform_subs_status  ON public.platform_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_platform_subs_provider_sub ON public.platform_subscriptions(provider, provider_subscription_id);

-- Somente 1 assinatura ativa/trial por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_subs_active_per_company
  ON public.platform_subscriptions(company_id)
  WHERE status IN ('trialing','active','past_due','paused');

-- ---------------------------------------------------------------------
-- 5. FATURAS e PAGAMENTOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id    uuid REFERENCES public.platform_subscriptions(id) ON DELETE SET NULL,
  number             text UNIQUE,
  status             public.platform_invoice_status NOT NULL DEFAULT 'draft',
  currency           char(3) NOT NULL DEFAULT 'BRL',
  subtotal_cents     integer NOT NULL DEFAULT 0,
  tax_cents          integer NOT NULL DEFAULT 0,
  total_cents        integer NOT NULL DEFAULT 0,
  amount_paid_cents  integer NOT NULL DEFAULT 0,
  period_start       timestamptz,
  period_end         timestamptz,
  due_at             timestamptz,
  paid_at            timestamptz,
  provider           public.platform_provider NOT NULL DEFAULT 'manual',
  provider_invoice_id text,
  hosted_url         text,
  pdf_url            text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_inv_company ON public.platform_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_platform_inv_status  ON public.platform_invoices(status);
CREATE INDEX IF NOT EXISTS idx_platform_inv_provider ON public.platform_invoices(provider, provider_invoice_id);

CREATE TABLE IF NOT EXISTS public.platform_invoice_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  description  text NOT NULL,
  quantity     integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_cents   integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL DEFAULT 0,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_platform_inv_items_invoice ON public.platform_invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS public.platform_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status        public.platform_payment_status NOT NULL DEFAULT 'pending',
  amount_cents  integer NOT NULL,
  currency      char(3) NOT NULL DEFAULT 'BRL',
  provider      public.platform_provider NOT NULL DEFAULT 'manual',
  provider_payment_id text,
  method        text,           -- ex: card, boleto, pix
  paid_at       timestamptz,
  failure_reason text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_pay_company ON public.platform_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_platform_pay_invoice ON public.platform_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_platform_pay_provider ON public.platform_payments(provider, provider_payment_id);

-- ---------------------------------------------------------------------
-- 6. EVENTOS DE WEBHOOK (Stripe/Paddle) — append-only
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_billing_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      public.platform_provider NOT NULL,
  event_type    text NOT NULL,
  external_id   text,
  company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.platform_subscriptions(id) ON DELETE SET NULL,
  invoice_id    uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  process_error text,
  UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_events_type ON public.platform_billing_events(provider, event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_company ON public.platform_billing_events(company_id);

CREATE OR REPLACE FUNCTION public.tg_platform_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform_billing_events é append-only';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.provider   IS DISTINCT FROM OLD.provider   OR
    NEW.event_type IS DISTINCT FROM OLD.event_type OR
    NEW.external_id IS DISTINCT FROM OLD.external_id OR
    NEW.payload    IS DISTINCT FROM OLD.payload    OR
    NEW.received_at IS DISTINCT FROM OLD.received_at
  ) THEN
    RAISE EXCEPTION 'platform_billing_events: apenas processed_at/process_error/associações podem ser atualizados';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_platform_events_immutable ON public.platform_billing_events;
CREATE TRIGGER trg_platform_events_immutable
  BEFORE UPDATE OR DELETE ON public.platform_billing_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_platform_events_immutable();

-- ---------------------------------------------------------------------
-- 7. USO / MEDIÇÃO por empresa e métrica (mensal)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_usage_counters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric       text NOT NULL,
  period_month date NOT NULL,   -- primeiro dia do mês (UTC)
  used_value   bigint NOT NULL DEFAULT 0 CHECK (used_value >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, metric, period_month)
);
CREATE INDEX IF NOT EXISTS idx_platform_usage_company ON public.platform_usage_counters(company_id, period_month);

-- Incrementa contador (chame dos triggers de bookings/wa_messages/etc.)
CREATE OR REPLACE FUNCTION public.platform_usage_increment(
  _company_id uuid, _metric text, _delta bigint DEFAULT 1, _at timestamptz DEFAULT now()
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new bigint;
BEGIN
  INSERT INTO public.platform_usage_counters(company_id, metric, period_month, used_value)
  VALUES (_company_id, _metric, date_trunc('month', _at)::date, GREATEST(_delta, 0))
  ON CONFLICT (company_id, metric, period_month)
  DO UPDATE SET used_value = public.platform_usage_counters.used_value + GREATEST(_delta,0),
                updated_at = now()
  RETURNING used_value INTO v_new;
  RETURN v_new;
END $$;

-- ---------------------------------------------------------------------
-- 8. HELPERS: limite atual e verificação
-- ---------------------------------------------------------------------

-- Retorna assinatura ativa (ou trial) da empresa
CREATE OR REPLACE FUNCTION public.platform_active_subscription(_company_id uuid)
RETURNS public.platform_subscriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.*
  FROM public.platform_subscriptions s
  WHERE s.company_id = _company_id
    AND s.status IN ('trialing','active','past_due','paused')
  ORDER BY (s.status='active') DESC, s.updated_at DESC
  LIMIT 1;
$$;

-- Retorna limite (max, unlimited?) para uma métrica na empresa
CREATE OR REPLACE FUNCTION public.platform_limit_for(
  _company_id uuid, _metric text
) RETURNS TABLE (max_value bigint, is_unlimited boolean, plan_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.max_value, l.is_unlimited, p.code
  FROM public.platform_subscriptions s
  JOIN public.platform_plans p ON p.id = s.plan_id
  JOIN public.platform_plan_limits l ON l.plan_id = p.id AND l.metric = _metric
  WHERE s.company_id = _company_id
    AND s.status IN ('trialing','active','past_due','paused')
  ORDER BY (s.status='active') DESC, s.updated_at DESC
  LIMIT 1;
$$;

-- Verifica se ainda pode consumir X de uma métrica; lança exceção se excede
CREATE OR REPLACE FUNCTION public.platform_check_quota(
  _company_id uuid, _metric text, _delta bigint DEFAULT 1
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max bigint; v_unl boolean; v_used bigint;
BEGIN
  SELECT max_value, is_unlimited INTO v_max, v_unl
    FROM public.platform_limit_for(_company_id, _metric) LIMIT 1;

  IF NOT FOUND THEN
    -- sem plano ativo/limite definido → permissivo por padrão (bloqueio deve ser explícito)
    RETURN true;
  END IF;
  IF COALESCE(v_unl, false) THEN RETURN true; END IF;

  SELECT COALESCE(used_value, 0) INTO v_used
    FROM public.platform_usage_counters
    WHERE company_id = _company_id AND metric = _metric
      AND period_month = date_trunc('month', now())::date;

  IF (COALESCE(v_used,0) + _delta) > v_max THEN
    RAISE EXCEPTION 'quota_exceeded: metric=% used=% limit=%',
      _metric, COALESCE(v_used,0), v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN true;
END $$;

-- Atalho: consumir (checar + incrementar) atomicamente
CREATE OR REPLACE FUNCTION public.platform_consume(
  _company_id uuid, _metric text, _delta bigint DEFAULT 1
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_check_quota(_company_id, _metric, _delta);
  RETURN public.platform_usage_increment(_company_id, _metric, _delta);
END $$;

-- ---------------------------------------------------------------------
-- 9. VIEWS
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_platform_subscription_status AS
SELECT
  s.id                      AS subscription_id,
  s.company_id,
  c.name                    AS company_name,
  p.code                    AS plan_code,
  p.name                    AS plan_name,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.trial_end_at,
  s.cancel_at_period_end,
  p.price_cents,
  p.currency,
  p.billing_cycle
FROM public.platform_subscriptions s
JOIN public.companies      c ON c.id = s.company_id
JOIN public.platform_plans p ON p.id = s.plan_id;

CREATE OR REPLACE VIEW public.v_platform_usage_snapshot AS
SELECT
  u.company_id,
  u.metric,
  u.period_month,
  u.used_value,
  lim.max_value,
  lim.is_unlimited,
  lim.plan_code,
  CASE
    WHEN lim.is_unlimited THEN 0
    WHEN lim.max_value IS NULL OR lim.max_value = 0 THEN 100
    ELSE LEAST(100, floor(100.0 * u.used_value / lim.max_value))::integer
  END AS pct_used
FROM public.platform_usage_counters u
LEFT JOIN LATERAL public.platform_limit_for(u.company_id, u.metric) lim ON true;

-- ---------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.platform_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_plan_limits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoice_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_billing_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_usage_counters   ENABLE ROW LEVEL SECURITY;

-- Planos: leitura pública (autenticados), escrita apenas platform_admin
DROP POLICY IF EXISTS pp_select ON public.platform_plans;
CREATE POLICY pp_select ON public.platform_plans FOR SELECT TO authenticated
  USING (is_public OR public.has_role(auth.uid(),'platform_admin')
                   OR public.has_role(auth.uid(),'platform_support'));
DROP POLICY IF EXISTS pp_write ON public.platform_plans;
CREATE POLICY pp_write ON public.platform_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'platform_admin'));

DROP POLICY IF EXISTS ppl_select ON public.platform_plan_limits;
CREATE POLICY ppl_select ON public.platform_plan_limits FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ppl_write ON public.platform_plan_limits;
CREATE POLICY ppl_write ON public.platform_plan_limits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'platform_admin'));

-- Assinaturas: owner da empresa lê e faz updates limitados; platform_admin tudo
DROP POLICY IF EXISTS ps_select ON public.platform_subscriptions;
CREATE POLICY ps_select ON public.platform_subscriptions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR public.has_company_role(auth.uid(), company_id,'owner')
    OR public.has_company_role(auth.uid(), company_id,'manager')
  );
DROP POLICY IF EXISTS ps_write ON public.platform_subscriptions;
CREATE POLICY ps_write ON public.platform_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'platform_admin'));

-- Faturas / itens / pagamentos: owner/manager da empresa lê; platform_admin escreve
DROP POLICY IF EXISTS pi_select ON public.platform_invoices;
CREATE POLICY pi_select ON public.platform_invoices FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR public.has_company_role(auth.uid(), company_id,'owner')
    OR public.has_company_role(auth.uid(), company_id,'manager')
  );
DROP POLICY IF EXISTS pi_write ON public.platform_invoices;
CREATE POLICY pi_write ON public.platform_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'platform_admin'));

DROP POLICY IF EXISTS pii_select ON public.platform_invoice_items;
CREATE POLICY pii_select ON public.platform_invoice_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR EXISTS (SELECT 1 FROM public.platform_invoices inv
               WHERE inv.id = platform_invoice_items.invoice_id
                 AND (public.has_company_role(auth.uid(), inv.company_id,'owner')
                   OR public.has_company_role(auth.uid(), inv.company_id,'manager')))
  );

DROP POLICY IF EXISTS ppay_select ON public.platform_payments;
CREATE POLICY ppay_select ON public.platform_payments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR public.has_company_role(auth.uid(), company_id,'owner')
    OR public.has_company_role(auth.uid(), company_id,'manager')
  );

-- Eventos de billing: apenas platform staff
DROP POLICY IF EXISTS pev_select ON public.platform_billing_events;
CREATE POLICY pev_select ON public.platform_billing_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin')
      OR public.has_role(auth.uid(),'platform_support'));

-- Contadores de uso: staff da empresa e platform staff
DROP POLICY IF EXISTS puc_select ON public.platform_usage_counters;
CREATE POLICY puc_select ON public.platform_usage_counters FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'platform_support')
    OR public.has_company_role(auth.uid(), company_id,'owner')
    OR public.has_company_role(auth.uid(), company_id,'manager')
  );

-- ---------------------------------------------------------------------
-- 11. GRANTS
-- ---------------------------------------------------------------------
GRANT SELECT                          ON public.platform_plans            TO authenticated;
GRANT SELECT                          ON public.platform_plan_limits      TO authenticated;
GRANT SELECT                          ON public.platform_subscriptions    TO authenticated;
GRANT SELECT                          ON public.platform_invoices         TO authenticated;
GRANT SELECT                          ON public.platform_invoice_items    TO authenticated;
GRANT SELECT                          ON public.platform_payments         TO authenticated;
GRANT SELECT                          ON public.platform_billing_events   TO authenticated;
GRANT SELECT                          ON public.platform_usage_counters   TO authenticated;

GRANT SELECT ON public.v_platform_subscription_status TO authenticated;
GRANT SELECT ON public.v_platform_usage_snapshot      TO authenticated;

GRANT ALL ON public.platform_plans          TO service_role;
GRANT ALL ON public.platform_plan_limits    TO service_role;
GRANT ALL ON public.platform_subscriptions  TO service_role;
GRANT ALL ON public.platform_invoices       TO service_role;
GRANT ALL ON public.platform_invoice_items  TO service_role;
GRANT ALL ON public.platform_payments       TO service_role;
GRANT ALL ON public.platform_billing_events TO service_role;
GRANT ALL ON public.platform_usage_counters TO service_role;

GRANT EXECUTE ON FUNCTION public.platform_active_subscription(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_limit_for(uuid, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_check_quota(uuid, text, bigint)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_usage_increment(uuid,text,bigint,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_consume(uuid, text, bigint)        TO service_role;

COMMIT;

-- =====================================================================
-- FIM — FASE 13
-- =====================================================================
