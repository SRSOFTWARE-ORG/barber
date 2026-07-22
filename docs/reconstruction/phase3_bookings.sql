-- =====================================================================
-- BARBER SHOP — FASE 3: AGENDAMENTOS E BLOQUEIOS DE AGENDA
-- =====================================================================
-- Pré-requisito: phase1_core.sql e phase2_catalog.sql executados.
-- Execute no SQL Editor. Idempotente.
--
-- CONTEÚDO:
--   1. Enums: booking_status, booking_origin
--   2. bookings              (agendamento — cabeçalho)
--   3. booking_services      (serviços do agendamento com preço snapshot)
--   4. barber_time_off       (bloqueios de agenda — isolados por barbeiro)
--   5. Prevenção de conflitos via btree_gist + EXCLUDE constraints
--   6. Trigger: preenche company_id e valida coerência
--         (barbeiro pertence à empresa, unidade pertence à empresa,
--          barbeiro está vinculado à unidade)
--   7. Trigger: sincroniza total_cents a partir de booking_services
--   8. Grants, RLS, updated_at, auditoria
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. ENUMS ---------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM (
    'pending','confirmed','in_progress','completed','cancelled','no_show'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_origin AS ENUM (
    'client','barber','manager','owner','system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. BOOKINGS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id         uuid NOT NULL REFERENCES public.units(id)     ON DELETE RESTRICT,
  barber_id       uuid NOT NULL REFERENCES public.barbers(id)   ON DELETE RESTRICT,
  client_id       uuid REFERENCES public.clients(id)            ON DELETE SET NULL,
  starts_at       timestamptz NOT NULL,   -- UTC
  ends_at         timestamptz NOT NULL,   -- UTC
  status          public.booking_status NOT NULL DEFAULT 'pending',
  origin          public.booking_origin NOT NULL DEFAULT 'client',
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at    timestamptz,
  cancel_reason   text,
  subtotal_cents  int NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  discount_cents  int NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents     int NOT NULL DEFAULT 0 CHECK (total_cents    >= 0),
  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_bookings_company_time ON public.bookings(company_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_barber_time  ON public.bookings(barber_id,  starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_client_time  ON public.bookings(client_id,  starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status       ON public.bookings(status);

-- 3. SERVIÇOS DO AGENDAMENTO --------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_services (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id         uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  -- Snapshot no momento do agendamento (imutável mesmo se o serviço mudar depois)
  name_snapshot      text NOT NULL,
  duration_minutes   int  NOT NULL CHECK (duration_minutes > 0),
  price_cents        int  NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  -- Preenchido nas próximas fases (planos): se o serviço é coberto por plano ativo
  is_plan            boolean NOT NULL DEFAULT false,
  plan_subscription_id uuid,           -- FK adicionada na fase 4
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_services_booking ON public.booking_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_service ON public.booking_services(service_id);

-- 4. BLOQUEIOS DE AGENDA (por barbeiro) ---------------------------------
CREATE TABLE IF NOT EXISTS public.barber_time_off (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  barber_id   uuid NOT NULL REFERENCES public.barbers(id)   ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_time_off_barber ON public.barber_time_off(barber_id, starts_at);

-- 5. PREVENÇÃO DE CONFLITOS ---------------------------------------------
-- 5.1 Dois bookings ATIVOS no mesmo barbeiro não podem sobrepor.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending','confirmed','in_progress'));

-- 5.2 Dois bloqueios do mesmo barbeiro não podem sobrepor.
ALTER TABLE public.barber_time_off
  DROP CONSTRAINT IF EXISTS time_off_no_overlap;
ALTER TABLE public.barber_time_off
  ADD CONSTRAINT time_off_no_overlap
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  );

-- 5.3 Booking ativo não pode cair dentro de bloqueio do mesmo barbeiro.
CREATE OR REPLACE FUNCTION public.check_booking_not_blocked()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('cancelled','no_show','completed') THEN
    IF EXISTS (
      SELECT 1 FROM public.barber_time_off b
      WHERE b.barber_id = NEW.barber_id
        AND tstzrange(b.starts_at, b.ends_at, '[)')
         && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
    ) THEN
      RAISE EXCEPTION 'Horário conflita com bloqueio de agenda do barbeiro'
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_booking_not_blocked
    BEFORE INSERT OR UPDATE OF starts_at, ends_at, status, barber_id
    ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.check_booking_not_blocked();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.4 Bloqueio novo não pode cair sobre booking ATIVO existente do mesmo barbeiro.
CREATE OR REPLACE FUNCTION public.check_time_off_no_active_booking()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.barber_id = NEW.barber_id
      AND b.status IN ('pending','confirmed','in_progress')
      AND tstzrange(b.starts_at, b.ends_at, '[)')
       && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Bloqueio conflita com agendamento ativo do barbeiro'
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_time_off_no_active_booking
    BEFORE INSERT OR UPDATE OF starts_at, ends_at, barber_id
    ON public.barber_time_off
    FOR EACH ROW EXECUTE FUNCTION public.check_time_off_no_active_booking();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. TRIGGER: valida coerência multi-tenant do booking -------------------
CREATE OR REPLACE FUNCTION public.enforce_booking_coherence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_barber_company uuid;
  v_unit_company   uuid;
  v_client_company uuid;
  v_linked         boolean;
BEGIN
  SELECT company_id INTO v_barber_company FROM public.barbers WHERE id = NEW.barber_id;
  SELECT company_id INTO v_unit_company   FROM public.units   WHERE id = NEW.unit_id;

  IF v_barber_company IS NULL THEN
    RAISE EXCEPTION 'Barbeiro % não encontrado', NEW.barber_id;
  END IF;
  IF v_unit_company IS NULL THEN
    RAISE EXCEPTION 'Unidade % não encontrada', NEW.unit_id;
  END IF;
  IF v_barber_company <> v_unit_company THEN
    RAISE EXCEPTION 'Barbeiro e unidade pertencem a empresas diferentes';
  END IF;

  -- Se company_id não foi informado, preencher automaticamente
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_barber_company;
  ELSIF NEW.company_id <> v_barber_company THEN
    RAISE EXCEPTION 'company_id inconsistente com barbeiro/unidade';
  END IF;

  -- Barbeiro precisa estar vinculado à unidade
  SELECT EXISTS (
    SELECT 1 FROM public.barber_units
    WHERE barber_id = NEW.barber_id AND unit_id = NEW.unit_id
  ) INTO v_linked;
  IF NOT v_linked THEN
    RAISE EXCEPTION 'Barbeiro % não está vinculado à unidade %', NEW.barber_id, NEW.unit_id;
  END IF;

  -- Cliente (quando informado) precisa ser da mesma empresa
  IF NEW.client_id IS NOT NULL THEN
    SELECT company_id INTO v_client_company FROM public.clients WHERE id = NEW.client_id;
    IF v_client_company IS NULL THEN
      RAISE EXCEPTION 'Cliente % não encontrado', NEW.client_id;
    END IF;
    IF v_client_company <> NEW.company_id THEN
      RAISE EXCEPTION 'Cliente pertence a outra empresa';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_bookings_coherence
    BEFORE INSERT OR UPDATE OF barber_id, unit_id, client_id, company_id
    ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_coherence();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. TRIGGER: sincronizar totais + preencher snapshot -------------------
CREATE OR REPLACE FUNCTION public.booking_services_fill_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_svc public.services%ROWTYPE;
BEGIN
  IF NEW.name_snapshot IS NULL OR NEW.duration_minutes IS NULL THEN
    SELECT * INTO v_svc FROM public.services WHERE id = NEW.service_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serviço % não encontrado', NEW.service_id;
    END IF;
    NEW.name_snapshot    := COALESCE(NEW.name_snapshot, v_svc.name);
    NEW.duration_minutes := COALESCE(NEW.duration_minutes, v_svc.duration_minutes);
    -- price_cents pode vir 0 quando is_plan = true; se não veio, usa do catálogo
    IF NEW.price_cents IS NULL THEN NEW.price_cents := v_svc.price_cents; END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_booking_services_snapshot
    BEFORE INSERT ON public.booking_services
    FOR EACH ROW EXECUTE FUNCTION public.booking_services_fill_snapshot();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.booking_recalc_totals(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_subtotal int; v_discount int; v_total int;
BEGIN
  SELECT COALESCE(SUM(price_cents),0) INTO v_subtotal
    FROM public.booking_services WHERE booking_id = _booking_id;
  SELECT discount_cents INTO v_discount FROM public.bookings WHERE id = _booking_id;
  v_total := GREATEST(v_subtotal - COALESCE(v_discount,0), 0);
  UPDATE public.bookings
     SET subtotal_cents = v_subtotal,
         total_cents    = v_total,
         updated_at     = now()
   WHERE id = _booking_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_booking_services_recalc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.booking_recalc_totals(COALESCE(NEW.booking_id, OLD.booking_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_booking_services_recalc_ins AFTER INSERT ON public.booking_services
    FOR EACH ROW EXECUTE FUNCTION public.trg_booking_services_recalc();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_booking_services_recalc_upd AFTER UPDATE ON public.booking_services
    FOR EACH ROW EXECUTE FUNCTION public.trg_booking_services_recalc();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_booking_services_recalc_del AFTER DELETE ON public.booking_services
    FOR EACH ROW EXECUTE FUNCTION public.trg_booking_services_recalc();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. UPDATED_AT + AUDITORIA ---------------------------------------------
DO $$ BEGIN CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_time_off_updated BEFORE UPDATE ON public.barber_time_off
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TRIGGER trg_audit_bookings AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_booking_services AFTER INSERT OR UPDATE OR DELETE ON public.booking_services
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_audit_time_off AFTER INSERT OR UPDATE OR DELETE ON public.barber_time_off
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. GRANTS --------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.bookings, public.booking_services, public.barber_time_off
TO authenticated;
GRANT ALL ON
  public.bookings, public.booking_services, public.barber_time_off
TO service_role;

-- 10. RLS ---------------------------------------------------------------
ALTER TABLE public.bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_time_off  ENABLE ROW LEVEL SECURITY;

-- Cliente vê só os próprios bookings (via clients.user_id).
-- Barbeiro vê os próprios (via barbers.user_id).
-- Gerente/proprietário/platform_admin veem toda a empresa.
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), company_id, 'proprietario')
  OR public.has_role(auth.uid(), company_id, 'gerente')
  OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
);

-- Insert: cliente pode criar para si; barbeiro/gerente/proprietário podem criar
-- na empresa que gerenciam; system via service_role.
DROP POLICY IF EXISTS bookings_insert ON public.bookings;
CREATE POLICY bookings_insert ON public.bookings FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), company_id, 'proprietario')
  OR public.has_role(auth.uid(), company_id, 'gerente')
  OR EXISTS (SELECT 1 FROM public.barbers b
             WHERE b.id = barber_id AND b.user_id = auth.uid())
  OR (client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.clients c
                  WHERE c.id = client_id AND c.user_id = auth.uid()))
);

-- Update: mesma lógica. Cliente só pode cancelar o próprio (validado no app).
DROP POLICY IF EXISTS bookings_update ON public.bookings;
CREATE POLICY bookings_update ON public.bookings FOR UPDATE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), company_id, 'proprietario')
  OR public.has_role(auth.uid(), company_id, 'gerente')
  OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), company_id, 'proprietario')
  OR public.has_role(auth.uid(), company_id, 'gerente')
  OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
);

