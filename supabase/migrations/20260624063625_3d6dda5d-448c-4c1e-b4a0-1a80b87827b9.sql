CREATE TABLE public.app_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  categoria text NOT NULL DEFAULT 'custom',
  cor_primaria text,
  cor_secundaria text,
  emoji text,
  logo_url text,
  banner_url text,
  banner_texto text,
  animacao text NOT NULL DEFAULT 'none',
  ativo boolean NOT NULL DEFAULT false,
  auto_ativar boolean NOT NULL DEFAULT false,
  data_inicio timestamptz,
  data_fim timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_events TO authenticated;
GRANT ALL ON public.app_events TO service_role;

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Todos podem ler eventos (necessário para renderizar banner/animação no app inteiro)
CREATE POLICY "Anyone can view app events"
  ON public.app_events FOR SELECT
  USING (true);

-- Apenas o CEO pode criar/editar/excluir
CREATE POLICY "CEO can insert app events"
  ON public.app_events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "CEO can update app events"
  ON public.app_events FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "CEO can delete app events"
  ON public.app_events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE TRIGGER update_app_events_updated_at
  BEFORE UPDATE ON public.app_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_events;