DROP POLICY IF EXISTS "Cliente atualiza seu agendamento" ON public.agendamentos;

CREATE POLICY "Cliente atualiza seu agendamento"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (auth.uid() = cliente_id)
WITH CHECK (
  auth.uid() = cliente_id
  AND sinal_pago IS NOT DISTINCT FROM (SELECT a.sinal_pago FROM public.agendamentos a WHERE a.id = agendamentos.id)
  AND valor_pago IS NOT DISTINCT FROM (SELECT a.valor_pago FROM public.agendamentos a WHERE a.id = agendamentos.id)
  AND taxa_app IS NOT DISTINCT FROM (SELECT a.taxa_app FROM public.agendamentos a WHERE a.id = agendamentos.id)
  AND valor_sinal IS NOT DISTINCT FROM (SELECT a.valor_sinal FROM public.agendamentos a WHERE a.id = agendamentos.id)
  AND barbeiro_id IS NOT DISTINCT FROM (SELECT a.barbeiro_id FROM public.agendamentos a WHERE a.id = agendamentos.id)
);