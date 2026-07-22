
CREATE TABLE public.promocoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adm_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text NOT NULL,
  preco_original text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promocoes ENABLE ROW LEVEL SECURITY;

-- Everyone can see active promotions
CREATE POLICY "Promoções ativas visíveis para todos"
  ON public.promocoes FOR SELECT
  TO anon, authenticated
  USING (ativa = true);

-- Admins can see all their own promotions (including inactive)
CREATE POLICY "Adms veem suas promoções"
  ON public.promocoes FOR SELECT
  TO authenticated
  USING (auth.uid() = adm_id AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo')));

-- Admins insert their own promotions
CREATE POLICY "Adms criam promoções"
  ON public.promocoes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = adm_id AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo')));

-- Admins update their own promotions
CREATE POLICY "Adms atualizam suas promoções"
  ON public.promocoes FOR UPDATE
  TO authenticated
  USING (auth.uid() = adm_id AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo')));

-- Admins delete their own promotions
CREATE POLICY "Adms deletam suas promoções"
  ON public.promocoes FOR DELETE
  TO authenticated
  USING (auth.uid() = adm_id AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo')));

-- CEO can manage all promotions
CREATE POLICY "CEO ve todas promoções"
  ON public.promocoes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'));

CREATE POLICY "CEO deleta qualquer promoção"
  ON public.promocoes FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'));
