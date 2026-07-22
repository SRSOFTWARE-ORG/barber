-- Seed default config row if none exists
INSERT INTO public.configuracoes (nome_barbearia, hora_inicio, hora_fim, dias_funcionamento, duracao_slot)
SELECT 'Barbearia Classic', 9, 19, '{1,2,3,4,5,6}'::integer[], 30
WHERE NOT EXISTS (SELECT 1 FROM public.configuracoes LIMIT 1);

-- Seed default services if none exist
INSERT INTO public.servicos (nome, preco, duracao)
SELECT * FROM (VALUES
  ('Corte Clássico'::text, 45::numeric, 30::integer),
  ('Barba Completa'::text, 35::numeric, 30::integer),
  ('Corte + Barba'::text, 70::numeric, 60::integer),
  ('Degradê'::text, 50::numeric, 40::integer),
  ('Pigmentação'::text, 80::numeric, 45::integer)
) AS v(nome, preco, duracao)
WHERE NOT EXISTS (SELECT 1 FROM public.servicos LIMIT 1);