-- ============ MARKETPLACE: produtos físicos com split 90/10 ============

-- 1) Catálogo de produtos (somente Barbearia/admin e CEO vendem)
CREATE TABLE public.marketplace_produtos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  preco numeric NOT NULL CHECK (preco >= 0),
  estoque integer NOT NULL DEFAULT 0 CHECK (estoque >= 0),
  imagem_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_produtos TO authenticated;
GRANT ALL ON public.marketplace_produtos TO service_role;

ALTER TABLE public.marketplace_produtos ENABLE ROW LEVEL SECURITY;

-- Feed global: qualquer usuário autenticado vê todos os produtos
CREATE POLICY "Todos veem produtos do marketplace"
  ON public.marketplace_produtos FOR SELECT
  TO authenticated
  USING (true);

-- Apenas Barbearia (admin) e CEO podem cadastrar, e só em nome próprio
CREATE POLICY "Vendedores criam seus produtos"
  ON public.marketplace_produtos FOR INSERT
  TO authenticated
  WITH CHECK (
    shop_owner_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ceo'::app_role))
  );

CREATE POLICY "Vendedores editam seus produtos"
  ON public.marketplace_produtos FOR UPDATE
  TO authenticated
  USING (shop_owner_id = auth.uid() OR public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (shop_owner_id = auth.uid() OR public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "Vendedores apagam seus produtos"
  ON public.marketplace_produtos FOR DELETE
  TO authenticated
  USING (shop_owner_id = auth.uid() OR public.has_role(auth.uid(), 'ceo'::app_role));

CREATE TRIGGER trg_marketplace_produtos_updated
  BEFORE UPDATE ON public.marketplace_produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Pedidos / vendas (feed global visível para todos)
CREATE TABLE public.marketplace_pedidos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id uuid REFERENCES public.marketplace_produtos(id) ON DELETE SET NULL,
  produto_nome text NOT NULL,
  shop_owner_id uuid NOT NULL,
  comprador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comprador_nome text,
  comprador_telefone text,
  quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario numeric NOT NULL,
  valor_total numeric NOT NULL,
  amount_app_fee numeric NOT NULL DEFAULT 0,
  amount_net numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  payment_id text,
  preference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_pedidos TO authenticated;
GRANT ALL ON public.marketplace_pedidos TO service_role;

ALTER TABLE public.marketplace_pedidos ENABLE ROW LEVEL SECURITY;

-- Feed global de vendas: todos veem todas as vendas
CREATE POLICY "Todos veem todas as vendas"
  ON public.marketplace_pedidos FOR SELECT
  TO authenticated
  USING (true);

-- Só o vendedor (ou CEO) marca a retirada / atualiza o pedido
CREATE POLICY "Vendedor atualiza seus pedidos"
  ON public.marketplace_pedidos FOR UPDATE
  TO authenticated
  USING (shop_owner_id = auth.uid() OR public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (shop_owner_id = auth.uid() OR public.has_role(auth.uid(), 'ceo'::app_role));

CREATE TRIGGER trg_marketplace_pedidos_updated
  BEFORE UPDATE ON public.marketplace_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_marketplace_pedidos_shop ON public.marketplace_pedidos(shop_owner_id);
CREATE INDEX idx_marketplace_pedidos_comprador ON public.marketplace_pedidos(comprador_id);
CREATE INDEX idx_marketplace_produtos_shop ON public.marketplace_produtos(shop_owner_id);

-- 3) Função atômica: confirma pagamento e baixa estoque (chamada pelo webhook)
CREATE OR REPLACE FUNCTION public.marketplace_confirm_order(_pedido_id uuid, _payment_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_produto_id uuid;
  v_qtd integer;
BEGIN
  SELECT status, produto_id, quantidade
    INTO v_status, v_produto_id, v_qtd
    FROM public.marketplace_pedidos
    WHERE id = _pedido_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Idempotente: se já estava pago/retirado, não baixa estoque de novo
  IF v_status IN ('pago', 'retirado') THEN
    RETURN;
  END IF;

  UPDATE public.marketplace_pedidos
    SET status = 'pago', payment_id = _payment_id, updated_at = now()
    WHERE id = _pedido_id;

  IF v_produto_id IS NOT NULL THEN
    UPDATE public.marketplace_produtos
      SET estoque = GREATEST(estoque - v_qtd, 0), updated_at = now()
      WHERE id = v_produto_id;
  END IF;
END;
$$;
