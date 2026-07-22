-- =====================================================================
-- BARBER SHOP — FASE 6: ENGAJAMENTO
-- =====================================================================
-- Pré-requisitos: phase1..phase5 executados.
-- Execute no SQL Editor. Idempotente.
--
-- CONTEÚDO:
--   1. Enums: review_target, media_kind, banner_placement
--   2. reviews                 (avaliação — SOMENTE clientes, 1 por booking)
--   3. review_reactions        (curtir / marcar útil)
--   4. portfolio_items         (imagens/vídeos/gifs de barbeiro OU empresa)
--   5. portfolio_likes
--   6. banners                 (carrossel/hero da vitrine da empresa)
--   7. Trigger: atualiza rating_avg/rating_count em barbers e companies
--   8. Trigger: só permite review de booking COMPLETED e do próprio cliente
--   9. Grants, RLS, updated_at, auditoria
-- =====================================================================

-- 1. ENUMS ---------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.review_target AS ENUM ('barber','company','service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.media_kind AS ENUM ('image','video','gif');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.banner_placement AS ENUM
  ('home_hero','home_carousel','services_top','plans_top','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Colunas agregadas em barbers/companies (idempotente)
ALTER TABLE public.barbers
  ADD COLUMN IF NOT EXISTS rating_avg   numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer      NOT NULL DEFAULT 0;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS rating_avg   numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer      NOT NULL DEFAULT 0;

-- 2. REVIEWS -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id       uuid REFERENCES public.units(id) ON DELETE SET NULL,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  booking_id    uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  target        public.review_target NOT NULL,
  barber_id     uuid REFERENCES public.barbers(id)  ON DELETE CASCADE,
  service_id    uuid REFERENCES public.services(id) ON DELETE CASCADE,
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         text,
  comment       text,
  is_hidden     boolean NOT NULL DEFAULT false,   -- moderação
  is_edited     boolean NOT NULL DEFAULT false,
  reply         text,                              -- resposta pública do estabelecimento
  reply_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reply_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- consistência do alvo
  CHECK (
    (target = 'barber'  AND barber_id  IS NOT NULL)
 OR (target = 'service' AND service_id IS NOT NULL)
 OR (target = 'company' AND barber_id  IS NULL AND service_id IS NULL)
  ),
  UNIQUE (booking_id, target, COALESCE(barber_id, '00000000-0000-0000-0000-000000000000'::uuid),
                              COALESCE(service_id,'00000000-0000-0000-0000-000000000000'::uuid))
);
CREATE INDEX IF NOT EXISTS idx_reviews_barber  ON public.reviews(barber_id)  WHERE NOT is_hidden;
CREATE INDEX IF NOT EXISTS idx_reviews_company ON public.reviews(company_id) WHERE NOT is_hidden;
CREATE INDEX IF NOT EXISTS idx_reviews_client  ON public.reviews(client_id);

-- 3. REVIEW_REACTIONS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_reactions (
  review_id  uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'helpful',  -- helpful|like
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id, kind)
);

-- 4. PORTFOLIO_ITEMS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  barber_id     uuid REFERENCES public.barbers(id) ON DELETE CASCADE,   -- NULL = empresa
  service_id    uuid REFERENCES public.services(id) ON DELETE SET NULL, -- tag opcional
  kind          public.media_kind NOT NULL,
  storage_path  text NOT NULL,     -- bucket 'portfolio' ou 'videos'
  thumb_path    text,
  width         integer,
  height        integer,
  duration_ms   integer,           -- vídeos
  caption       text,
  is_featured   boolean NOT NULL DEFAULT false,
  is_public     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  likes_count   integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_port_company ON public.portfolio_items(company_id) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_port_barber  ON public.portfolio_items(barber_id)  WHERE is_public;

