
CREATE OR REPLACE FUNCTION public.get_barber_location(_barber_id uuid)
RETURNS TABLE(endereco_completo text, link_google_maps text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.endereco_completo, p.link_google_maps
  FROM public.profiles p
  WHERE p.id = _barber_id
  LIMIT 1
$$;
