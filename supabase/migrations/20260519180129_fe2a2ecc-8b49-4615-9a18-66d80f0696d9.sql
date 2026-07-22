
ALTER TABLE public.configuracoes_barbeiro
  ADD COLUMN IF NOT EXISTS fechado_hoje_data date,
  ADD COLUMN IF NOT EXISTS fechado_hoje_hora time,
  ADD COLUMN IF NOT EXISTS limite_agendamento_hora integer;
