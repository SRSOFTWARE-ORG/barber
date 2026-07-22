
-- Adiciona a coluna para vincular o cliente a um administrador específico
ALTER TABLE public.profiles ADD COLUMN adm_responsavel_id uuid;

-- Cria um índice para otimizar a busca por clientes de um admin específico
CREATE INDEX idx_cliente_adm_responsavel ON public.profiles(adm_responsavel_id);
