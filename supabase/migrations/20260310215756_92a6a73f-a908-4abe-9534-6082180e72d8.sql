
CREATE TABLE public.suporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adm_id uuid NOT NULL,
  assunto text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  resposta text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suporte ENABLE ROW LEVEL SECURITY;

-- ADMs can see their own tickets
CREATE POLICY "Adms veem seus tickets"
  ON public.suporte FOR SELECT
  TO authenticated
  USING (auth.uid() = adm_id);

-- ADMs can create tickets
CREATE POLICY "Adms criam tickets"
  ON public.suporte FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = adm_id AND has_role(auth.uid(), 'admin'));

-- CEO can see all tickets
CREATE POLICY "CEO ve todos tickets"
  ON public.suporte FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'));

-- CEO can update tickets (respond, change status)
CREATE POLICY "CEO atualiza tickets"
  ON public.suporte FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'));
