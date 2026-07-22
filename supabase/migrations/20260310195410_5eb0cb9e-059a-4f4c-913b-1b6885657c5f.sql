
-- Adiciona coluna de preço à tabela de agendamentos
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS valor_pago decimal(10,2) DEFAULT 0.00;

-- Cria índice para busca rápida por nome de cliente
CREATE INDEX IF NOT EXISTS idx_cliente_nome ON public.agendamentos (cliente_nome);
