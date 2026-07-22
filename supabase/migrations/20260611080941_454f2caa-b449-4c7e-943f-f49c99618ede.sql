-- 1) Comodidades column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS comodidades text[] NOT NULL DEFAULT '{}';

-- 2) Extend get_barber_theme to return comodidades
DROP FUNCTION IF EXISTS public.get_barber_theme(uuid);
CREATE FUNCTION public.get_barber_theme(_barber_id uuid)
 RETURNS TABLE(tema_cores jsonb, hero_image_url text, hero_object_fit text, hero_object_position text, plano_enabled boolean, plano_modo text, link_planos text, comodidades text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.tema_cores,
    p.hero_image_url,
    COALESCE(p.hero_object_fit, 'cover'),
    COALESCE(p.hero_object_position, 'center'),
    COALESCE(p.plano_enabled, true),
    COALESCE(p.plano_modo, 'whatsapp'),
    p.link_planos,
    COALESCE(p.comodidades, '{}')
  FROM public.profiles p
  WHERE p.id = _barber_id;
$function$;

-- 3) Seed default services for new barbers
CREATE OR REPLACE FUNCTION public.seed_default_services()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'admin' THEN
    IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE shop_owner_id = NEW.user_id) THEN
      INSERT INTO public.servicos (shop_owner_id, nome, preco, duracao) VALUES
        (NEW.user_id, 'Corte', 40, 30),
        (NEW.user_id, 'Barba', 30, 20),
        (NEW.user_id, 'Corte + Barba', 60, 50),
        (NEW.user_id, 'Sobrancelha', 15, 10);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_default_services ON public.user_roles;
CREATE TRIGGER trg_seed_default_services
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.seed_default_services();