-- 5. PORTFOLIO_LIKES -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolio_likes (
  item_id    uuid NOT NULL REFERENCES public.portfolio_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

-- 6. BANNERS -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.banners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id       uuid REFERENCES public.units(id) ON DELETE SET NULL,
  placement     public.banner_placement NOT NULL DEFAULT 'home_carousel',
  title         text,
  subtitle      text,
  cta_label     text,
  cta_url       text,
  image_path    text NOT NULL,     -- bucket 'banners'
  image_mobile_path text,
  color_bg      text,
  color_fg      text,
  is_active     boolean NOT NULL DEFAULT true,
  starts_at     timestamptz,
  ends_at       timestamptz,
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_banners_company ON public.banners(company_id, placement) WHERE is_active;

-- 7. TRIGGERS DE NEGÓCIO -------------------------------------------------

-- 7a. Só cliente do próprio booking, e booking precisa estar completed
CREATE OR REPLACE FUNCTION public.validate_review_authorship()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bk public.bookings%ROWTYPE;
  v_client_user uuid;
BEGIN
  SELECT * INTO v_bk FROM public.bookings WHERE id = NEW.booking_id;
  IF v_bk.id IS NULL THEN
    RAISE EXCEPTION 'Booking inexistente';
  END IF;
  IF v_bk.status <> 'completed' THEN
    RAISE EXCEPTION 'Só é possível avaliar após o atendimento ser concluído';
  END IF;
  IF v_bk.client_id <> NEW.client_id THEN
    RAISE EXCEPTION 'Cliente da avaliação não corresponde ao booking';
  END IF;
  IF v_bk.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Empresa da avaliação não corresponde ao booking';
  END IF;

  -- valida que quem escreve é o próprio user do cliente (não staff)
  SELECT user_id INTO v_client_user FROM public.clients WHERE id = NEW.client_id;
  IF v_client_user IS NULL OR v_client_user <> auth.uid() THEN
    -- platform_admin pode inserir para migrações; barre o resto
    IF NOT public.is_platform_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Apenas o cliente pode enviar a avaliação';
    END IF;
  END IF;

  -- barber, se target=barber, tem que ter atendido o booking
  IF NEW.target = 'barber' AND NEW.barber_id IS NOT NULL AND NEW.barber_id <> v_bk.barber_id THEN
    RAISE EXCEPTION 'O barbeiro avaliado não é o do agendamento';
  END IF;

  -- service, se target=service, tem que estar no booking
  IF NEW.target = 'service' AND NEW.service_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.booking_services bs
                   WHERE bs.booking_id = NEW.booking_id AND bs.service_id = NEW.service_id) THEN
      RAISE EXCEPTION 'Serviço avaliado não faz parte do agendamento';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reviews_validate ON public.reviews;
CREATE TRIGGER trg_reviews_validate
BEFORE INSERT OR UPDATE OF client_id, booking_id, barber_id, service_id, target ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.validate_review_authorship();

-- 7b. Recalcula rating_avg/rating_count agregados
CREATE OR REPLACE FUNCTION public.recalc_rating_targets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_barber  uuid;
BEGIN
  v_company := COALESCE(NEW.company_id, OLD.company_id);
  v_barber  := COALESCE(NEW.barber_id,  OLD.barber_id);

  IF v_barber IS NOT NULL THEN
    UPDATE public.barbers b
       SET rating_count = sub.cnt,
           rating_avg   = COALESCE(sub.avg,0)
      FROM (SELECT COUNT(*) cnt, AVG(rating)::numeric(3,2) avg
              FROM public.reviews
             WHERE barber_id = v_barber AND NOT is_hidden AND target='barber') sub
     WHERE b.id = v_barber;
  END IF;

  UPDATE public.companies c
     SET rating_count = sub.cnt,
         rating_avg   = COALESCE(sub.avg,0)
    FROM (SELECT COUNT(*) cnt, AVG(rating)::numeric(3,2) avg
            FROM public.reviews
           WHERE company_id = v_company AND NOT is_hidden) sub
   WHERE c.id = v_company;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reviews_agg ON public.reviews;
CREATE TRIGGER trg_reviews_agg
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recalc_rating_targets();

-- 7c. likes_count em portfolio_items
CREATE OR REPLACE FUNCTION public.recalc_portfolio_likes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.portfolio_items
     SET likes_count = (SELECT COUNT(*) FROM public.portfolio_likes
                        WHERE item_id = COALESCE(NEW.item_id, OLD.item_id))
   WHERE id = COALESCE(NEW.item_id, OLD.item_id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_port_likes ON public.portfolio_likes;
CREATE TRIGGER trg_port_likes
AFTER INSERT OR DELETE ON public.portfolio_likes
FOR EACH ROW EXECUTE FUNCTION public.recalc_portfolio_likes();

-- 7d. marca is_edited em reviews
CREATE OR REPLACE FUNCTION public.mark_review_edited()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.rating IS DISTINCT FROM OLD.rating)
  OR (NEW.title  IS DISTINCT FROM OLD.title)
  OR (NEW.comment IS DISTINCT FROM OLD.comment) THEN
    NEW.is_edited := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reviews_edited ON public.reviews;
CREATE TRIGGER trg_reviews_edited
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.mark_review_edited();

