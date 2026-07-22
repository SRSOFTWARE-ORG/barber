-- Remove broad public SELECT that exposed the internal "motivo" note to anon
DROP POLICY IF EXISTS "Bloqueios visíveis para todos" ON public.horarios_bloqueados;

-- Anon no longer reads the table directly; drop any column-level grants it held
REVOKE SELECT ON public.horarios_bloqueados FROM anon;

-- Full-row reads restricted to the owning shop staff / CEO (never anonymous, never other tenants)
CREATE POLICY "Bloqueios visíveis para equipe"
ON public.horarios_bloqueados
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.get_shop_owner(auth.uid()) = shop_owner_id
  )
);

-- Public booking availability: expose ONLY non-sensitive columns (no "motivo")
CREATE OR REPLACE FUNCTION public.get_blocked_slots(
  _data_inicio date DEFAULT CURRENT_DATE,
  _dias integer DEFAULT 60
)
RETURNS TABLE(id uuid, data date, hora time without time zone, shop_owner_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT h.id, h.data, h.hora, h.shop_owner_id
  FROM public.horarios_bloqueados h
  WHERE h.data >= _data_inicio
    AND h.data <= _data_inicio + (_dias || ' days')::interval;
$$;

GRANT EXECUTE ON FUNCTION public.get_blocked_slots(date, integer) TO anon, authenticated;