DROP POLICY IF EXISTS bookings_delete ON public.bookings;
CREATE POLICY bookings_delete ON public.bookings FOR DELETE TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), company_id, 'proprietario')
  OR public.has_role(auth.uid(), company_id, 'gerente')
);

-- BOOKING_SERVICES: mesma visibilidade do booking pai
DROP POLICY IF EXISTS booking_services_all ON public.booking_services;
CREATE POLICY booking_services_all ON public.booking_services FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = booking_id
          AND (public.is_platform_admin(auth.uid())
               OR public.has_role(auth.uid(), bk.company_id, 'proprietario')
               OR public.has_role(auth.uid(), bk.company_id, 'gerente')
               OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = bk.barber_id AND b.user_id = auth.uid())
               OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = bk.client_id AND c.user_id = auth.uid())))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings bk WHERE bk.id = booking_id
          AND (public.is_platform_admin(auth.uid())
               OR public.has_role(auth.uid(), bk.company_id, 'proprietario')
               OR public.has_role(auth.uid(), bk.company_id, 'gerente')
               OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = bk.barber_id AND b.user_id = auth.uid())
               OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = bk.client_id AND c.user_id = auth.uid())))
);

-- BARBER_TIME_OFF: barbeiro cria o próprio; gerente/proprietário criam para
-- qualquer barbeiro da empresa; ninguém enxerga bloqueio de outra empresa.
DROP POLICY IF EXISTS time_off_select ON public.barber_time_off;
CREATE POLICY time_off_select ON public.barber_time_off FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_company_member(auth.uid(), company_id)
);

DROP POLICY IF EXISTS time_off_write ON public.barber_time_off;
CREATE POLICY time_off_write ON public.barber_time_off FOR ALL TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), company_id, 'proprietario')
  OR public.has_role(auth.uid(), company_id, 'gerente')
  OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid())
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), company_id, 'proprietario')
  OR public.has_role(auth.uid(), company_id, 'gerente')
  OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid())
);

-- =====================================================================
-- FIM DA FASE 3
-- =====================================================================
-- Próxima fase (4): planos de assinatura + serviços do plano + selo PLANO
--   + controle de utilização. Ela adicionará a FK final
--   booking_services.plan_subscription_id → plan_subscriptions(id).
-- =====================================================================
