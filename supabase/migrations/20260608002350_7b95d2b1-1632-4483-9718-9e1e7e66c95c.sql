DROP POLICY IF EXISTS "Fotos visiveis no escopo da barbearia" ON public.galeria_fotos;
CREATE POLICY "Fotos visiveis no escopo da barbearia"
ON public.galeria_fotos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'ceo'::app_role)
  OR (
    get_shop_owner(auth.uid()) IS NOT NULL
    AND NOT (get_shop_owner(auth.uid()) IS DISTINCT FROM get_shop_owner(adm_id))
  )
);

DROP POLICY IF EXISTS "Promocoes visiveis no escopo da barbearia" ON public.promocoes;
CREATE POLICY "Promocoes visiveis no escopo da barbearia"
ON public.promocoes
FOR SELECT
TO authenticated
USING (
  (ativa = true)
  AND has_role(auth.uid(), 'ceo'::app_role) IS NOT NULL
  AND (
    has_role(auth.uid(), 'ceo'::app_role)
    OR (
      get_shop_owner(auth.uid()) IS NOT NULL
      AND NOT (get_shop_owner(auth.uid()) IS DISTINCT FROM get_shop_owner(adm_id))
    )
  )
);