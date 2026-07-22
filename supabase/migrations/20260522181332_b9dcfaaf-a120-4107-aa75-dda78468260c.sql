-- Per-barber shop name (default: empty -> falls back to "Barbearia {display_name}")
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome_barbearia text;

-- Update get_barber_name to prefer custom nome_barbearia, else fall back to user_roles.display_name
CREATE OR REPLACE FUNCTION public.get_barber_name(_barber_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim(regexp_replace(p.nome_barbearia, '^\s*barbearia\s+', '', 'i')), ''),
    ur.display_name
  )
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = _barber_id AND ur.role = 'admin'
  LIMIT 1
$$;
