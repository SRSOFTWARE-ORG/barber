
-- Chat messages table
CREATE TABLE public.mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id uuid NOT NULL,
  destinatario_id uuid NOT NULL,
  conteudo text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Users can read messages they sent or received
CREATE POLICY "Users read own messages"
  ON public.mensagens FOR SELECT
  TO authenticated
  USING (auth.uid() = remetente_id OR auth.uid() = destinatario_id);

-- Users can insert messages (as sender)
CREATE POLICY "Users send messages"
  ON public.mensagens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = remetente_id);

-- Users can update messages they received (mark as read)
CREATE POLICY "Users mark received as read"
  ON public.mensagens FOR UPDATE
  TO authenticated
  USING (auth.uid() = destinatario_id);

-- CEO can read all messages
CREATE POLICY "CEO reads all messages"
  ON public.mensagens FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'ceo'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
