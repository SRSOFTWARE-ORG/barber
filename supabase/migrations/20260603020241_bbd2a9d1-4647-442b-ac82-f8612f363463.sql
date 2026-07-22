-- 1) Fix avaliacoes INSERT policy: verify the appointment actually belongs to the inserting client
DROP POLICY IF EXISTS "Cliente avalia seu atendimento" ON public.avaliacoes;

CREATE POLICY "Cliente avalia seu atendimento"
ON public.avaliacoes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = cliente_id
  AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = agendamento_id
      AND a.cliente_id = auth.uid()
  )
);

-- 2) Restrict realtime.messages so authenticated users can only access private
-- channel topics scoped to their own user id (instead of any topic).
-- The app uses only public postgres_changes channels, which are unaffected.
DROP POLICY IF EXISTS "Authenticated only realtime" ON realtime.messages;

CREATE POLICY "Users access own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING ( topic LIKE ('%' || auth.uid()::text || '%') );
