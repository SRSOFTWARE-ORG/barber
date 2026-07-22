CREATE OR REPLACE FUNCTION public.get_barber_planos_link(_barber_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT link_planos FROM public.profiles WHERE id = _barber_id LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_barber_planos_link(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barber_planos_link(uuid) TO authenticated;