-- 8. UPDATED_AT + AUDITORIA ---------------------------------------------
DROP TRIGGER IF EXISTS trg_reviews_upd ON public.reviews;
CREATE TRIGGER trg_reviews_upd BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_portfolio_upd ON public.portfolio_items;
CREATE TRIGGER trg_portfolio_upd BEFORE UPDATE ON public.portfolio_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_banners_upd ON public.banners;
CREATE TRIGGER trg_banners_upd BEFORE UPDATE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_reviews ON public.reviews;
CREATE TRIGGER trg_audit_reviews AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_portfolio ON public.portfolio_items;
CREATE TRIGGER trg_audit_portfolio AFTER INSERT OR UPDATE OR DELETE ON public.portfolio_items
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_banners ON public.banners;
CREATE TRIGGER trg_audit_banners AFTER INSERT OR UPDATE OR DELETE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 9. GRANTS -------------------------------------------------------------
GRANT SELECT ON public.reviews          TO anon, authenticated;   -- visíveis publicamente
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews             TO service_role;

GRANT SELECT, INSERT, DELETE ON public.review_reactions TO authenticated;
GRANT ALL ON public.review_reactions    TO service_role;

GRANT SELECT ON public.portfolio_items  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.portfolio_items TO authenticated;
GRANT ALL ON public.portfolio_items     TO service_role;

GRANT SELECT, INSERT, DELETE ON public.portfolio_likes TO authenticated;
GRANT ALL ON public.portfolio_likes     TO service_role;

GRANT SELECT ON public.banners          TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners             TO service_role;

-- 10. RLS ---------------------------------------------------------------
ALTER TABLE public.reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_likes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners          ENABLE ROW LEVEL SECURITY;

-- Reviews
DROP POLICY IF EXISTS p_reviews_public_read ON public.reviews;
CREATE POLICY p_reviews_public_read ON public.reviews
FOR SELECT USING (NOT is_hidden);

DROP POLICY IF EXISTS p_reviews_staff_read ON public.reviews;
CREATE POLICY p_reviews_staff_read ON public.reviews
FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id)
       OR EXISTS (SELECT 1 FROM public.clients c
                  WHERE c.id = client_id AND c.user_id = auth.uid()));

-- Insert: só o próprio cliente do booking (validação reforçada no trigger)
DROP POLICY IF EXISTS p_reviews_client_insert ON public.reviews;
CREATE POLICY p_reviews_client_insert ON public.reviews
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c
                    WHERE c.id = client_id AND c.user_id = auth.uid()));

-- Update: cliente edita a própria (rating/comment); staff só edita reply/is_hidden
DROP POLICY IF EXISTS p_reviews_client_update ON public.reviews;
CREATE POLICY p_reviews_client_update ON public.reviews
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = client_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = client_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS p_reviews_staff_update ON public.reviews;
CREATE POLICY p_reviews_staff_update ON public.reviews
FOR UPDATE TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS p_reviews_delete ON public.reviews;
CREATE POLICY p_reviews_delete ON public.reviews
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = client_id AND c.user_id = auth.uid())
       OR public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- Reactions
DROP POLICY IF EXISTS p_rreact_all ON public.review_reactions;
CREATE POLICY p_rreact_all ON public.review_reactions FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Portfolio
DROP POLICY IF EXISTS p_port_public_read ON public.portfolio_items;
CREATE POLICY p_port_public_read ON public.portfolio_items
FOR SELECT USING (is_public);

DROP POLICY IF EXISTS p_port_staff_read ON public.portfolio_items;
CREATE POLICY p_port_staff_read ON public.portfolio_items
FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

-- Barbeiro gerencia o próprio portfólio; staff da empresa gerencia todo
DROP POLICY IF EXISTS p_port_manage ON public.portfolio_items;
CREATE POLICY p_port_manage ON public.portfolio_items
FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid())
       OR (barber_id IS NOT NULL AND EXISTS
           (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid())))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid())
       OR (barber_id IS NOT NULL AND EXISTS
           (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid())));

DROP POLICY IF EXISTS p_port_likes_all ON public.portfolio_likes;
CREATE POLICY p_port_likes_all ON public.portfolio_likes FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Banners
DROP POLICY IF EXISTS p_banners_public_read ON public.banners;
CREATE POLICY p_banners_public_read ON public.banners
FOR SELECT USING (
  is_active
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >  now())
);

DROP POLICY IF EXISTS p_banners_staff_read ON public.banners;
CREATE POLICY p_banners_staff_read ON public.banners
FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS p_banners_manage ON public.banners;
CREATE POLICY p_banners_manage ON public.banners FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['proprietario','gerente']::text[])
       OR public.is_platform_admin(auth.uid()));

-- =====================================================================
-- FIM DA FASE 6
-- =====================================================================
