-- Restrict despesas UPDATE/DELETE to shop admins/CEO only.
-- Previously clients linked to a shop (whose get_shop_owner = shop owner)
-- could update/delete the shop's expense records.

DROP POLICY IF EXISTS "Shop owner can update expenses" ON public.despesas;
CREATE POLICY "Shop owner can update expenses"
ON public.despesas
FOR UPDATE
USING (
  ((shop_owner_id = public.get_shop_owner(auth.uid())) AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.has_role(auth.uid(), 'ceo'::app_role)
)
WITH CHECK (
  ((shop_owner_id = public.get_shop_owner(auth.uid())) AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.has_role(auth.uid(), 'ceo'::app_role)
);

DROP POLICY IF EXISTS "Shop owner can delete expenses" ON public.despesas;
CREATE POLICY "Shop owner can delete expenses"
ON public.despesas
FOR DELETE
USING (
  ((shop_owner_id = public.get_shop_owner(auth.uid())) AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.has_role(auth.uid(), 'ceo'::app_role)
);