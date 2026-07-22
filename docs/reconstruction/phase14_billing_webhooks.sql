-- =====================================================================
-- FASE 14 — Webhook de billing (Stripe/Paddle): reconciliação e idempotência
-- Depende da Fase 13 (platform_plans, platform_subscriptions,
-- platform_invoices, platform_invoice_items, platform_payments,
-- platform_billing_events).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Mapeamento provider_price -> plano interno
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_provider_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.platform_plans(id) ON DELETE CASCADE,
  provider public.platform_provider NOT NULL,
  provider_price_id text NOT NULL,
  billing_cycle public.platform_billing_cycle NOT NULL DEFAULT 'monthly',
  currency text NOT NULL DEFAULT 'BRL',
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_price_id)
);

CREATE INDEX IF NOT EXISTS ix_pp_prices_plan ON public.platform_provider_prices(plan_id);

GRANT SELECT ON public.platform_provider_prices TO authenticated;
GRANT ALL    ON public.platform_provider_prices TO service_role;
ALTER TABLE public.platform_provider_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_prices_read_all ON public.platform_provider_prices;
CREATE POLICY pp_prices_read_all ON public.platform_provider_prices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pp_prices_admin_write ON public.platform_provider_prices;
CREATE POLICY pp_prices_admin_write ON public.platform_provider_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'platform_admin'));

-- ---------------------------------------------------------------------
-- 2) Mapeamento provider_customer -> company
--    (permite webhook resolver a empresa mesmo sem metadata)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_provider_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider public.platform_provider NOT NULL,
  provider_customer_id text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_customer_id)
);

CREATE INDEX IF NOT EXISTS ix_pp_customers_company ON public.platform_provider_customers(company_id);

GRANT SELECT ON public.platform_provider_customers TO authenticated;
GRANT ALL    ON public.platform_provider_customers TO service_role;
ALTER TABLE public.platform_provider_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_cust_read_members ON public.platform_provider_customers;
CREATE POLICY pp_cust_read_members ON public.platform_provider_customers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'platform_admin')
    OR public.is_member_of(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS pp_cust_admin_write ON public.platform_provider_customers;
CREATE POLICY pp_cust_admin_write ON public.platform_provider_customers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'platform_admin'));

