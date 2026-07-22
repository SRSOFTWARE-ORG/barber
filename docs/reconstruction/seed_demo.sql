-- =====================================================================
-- BARBER SHOP — SEED DE DEMONSTRAÇÃO (idempotente, seguro para reexecutar)
-- =====================================================================
-- Execute no SQL Editor do Supabase:
--   https://supabase.com/dashboard/project/ddrwahpcbsbxhflhskuh/sql/new
--
-- O que este arquivo faz:
--   1. Corrige GRANTs de todas as tabelas do schema public para a Data API
--      (resolve "permission denied" / "relation does not exist" quando
--      a tabela existe mas o role authenticated/anon não tem acesso).
--   2. Concede as roles `admin` e `ceo` ao usuário srcj9975@gmail.com
--      tanto em `user_roles` (legado) quanto em `platform_admins` (novo).
--   3. Cria a função `public.seed_demo_data()` que popula empresa,
--      unidade, barbeiros, clientes, serviços, agendamentos das últimas
--      4 semanas, promoções e produtos de marketplace — só se a tabela
--      existir e só se ainda não existirem registros com o marker demo.
--   4. Executa a seed uma vez ao final. Você pode rodar novamente com:
--         SELECT public.seed_demo_data();
--      ou apagar tudo o que a seed criou com:
--         SELECT public.unseed_demo_data();
--
-- Pré-requisitos:
--   - Você já fez login pelo menos uma vez em /auth com srcj9975@gmail.com
--     (para existir a linha em auth.users).
--   - As migrations das fases 1..9 já foram executadas OU o app está
--     rodando no schema legado — o script detecta e adapta.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. GRANTs no schema public (fix para "permission denied" da Data API)
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS t
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.t);
  END LOOP;

  -- Sequences (para tabelas com bigserial/serial)
  FOR r IN
    SELECT c.relname AS s
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='S'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', r.s);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', r.s);
  END LOOP;
END $$;

-- Não concedemos anon aqui automaticamente. Se você precisa de leitura
-- pública em alguma tabela específica (ex: vitrine/gallery), rode manualmente:
--   GRANT SELECT ON public.<tabela> TO anon;

