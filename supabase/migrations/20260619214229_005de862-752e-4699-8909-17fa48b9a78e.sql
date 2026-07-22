-- Safe wrapper: returns the caller's own shop owner only.
CREATE OR REPLACE FUNCTION public.get_my_shop_owner()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_shop_owner(auth.uid());
$$;

-- Safe wrapper: returns the shop owner of a BARBER (admin) only.
-- Returns NULL for non-barber ids, preventing client/membership enumeration.
CREATE OR REPLACE FUNCTION public.get_barber_shop_owner(_barber_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_shop_owner(_barber_id)
  WHERE public.has_role(_barber_id, 'admin'::app_role);
$$;

-- Lock down the privileged helpers so application roles cannot call them directly.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_shop_owner(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_shop_member(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_client_of(uuid) FROM anon, authenticated, PUBLIC;

-- Keep them available to the backend (edge functions use service_role) and to
-- RLS policies / SECURITY DEFINER functions (which run as the function owner).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shop_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_shop_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_client_of(uuid) TO service_role;

-- Expose only the safe wrappers to the app.
GRANT EXECUTE ON FUNCTION public.get_my_shop_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_barber_shop_owner(uuid) TO authenticated, service_role;