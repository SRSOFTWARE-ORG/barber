-- 1) Add a WITH CHECK to the appointments UPDATE policy (defense-in-depth).
--    Column-level restrictions for clients are already enforced by the
--    BEFORE UPDATE trigger guard_agendamento_update; this ensures the post-update
--    row still belongs to an authorized actor.
DROP POLICY IF EXISTS "Update agendamentos" ON public.agendamentos;
CREATE POLICY "Update agendamentos"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'ceo'::app_role)
  OR (auth.uid() = cliente_id)
  OR (auth.uid() = barbeiro_id)
)
WITH CHECK (
  has_role(auth.uid(), 'ceo'::app_role)
  OR (auth.uid() = cliente_id)
  OR (auth.uid() = barbeiro_id)
);

-- 2) Explicit deny-all on webauthn_challenges. RLS is enabled but there were no
--    policies; this table is only accessed by edge functions via the service role
--    (which bypasses RLS). The explicit policy documents intent and satisfies the
--    linter that flags "RLS enabled, no policy".
DROP POLICY IF EXISTS "Deny all webauthn_challenges" ON public.webauthn_challenges;
CREATE POLICY "Deny all webauthn_challenges"
ON public.webauthn_challenges
AS PERMISSIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);