-- Finding 1: harden the public booking INSERT policy so a client-supplied
-- platform fee (taxa_app) can never persist, even if the BEFORE INSERT trigger
-- is disabled. The fee must equal the configured rate for the barber, and a
-- brand-new booking must start unpaid.
DROP POLICY IF EXISTS "Qualquer um pode agendar" ON public.agendamentos;
CREATE POLICY "Qualquer um pode agendar" ON public.agendamentos
FOR INSERT
WITH CHECK (
  ((cliente_id IS NULL) OR (auth.uid() = cliente_id))
  AND cliente_nome IS NOT NULL AND btrim(cliente_nome) <> ''
  AND cliente_telefone IS NOT NULL AND btrim(cliente_telefone) <> ''
  AND barbeiro_id IS NOT NULL
  AND data IS NOT NULL
  AND hora IS NOT NULL
  AND sinal_pago = false
  AND COALESCE(valor_pago, 0) = 0
  AND taxa_app = public.get_barber_taxa(barbeiro_id)
);

-- Finding 2: add a WITH CHECK mirroring the USING clause on the comprovantes
-- storage UPDATE policy so a file cannot be moved/renamed to reference an
-- agendamento the user does not also own.
DROP POLICY IF EXISTS "Comprovantes update" ON storage.objects;
CREATE POLICY "Comprovantes update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.can_access_comprovante((split_part(name, '/', 1))::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'comprovantes'
  AND public.can_access_comprovante((split_part(name, '/', 1))::uuid, auth.uid())
);