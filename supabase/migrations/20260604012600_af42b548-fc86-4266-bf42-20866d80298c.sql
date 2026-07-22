-- 1) Harden public booking INSERT policy (keep anonymous booking, prevent abuse)
DROP POLICY IF EXISTS "Qualquer um pode agendar" ON public.agendamentos;
CREATE POLICY "Qualquer um pode agendar"
  ON public.agendamentos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    ((cliente_id IS NULL) OR (auth.uid() = cliente_id))
    AND cliente_nome IS NOT NULL AND btrim(cliente_nome) <> ''
    AND cliente_telefone IS NOT NULL AND btrim(cliente_telefone) <> ''
    AND barbeiro_id IS NOT NULL
    AND data IS NOT NULL
    AND hora IS NOT NULL
    AND sinal_pago = false
    AND COALESCE(valor_pago, 0) >= 0
    AND COALESCE(taxa_app, 0) >= 0
  );

-- 2) Passkey/biometrics enrollment flag on profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passkey_enabled boolean NOT NULL DEFAULT false;