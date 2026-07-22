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
  INSERT INTO public.servicos (nome, preco, duracao, eh_fracionado, shop_owner_id)
  VALUES
    ('Corte de Cabelo', 35, 40, false, _owner),
    ('Barba', 25, 30, false, _owner),
    ('Corte + Barba', 55, 60, false, _owner),
    ('Pezinho / Acabamento', 15, 15, false, _owner),
    ('Sobrancelha', 10, 10, false, _owner),
    ('Corte Infantil', 30, 40, false, _owner),
    ('Pigmentação', 20, 20, false, _owner),
    ('Hidratação / Tratamento', 30, 30, false, _owner);
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','ceo')
  LOOP
    PERFORM public.seed_default_services(r.user_id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.on_admin_role_seed_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    PERFORM public.seed_default_services(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_services_on_admin ON public.user_roles;
CREATE TRIGGER trg_seed_services_on_admin
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.on_admin_role_seed_services();

GRANT EXECUTE ON FUNCTION public.seed_default_services(uuid) TO authenticated, service_role;