-- ---------------------------------------------------------------------
-- 2. Bootstrap de roles para o usuário CEO
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_uid uuid;
  v_ur_has_company boolean;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'srcj9975@gmail.com' LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'Usuário srcj9975@gmail.com ainda não existe em auth.users. Faça login em /auth uma vez e rode este script de novo.';
    RETURN;
  END IF;

  -- platform_admins (schema multi-tenant novo)
  IF to_regclass('public.platform_admins') IS NOT NULL THEN
    INSERT INTO public.platform_admins (user_id, role)
    VALUES (v_uid, 'ceo')
    ON CONFLICT (user_id) DO UPDATE SET role = 'ceo';
  END IF;

  -- user_roles: pode ter formato legado (user_id, role) OU novo (user_id, company_id, role).
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='user_roles' AND column_name='company_id'
    ) INTO v_ur_has_company;

    IF v_ur_has_company THEN
      -- schema novo: precisa de company_id; usa a primeira empresa disponível se houver
      DECLARE v_cid uuid;
      BEGIN
        SELECT id INTO v_cid FROM public.companies ORDER BY created_at LIMIT 1;
        IF v_cid IS NOT NULL THEN
          INSERT INTO public.user_roles (user_id, company_id, role)
          VALUES (v_uid, v_cid, 'proprietario')
          ON CONFLICT DO NOTHING;
        END IF;
      END;
    ELSE
      -- schema legado (user_id, role) — insere admin e ceo
      EXECUTE 'INSERT INTO public.user_roles (user_id, role) VALUES ($1, ''admin'') ON CONFLICT DO NOTHING' USING v_uid;
      EXECUTE 'INSERT INTO public.user_roles (user_id, role) VALUES ($1, ''ceo'')   ON CONFLICT DO NOTHING' USING v_uid;
    END IF;
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- 3. Funções de seed / unseed (idempotentes)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unseed_demo_data()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cid uuid;
BEGIN
  SELECT id INTO v_cid FROM public.companies WHERE slug='demo-barber' LIMIT 1;
  IF v_cid IS NULL THEN RETURN 'nada para remover'; END IF;

  IF to_regclass('public.booking_services') IS NOT NULL THEN
    DELETE FROM public.booking_services WHERE booking_id IN
      (SELECT id FROM public.bookings WHERE company_id = v_cid);
  END IF;
  IF to_regclass('public.bookings')  IS NOT NULL THEN DELETE FROM public.bookings  WHERE company_id = v_cid; END IF;
  IF to_regclass('public.barber_services') IS NOT NULL THEN
    DELETE FROM public.barber_services WHERE barber_id IN
      (SELECT id FROM public.barbers WHERE company_id = v_cid);
  END IF;
  IF to_regclass('public.services') IS NOT NULL THEN DELETE FROM public.services WHERE company_id = v_cid; END IF;
  IF to_regclass('public.clients')  IS NOT NULL THEN DELETE FROM public.clients  WHERE company_id = v_cid; END IF;
  IF to_regclass('public.barber_units') IS NOT NULL THEN
    DELETE FROM public.barber_units WHERE barber_id IN
      (SELECT id FROM public.barbers WHERE company_id = v_cid);
  END IF;
  IF to_regclass('public.barbers')  IS NOT NULL THEN DELETE FROM public.barbers  WHERE company_id = v_cid; END IF;
  IF to_regclass('public.units')    IS NOT NULL THEN DELETE FROM public.units    WHERE company_id = v_cid; END IF;
  DELETE FROM public.companies WHERE id = v_cid;
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cid uuid;
  v_uid uuid;
  v_unit_id uuid;
  v_barber_ids uuid[];
  v_client_ids uuid[];
  v_service_ids uuid[];
  v_bid uuid;
  v_start timestamptz;
  v_dur int;
  v_price int;
  i int;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email='srcj9975@gmail.com' LIMIT 1;

  -- --------- COMPANY ----------
  IF to_regclass('public.companies') IS NULL THEN
    RETURN 'schema não tem companies — rode as migrations phase1..phase3 antes.';
  END IF;

  INSERT INTO public.companies (slug, name, email, phone, created_by)
  VALUES ('demo-barber','Barbearia Demo','demo@barber.app','+55 11 99999-0000', v_uid)
  ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
  RETURNING id INTO v_cid;

  -- Garante papel de proprietário para o usuário logado (schema multi-tenant)
  IF v_uid IS NOT NULL
     AND to_regclass('public.user_roles') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='user_roles' AND column_name='company_id') THEN
    INSERT INTO public.user_roles(user_id, company_id, role)
    VALUES (v_uid, v_cid, 'proprietario') ON CONFLICT DO NOTHING;
  END IF;

  -- --------- UNIT ----------
  IF to_regclass('public.units') IS NOT NULL THEN
    SELECT id INTO v_unit_id FROM public.units WHERE company_id=v_cid LIMIT 1;
    IF v_unit_id IS NULL THEN
      INSERT INTO public.units(company_id, name, city, state)
      VALUES (v_cid, 'Matriz','São Paulo','SP') RETURNING id INTO v_unit_id;
    END IF;
  END IF;

  -- --------- BARBERS ----------
  IF to_regclass('public.barbers') IS NOT NULL THEN
    FOR i IN 1..3 LOOP
      INSERT INTO public.barbers(company_id, full_name, display_name, commission_percent)
      SELECT v_cid,
             (ARRAY['Carlos Silva','Rafael Souza','João Pereira'])[i],
             (ARRAY['Carlos','Rafa','João'])[i],
             40
      WHERE NOT EXISTS (
        SELECT 1 FROM public.barbers
         WHERE company_id=v_cid AND full_name=(ARRAY['Carlos Silva','Rafael Souza','João Pereira'])[i]
      );
    END LOOP;
    SELECT array_agg(id) INTO v_barber_ids FROM public.barbers WHERE company_id=v_cid;

    IF to_regclass('public.barber_units') IS NOT NULL AND v_unit_id IS NOT NULL THEN
      INSERT INTO public.barber_units(barber_id, unit_id, is_primary)
      SELECT b.id, v_unit_id, true FROM public.barbers b WHERE b.company_id=v_cid
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- --------- SERVICES ----------
  IF to_regclass('public.services') IS NOT NULL THEN
    FOR i IN 1..5 LOOP
      INSERT INTO public.services(company_id, name, duration_minutes, price_cents)
      SELECT v_cid,
             (ARRAY['Corte Masculino','Barba','Corte + Barba','Pigmentação','Sobrancelha'])[i],
             (ARRAY[30,25,50,45,15])[i],
             (ARRAY[5000,3500,7500,8000,2000])[i]
      WHERE NOT EXISTS (
        SELECT 1 FROM public.services
         WHERE company_id=v_cid AND name=(ARRAY['Corte Masculino','Barba','Corte + Barba','Pigmentação','Sobrancelha'])[i]
      );
    END LOOP;
    SELECT array_agg(id) INTO v_service_ids FROM public.services WHERE company_id=v_cid;
  END IF;

  -- --------- CLIENTS ----------
  IF to_regclass('public.clients') IS NOT NULL THEN
    FOR i IN 1..15 LOOP
      INSERT INTO public.clients(company_id, full_name, phone)
      SELECT v_cid,
             'Cliente Demo '||i,
             '+5511900' || lpad(i::text,5,'0')
      WHERE NOT EXISTS (
        SELECT 1 FROM public.clients WHERE company_id=v_cid AND phone='+5511900'||lpad(i::text,5,'0')
      );
    END LOOP;
    SELECT array_agg(id) INTO v_client_ids FROM public.clients WHERE company_id=v_cid;
  END IF;

  -- --------- BOOKINGS (últimas 4 semanas) ----------
  IF to_regclass('public.bookings') IS NOT NULL
     AND v_barber_ids IS NOT NULL AND v_service_ids IS NOT NULL AND v_client_ids IS NOT NULL THEN
    FOR i IN 0..79 LOOP
      -- pula se já existe seed nesta janela
      v_start := date_trunc('hour', now()) - ((i * 6) || ' hours')::interval;
      v_dur := (ARRAY[30,25,50,45,15])[1 + (i % 5)];
      v_price := (ARRAY[5000,3500,7500,8000,2000])[1 + (i % 5)];

      IF EXISTS (
        SELECT 1 FROM public.bookings
         WHERE company_id=v_cid AND starts_at=v_start
           AND barber_id = v_barber_ids[1 + (i % array_length(v_barber_ids,1))]
      ) THEN CONTINUE; END IF;

      INSERT INTO public.bookings(
        company_id, unit_id, barber_id, client_id,
        starts_at, ends_at, status, origin,
        subtotal_cents, total_cents
      ) VALUES (
        v_cid, v_unit_id,
        v_barber_ids[1 + (i % array_length(v_barber_ids,1))],
        v_client_ids[1 + (i % array_length(v_client_ids,1))],
        v_start, v_start + (v_dur || ' minutes')::interval,
        (ARRAY['completed','completed','completed','confirmed','cancelled','no_show'])[1 + (i % 6)]::public.booking_status,
        'client', v_price, v_price
      ) RETURNING id INTO v_bid;

      IF to_regclass('public.booking_services') IS NOT NULL THEN
        INSERT INTO public.booking_services(booking_id, service_id, name_snapshot, duration_minutes, price_cents)
        SELECT v_bid,
               v_service_ids[1 + (i % array_length(v_service_ids,1))],
               s.name, s.duration_minutes, s.price_cents
          FROM public.services s
         WHERE s.id = v_service_ids[1 + (i % array_length(v_service_ids,1))];
      END IF;
    END LOOP;
  END IF;

  -- --------- LEGADO OPCIONAL: promocoes / marketplace_produtos ----------
  IF to_regclass('public.promocoes') IS NOT NULL THEN
    INSERT INTO public.promocoes(titulo, descricao, desconto_percent, ativo)
    SELECT * FROM (VALUES
      ('Corte + Barba 20% OFF','Combo semanal',20,true),
      ('Terça do Cliente','Corte com 15% de desconto',15,true),
      ('Sobrancelha grátis','Na compra de corte + barba',0,true)
    ) v(t,d,p,a)
    WHERE NOT EXISTS (SELECT 1 FROM public.promocoes WHERE titulo=v.t);
  END IF;

  IF to_regclass('public.marketplace_produtos') IS NOT NULL THEN
    INSERT INTO public.marketplace_produtos(nome, descricao, preco, estoque, ativo)
    SELECT * FROM (VALUES
      ('Pomada Modeladora','Fixação forte, brilho médio',49.90,20,true),
      ('Óleo para Barba','Hidrata e perfuma',39.90,15,true),
      ('Shampoo Anticaspa','200ml',34.90,30,true)
    ) v(n,d,p,e,a)
    WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_produtos WHERE nome=v.n);
  END IF;

  RETURN format('seed ok — company %s, %s barbeiros, %s clientes, %s serviços',
                v_cid,
                COALESCE(array_length(v_barber_ids,1),0),
                COALESCE(array_length(v_client_ids,1),0),
                COALESCE(array_length(v_service_ids,1),0));
