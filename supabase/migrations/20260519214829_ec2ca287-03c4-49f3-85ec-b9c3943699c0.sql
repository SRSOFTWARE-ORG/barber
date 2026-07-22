
-- agendamentos INSERT: anon (sem cliente_id) ou usuário inserindo só pra si
DROP POLICY IF EXISTS "Qualquer um pode agendar" ON public.agendamentos;
CREATE POLICY "Qualquer um pode agendar" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (cliente_id IS NULL OR auth.uid() = cliente_id);

-- notificacoes INSERT: só staff cria manualmente; triggers SECURITY DEFINER continuam funcionando
DROP POLICY IF EXISTS "System insert notifications" ON public.notificacoes;
CREATE POLICY "Staff insert notifications" ON public.notificacoes
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));
