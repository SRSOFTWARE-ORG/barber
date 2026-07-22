-- =====================================================================
-- BARBER SHOP — RECONSTRUÇÃO FASE 1: NÚCLEO MULTI-TENANT
-- =====================================================================
-- Execute este arquivo no SQL Editor do Supabase do SEU projeto
-- (ddrwahpcbsbxhflhskuh). Idempotente: pode rodar mais de uma vez.
--
-- CONTEÚDO:
--   1. Extensions
--   2. Enums (app_role, audit_action)
--   3. Tabelas núcleo: companies, units, profiles, user_roles,
--      platform_admins, audit_logs
--   4. Security-definer helpers: is_platform_admin, has_role,
--      is_company_member, current_company_ids
--   5. RLS + grants
--   6. Triggers: updated_at, auto-profile, auditoria genérica
--   7. Bootstrap do CEO (instruções ao final)
--
-- ATENÇÃO: se você tem tabelas antigas com estes nomes de tentativas
-- anteriores, revise antes de executar — este script usa
-- CREATE TABLE IF NOT EXISTS e NÃO altera colunas existentes.
-- =====================================================================

-- 1. EXTENSIONS ----------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 2. ENUMS ---------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'ceo','suporte','proprietario','gerente','barbeiro','cliente'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_action AS ENUM ('INSERT','UPDATE','DELETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. TABELAS -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.companies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       citext NOT NULL UNIQUE,
  name       text   NOT NULL,
  logo_url   text,
  phone      text,
  email      citext,
  timezone   text   NOT NULL DEFAULT 'America/Sao_Paulo',
  language   text   NOT NULL DEFAULT 'pt-BR',
  currency   text   NOT NULL DEFAULT 'BRL',
  country    text   NOT NULL DEFAULT 'BR',
  status     text   NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','suspended','trial','deleted')),
  settings   jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);

CREATE TABLE IF NOT EXISTS public.units (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name           text NOT NULL,
  address        text, city text, state text,
  country        text NOT NULL DEFAULT 'BR',
  phone          text,
  timezone       text,
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','inactive','deleted')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_company ON public.units(company_id);

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text, display_name text, avatar_url text, phone text,
  language     text NOT NULL DEFAULT 'pt-BR',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Roles de EMPRESA (proprietario/gerente/barbeiro/cliente).
-- CEO/suporte são de PLATAFORMA → tabela platform_admins.
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id    uuid REFERENCES public.units(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL
             CHECK (role IN ('proprietario','gerente','barbeiro','cliente')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, unit_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user    ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company ON public.user_roles(company_id);

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL CHECK (role IN ('ceo','suporte')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  company_id    uuid,
  table_name    text NOT NULL,
  row_pk        text,
  action        public.audit_action NOT NULL,
  old_data      jsonb, new_data jsonb,
  ip            inet
);
CREATE INDEX IF NOT EXISTS idx_audit_table_time ON public.audit_logs(table_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_company    ON public.audit_logs(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON public.audit_logs(actor_user_id, occurred_at DESC);

-- 4. GRANTS --------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles  TO authenticated;
GRANT SELECT ON public.user_roles      TO authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT SELECT ON public.audit_logs      TO authenticated;
GRANT ALL ON public.companies, public.units, public.profiles,
             public.user_roles, public.platform_admins, public.audit_logs
      TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO service_role;

-- 5. SECURITY DEFINER HELPERS -------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.platform_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.platform_admins WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _company_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND company_id = _company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.current_company_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT company_id FROM public.user_roles WHERE user_id = auth.uid();
$$;

-- 6. RLS -----------------------------------------------------------------
ALTER TABLE public.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.is_company_member(auth.uid(), id));

DROP POLICY IF EXISTS companies_insert ON public.companies;
CREATE POLICY companies_insert ON public.companies FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS companies_update ON public.companies;
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), id, 'proprietario'))
WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), id, 'proprietario'));

DROP POLICY IF EXISTS companies_delete ON public.companies;
CREATE POLICY companies_delete ON public.companies FOR DELETE TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS units_write ON public.units;
CREATE POLICY units_write ON public.units FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente'))
WITH CHECK (public.is_platform_admin(auth.uid())
       OR public.has_role(auth.uid(), company_id, 'proprietario')
       OR public.has_role(auth.uid(), company_id, 'gerente'));

DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR user_id = auth.uid()
       OR public.is_company_member(auth.uid(), company_id));
-- Write via service_role/RPC apenas (deny para authenticated por default).

DROP POLICY IF EXISTS platform_admins_select ON public.platform_admins;
CREATE POLICY platform_admins_select ON public.platform_admins FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid())
       OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id)));

-- 7. TRIGGERS ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$ BEGIN CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_units_updated BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, display_name, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid; v_pk text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_company_id := (to_jsonb(OLD)->>'company_id')::uuid;
      v_pk := (to_jsonb(OLD)->>'id');
    ELSE
      v_company_id := (to_jsonb(NEW)->>'company_id')::uuid;
      v_pk := (to_jsonb(NEW)->>'id');
    END IF;
  EXCEPTION WHEN others THEN v_company_id := NULL; END;
  INSERT INTO public.audit_logs(actor_user_id, company_id, table_name, row_pk, action, old_data, new_data)
  VALUES (auth.uid(), v_company_id,
    TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME, v_pk, TG_OP::public.audit_action,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$ BEGIN CREATE TRIGGER trg_audit_companies AFTER INSERT OR UPDATE OR DELETE
  ON public.companies FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_units AFTER INSERT OR UPDATE OR DELETE
  ON public.units FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE
  ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_platform_admins AFTER INSERT OR UPDATE OR DELETE
  ON public.platform_admins FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 8. BOOTSTRAP CEO (execute DEPOIS de fazer login uma vez no /auth
--    com srcj9975@gmail.com):
--
--   INSERT INTO public.platform_admins (user_id, role)
--   SELECT id, 'ceo' FROM auth.users WHERE email = 'srcj9975@gmail.com'
--   ON CONFLICT (user_id) DO UPDATE SET role = 'ceo';
--
-- Para adicionar suporte:
--   INSERT INTO public.platform_admins (user_id, role)
--   SELECT id, 'suporte' FROM auth.users WHERE email = 'x@y.com';
--
-- Para remover trava CEO antiga (email hardcoded):
--   DELETE FROM public.user_roles WHERE role = 'ceo';
-- =====================================================================
