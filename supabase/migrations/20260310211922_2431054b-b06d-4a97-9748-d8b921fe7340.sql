
-- Create a security definer function to list barbers publicly
CREATE OR REPLACE FUNCTION public.get_barbers()
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id, ur.display_name
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
$$;
