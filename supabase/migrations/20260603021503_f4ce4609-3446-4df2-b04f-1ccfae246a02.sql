-- ============================================================
-- 1. AUDIT LOG TABLE
-- ============================================================
CREATE TABLE public.security_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  event_type text NOT NULL,
  resource text,
  details jsonb,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Writes happen only via SECURITY DEFINER functions / service_role; no direct
-- authenticated writes. CEO can read for review.
GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CEO reads audit log"
ON public.security_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'ceo'::app_role));

CREATE INDEX idx_security_audit_log_user ON public.security_audit_log (user_id, created_at DESC);
CREATE INDEX idx_security_audit_log_event ON public.security_audit_log (event_type, created_at DESC);

-- ============================================================
-- 2. AUDIT: review (avaliacoes) inserts
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_avaliacao_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (user_id, event_type, resource, details, allowed)
  VALUES (
    auth.uid(),
    'review_insert',
    'avaliacoes',
    jsonb_build_object(
      'agendamento_id', NEW.agendamento_id,
      'adm_id', NEW.adm_id,
      'nota', NEW.nota
    ),
    true
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_avaliacao
AFTER INSERT ON public.avaliacoes
FOR EACH ROW
EXECUTE FUNCTION public.audit_avaliacao_insert();

-- ============================================================
-- 3. AUDIT: realtime subscription attempts (called from the client)
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_realtime_access(_topic text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  -- A legitimate per-user topic embeds the caller's own uid.
  _allowed := _topic LIKE ('%' || auth.uid()::text || '%');
  INSERT INTO public.security_audit_log (user_id, event_type, resource, details, allowed)
  VALUES (
    auth.uid(),
    CASE WHEN _allowed THEN 'realtime_subscribe' ELSE 'realtime_subscribe_denied' END,
    'realtime.messages',
    jsonb_build_object('topic', _topic),
    _allowed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_realtime_access(text) TO authenticated;

-- ============================================================
-- 4. FIX: lock down self-writes of profiles.adm_responsavel_id
--    Root cause of the 3 error-level findings (config/gallery/escalation).
-- ============================================================

-- Sanctioned, validated self-link flow.
CREATE OR REPLACE FUNCTION public.link_self_to_barber(_barber_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF _barber_id IS NULL OR NOT has_role(_barber_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Barbeiro inválido';
  END IF;
  -- Whitelist this transaction so the guard trigger allows the change.
  PERFORM set_config('app.allow_self_link', '1', true);
  UPDATE public.profiles
    SET adm_responsavel_id = _barber_id,
        updated_at = now()
    WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_self_to_barber(uuid) TO authenticated;

-- Guard trigger: a regular user can no longer change their own tenant scope
-- by writing adm_responsavel_id directly. Only allowed via:
--   * the sanctioned link_self_to_barber RPC (transaction flag), or
--   * service_role / backend (auth.uid() IS NULL), or
--   * staff (admin/ceo) managing clients.
CREATE OR REPLACE FUNCTION public.guard_profile_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.adm_responsavel_id IS DISTINCT FROM OLD.adm_responsavel_id THEN
    IF coalesce(current_setting('app.allow_self_link', true), '') = '1' THEN
      NULL; -- validated RPC
    ELSIF auth.uid() IS NULL THEN
      NULL; -- service_role / backend edge functions
    ELSIF has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ceo'::app_role) THEN
      NULL; -- staff managing their own clients
    ELSE
      RAISE EXCEPTION 'Vínculo de barbeiro deve ser feito pelo fluxo oficial';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_profile_link
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_link();