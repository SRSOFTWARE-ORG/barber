-- =====================================================================
-- BARBER SHOP — FASE 5: FINANCEIRO
-- =====================================================================
-- Pré-requisitos: phase1..phase4 executados.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- CONTEÚDO:
--   1. Enums: payment_method, transaction_kind, transaction_status,
--             commission_status, payout_status, merit_metric
--   2. finance_accounts        (contas/carteiras: caixa, banco, gateway)
--   3. finance_categories      (categorias de receita/despesa)
--   4. finance_transactions    (livro caixa unificado — receita/despesa)
--   5. booking_payments        (pagamentos vinculados a agendamentos)
--   6. commissions             (comissão por serviço executado)
--   7. subscription_pot        (pote 60/40 por ciclo/empresa)
--   8. subscription_pot_shares (rateio para barbeiros — meritocracia)
--   9. barber_payouts + payout_items  (fechamento/repasse)
--  10. merit_scores            (pontuação de meritocracia por período)
--  11. Triggers automáticos:
--         - booking completed -> gera commissions
--         - subscription_events(payment_ok) -> alimenta subscription_pot
--         - fechamento de ciclo -> calcula shares por merit_score
--  12. Views: v_finance_dre, v_barber_earnings, v_pot_summary
--  13. Grants, RLS, updated_at, auditoria
-- =====================================================================

