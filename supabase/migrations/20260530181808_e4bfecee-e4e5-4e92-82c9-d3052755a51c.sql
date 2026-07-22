-- 1) Add owner columns
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS shop_owner_id uuid;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS shop_owner_id uuid;

-- 2) Assign existing rows to the primary (earliest) shop owner
UPDATE public.servicos SET shop_owner_id = (
  SELECT ur.user_id FROM public.user_roles ur
  WHERE ur.role='admin'
    AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t WHERE t.barber_id=ur.user_id AND t.active=true)
  ORDER BY ur.user_id LIMIT 1
) WHERE shop_owner_id IS NULL;

UPDATE public.configuracoes SET shop_owner_id = (
  SELECT ur.user_id FROM public.user_roles ur
  WHERE ur.role='admin'
    AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t WHERE t.barber_id=ur.user_id AND t.active=true)
  ORDER BY ur.user_id LIMIT 1
) WHERE shop_owner_id IS NULL;

-- 3) Duplicate services for every OTHER shop owner
INSERT INTO public.servicos (nome, preco, duracao, eh_fracionado, duracao_fase1, duracao_espera, duracao_fase2, shop_owner_id)
SELECT s.nome, s.preco, s.duracao, s.eh_fracionado, s.duracao_fase1, s.duracao_espera, s.duracao_fase2, o.user_id
FROM public.servicos s
CROSS JOIN (
  SELECT ur.user_id FROM public.user_roles ur
  WHERE ur.role='admin'
    AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t WHERE t.barber_id=ur.user_id AND t.active=true)
    AND ur.user_id <> (
      SELECT ur2.user_id FROM public.user_roles ur2
      WHERE ur2.role='admin'
        AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t2 WHERE t2.barber_id=ur2.user_id AND t2.active=true)
      ORDER BY ur2.user_id LIMIT 1
    )
) o
WHERE s.shop_owner_id = (
  SELECT ur3.user_id FROM public.user_roles ur3
  WHERE ur3.role='admin'
    AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t3 WHERE t3.barber_id=ur3.user_id AND t3.active=true)
  ORDER BY ur3.user_id LIMIT 1
);

-- 4) Duplicate configuracoes for every OTHER shop owner
INSERT INTO public.configuracoes (nome_barbearia, hora_inicio, hora_fim, dias_funcionamento, duracao_slot, shop_owner_id)
SELECT c.nome_barbearia, c.hora_inicio, c.hora_fim, c.dias_funcionamento, c.duracao_slot, o.user_id
FROM public.configuracoes c
CROSS JOIN (
  SELECT ur.user_id FROM public.user_roles ur
  WHERE ur.role='admin'
    AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t WHERE t.barber_id=ur.user_id AND t.active=true)
    AND ur.user_id <> (
      SELECT ur2.user_id FROM public.user_roles ur2
      WHERE ur2.role='admin'
        AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t2 WHERE t2.barber_id=ur2.user_id AND t2.active=true)
      ORDER BY ur2.user_id LIMIT 1
    )
) o
WHERE c.shop_owner_id = (
  SELECT ur3.user_id FROM public.user_roles ur3
  WHERE ur3.role='admin'
    AND NOT EXISTS (SELECT 1 FROM public.barbershop_team t3 WHERE t3.barber_id=ur3.user_id AND t3.active=true)
  ORDER BY ur3.user_id LIMIT 1
);

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_servicos_shop_owner ON public.servicos(shop_owner_id);
CREATE INDEX IF NOT EXISTS idx_configuracoes_shop_owner ON public.configuracoes(shop_owner_id);

-- 6) Tighten RLS on servicos (scope by shop owner)
DROP POLICY IF EXISTS "Serviços visíveis para todos" ON public.servicos;
DROP POLICY IF EXISTS "Insert serviços" ON public.servicos;
DROP POLICY IF EXISTS "Update serviços" ON public.servicos;
DROP POLICY IF EXISTS "Delete serviços" ON public.servicos;

CREATE POLICY "Servicos visiveis no escopo da barbearia"
ON public.servicos FOR SELECT TO authenticated
USING (has_role(auth.uid(),'ceo'::app_role) OR get_shop_owner(auth.uid()) = shop_owner_id);

CREATE POLICY "Staff insere servicos do seu escopo"
ON public.servicos FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(),'ceo'::app_role)
  OR (has_role(auth.uid(),'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
);

CREATE POLICY "Staff atualiza servicos do seu escopo"
ON public.servicos FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'ceo'::app_role)
  OR (has_role(auth.uid(),'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
);

CREATE POLICY "Staff deleta servicos do seu escopo"
ON public.servicos FOR DELETE TO authenticated
USING (
  has_role(auth.uid(),'ceo'::app_role)
  OR (has_role(auth.uid(),'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
);

-- 7) Tighten RLS on configuracoes (scope by shop owner)
DROP POLICY IF EXISTS "Config visível para todos" ON public.configuracoes;
DROP POLICY IF EXISTS "Update config" ON public.configuracoes;

CREATE POLICY "Config visivel no escopo da barbearia"
ON public.configuracoes FOR SELECT TO authenticated
USING (has_role(auth.uid(),'ceo'::app_role) OR get_shop_owner(auth.uid()) = shop_owner_id);

CREATE POLICY "Staff insere config do seu escopo"
ON public.configuracoes FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(),'ceo'::app_role)
  OR (has_role(auth.uid(),'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
);

CREATE POLICY "Staff atualiza config do seu escopo"
ON public.configuracoes FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'ceo'::app_role)
  OR (has_role(auth.uid(),'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
);

-- 8) RPCs for client/anon booking to read the right shop's services
CREATE OR REPLACE FUNCTION public.get_services_for_barber(_barber_id uuid)
RETURNS TABLE(id uuid, nome text, preco numeric, duracao integer, eh_fracionado boolean, duracao_fase1 integer, duracao_espera integer, duracao_fase2 integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.id, s.nome, s.preco, s.duracao, s.eh_fracionado, s.duracao_fase1, s.duracao_espera, s.duracao_fase2
  FROM public.servicos s
  WHERE s.shop_owner_id = public.get_shop_owner(_barber_id)
  ORDER BY s.created_at;
$$;

CREATE OR REPLACE FUNCTION public.get_shop_config_for_barber(_barber_id uuid)
RETURNS TABLE(nome_barbearia text, hora_inicio integer, hora_fim integer, dias_funcionamento integer[], duracao_slot integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.nome_barbearia, c.hora_inicio, c.hora_fim, c.dias_funcionamento, c.duracao_slot
  FROM public.configuracoes c
  WHERE c.shop_owner_id = public.get_shop_owner(_barber_id)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_services_for_barber(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_config_for_barber(uuid) TO anon, authenticated;