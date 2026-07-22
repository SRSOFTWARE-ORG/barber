
-- Avaliacoes table (no FK to auth.users)
CREATE TABLE public.avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE NOT NULL,
  cliente_id uuid NOT NULL,
  adm_id uuid NOT NULL,
  nota int NOT NULL,
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agendamento_id)
);

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_avaliacao_nota()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nota < 1 OR NEW.nota > 5 THEN
    RAISE EXCEPTION 'Nota deve ser entre 1 e 5';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_avaliacao
  BEFORE INSERT OR UPDATE ON public.avaliacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_avaliacao_nota();

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;

-- Clients can insert ratings for their own appointments
CREATE POLICY "Cliente avalia seu atendimento"
  ON public.avaliacoes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = cliente_id);

-- Clients can see their own ratings
CREATE POLICY "Cliente ve suas avaliacoes"
  ON public.avaliacoes FOR SELECT
  TO authenticated
  USING (auth.uid() = cliente_id);

-- ADMs can see ratings for them
CREATE POLICY "ADM ve suas avaliacoes"
  ON public.avaliacoes FOR SELECT
  TO authenticated
  USING (auth.uid() = adm_id AND has_role(auth.uid(), 'admin'));

-- CEO can see all ratings
CREATE POLICY "CEO ve todas avaliacoes"
  ON public.avaliacoes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'));
