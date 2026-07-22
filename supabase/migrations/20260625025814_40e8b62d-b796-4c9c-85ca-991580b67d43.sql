CREATE OR REPLACE FUNCTION public.get_shop_owner(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT shop_owner_id
       FROM public.barbershop_team
      WHERE barber_id = _user_id AND active = true
      LIMIT 1),
    (SELECT _user_id WHERE public.has_role(_user_id, 'admin'::app_role))
  );
$$;

CREATE OR REPLACE FUNCTION public.get_visible_shop_owner(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT shop_owner_id
       FROM public.barbershop_team
      WHERE barber_id = _user_id AND active = true
      LIMIT 1),
    (SELECT _user_id WHERE public.has_role(_user_id, 'admin'::app_role)),
    (SELECT adm_responsavel_id FROM public.profiles WHERE id = _user_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_shop_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_owner(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_visible_shop_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_shop_owner(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Config visivel no escopo da barbearia" ON public.configuracoes;
CREATE POLICY "Config visivel no escopo da barbearia"
ON public.configuracoes
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR public.get_visible_shop_owner(auth.uid()) = shop_owner_id
);

DROP POLICY IF EXISTS "Servicos visiveis no escopo da barbearia" ON public.servicos;
CREATE POLICY "Servicos visiveis no escopo da barbearia"
ON public.servicos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR public.get_visible_shop_owner(auth.uid()) = shop_owner_id
);

DROP POLICY IF EXISTS "Fotos visiveis no escopo da barbearia" ON public.galeria_fotos;
CREATE POLICY "Fotos visiveis no escopo da barbearia"
ON public.galeria_fotos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR (
    public.get_visible_shop_owner(auth.uid()) IS NOT NULL
    AND public.get_visible_shop_owner(auth.uid()) IS NOT DISTINCT FROM public.get_visible_shop_owner(adm_id)
  )
);

DROP POLICY IF EXISTS "Promocoes visiveis no escopo da barbearia" ON public.promocoes;
CREATE POLICY "Promocoes visiveis no escopo da barbearia"
ON public.promocoes
FOR SELECT
TO authenticated
USING (
  ativa = true
  AND (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR (
      public.get_visible_shop_owner(auth.uid()) IS NOT NULL
      AND public.get_visible_shop_owner(auth.uid()) IS NOT DISTINCT FROM public.get_visible_shop_owner(adm_id)
    )
  )
);

DROP POLICY IF EXISTS "planos select shop scope" ON public.planos;
CREATE POLICY "planos select shop scope"
ON public.planos
FOR SELECT
TO authenticated
USING (
  shop_owner_id = public.get_visible_shop_owner(auth.uid())
  OR public.has_role(auth.uid(), 'ceo'::app_role)
);

DROP POLICY IF EXISTS "plano_servicos select shop scope" ON public.plano_servicos;
CREATE POLICY "plano_servicos select shop scope"
ON public.plano_servicos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.planos p
     WHERE p.id = plano_servicos.plano_id
       AND (
         p.shop_owner_id = public.get_visible_shop_owner(auth.uid())
         OR public.has_role(auth.uid(), 'ceo'::app_role)
       )
  )
);

REVOKE ALL ON public.evolution_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.evolution_config TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.evolution_config TO authenticated;
GRANT SELECT (
  id, instance, paired, last_status, updated_at, barbeiro_id,
  antiban_enabled, min_gap_seconds, max_per_hour, max_per_day,
  business_hours_start, business_hours_end, presence_simulation, warmup_mode,
  retorno_enabled, retorno_dias, phone_number, connected_at, disconnected_at, last_qr_at
) ON public.evolution_config TO authenticated;

REVOKE ALL ON public.marketplace_pedidos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketplace_pedidos TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.marketplace_pedidos TO authenticated;
GRANT SELECT (
  id, produto_id, produto_nome, shop_owner_id, comprador_id, comprador_nome,
  quantidade, valor_unitario, valor_total, amount_app_fee, amount_net,
  status, payment_id, preference_id, created_at, updated_at
) ON public.marketplace_pedidos TO authenticated;

REVOKE SELECT (chave_pix, qr_code_pix_url, invite_code, taxa_app_valor, taxa_isenta_ate)
ON public.profiles
FROM PUBLIC, anon, authenticated;