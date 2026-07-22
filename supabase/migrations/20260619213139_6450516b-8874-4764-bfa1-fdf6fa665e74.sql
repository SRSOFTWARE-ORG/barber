CREATE OR REPLACE FUNCTION public.seed_default_services(_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _owner IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.servicos WHERE shop_owner_id = _owner) THEN
    RETURN;
  END IF;
  INSERT INTO public.servicos (nome, preco, duracao, eh_fracionado, duracao_fase1, duracao_espera, duracao_fase2, shop_owner_id)
  VALUES
    ('Corte', 35, 30, false, null, null, null, _owner),
    ('Barba', 25, 20, false, null, null, null, _owner),
    ('Barba + Pigmentação', 30, 30, false, null, null, null, _owner),
    ('Sombraselha', 10, 10, false, null, null, null, _owner),
    ('Sombraselha + Pigmentação', 15, 15, false, null, null, null, _owner),
    ('Pezinho', 10, 10, false, null, null, null, _owner),
    ('Freestyle (Apt)', 15, 15, false, null, null, null, _owner),
    ('Pigmentação', 15, 10, false, null, null, null, _owner),
    ('Corte + Pigmentação', 55, 50, false, null, null, null, _owner),
    ('Nevou', 140, 160, true, 10, 120, 30, _owner),
    ('Reflexo', 140, 160, true, 10, 120, 30, _owner),
    ('Colorimetria', 160, 80, true, 10, 40, 30, _owner);
END;
$$;

-- Backfill: add any missing default service (by name, case-insensitive) to every existing barbershop.
DO $$
DECLARE
  r record;
  s record;
  defaults jsonb := '[
    {"nome":"Corte","preco":35,"duracao":30,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Barba","preco":25,"duracao":20,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Barba + Pigmentação","preco":30,"duracao":30,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Sombraselha","preco":10,"duracao":10,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Sombraselha + Pigmentação","preco":15,"duracao":15,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Pezinho","preco":10,"duracao":10,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Freestyle (Apt)","preco":15,"duracao":15,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Pigmentação","preco":15,"duracao":10,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Corte + Pigmentação","preco":55,"duracao":50,"frac":false,"f1":null,"esp":null,"f2":null},
    {"nome":"Nevou","preco":140,"duracao":160,"frac":true,"f1":10,"esp":120,"f2":30},
    {"nome":"Reflexo","preco":140,"duracao":160,"frac":true,"f1":10,"esp":120,"f2":30},
    {"nome":"Colorimetria","preco":160,"duracao":80,"frac":true,"f1":10,"esp":40,"f2":30}
  ]'::jsonb;
BEGIN
  FOR r IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','ceo')
  LOOP
    FOR s IN SELECT v FROM jsonb_array_elements(defaults) AS d(v)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.servicos sv
        WHERE sv.shop_owner_id = r.user_id
          AND lower(btrim(sv.nome)) = lower(btrim(s.v->>'nome'))
      ) THEN
        INSERT INTO public.servicos (nome, preco, duracao, eh_fracionado, duracao_fase1, duracao_espera, duracao_fase2, shop_owner_id)
        VALUES (
          s.v->>'nome',
          (s.v->>'preco')::numeric,
          (s.v->>'duracao')::int,
          (s.v->>'frac')::boolean,
          NULLIF(s.v->>'f1','null')::int,
          NULLIF(s.v->>'esp','null')::int,
          NULLIF(s.v->>'f2','null')::int,
          r.user_id
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;