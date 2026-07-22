
-- Taxa do app por barbeiro (com isenção temporal)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS taxa_app_valor numeric NOT NULL DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS taxa_isenta_ate timestamptz;

-- Janela de disponibilidade da promoção
ALTER TABLE public.promocoes
  ADD COLUMN IF NOT EXISTS disponivel_de timestamptz,
  ADD COLUMN IF NOT EXISTS disponivel_ate timestamptz;

-- RPC: retorna taxa efetiva do barbeiro (0 se em período de isenção)
CREATE OR REPLACE FUNCTION public.get_barber_taxa(_barber_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.taxa_isenta_ate IS NOT NULL AND p.taxa_isenta_ate > now() THEN 0
    ELSE COALESCE(p.taxa_app_valor, 3.00)
  END
  FROM public.profiles p
  WHERE p.id = _barber_id
  LIMIT 1
$$;
