-- Tighten evolution_audit_log SELECT so only barbershop staff (admins) of the shop can read
-- WhatsApp audit logs. Previously a 'cliente' role user whose adm_responsavel_id pointed to a
-- shop owner satisfied get_shop_owner-based scope and could read these sensitive logs.
DROP POLICY IF EXISTS "Barbeiro ve seu audit log" ON public.evolution_audit_log;

CREATE POLICY "Barbeiro ve seu audit log"
ON public.evolution_audit_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'ceo'::app_role)
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_shop_owner(auth.uid()) = get_shop_owner(barbeiro_id)
  )
);