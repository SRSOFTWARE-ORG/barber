-- =====================================================================
-- BARBER SHOP — FASE 2: CATÁLOGO (clientes, barbeiros, serviços)
-- =====================================================================
-- Pré-requisito: phase1_core.sql executado.
-- Execute no SQL Editor do Supabase (ddrwahpcbsbxhflhskuh).
-- Idempotente.
--
-- CONTEÚDO:
--   1. clients               (cadastro de clientes por empresa)
--   2. barbers               (perfil profissional do barbeiro)
--   3. barber_units          (barbeiro ↔ unidade, N:N)
--   4. service_categories    (categorias de serviço por empresa)
--   5. services              (catálogo de serviços)
--   6. barber_services       (barbeiro ↔ serviço, N:N + comissão override)
--   7. Grants, RLS, triggers de updated_at + auditoria
-- =====================================================================

-- 1. CLIENTES ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- se o cliente tem login
  full_name    text NOT NULL,
  phone        text NOT NULL,
  whatsapp     text,
  email        citext,
  avatar_url   text,
  birthdate    date,
  notes        text,
  tags         text[] NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive','blocked','deleted')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_clients_company  ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_user     ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone    ON public.clients(company_id, phone);
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON public.clients USING gin (full_name gin_trgm_ops);

-- pg_trgm é útil para busca por nome. Habilita se ainda não tiver.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. BARBEIROS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barbers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- login do barbeiro
  full_name          text NOT NULL,
  display_name       text,
  avatar_url         text,
  bio                text,
  specialties        text[] NOT NULL DEFAULT '{}',
  commission_percent numeric(5,2) NOT NULL DEFAULT 0
                     CHECK (commission_percent BETWEEN 0 AND 100),
  working_hours      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive','vacation','deleted')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_barbers_company ON public.barbers(company_id);
CREATE INDEX IF NOT EXISTS idx_barbers_user    ON public.barbers(user_id);

-- 3. BARBEIRO ↔ UNIDADE (N:N) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.barber_units (
  barber_id  uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  unit_id    uuid NOT NULL REFERENCES public.units(id)   ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (barber_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_barber_units_unit ON public.barber_units(unit_id);

-- 4. CATEGORIAS DE SERVIÇO ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  icon       text,
  sort_order int  NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_service_categories_company ON public.service_categories(company_id);

-- 5. SERVIÇOS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id        uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  name               text NOT NULL,
  description        text,
  duration_minutes   int  NOT NULL CHECK (duration_minutes > 0),
  price_cents        int  NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  image_url          text,
  active             boolean NOT NULL DEFAULT true,
  sort_order         int NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_company ON public.services(company_id);
CREATE INDEX IF NOT EXISTS idx_services_active  ON public.services(company_id, active);

-- 6. BARBEIRO ↔ SERVIÇO (N:N) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.barber_services (
  barber_id                  uuid NOT NULL REFERENCES public.barbers(id)  ON DELETE CASCADE,
  service_id                 uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  commission_percent_override numeric(5,2)
                             CHECK (commission_percent_override IS NULL
                                    OR commission_percent_override BETWEEN 0 AND 100),
  price_cents_override       int CHECK (price_cents_override IS NULL OR price_cents_override >= 0),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (barber_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_barber_services_service ON public.barber_services(service_id);

-- 7. GRANTS --------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.clients, public.barbers, public.barber_units,
  public.service_categories, public.services, public.barber_services
TO authenticated;
GRANT ALL ON
  public.clients, public.barbers, public.barber_units,
  public.service_categories, public.services, public.barber_services
TO service_role;

-- 8. UPDATED_AT triggers -------------------------------------------------
DO $$ BEGIN CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_barbers_updated BEFORE UPDATE ON public.barbers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_service_categories_updated BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. AUDITORIA -----------------------------------------------------------
DO $$ BEGIN CREATE TRIGGER trg_audit_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_barbers AFTER INSERT OR UPDATE OR DELETE ON public.barbers
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_barber_units AFTER INSERT OR UPDATE OR DELETE ON public.barber_units
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_service_categories AFTER INSERT OR UPDATE OR DELETE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_services AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_barber_services AFTER INSERT OR UPDATE OR DELETE ON public.barber_services
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 10. RLS ---------------------------------------------------------------
ALTER TABLE public.clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_units       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_services    ENABLE ROW LEVEL SECURITY;

-- helper: barbeiro pode gerenciar apenas o próprio registro
CREATE OR REPLACE FUNCTION public.is_self_barber(_user_id uuid, _barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.barbers WHERE id = _barber_id AND user_id = _user_id);
$$;

-- CLIENTS ---------------------------------------------------------------
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.is_company_member(auth.uid(), company_id)
       OR user_id = auth.uid());

DROP POLICY IF EXISTS clients_write ON public.clients;
CREATE POLICY clients_write ON public.clients FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente')
       OR public.has_role(auth.uid(), company_id, 'barbeiro'))
WITH CHECK (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente')
       OR public.has_role(auth.uid(), company_id, 'barbeiro'));

-- BARBERS ---------------------------------------------------------------
DROP POLICY IF EXISTS barbers_select ON public.barbers;
CREATE POLICY barbers_select ON public.barbers FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS barbers_write ON public.barbers;
CREATE POLICY barbers_write ON public.barbers FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente')
       OR user_id = auth.uid())  -- barbeiro edita o próprio perfil
WITH CHECK (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente')
       OR user_id = auth.uid());

-- BARBER_UNITS ----------------------------------------------------------
DROP POLICY IF EXISTS barber_units_select ON public.barber_units;
CREATE POLICY barber_units_select ON public.barber_units FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id
                  AND public.is_company_member(auth.uid(), b.company_id)));