-- 1. ENUMS ---------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.payment_method AS ENUM
  ('cash','debit','credit','pix','transfer','voucher','plan','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.transaction_kind AS ENUM ('income','expense','transfer','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.transaction_status AS ENUM ('pending','confirmed','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.commission_status AS ENUM ('pending','locked','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.payout_status AS ENUM ('draft','approved','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.merit_metric AS ENUM
  ('revenue','completed_bookings','rating_avg','retention','punctuality','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. FINANCE_ACCOUNTS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id      uuid REFERENCES public.units(id) ON DELETE SET NULL,
  name         text NOT NULL,
  kind         text NOT NULL DEFAULT 'cash',   -- cash|bank|gateway|wallet
  currency     text NOT NULL DEFAULT 'BRL',
  is_active    boolean NOT NULL DEFAULT true,
  opening_balance_cents bigint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facc_company ON public.finance_accounts(company_id);

-- 3. FINANCE_CATEGORIES --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind        public.transaction_kind NOT NULL,
  name        text NOT NULL,
  color_hex   text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind, name)
);

-- 4. FINANCE_TRANSACTIONS ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id           uuid REFERENCES public.units(id) ON DELETE SET NULL,
  account_id        uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  category_id       uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  kind              public.transaction_kind NOT NULL,
  status            public.transaction_status NOT NULL DEFAULT 'confirmed',
  method            public.payment_method,
  amount_cents      bigint NOT NULL CHECK (amount_cents <> 0),  -- income>0, expense<0
  description       text,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  -- Vínculos opcionais (rastreabilidade)
  booking_id        uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  subscription_id   uuid REFERENCES public.client_subscriptions(id) ON DELETE SET NULL,
  barber_id         uuid REFERENCES public.barbers(id) ON DELETE SET NULL,
  meta              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ftx_company_time ON public.finance_transactions(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ftx_unit         ON public.finance_transactions(unit_id);
CREATE INDEX IF NOT EXISTS idx_ftx_booking      ON public.finance_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_ftx_subscription ON public.finance_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_ftx_barber       ON public.finance_transactions(barber_id);

-- 5. BOOKING_PAYMENTS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  method        public.payment_method NOT NULL,
  paid_at       timestamptz NOT NULL DEFAULT now(),
  transaction_id uuid REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  notes         text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bpay_booking ON public.booking_payments(booking_id);

-- 6. COMMISSIONS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commissions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id              uuid REFERENCES public.units(id) ON DELETE SET NULL,
  barber_id            uuid NOT NULL REFERENCES public.barbers(id) ON DELETE RESTRICT,
  booking_id           uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  booking_service_id   uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE CASCADE,
  service_id           uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  base_amount_cents    bigint NOT NULL,       -- valor do serviço
  rate_bps             integer NOT NULL,      -- 0..10000
  amount_cents         bigint NOT NULL,       -- base * rate / 10000
  covered_by_plan      boolean NOT NULL DEFAULT false, -- se true, comissão vem do pote
  status               public.commission_status NOT NULL DEFAULT 'pending',
  payout_id            uuid,   -- FK adicionada mais adiante
  earned_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_service_id)
);
CREATE INDEX IF NOT EXISTS idx_comm_barber_time ON public.commissions(barber_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_company     ON public.commissions(company_id);
CREATE INDEX IF NOT EXISTS idx_comm_status      ON public.commissions(status);

-- 7. SUBSCRIPTION_POT (pote 60/40 por ciclo/empresa) --------------------
CREATE TABLE IF NOT EXISTS public.subscription_pot (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start          timestamptz NOT NULL,
  period_end            timestamptz NOT NULL,
  gross_cents           bigint NOT NULL DEFAULT 0,   -- soma paga pelos clientes
  barber_share_cents    bigint NOT NULL DEFAULT 0,   -- 60% (default)
  company_share_cents   bigint NOT NULL DEFAULT 0,   -- 40% (default)
  barber_share_bps      integer NOT NULL DEFAULT 6000,
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_pot_company ON public.subscription_pot(company_id, period_start DESC);

-- 8. SUBSCRIPTION_POT_SHARES (rateio por meritocracia) ------------------
CREATE TABLE IF NOT EXISTS public.subscription_pot_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id        uuid NOT NULL REFERENCES public.subscription_pot(id) ON DELETE CASCADE,
  barber_id     uuid NOT NULL REFERENCES public.barbers(id) ON DELETE RESTRICT,
  score         numeric(12,4) NOT NULL DEFAULT 0,
  share_bps     integer NOT NULL DEFAULT 0,   -- fração do pote (0..10000)
  amount_cents  bigint NOT NULL DEFAULT 0,
  payout_id     uuid,   -- FK abaixo
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pot_id, barber_id)
);

-- 9. PAYOUTS -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barber_payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  barber_id      uuid NOT NULL REFERENCES public.barbers(id) ON DELETE RESTRICT,
  period_start   timestamptz NOT NULL,
  period_end     timestamptz NOT NULL,
  commissions_cents  bigint NOT NULL DEFAULT 0,
  pot_share_cents    bigint NOT NULL DEFAULT 0,
  adjustments_cents  bigint NOT NULL DEFAULT 0,
  total_cents        bigint NOT NULL DEFAULT 0,
  status         public.payout_status NOT NULL DEFAULT 'draft',
  paid_at        timestamptz,
  transaction_id uuid REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_barber ON public.barber_payouts(barber_id, period_end DESC);

-- FKs de volta (agora que payouts existe)
ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_payout_fk,
  ADD CONSTRAINT commissions_payout_fk
    FOREIGN KEY (payout_id) REFERENCES public.barber_payouts(id) ON DELETE SET NULL;

ALTER TABLE public.subscription_pot_shares
  DROP CONSTRAINT IF EXISTS pot_shares_payout_fk,
  ADD CONSTRAINT pot_shares_payout_fk
    FOREIGN KEY (payout_id) REFERENCES public.barber_payouts(id) ON DELETE SET NULL;

-- 10. MERIT_SCORES ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merit_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  barber_id     uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  metric        public.merit_metric NOT NULL,
  value         numeric(14,4) NOT NULL DEFAULT 0,
  weight_bps    integer NOT NULL DEFAULT 10000,  -- peso da métrica
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, barber_id, period_start, metric)
);
CREATE INDEX IF NOT EXISTS idx_merit_period ON public.merit_scores(company_id, period_start);

-- 11. TRIGGERS DE NEGÓCIO ----------------------------------------------

