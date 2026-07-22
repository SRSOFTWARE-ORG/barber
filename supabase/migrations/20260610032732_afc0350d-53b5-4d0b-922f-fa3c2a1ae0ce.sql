-- Tabela de despesas / fluxo de caixa por barbearia
CREATE TABLE public.despesas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_owner_id uuid NOT NULL,
  descricao text NOT NULL,
  categoria text NOT NULL DEFAULT 'outros',
  valor numeric NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT CURRENT_DATE,
  recorrente boolean NOT NULL DEFAULT false,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas TO authenticated;
GRANT ALL ON public.despesas TO service_role;

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_despesas_set_shop_owner
  BEFORE INSERT ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.set_shop_owner_from_auth();

CREATE TRIGGER trg_despesas_updated_at
  BEFORE UPDATE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Shop members can view expenses"
  ON public.despesas FOR SELECT
  TO authenticated
  USING (
    public.is_shop_member(auth.uid(), shop_owner_id)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

CREATE POLICY "Shop owner can insert expenses"
  ON public.despesas FOR INSERT
  TO authenticated
  WITH CHECK (
    shop_owner_id = public.get_shop_owner(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ceo'::app_role))
  );

CREATE POLICY "Shop owner can update expenses"
  ON public.despesas FOR UPDATE
  TO authenticated
  USING (
    shop_owner_id = public.get_shop_owner(auth.uid())
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  )
  WITH CHECK (
    shop_owner_id = public.get_shop_owner(auth.uid())
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

CREATE POLICY "Shop owner can delete expenses"
  ON public.despesas FOR DELETE
  TO authenticated
  USING (
    shop_owner_id = public.get_shop_owner(auth.uid())
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

CREATE OR REPLACE FUNCTION public.financial_summary(
  _shop_owner_id uuid,
  _from date DEFAULT (date_trunc('month', now()))::date,
  _to date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  gross_revenue numeric,
  platform_fees numeric,
  barber_share numeric,
  shop_share numeric,
  total_expenses numeric,
  net_profit numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH rev AS (
    SELECT
      COALESCE(SUM(pl.amount_total),0) AS gross,
      COALESCE(SUM(pl.amount_app_fee),0) AS fees,
      COALESCE(SUM(pl.amount_barber),0) AS barber,
      COALESCE(SUM(pl.amount_shop),0) AS shop
    FROM public.payment_logs pl
    WHERE pl.shop_owner_id = _shop_owner_id
      AND pl.status = 'approved'
      AND pl.created_at::date BETWEEN _from AND _to
  ),
  exp AS (
    SELECT COALESCE(SUM(d.valor),0) AS total
    FROM public.despesas d
    WHERE d.shop_owner_id = _shop_owner_id
      AND d.data BETWEEN _from AND _to
  )
  SELECT
    rev.gross,
    rev.fees,
    rev.barber,
    rev.shop,
    exp.total,
    (rev.gross - rev.fees - exp.total)
  FROM rev, exp
  WHERE auth.uid() = _shop_owner_id
     OR public.is_shop_member(auth.uid(), _shop_owner_id)
     OR public.has_role(auth.uid(), 'ceo'::app_role);
$$;