GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_owner(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_shop_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_client_of(uuid) TO authenticated, anon;