-- ---------------------------------------------------------------------
-- 3) Idempotência: registrar evento antes de processar
--    Retorna:
--      inserted=true  -> primeiro processamento (siga em frente)
--      inserted=false -> evento já registrado (não reprocessar mutações)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_webhook_register_event(
  _provider public.platform_provider,
  _event_type text,
  _external_id text,
  _payload jsonb
) RETURNS TABLE(event_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.platform_billing_events(provider, event_type, external_id, payload)
  VALUES (_provider, _event_type, _external_id, COALESCE(_payload,'{}'::jsonb))
  ON CONFLICT (provider, external_id) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.platform_billing_events
      WHERE provider=_provider AND external_id=_external_id;
    RETURN QUERY SELECT _id, false;
  ELSE
    RETURN QUERY SELECT _id, true;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.platform_webhook_register_event(public.platform_provider,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_webhook_register_event(public.platform_provider,text,text,jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- 4) Marca evento como processado (opcional error_msg)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_webhook_mark_processed(
  _event_id uuid,
  _error_msg text DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.platform_billing_events
     SET processed_at = now(),
         error_message = _error_msg
   WHERE id = _event_id;
$$;

REVOKE ALL ON FUNCTION public.platform_webhook_mark_processed(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_webhook_mark_processed(uuid,text) TO service_role;

-- ---------------------------------------------------------------------
-- 5) Reconciliar subscription
--    Idempotente por (provider, provider_subscription_id).
--    Encerra ativas anteriores da empresa que não sejam esta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_reconcile_subscription(
  _provider public.platform_provider,
  _company_id uuid,
  _plan_id uuid,
  _provider_customer_id text,
  _provider_subscription_id text,
  _status public.platform_sub_status,
  _trial_ends_at timestamptz,
  _current_period_start timestamptz,
  _current_period_end timestamptz,
  _cancel_at_period_end boolean,
  _canceled_at timestamptz,
  _starts_at timestamptz,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub_id uuid;
BEGIN
  -- upsert customer mapping (best-effort)
  IF _provider_customer_id IS NOT NULL AND _company_id IS NOT NULL THEN
    INSERT INTO public.platform_provider_customers(company_id, provider, provider_customer_id)
    VALUES (_company_id, _provider, _provider_customer_id)
    ON CONFLICT (provider, provider_customer_id) DO NOTHING;
  END IF;

  -- encerra outras assinaturas ativas da empresa
  IF _company_id IS NOT NULL AND _status IN ('trialing','active','past_due') THEN
    UPDATE public.platform_subscriptions
       SET status='canceled', canceled_at=now(), ends_at=now(), updated_at=now()
     WHERE company_id=_company_id
       AND status IN ('trialing','active','past_due')
       AND (provider IS DISTINCT FROM _provider
            OR provider_subscription_id IS DISTINCT FROM _provider_subscription_id);
  END IF;

  SELECT id INTO _sub_id
    FROM public.platform_subscriptions
   WHERE provider=_provider AND provider_subscription_id=_provider_subscription_id;

  IF _sub_id IS NULL THEN
    INSERT INTO public.platform_subscriptions(
      company_id, plan_id, provider, provider_customer_id, provider_subscription_id,
      status, trial_ends_at, current_period_start, current_period_end,
      cancel_at_period_end, canceled_at, starts_at, ends_at, metadata
    ) VALUES (
      _company_id, _plan_id, _provider, _provider_customer_id, _provider_subscription_id,
      _status, _trial_ends_at, _current_period_start, _current_period_end,
      COALESCE(_cancel_at_period_end,false), _canceled_at, COALESCE(_starts_at, now()),
      CASE WHEN _status='canceled' THEN COALESCE(_canceled_at, now()) ELSE NULL END,
      COALESCE(_metadata,'{}'::jsonb)
    )
    RETURNING id INTO _sub_id;
  ELSE
    UPDATE public.platform_subscriptions
       SET company_id=COALESCE(_company_id, company_id),
           plan_id=COALESCE(_plan_id, plan_id),
           provider_customer_id=COALESCE(_provider_customer_id, provider_customer_id),
           status=_status,
           trial_ends_at=_trial_ends_at,
           current_period_start=COALESCE(_current_period_start, current_period_start),
           current_period_end=COALESCE(_current_period_end, current_period_end),
           cancel_at_period_end=COALESCE(_cancel_at_period_end, cancel_at_period_end),
           canceled_at=_canceled_at,
           starts_at=COALESCE(_starts_at, starts_at),
           ends_at=CASE WHEN _status='canceled' THEN COALESCE(_canceled_at, now()) ELSE NULL END,
           metadata=COALESCE(_metadata, metadata),
           updated_at=now()
     WHERE id=_sub_id;
  END IF;

  RETURN _sub_id;
END $$;

REVOKE ALL ON FUNCTION public.platform_reconcile_subscription(
  public.platform_provider,uuid,uuid,text,text,public.platform_sub_status,
  timestamptz,timestamptz,timestamptz,boolean,timestamptz,timestamptz,jsonb
) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_reconcile_subscription(
  public.platform_provider,uuid,uuid,text,text,public.platform_sub_status,
  timestamptz,timestamptz,timestamptz,boolean,timestamptz,timestamptz,jsonb
) TO service_role;

-- ---------------------------------------------------------------------
-- 6) Reconciliar invoice (idempotente por provider_invoice_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_reconcile_invoice(
  _provider public.platform_provider,
  _company_id uuid,
  _subscription_id uuid,
  _provider_invoice_id text,
  _status public.platform_invoice_status,
  _currency text,
  _amount_due_cents integer,
  _amount_paid_cents integer,
  _issued_at timestamptz,
  _due_at timestamptz,
  _paid_at timestamptz,
  _hosted_invoice_url text,
  _pdf_url text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_id uuid;
BEGIN
  SELECT id INTO _inv_id FROM public.platform_invoices
   WHERE provider=_provider AND provider_invoice_id=_provider_invoice_id;

  IF _inv_id IS NULL THEN
    INSERT INTO public.platform_invoices(
      company_id, subscription_id, provider, provider_invoice_id,
      status, currency, amount_due_cents, amount_paid_cents,
      issued_at, due_at, paid_at, hosted_invoice_url, pdf_url, metadata
    ) VALUES (
      _company_id, _subscription_id, _provider, _provider_invoice_id,
      _status, COALESCE(_currency,'BRL'),
      COALESCE(_amount_due_cents,0), COALESCE(_amount_paid_cents,0),
      COALESCE(_issued_at, now()), _due_at, _paid_at,
      _hosted_invoice_url, _pdf_url, COALESCE(_metadata,'{}'::jsonb)
    )
    RETURNING id INTO _inv_id;
  ELSE
    UPDATE public.platform_invoices
       SET company_id=COALESCE(_company_id, company_id),
           subscription_id=COALESCE(_subscription_id, subscription_id),
           status=_status,
           currency=COALESCE(_currency, currency),
           amount_due_cents=COALESCE(_amount_due_cents, amount_due_cents),
           amount_paid_cents=COALESCE(_amount_paid_cents, amount_paid_cents),
           issued_at=COALESCE(_issued_at, issued_at),
           due_at=_due_at,
           paid_at=_paid_at,
           hosted_invoice_url=COALESCE(_hosted_invoice_url, hosted_invoice_url),
           pdf_url=COALESCE(_pdf_url, pdf_url),
           metadata=COALESCE(_metadata, metadata),
           updated_at=now()
     WHERE id=_inv_id;
  END IF;

  RETURN _inv_id;
END $$;

REVOKE ALL ON FUNCTION public.platform_reconcile_invoice(
  public.platform_provider,uuid,uuid,text,public.platform_invoice_status,text,
  integer,integer,timestamptz,timestamptz,timestamptz,text,text,jsonb
) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_reconcile_invoice(
  public.platform_provider,uuid,uuid,text,public.platform_invoice_status,text,
  integer,integer,timestamptz,timestamptz,timestamptz,text,text,jsonb
) TO service_role;

-- ---------------------------------------------------------------------
-- 7) Reconciliar payment (idempotente por provider_payment_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_reconcile_payment(
  _provider public.platform_provider,
  _company_id uuid,
  _invoice_id uuid,
  _provider_payment_id text,
  _status public.platform_payment_status,
  _amount_cents integer,
  _currency text,
  _method text,
  _paid_at timestamptz,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pay_id uuid;
BEGIN
  SELECT id INTO _pay_id FROM public.platform_payments
   WHERE provider=_provider AND provider_payment_id=_provider_payment_id;

  IF _pay_id IS NULL THEN
    INSERT INTO public.platform_payments(
      company_id, invoice_id, provider, provider_payment_id,
      status, amount_cents, currency, method, paid_at, metadata
    ) VALUES (
      _company_id, _invoice_id, _provider, _provider_payment_id,
      _status, COALESCE(_amount_cents,0), COALESCE(_currency,'BRL'),
      _method, _paid_at, COALESCE(_metadata,'{}'::jsonb)
    )
    RETURNING id INTO _pay_id;
  ELSE
    UPDATE public.platform_payments
       SET status=_status,
           amount_cents=COALESCE(_amount_cents, amount_cents),
           currency=COALESCE(_currency, currency),
           method=COALESCE(_method, method),
           paid_at=_paid_at,
           metadata=COALESCE(_metadata, metadata),
           updated_at=now()
     WHERE id=_pay_id;
  END IF;

  RETURN _pay_id;
END $$;

REVOKE ALL ON FUNCTION public.platform_reconcile_payment(
  public.platform_provider,uuid,uuid,text,public.platform_payment_status,
  integer,text,text,timestamptz,jsonb
) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_reconcile_payment(
  public.platform_provider,uuid,uuid,text,public.platform_payment_status,
  integer,text,text,timestamptz,jsonb
) TO service_role;

-- ---------------------------------------------------------------------
-- 8) Views de observabilidade
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_platform_webhook_health AS
SELECT provider,
       count(*) FILTER (WHERE processed_at IS NULL)                       AS pending,
       count(*) FILTER (WHERE processed_at IS NOT NULL AND error_message IS NULL) AS ok,
       count(*) FILTER (WHERE error_message IS NOT NULL)                  AS with_errors,
       max(received_at)                                                   AS last_received_at
  FROM public.platform_billing_events
 GROUP BY provider;

CREATE OR REPLACE VIEW public.v_platform_webhook_unprocessed AS
SELECT id, provider, event_type, external_id, received_at, error_message
  FROM public.platform_billing_events
 WHERE processed_at IS NULL
 ORDER BY received_at ASC;

GRANT SELECT ON public.v_platform_webhook_health TO authenticated;
GRANT SELECT ON public.v_platform_webhook_unprocessed TO authenticated;

-- =====================================================================
-- FIM FASE 14
-- =====================================================================
