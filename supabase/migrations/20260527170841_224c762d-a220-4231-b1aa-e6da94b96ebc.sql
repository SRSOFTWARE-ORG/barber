
-- 1) agendamento_status_log: restringe admin ao próprio agendamento
DROP POLICY IF EXISTS "Log visivel a participantes e staff" ON public.agendamento_status_log;

CREATE POLICY "Log visivel a participantes"
ON public.agendamento_status_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = agendamento_status_log.agendamento_id
      AND (a.cliente_id = auth.uid() OR a.barbeiro_id = auth.uid())
  )
);

CREATE POLICY "CEO ve todos logs"
ON public.agendamento_status_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role));

-- 2) agendamentos: remove acesso amplo de admin
DROP POLICY IF EXISTS "Staff ve todos agendamentos" ON public.agendamentos;

CREATE POLICY "CEO ve todos agendamentos"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role));

-- Ajusta UPDATE para não permitir que admin altere agendamentos alheios
DROP POLICY IF EXISTS "Update agendamentos" ON public.agendamentos;

CREATE POLICY "Update agendamentos"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR auth.uid() = cliente_id
  OR auth.uid() = barbeiro_id
);

-- 3) whatsapp_queue: admin só atualiza linhas próprias
DROP POLICY IF EXISTS "CEO update queue" ON public.whatsapp_queue;

CREATE POLICY "CEO update any queue"
ON public.whatsapp_queue
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "Admin update own queue rows"
ON public.whatsapp_queue
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND auth.uid() = barbeiro_id
);
