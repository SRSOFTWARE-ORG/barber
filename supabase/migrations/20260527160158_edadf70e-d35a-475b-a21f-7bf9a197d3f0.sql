
-- 1) Tighten gallery visibility to shop scope (multi-tenant isolation)
DROP POLICY IF EXISTS "Clientes veem fotos do seu barbeiro" ON public.galeria_fotos;
DROP POLICY IF EXISTS "Adms inserem suas fotos" ON public.galeria_fotos;
DROP POLICY IF EXISTS "Adms deletam suas fotos" ON public.galeria_fotos;

CREATE POLICY "Fotos visiveis no escopo da barbearia"
  ON public.galeria_fotos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR public.get_shop_owner(auth.uid()) IS NOT DISTINCT FROM public.get_shop_owner(adm_id)
  );

CREATE POLICY "Adms inserem fotos do seu escopo"
  ON public.galeria_fotos FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = adm_id
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ceo'::app_role))
  );

CREATE POLICY "Adms deletam fotos do seu escopo"
  ON public.galeria_fotos FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR (auth.uid() = adm_id)
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_shop_owner(auth.uid()) = auth.uid()
      AND public.get_shop_owner(adm_id) = auth.uid()
    )
  );

-- 2) Same isolation for promotions (clients of shop see all team promos; team barbers see all shop promos)
DROP POLICY IF EXISTS "Clientes veem promoções do seu barbeiro" ON public.promocoes;

CREATE POLICY "Promocoes visiveis no escopo da barbearia"
  ON public.promocoes FOR SELECT TO authenticated
  USING (
    ativa = true
    AND public.get_shop_owner(auth.uid()) IS NOT DISTINCT FROM public.get_shop_owner(adm_id)
  );

-- 3) Helper RPC: list team barbers for the current user's shop (used in UI filters)
CREATE OR REPLACE FUNCTION public.list_my_shop_team()
RETURNS TABLE(user_id uuid, display_name text, is_owner boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH shop AS (SELECT public.get_shop_owner(auth.uid()) AS sid)
  SELECT b.user_id, b.display_name, b.is_owner
  FROM shop, public.list_barbers_of_shop(shop.sid) b
  WHERE shop.sid IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_shop_team() TO authenticated;
