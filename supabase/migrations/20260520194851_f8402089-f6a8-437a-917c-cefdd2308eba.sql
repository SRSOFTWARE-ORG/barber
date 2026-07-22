
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars text := 'abcdefghijkmnpqrstuvwxyz23456789';
  code text;
  exists_count int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    SELECT count(*) INTO exists_count FROM public.profiles WHERE invite_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$;

-- Preenche códigos para admins (barbeiros) existentes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.id FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.invite_code IS NULL
  LOOP
    UPDATE public.profiles SET invite_code = public.gen_invite_code() WHERE id = r.id;
  END LOOP;
END $$;

-- Trigger: quando alguém vira admin, garante o código
CREATE OR REPLACE FUNCTION public.ensure_invite_code_for_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    UPDATE public.profiles
       SET invite_code = public.gen_invite_code()
     WHERE id = NEW.user_id AND invite_code IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_invite_code ON public.user_roles;
CREATE TRIGGER trg_ensure_invite_code
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.ensure_invite_code_for_admin();

-- Função pública para resolver o código → barbeiro
CREATE OR REPLACE FUNCTION public.resolve_invite_code(_code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
  WHERE p.invite_code = _code
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_invite_code(text) TO anon, authenticated;
