-- 1) Metadados de instância em evolution_config
ALTER TABLE public.evolution_config
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_qr_at timestamptz;

-- 2) Log de auditoria da integração WhatsApp
CREATE TABLE IF NOT EXISTS public.evolution_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid,
  actor_role text,
  barbeiro_id uuid,
  instance text,
  action text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evo_audit_barbeiro ON public.evolution_audit_log (barbeiro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evo_audit_created ON public.evolution_audit_log (created_at DESC);

GRANT SELECT ON public.evolution_audit_log TO authenticated;
GRANT ALL ON public.evolution_audit_log TO service_role;

ALTER TABLE public.evolution_audit_log ENABLE ROW LEVEL SECURITY;

-- CEO vê tudo
CREATE POLICY "CEO ve audit log"
ON public.evolution_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role));

-- Barbeiro vê registros da própria barbearia
CREATE POLICY "Barbeiro ve seu audit log"
ON public.evolution_audit_log
FOR SELECT
TO authenticated
USING (
  public.get_shop_owner(auth.uid()) = public.get_shop_owner(barbeiro_id)
);