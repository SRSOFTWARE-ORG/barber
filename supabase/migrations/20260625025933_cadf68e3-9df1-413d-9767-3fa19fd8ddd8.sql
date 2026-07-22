GRANT EXECUTE ON FUNCTION public.get_shop_owner(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_shop_owner(uuid) FROM anon;