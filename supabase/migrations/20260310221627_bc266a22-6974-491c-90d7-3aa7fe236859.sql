
CREATE OR REPLACE FUNCTION public.get_shop_location()
RETURNS TABLE(endereco_completo text, link_google_maps text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.endereco_completo, p.link_google_maps
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'admin'
    AND p.endereco_completo IS NOT NULL
  LIMIT 1
$$;
