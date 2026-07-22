-- 1) Restrict the staff UPDATE policy on agendamentos to authenticated users only.
--    Anonymous (anon) requests must never be able to update appointments.
DROP POLICY IF EXISTS "Staff atualiza agendamentos" ON public.agendamentos;
CREATE POLICY "Staff atualiza agendamentos"
  ON public.agendamentos
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'ceo'::app_role)
    OR (has_role(auth.uid(), 'admin'::app_role) AND (get_shop_owner(auth.uid()) = get_shop_owner(barbeiro_id)))
    OR (auth.uid() = barbeiro_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'ceo'::app_role)
    OR (has_role(auth.uid(), 'admin'::app_role) AND (get_shop_owner(auth.uid()) = get_shop_owner(barbeiro_id)))
    OR (auth.uid() = barbeiro_id)
  );

-- 2) Restrict the Realtime publication for agendamentos to NON-PII columns only.
--    Realtime change events must never broadcast client name, surname, phone or paid amount.
ALTER PUBLICATION supabase_realtime DROP TABLE public.agendamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos
  (id, cliente_id, status, servico_ids, hora, data, created_at,
   barbeiro_id, barbeiro_nome, sinal_pago, valor_sinal, taxa_app,
   arquivado, comprovante_url, pix_gerado_em,
   eh_fracionado, fase1_duracao, espera_duracao, fase2_duracao);

-- 3) Remove configuracoes from the Realtime publication entirely.
--    The frontend does not subscribe to configuracoes changes, so broadcasting
--    shop configuration rows over Realtime is unnecessary attack surface.
ALTER PUBLICATION supabase_realtime DROP TABLE public.configuracoes;