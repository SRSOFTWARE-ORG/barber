
-- 1. evolution_webhook_logs: restrict SELECT to CEO only
DROP POLICY IF EXISTS "Staff read webhook logs" ON public.evolution_webhook_logs;
CREATE POLICY "CEO read webhook logs"
  ON public.evolution_webhook_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'::app_role));

-- 2. whatsapp_queue: split staff read into CEO-all + admin-own
DROP POLICY IF EXISTS "Staff read queue" ON public.whatsapp_queue;
CREATE POLICY "CEO read all queue"
  ON public.whatsapp_queue FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'::app_role));
-- "Barbeiro read own queue" already exists for admin-as-own-barber reads.

-- 3. configuracoes_barbeiro: scope SELECT to owner, linked clients, and CEO
DROP POLICY IF EXISTS "Config visivel para autenticados" ON public.configuracoes_barbeiro;
CREATE POLICY "Config visivel para participantes"
  ON public.configuracoes_barbeiro FOR SELECT
  TO authenticated
  USING (
    auth.uid() = barbeiro_id
    OR is_client_of(barbeiro_id)
    OR has_role(auth.uid(), 'ceo'::app_role)
  );