END $$;

GRANT EXECUTE ON FUNCTION public.seed_demo_data()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unseed_demo_data() TO service_role;

-- ---------------------------------------------------------------------
-- 4. Executa a seed AGORA
-- ---------------------------------------------------------------------
SELECT public.seed_demo_data() AS resultado;

-- ---------------------------------------------------------------------
-- 5. Verificação rápida do Dashboard Executivo
-- ---------------------------------------------------------------------
-- Views usadas pelo dashboard:
--   v_dashboard_barber_today, v_bookings_daily, kpi_snapshots
-- Se alguma não existir, o dashboard mostra '—' nos KPIs correspondentes.
SELECT
  to_regclass('public.v_dashboard_barber_today') AS v_barber_today,
  to_regclass('public.v_bookings_daily')         AS v_bookings_daily,
  to_regclass('public.kpi_snapshots')            AS kpi_snapshots,
  to_regclass('public.bookings')                 AS bookings,
  to_regclass('public.shop_appts')               AS shop_appts_legacy;

-- Se `shop_appts_legacy` vier NULL e alguma tela ainda pedir essa tabela,
-- crie um alias/view apontando para bookings:
--   CREATE OR REPLACE VIEW public.shop_appts AS SELECT * FROM public.bookings;
--   GRANT SELECT ON public.shop_appts TO authenticated;

-- Para reexecutar seed sem duplicar:    SELECT public.seed_demo_data();
-- Para limpar tudo:                     SELECT public.unseed_demo_data();
