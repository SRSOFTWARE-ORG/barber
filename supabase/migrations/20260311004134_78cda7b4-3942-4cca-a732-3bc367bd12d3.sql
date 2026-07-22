CREATE POLICY "Users delete own notifications"
ON public.notificacoes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);