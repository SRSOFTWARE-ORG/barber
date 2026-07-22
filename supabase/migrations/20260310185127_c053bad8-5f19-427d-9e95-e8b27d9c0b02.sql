-- Criar tabela de serviços
CREATE TABLE public.servicos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  duracao INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.servicos (nome, preco, duracao) VALUES
  ('Corte Clássico', 45, 30),
  ('Barba Completa', 35, 30),
  ('Corte + Barba', 70, 60),
  ('Degradê', 50, 40),
  ('Pigmentação', 80, 45);

-- Criar tabela de agendamentos
CREATE TABLE public.agendamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cliente_nome TEXT NOT NULL,
  cliente_sobrenome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  servico_ids UUID[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled'))
);

-- Criar tabela de horários bloqueados
CREATE TABLE public.horarios_bloqueados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  motivo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de configurações
CREATE TABLE public.configuracoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_barbearia TEXT NOT NULL DEFAULT 'Barbearia Classic',
  hora_inicio INTEGER NOT NULL DEFAULT 9,
  hora_fim INTEGER NOT NULL DEFAULT 19,
  dias_funcionamento INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  duracao_slot INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.configuracoes (nome_barbearia) VALUES ('Barbearia Classic');

-- Habilitar RLS
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios_bloqueados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura pública
CREATE POLICY "Serviços visíveis para todos" ON public.servicos FOR SELECT USING (true);
CREATE POLICY "Config visível para todos" ON public.configuracoes FOR SELECT USING (true);
CREATE POLICY "Bloqueios visíveis para todos" ON public.horarios_bloqueados FOR SELECT USING (true);
CREATE POLICY "Agendamentos visíveis para todos" ON public.agendamentos FOR SELECT USING (true);

-- Políticas de escrita
CREATE POLICY "Qualquer um pode agendar" ON public.agendamentos FOR INSERT WITH CHECK (true);
CREATE POLICY "Update agendamentos" ON public.agendamentos FOR UPDATE USING (true);
CREATE POLICY "Update config" ON public.configuracoes FOR UPDATE USING (true);
CREATE POLICY "Insert serviços" ON public.servicos FOR INSERT WITH CHECK (true);
CREATE POLICY "Update serviços" ON public.servicos FOR UPDATE USING (true);
CREATE POLICY "Delete serviços" ON public.servicos FOR DELETE USING (true);
CREATE POLICY "Insert bloqueios" ON public.horarios_bloqueados FOR INSERT WITH CHECK (true);
CREATE POLICY "Delete bloqueios" ON public.horarios_bloqueados FOR DELETE USING (true);

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agendamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE servicos;
ALTER PUBLICATION supabase_realtime ADD TABLE horarios_bloqueados;
ALTER PUBLICATION supabase_realtime ADD TABLE configuracoes;