-- 11a. Ao completar booking, gera commissions para cada booking_service
CREATE OR REPLACE FUNCTION public.generate_commissions_on_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bs RECORD;
  v_rate integer;
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  FOR bs IN
    SELECT bs.*, s.name AS service_name
    FROM public.booking_services bs
    JOIN public.services s ON s.id = bs.service_id
    WHERE bs.booking_id = NEW.id
  LOOP
    -- taxa: override em barber_services > default do service
    SELECT COALESCE(bsv.commission_bps, s.commission_bps, 5000)
      INTO v_rate
    FROM public.services s
    LEFT JOIN public.barber_services bsv
      ON bsv.service_id = s.id AND bsv.barber_id = NEW.barber_id
    WHERE s.id = bs.service_id;

    INSERT INTO public.commissions
      (company_id, unit_id, barber_id, booking_id, booking_service_id,
       service_id, base_amount_cents, rate_bps, amount_cents,
       covered_by_plan, status, earned_at)
    VALUES
      (NEW.company_id, NEW.unit_id, NEW.barber_id, NEW.id, bs.id,
       bs.service_id,
       COALESCE(bs.unit_price_cents,0) * COALESCE(bs.quantity,1),
       v_rate,
       -- Se coberto pelo plano, comissão direta = 0 (barbeiro recebe pelo pote)
       CASE WHEN bs.covered_by_plan THEN 0
            ELSE (COALESCE(bs.unit_price_cents,0) * COALESCE(bs.quantity,1) * v_rate) / 10000 END,
       bs.covered_by_plan,
       'pending',
       COALESCE(NEW.ends_at, now()))
    ON CONFLICT (booking_service_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gen_commissions ON public.bookings;
CREATE TRIGGER trg_gen_commissions
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.generate_commissions_on_complete();

-- 11b. Ao receber payment_ok em subscription_events, alimenta o pote
CREATE OR REPLACE FUNCTION public.feed_subscription_pot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub  public.client_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_barber_bps integer;
  v_barber_amt bigint;
  v_company_amt bigint;
BEGIN
  IF NEW.kind <> 'payment_ok' OR COALESCE(NEW.amount_cents,0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_sub  FROM public.client_subscriptions WHERE id = NEW.subscription_id;
  SELECT * INTO v_plan FROM public.subscription_plans   WHERE id = v_sub.plan_id;

  v_barber_bps  := COALESCE(v_plan.barber_share_bps, 6000);
  v_barber_amt  := (NEW.amount_cents * v_barber_bps) / 10000;
  v_company_amt := NEW.amount_cents - v_barber_amt;

  INSERT INTO public.subscription_pot
    (company_id, period_start, period_end, gross_cents,
     barber_share_cents, company_share_cents, barber_share_bps)
  VALUES
    (v_sub.company_id, v_sub.current_period_start, v_sub.current_period_end,
     NEW.amount_cents, v_barber_amt, v_company_amt, v_barber_bps)
  ON CONFLICT (company_id, period_start) DO UPDATE
    SET gross_cents         = public.subscription_pot.gross_cents + EXCLUDED.gross_cents,
        barber_share_cents  = public.subscription_pot.barber_share_cents + EXCLUDED.barber_share_cents,
        company_share_cents = public.subscription_pot.company_share_cents + EXCLUDED.company_share_cents,
        updated_at = now();

  -- Receita do plano no livro caixa
  INSERT INTO public.finance_transactions
    (company_id, kind, status, method, amount_cents, description,
     subscription_id, occurred_at)
  VALUES
    (v_sub.company_id, 'income', 'confirmed', 'plan',
     NEW.amount_cents,
     'Assinatura: ' || v_plan.name,
     v_sub.id, NEW.created_at);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_feed_pot ON public.subscription_events;
CREATE TRIGGER trg_feed_pot
AFTER INSERT ON public.subscription_events
FOR EACH ROW EXECUTE FUNCTION public.feed_subscription_pot();

-- 11c. Fechamento do pote: distribui pelo score de meritocracia
CREATE OR REPLACE FUNCTION public.close_subscription_pot(_pot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pot   public.subscription_pot%ROWTYPE;
  v_total numeric := 0;
  v_row RECORD;
  v_assigned bigint := 0;
BEGIN
  SELECT * INTO v_pot FROM public.subscription_pot WHERE id = _pot_id FOR UPDATE;
  IF v_pot.id IS NULL THEN RAISE EXCEPTION 'Pote inexistente'; END IF;
  IF v_pot.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Pote já fechado'; END IF;

  -- Soma scores agregados (peso*valor) por barbeiro no período
  DELETE FROM public.subscription_pot_shares WHERE pot_id = _pot_id;

  CREATE TEMP TABLE _scores ON COMMIT DROP AS
  SELECT ms.barber_id,
         SUM(ms.value * (ms.weight_bps::numeric/10000)) AS score
  FROM public.merit_scores ms
  WHERE ms.company_id  = v_pot.company_id
    AND ms.period_start = v_pot.period_start
  GROUP BY ms.barber_id;

  SELECT COALESCE(SUM(score),0) INTO v_total FROM _scores WHERE score > 0;

  IF v_total = 0 THEN
    -- fallback: divisão igualitária entre barbeiros ativos da empresa
    INSERT INTO _scores(barber_id, score)
    SELECT b.id, 1
    FROM public.barbers b
    WHERE b.company_id = v_pot.company_id AND b.is_active
    ON CONFLICT DO NOTHING;
    SELECT COALESCE(SUM(score),0) INTO v_total FROM _scores;
  END IF;

  FOR v_row IN SELECT * FROM _scores WHERE score > 0 LOOP
    INSERT INTO public.subscription_pot_shares
      (pot_id, barber_id, score, share_bps, amount_cents)
    VALUES
      (_pot_id, v_row.barber_id, v_row.score,
       ((v_row.score / v_total) * 10000)::int,
       ((v_row.score / v_total) * v_pot.barber_share_cents)::bigint);
  END LOOP;

  -- ajuste de arredondamento no último
  SELECT COALESCE(SUM(amount_cents),0) INTO v_assigned
  FROM public.subscription_pot_shares WHERE pot_id = _pot_id;

  UPDATE public.subscription_pot_shares
     SET amount_cents = amount_cents + (v_pot.barber_share_cents - v_assigned)
   WHERE id = (SELECT id FROM public.subscription_pot_shares
               WHERE pot_id = _pot_id ORDER BY amount_cents DESC LIMIT 1);

  UPDATE public.subscription_pot SET closed_at = now(), updated_at = now() WHERE id = _pot_id;
END $$;

-- 12. VIEWS -------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_finance_dre AS
SELECT
  company_id,
  date_trunc('month', occurred_at) AS month,
  SUM(CASE WHEN kind='income'  AND status='confirmed' THEN amount_cents ELSE 0 END) AS income_cents,
  SUM(CASE WHEN kind='expense' AND status='confirmed' THEN -amount_cents ELSE 0 END) AS expense_cents,
  SUM(CASE WHEN status='confirmed' THEN
        CASE WHEN kind='income' THEN amount_cents
             WHEN kind='expense' THEN amount_cents  -- expense é negativo
             ELSE 0 END
       ELSE 0 END) AS net_cents
FROM public.finance_transactions
GROUP BY company_id, date_trunc('month', occurred_at);

CREATE OR REPLACE VIEW public.v_barber_earnings AS
SELECT
  c.company_id,
  c.barber_id,
  date_trunc('month', c.earned_at) AS month,
  SUM(c.amount_cents) FILTER (WHERE NOT c.covered_by_plan) AS direct_commissions_cents,
  COUNT(*) FILTER (WHERE c.covered_by_plan) AS plan_services_count,
  COUNT(*) AS total_services
FROM public.commissions c
WHERE c.status <> 'cancelled'
GROUP BY c.company_id, c.barber_id, date_trunc('month', c.earned_at);

CREATE OR REPLACE VIEW public.v_pot_summary AS
SELECT p.company_id, p.id AS pot_id, p.period_start, p.period_end,
       p.gross_cents, p.barber_share_cents, p.company_share_cents,
       p.closed_at,
       COALESCE(SUM(s.amount_cents),0) AS distributed_cents
FROM public.subscription_pot p
LEFT JOIN public.subscription_pot_shares s ON s.pot_id = p.id
GROUP BY p.id;

-- 13. UPDATED_AT + AUDITORIA -------------------------------------------
DROP TRIGGER IF EXISTS trg_facc_upd  ON public.finance_accounts;
CREATE TRIGGER trg_facc_upd  BEFORE UPDATE ON public.finance_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ftx_upd   ON public.finance_transactions;
CREATE TRIGGER trg_ftx_upd   BEFORE UPDATE ON public.finance_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_comm_upd  ON public.commissions;
CREATE TRIGGER trg_comm_upd  BEFORE UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pot_upd   ON public.subscription_pot;
CREATE TRIGGER trg_pot_upd   BEFORE UPDATE ON public.subscription_pot
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pots_upd  ON public.subscription_pot_shares;
CREATE TRIGGER trg_pots_upd  BEFORE UPDATE ON public.subscription_pot_shares
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payout_upd ON public.barber_payouts;
CREATE TRIGGER trg_payout_upd BEFORE UPDATE ON public.barber_payouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  PERFORM 1;
  -- auditoria
END $$;

DROP TRIGGER IF EXISTS trg_audit_ftx    ON public.finance_transactions;
CREATE TRIGGER trg_audit_ftx    AFTER INSERT OR UPDATE OR DELETE ON public.finance_transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_comm   ON public.commissions;
CREATE TRIGGER trg_audit_comm   AFTER INSERT OR UPDATE OR DELETE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_pot    ON public.subscription_pot;
CREATE TRIGGER trg_audit_pot    AFTER INSERT OR UPDATE OR DELETE ON public.subscription_pot
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_pots   ON public.subscription_pot_shares;
CREATE TRIGGER trg_audit_pots   AFTER INSERT OR UPDATE OR DELETE ON public.subscription_pot_shares
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_payout ON public.barber_payouts;
CREATE TRIGGER trg_audit_payout AFTER INSERT OR UPDATE OR DELETE ON public.barber_payouts
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_merit  ON public.merit_scores;
CREATE TRIGGER trg_audit_merit  AFTER INSERT OR UPDATE OR DELETE ON public.merit_scores
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 14. GRANTS -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.finance_accounts, public.finance_categories, public.finance_transactions,
  public.booking_payments, public.commissions, public.subscription_pot,
  public.subscription_pot_shares, public.barber_payouts, public.merit_scores
TO authenticated;

GRANT ALL ON
  public.finance_accounts, public.finance_categories, public.finance_transactions,
  public.booking_payments, public.commissions, public.subscription_pot,
  public.subscription_pot_shares, public.barber_payouts, public.merit_scores
TO service_role;

GRANT SELECT ON
  public.v_finance_dre, public.v_barber_earnings, public.v_pot_summary
TO authenticated;

-- 15. RLS --------------------------------------------------------------
ALTER TABLE public.finance_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_pot        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_pot_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_payouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merit_scores            ENABLE ROW LEVEL SECURITY;

-- Financeiro sensível: só proprietário/gerente + platform_admin
DROP POLICY IF EXISTS p_facc_all ON public.finance_accounts;
CREATE POLICY p_facc_all ON public.finance_accounts FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_fcat_all ON public.finance_categories;
CREATE POLICY p_fcat_all ON public.finance_categories FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_ftx_all ON public.finance_transactions;
CREATE POLICY p_ftx_all ON public.finance_transactions FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- Pagamentos de booking: staff da empresa (inclui barbeiro para registrar)
DROP POLICY IF EXISTS p_bpay_all ON public.booking_payments;
CREATE POLICY p_bpay_all ON public.booking_payments FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente','barbeiro']::text[])
       OR public.is_platform_admin(auth.uid()));

-- Commissions: barbeiro vê as próprias; staff vê tudo da empresa
DROP POLICY IF EXISTS p_comm_read ON public.commissions;
CREATE POLICY p_comm_read ON public.commissions FOR SELECT TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS p_comm_manage ON public.commissions;
CREATE POLICY p_comm_manage ON public.commissions FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- Pote e shares: leitura para staff e barbeiro dono do share; escrita só staff
DROP POLICY IF EXISTS p_pot_read ON public.subscription_pot;
CREATE POLICY p_pot_read ON public.subscription_pot FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS p_pot_manage ON public.subscription_pot;
CREATE POLICY p_pot_manage ON public.subscription_pot FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_pots_read ON public.subscription_pot_shares;
CREATE POLICY p_pots_read ON public.subscription_pot_shares FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.subscription_pot p
          WHERE p.id = pot_id
            AND (public.is_company_member(auth.uid(), p.company_id)
                 OR EXISTS (SELECT 1 FROM public.barbers b
                            WHERE b.id = subscription_pot_shares.barber_id AND b.user_id = auth.uid()))));

