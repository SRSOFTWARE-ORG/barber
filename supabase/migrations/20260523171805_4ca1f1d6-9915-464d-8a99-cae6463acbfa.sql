
CREATE OR REPLACE FUNCTION public.list_barbers_showcase()
RETURNS TABLE(
  user_id uuid,
  display_name text,
  full_name text,
  nome_barbearia text,
  avatar_url text,
  rating_avg numeric,
  rating_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ur.user_id,
    ur.display_name,
    p.full_name,
    p.nome_barbearia,
    p.avatar_url,
    COALESCE(ROUND(AVG(a.nota)::numeric, 1), 0) AS rating_avg,
    COALESCE(COUNT(a.id), 0)::int AS rating_count
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.avaliacoes a ON a.adm_id = ur.user_id
  WHERE ur.role = 'admin'
  GROUP BY ur.user_id, ur.display_name, p.full_name, p.nome_barbearia, p.avatar_url
  ORDER BY rating_avg DESC, rating_count DESC, ur.display_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_barbers_showcase() TO anon, authenticated;
