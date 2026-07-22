ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS categoria text;

UPDATE public.servicos SET categoria = CASE
  WHEN nome ~* '(combo|completo|\+)' THEN 'COMBOS'
  WHEN nome ~* '(progressiv|selage|relaxa|tintura|colora|colorimetr|luzes|mechas|platinad|nevou|descolora|reflexo|quimic)' THEN 'QUÍMICA'
  WHEN nome ~* '(hidrata|nutri|lavagem|limpeza|sobrance|sombrace|sombrasel|pigment|design|tratament)' THEN 'TRATAMENTO & ESTÉTICA'
  WHEN nome ~* '(barba|cavanhaque|barboterap|bigode)' THEN 'BARBA'
  WHEN nome ~* '(corte|cabelo|degrade|degradê|fade|pezinho|acabamento|infantil|freestyle|raspad|desenho|risco|navalhad|disfarc|social)' THEN 'CORTES'
  ELSE 'Outros'
END
WHERE categoria IS NULL;