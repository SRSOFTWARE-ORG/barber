ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_bg_url text,
  ADD COLUMN IF NOT EXISTS app_bg_opacity numeric NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS app_logo_url text;

DROP FUNCTION IF EXISTS public.get_barber_theme(uuid);

CREATE FUNCTION public.get_barber_theme(_barber_id uuid)
 RETURNS TABLE(tema_cores jsonb, hero_image_url text, hero_object_fit text, hero_object_position text, plano_enabled boolean, plano_modo text, link_planos text, comodidades text[], app_bg_url text, app_bg_opacity numeric, app_logo_url text)
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
    COALESCE(p.comodidades, '{}'),
    p.app_bg_url,
    COALESCE(p.app_bg_opacity, 0.15),
    p.app_logo_url
  FROM public.profiles p
  WHERE p.id = _barber_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_barber_theme(uuid) TO anon, authenticated, service_role;