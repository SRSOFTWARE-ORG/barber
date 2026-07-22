
-- Function to get barber display name by user_id (for clients to see their barber)
CREATE OR REPLACE FUNCTION public.get_barber_name(_barber_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT display_name FROM public.user_roles
  WHERE user_id = _barber_id AND role = 'admin'
  LIMIT 1
$$;
