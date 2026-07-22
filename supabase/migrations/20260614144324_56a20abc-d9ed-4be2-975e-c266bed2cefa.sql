-- Harden agendamentos UPDATE: split the overly broad policy into role-scoped
-- policies. Column-level protection of financial fields is enforced by the
-- existing BEFORE UPDATE trigger guard_agendamento_update (which can compare
-- OLD/NEW), since RLS WITH CHECK cannot reference previous row values.

DROP POLICY IF EXISTS "Update agendamentos" ON public.agendamentos;

-- Staff: CEO, admins, and the barber assigned to the booking have full update rights.
CREATE POLICY "Staff atualiza agendamentos"
  ON public.agendamentos
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = barbeiro_id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = barbeiro_id
  );

-- Clients: may only touch their own booking. The guard_agendamento_update
-- trigger restricts them to safe columns (cancellation + comprovante upload)
-- and rejects any change to sinal_pago, valor_pago, taxa_app, valor_sinal,
-- barbeiro_id, data, hora, servico_ids and archive flag.
CREATE POLICY "Cliente atualiza seu agendamento"
  ON public.agendamentos
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = cliente_id)
  WITH CHECK (auth.uid() = cliente_id);
