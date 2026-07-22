
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Permite o cliente se desvincular do barbeiro atual (zera o vínculo).
CREATE OR REPLACE FUNCTION public.unlink_self_from_barber()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  -- Whitelist this transaction so the guard trigger allows the change.
  PERFORM set_config('app.allow_self_link', '1', true);
  UPDATE public.profiles
    SET adm_responsavel_id = NULL,
        updated_at = now()
    WHERE id = auth.uid();
END;
$function$;

-- Listagem pública de barbearias com coordenadas para ordenar por distância e nota.
CREATE OR REPLACE FUNCTION public.list_shops_geo()
 RETURNS TABLE(shop_owner_id uuid, shop_name text, display_name text, avatar_url text, rating_avg numeric, rating_count integer, latitude double precision, longitude double precision, endereco_completo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ur.user_id,
    COALESCE(NULLIF(btrim(p.nome_barbearia), ''), 'Barbearia ' || ur.display_name),
    ur.display_name,
    p.avatar_url,
    COALESCE(ROUND(AVG(a.nota)::numeric, 1), 0),
    COALESCE(COUNT(DISTINCT a.id), 0)::int,
    p.latitude,
    p.longitude,
    p.endereco_completo
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.avaliacoes a ON a.adm_id = ur.user_id
  WHERE ur.role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM public.barbershop_team t
      WHERE t.barber_id = ur.user_id AND t.active = true
    )
  GROUP BY ur.user_id, ur.display_name, p.nome_barbearia, p.avatar_url, p.latitude, p.longitude, p.endereco_completo
  ORDER BY 5 DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.unlink_self_from_barber() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_shops_geo() TO anon, authenticated;