DROP POLICY IF EXISTS p_pots_manage ON public.subscription_pot_shares;
CREATE POLICY p_pots_manage ON public.subscription_pot_shares FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.subscription_pot p
               WHERE p.id = pot_id
                 AND (public.has_company_role(auth.uid(), p.company_id, ARRAY['proprietario','gerente']::text[])
                      OR public.is_platform_admin(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.subscription_pot p
               WHERE p.id = pot_id
                 AND (public.has_company_role(auth.uid(), p.company_id, ARRAY['proprietario','gerente']::text[])
                      OR public.is_platform_admin(auth.uid()))));

-- Payouts: barbeiro vê os próprios; staff gerencia
DROP POLICY IF EXISTS p_payout_read ON public.barber_payouts;
CREATE POLICY p_payout_read ON public.barber_payouts FOR SELECT TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS p_payout_manage ON public.barber_payouts;
CREATE POLICY p_payout_manage ON public.barber_payouts FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- Merit_scores: barbeiro vê os próprios; staff gerencia
DROP POLICY IF EXISTS p_merit_read ON public.merit_scores;
CREATE POLICY p_merit_read ON public.merit_scores FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id)
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS p_merit_manage ON public.merit_scores;
CREATE POLICY p_merit_manage ON public.merit_scores FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- =====================================================================
-- FIM DA FASE 5
-- =====================================================================
