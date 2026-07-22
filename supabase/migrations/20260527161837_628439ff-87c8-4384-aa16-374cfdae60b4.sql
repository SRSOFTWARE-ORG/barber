
-- Tabela de assinaturas mensais da plataforma
CREATE TABLE public.platform_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_owner_id uuid NOT NULL,
  period_month date NOT NULL, -- primeiro dia do mês de referência
  base_amount numeric(10,2) NOT NULL DEFAULT 99.90,
  team_count integer NOT NULL DEFAULT 0,
  per_barber_amount numeric(10,2) NOT NULL DEFAULT 19.90,
  total_amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado | cancelado
  due_date date NOT NULL,
  paid_at timestamptz,
  payment_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_owner_id, period_month)
);

GRANT SELECT ON public.platform_subscriptions TO authenticated;
GRANT ALL ON public.platform_subscriptions TO service_role;

ALTER TABLE public.platform_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dono ve suas faturas"
ON public.platform_subscriptions FOR SELECT TO authenticated
USING (auth.uid() = shop_owner_id);

CREATE POLICY "CEO ve todas faturas"
ON public.platform_subscriptions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "CEO gerencia faturas"
ON public.platform_subscriptions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE INDEX idx_sub_owner_period ON public.platform_subscriptions(shop_owner_id, period_month DESC);
CREATE INDEX idx_sub_status ON public.platform_subscriptions(status, due_date);

CREATE TRIGGER trg_sub_updated_at
BEFORE UPDATE ON public.platform_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpers de preço (CEO ajusta)
CREATE OR REPLACE FUNCTION public.get_subscription_prices()
RETURNS TABLE(base_price numeric, per_barber_price numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT value::numeric FROM public.internal_secrets WHERE name='sub_base_price'), 99.90),
    COALESCE((SELECT value::numeric FROM public.internal_secrets WHERE name='sub_per_barber_price'), 19.90)
$$;

CREATE OR REPLACE FUNCTION public.set_subscription_prices(_base numeric, _per_barber numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.internal_secrets(name, value, updated_at)
    VALUES ('sub_base_price', _base::text, now())
    ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
  INSERT INTO public.internal_secrets(name, value, updated_at)
    VALUES ('sub_per_barber_price', _per_barber::text, now())
    ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
END;
$$;

-- Gera (ou recalcula) fatura de uma barbearia para um mês
CREATE OR REPLACE FUNCTION public.generate_invoice_for_shop(_shop_owner_id uuid, _period date DEFAULT date_trunc('month', now())::date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_team int;
  v_base numeric;
  v_per numeric;
  v_total numeric;
  v_id uuid;
  v_due date;
BEGIN
  SELECT base_price, per_barber_price INTO v_base, v_per FROM public.get_subscription_prices();
  SELECT count(*) INTO v_team FROM public.barbershop_team
    WHERE shop_owner_id = _shop_owner_id AND active = true;
  v_total := v_base + (v_team * v_per);
  v_due := (_period + interval '10 days')::date;

  INSERT INTO public.platform_subscriptions
    (shop_owner_id, period_month, base_amount, team_count, per_barber_amount, total_amount, due_date)
  VALUES
    (_shop_owner_id, _period, v_base, v_team, v_per, v_total, v_due)
  ON CONFLICT (shop_owner_id, period_month) DO UPDATE
    SET team_count = EXCLUDED.team_count,
        base_amount = EXCLUDED.base_amount,
        per_barber_amount = EXCLUDED.per_barber_amount,
        total_amount = CASE WHEN platform_subscriptions.status = 'pago' THEN platform_subscriptions.total_amount ELSE EXCLUDED.total_amount END,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Gera faturas para TODAS as barbearias ativas (admins) — usada pelo cron
CREATE OR REPLACE FUNCTION public.generate_all_invoices(_period date DEFAULT date_trunc('month', now())::date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.barbershop_team t
        WHERE t.barber_id = ur.user_id AND t.active = true
      )
  LOOP
    PERFORM public.generate_invoice_for_shop(r.user_id, _period);
    n := n + 1;
  END LOOP;
  -- Marca como atrasadas as pendentes vencidas
  UPDATE public.platform_subscriptions
    SET status='atrasado', updated_at=now()
    WHERE status='pendente' AND due_date < current_date;
  RETURN n;
END;
$$;

-- Status para a barbearia (dono)
CREATE OR REPLACE FUNCTION public.get_my_subscription_status()
RETURNS TABLE(
  id uuid, period_month date, total_amount numeric, base_amount numeric,
  team_count int, per_barber_amount numeric, status text, due_date date,
  paid_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, period_month, total_amount, base_amount, team_count, per_barber_amount, status, due_date, paid_at
  FROM public.platform_subscriptions
  WHERE shop_owner_id = auth.uid()
  ORDER BY period_month DESC
  LIMIT 12
$$;

-- CEO: lista todas faturas com nome da barbearia
CREATE OR REPLACE FUNCTION public.list_all_subscriptions(_status text DEFAULT NULL)
RETURNS TABLE(
  id uuid, shop_owner_id uuid, shop_name text, period_month date,
  total_amount numeric, team_count int, status text, due_date date, paid_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.shop_owner_id,
    COALESCE(NULLIF(btrim(p.nome_barbearia),''), ur.display_name, 'Barbearia'),
    s.period_month, s.total_amount, s.team_count, s.status, s.due_date, s.paid_at
  FROM public.platform_subscriptions s
  LEFT JOIN public.user_roles ur ON ur.user_id = s.shop_owner_id AND ur.role='admin'
  LEFT JOIN public.profiles p ON p.id = s.shop_owner_id
  WHERE public.has_role(auth.uid(),'ceo'::app_role)
    AND (_status IS NULL OR s.status = _status)
  ORDER BY s.period_month DESC, s.status ASC
$$;

-- CEO marca como pago manualmente
CREATE OR REPLACE FUNCTION public.mark_subscription_paid(_id uuid, _payment_id text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ceo'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.platform_subscriptions
    SET status='pago', paid_at=now(), payment_id=_payment_id, notes=COALESCE(_notes, notes), updated_at=now()
    WHERE id = _id;
END;
$$;

-- Remove RPC antiga de taxas por agendamento (não vamos mais usar)
DROP FUNCTION IF EXISTS public.app_fees_pending(uuid);

-- Gera faturas do mês atual para todas as barbearias agora (bootstrap)
SELECT public.generate_all_invoices();
