
CREATE TABLE public.configuracoes_barbeiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL UNIQUE,
  hora_inicio integer NOT NULL DEFAULT 9,
  hora_fim integer NOT NULL DEFAULT 19,
  dias_funcionamento integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  duracao_slot integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracoes_barbeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Config visivel para todos" ON public.configuracoes_barbeiro FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Barbeiro atualiza propria config" ON public.configuracoes_barbeiro FOR UPDATE TO authenticated USING (auth.uid() = barbeiro_id);
CREATE POLICY "Barbeiro insere propria config" ON public.configuracoes_barbeiro FOR INSERT TO authenticated WITH CHECK (auth.uid() = barbeiro_id);
CREATE POLICY "CEO gerencia configs" ON public.configuracoes_barbeiro FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ceo')) WITH CHECK (public.has_role(auth.uid(), 'ceo'));
