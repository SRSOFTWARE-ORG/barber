
CREATE OR REPLACE FUNCTION public.ensure_my_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT invite_code INTO v_code FROM public.profiles WHERE id = auth.uid();
  IF v_code IS NULL OR length(v_code) = 0 THEN
    v_code := public.gen_invite_code();
    UPDATE public.profiles SET invite_code = v_code WHERE id = auth.uid();
  END IF;
  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_my_invite_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_invite_code() TO authenticated;
