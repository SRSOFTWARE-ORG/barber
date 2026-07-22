
-- Allow users to delete their own sent or received messages
CREATE POLICY "Users delete own messages"
  ON public.mensagens FOR DELETE
  TO authenticated
  USING (auth.uid() = remetente_id OR auth.uid() = destinatario_id);

-- Table to track archived chats
CREATE TABLE public.chats_arquivados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, partner_id)
);

ALTER TABLE public.chats_arquivados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own archived chats"
  ON public.chats_arquivados FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
