DROP POLICY IF EXISTS "Staff atualiza agendamentos" ON public.agendamentos;

CREATE POLICY "Staff atualiza agendamentos" ON public.agendamentos
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND public.get_shop_owner(auth.uid()) = public.get_shop_owner(barbeiro_id))
  OR (auth.uid() = barbeiro_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND public.get_shop_owner(auth.uid()) = public.get_shop_owner(barbeiro_id))
  OR (auth.uid() = barbeiro_id)
);