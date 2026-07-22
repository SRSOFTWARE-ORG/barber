CREATE OR REPLACE FUNCTION public.get_barber_name(_barber_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(btrim(p.nome_barbearia), ''), ur.display_name)
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = _barber_id AND ur.role = 'admin'
  LIMIT 1
$$;
