ALTER TABLE public.barbershop_team
  ADD COLUMN IF NOT EXISTS allow_own_mp boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.list_barbers_of_shop(uuid);

CREATE FUNCTION public.list_barbers_of_shop(_shop_owner_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, full_name text, avatar_url text, is_owner boolean, rating_avg numeric, rating_count integer, commission_type text, commission_value numeric, allow_own_mp boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH members AS (
    SELECT _shop_owner_id AS uid, true AS is_owner, NULL::text AS ctype, NULL::numeric AS cval, true AS allow_mp
    UNION ALL
    SELECT t.barber_id, false, t.commission_type, t.commission_value, t.allow_own_mp
    FROM public.barbershop_team t
    WHERE t.shop_owner_id = _shop_owner_id AND t.active = true
  )
  SELECT
    m.uid, ur.display_name, p.full_name, p.avatar_url, m.is_owner,
    COALESCE(ROUND(AVG(a.nota)::numeric, 1), 0),
    COALESCE(COUNT(DISTINCT a.id), 0)::int,
    m.ctype, m.cval, m.allow_mp
  FROM members m
  LEFT JOIN public.user_roles ur ON ur.user_id = m.uid AND ur.role = 'admin'
  LEFT JOIN public.profiles p ON p.id = m.uid
  LEFT JOIN public.avaliacoes a ON a.adm_id = m.uid
  GROUP BY m.uid, ur.display_name, p.full_name, p.avatar_url, m.is_owner, m.ctype, m.cval, m.allow_mp
  ORDER BY m.is_owner DESC, ur.display_name ASC;
$function$;

CREATE OR REPLACE FUNCTION public.can_barber_own_mp(_barber_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(_barber_id, 'admin'::app_role)
         AND NOT EXISTS(SELECT 1 FROM public.barbershop_team WHERE barber_id = _barber_id AND active = true)
      THEN true
    ELSE COALESCE(
      (SELECT allow_own_mp FROM public.barbershop_team WHERE barber_id = _barber_id AND active = true LIMIT 1),
      false
    )
  END
$function$;