DROP POLICY IF EXISTS barber_units_write ON public.barber_units;
CREATE POLICY barber_units_write ON public.barber_units FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id
                  AND (public.has_role(auth.uid(), b.company_id, 'proprietario')
                       OR public.has_role(auth.uid(), b.company_id, 'gerente'))))
WITH CHECK (public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id
                  AND (public.has_role(auth.uid(), b.company_id, 'proprietario')
                       OR public.has_role(auth.uid(), b.company_id, 'gerente'))));

-- SERVICE_CATEGORIES ----------------------------------------------------
DROP POLICY IF EXISTS svc_cat_select ON public.service_categories;
CREATE POLICY svc_cat_select ON public.service_categories FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS svc_cat_write ON public.service_categories;
CREATE POLICY svc_cat_write ON public.service_categories FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente'))
WITH CHECK (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente'));

-- SERVICES: leitura pública para o app (mesmo sem login o cliente vê serviços
-- ativos ao entrar no slug da barbearia). Ajuste se quiser restringir.
GRANT SELECT ON public.services            TO anon;
GRANT SELECT ON public.service_categories  TO anon;

DROP POLICY IF EXISTS services_select ON public.services;
CREATE POLICY services_select ON public.services FOR SELECT TO authenticated, anon
USING (active = true
       OR public.is_platform_admin(auth.uid())
       OR public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS svc_cat_select_public ON public.service_categories;
CREATE POLICY svc_cat_select_public ON public.service_categories FOR SELECT TO anon
USING (active = true);

DROP POLICY IF EXISTS services_write ON public.services;
CREATE POLICY services_write ON public.services FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente'))
WITH CHECK (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente'));

-- BARBER_SERVICES -------------------------------------------------------
DROP POLICY IF EXISTS barber_services_select ON public.barber_services;
CREATE POLICY barber_services_select ON public.barber_services FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id
                  AND public.is_company_member(auth.uid(), b.company_id)));

DROP POLICY IF EXISTS barber_services_write ON public.barber_services;
CREATE POLICY barber_services_write ON public.barber_services FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id
                  AND (public.has_role(auth.uid(), b.company_id, 'proprietario')
                       OR public.has_role(auth.uid(), b.company_id, 'gerente')
                       OR b.user_id = auth.uid())))
WITH CHECK (public.is_platform_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.barbers b
                  WHERE b.id = barber_id
                  AND (public.has_role(auth.uid(), b.company_id, 'proprietario')
                       OR public.has_role(auth.uid(), b.company_id, 'gerente')
                       OR b.user_id = auth.uid())));

-- =====================================================================
-- FIM DA FASE 2
-- =====================================================================
--
-- STORAGE BUCKETS (execute no dashboard OU via SQL abaixo):
-- Como você usa seu próprio Supabase, o mais rápido é:
--   Dashboard → Storage → New bucket, criar cada um:
--     - avatars     (public)
--     - logos       (public)
--     - portfolio   (public)
--     - services    (public)
--     - banners     (public)
--     - videos      (public)
--     - documents   (private)
--     - support     (private)
--
-- Ou via SQL (dentro do Storage: pode usar SQL do dashboard também):
--
--   INSERT INTO storage.buckets (id, name, public) VALUES
--     ('avatars','avatars',true),('logos','logos',true),
--     ('portfolio','portfolio',true),('services','services',true),
--     ('banners','banners',true),('videos','videos',true),
--     ('documents','documents',false),('support','support',false)
--   ON CONFLICT (id) DO NOTHING;
--
-- Depois, RLS nos objetos (leitura pública dos públicos + upload por membros):
--
--   -- Leitura pública nos buckets públicos
--   DROP POLICY IF EXISTS storage_public_read ON storage.objects;
--   CREATE POLICY storage_public_read ON storage.objects FOR SELECT TO anon, authenticated
--   USING (bucket_id IN ('avatars','logos','portfolio','services','banners','videos'));
--
--   -- Upload/Update/Delete: usuário autenticado, dentro do próprio "folder"
--   -- Convenção: primeiro segmento do path = company_id
--   DROP POLICY IF EXISTS storage_company_write ON storage.objects;
--   CREATE POLICY storage_company_write ON storage.objects FOR ALL TO authenticated
--   USING (
--     bucket_id IN ('avatars','logos','portfolio','services','banners','videos','documents','support')
--     AND (public.is_platform_admin(auth.uid())
--          OR public.is_company_member(auth.uid(), (storage.foldername(name))[1]::uuid))
--   )
--   WITH CHECK (
--     bucket_id IN ('avatars','logos','portfolio','services','banners','videos','documents','support')
--     AND (public.is_platform_admin(auth.uid())
--          OR public.is_company_member(auth.uid(), (storage.foldername(name))[1]::uuid))
--   );
--
-- =====================================================================
