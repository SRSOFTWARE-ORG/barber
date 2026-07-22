-- Restrict direct reads on marketplace orders (contains buyer PII + financials).
DROP POLICY IF EXISTS "Todos veem todas as vendas" ON public.marketplace_pedidos;

CREATE POLICY "Pedidos visiveis a envolvidos"
  ON public.marketplace_pedidos
  FOR SELECT
  TO authenticated
  USING (
    comprador_id = auth.uid()
    OR shop_owner_id = auth.uid()
    OR public.is_shop_member(auth.uid(), shop_owner_id)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

-- Sanitized public feed for the global "all sales" view. Returns only
-- non-sensitive columns: no telefone, no comprador_id, no payment_id,
-- no amount_net / amount_app_fee breakdown.
CREATE OR REPLACE FUNCTION public.marketplace_feed()
RETURNS TABLE(
  id uuid,
  produto_nome text,
  comprador_nome text,
  quantidade integer,
  valor_total numeric,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, produto_nome, comprador_nome, quantidade, valor_total, status, created_at
  FROM public.marketplace_pedidos
  WHERE status IN ('pago', 'retirado')
  ORDER BY created_at DESC
  LIMIT 100
$$;

GRANT EXECUTE ON FUNCTION public.marketplace_feed() TO authenticated, anon;
