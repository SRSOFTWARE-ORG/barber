-- 1) Tighten configuracoes_barbeiro: remove anonymous read access
DROP POLICY IF EXISTS "Config visivel para todos" ON public.configuracoes_barbeiro;

CREATE POLICY "Config visivel para autenticados"
ON public.configuracoes_barbeiro
FOR SELECT
TO authenticated
USING (true);

-- 2) Prevent admins from reassigning clients (changing adm_responsavel_id)
--    Only the profile owner or a CEO may change adm_responsavel_id.
CREATE OR REPLACE FUNCTION public.guard_profile_admin_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / no auth context: allow (edge functions)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Owner or CEO can change anything
  IF auth.uid() = NEW.id OR public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Otherwise (admins updating their clients): block changes to sensitive link/identity columns
  IF NEW.adm_responsavel_id IS DISTINCT FROM OLD.adm_responsavel_id THEN
    RAISE EXCEPTION 'Admins cannot reassign a client to another barber';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot change profile id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_admin_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_admin_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_admin_update();