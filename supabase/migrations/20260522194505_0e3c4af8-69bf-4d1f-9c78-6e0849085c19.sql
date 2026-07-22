
-- Helper: checa se o usuário autenticado é cliente vinculado ao barbeiro informado
CREATE OR REPLACE FUNCTION public.is_client_of(_barber_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND adm_responsavel_id = _barber_id
  )
$$;

-- ============ PROMOÇÕES ============
DROP POLICY IF EXISTS "Promoções ativas visíveis para todos" ON public.promocoes;
DROP POLICY IF EXISTS "Clientes veem promoções do seu barbeiro" ON public.promocoes;

CREATE POLICY "Clientes veem promoções do seu barbeiro"
ON public.promocoes
FOR SELECT
TO authenticated
USING (
  ativa = true
  AND public.is_client_of(adm_id)
);

-- ============ GALERIA DE FOTOS ============
DROP POLICY IF EXISTS "Fotos visíveis para todos" ON public.galeria_fotos;
DROP POLICY IF EXISTS "Clientes veem fotos do seu barbeiro" ON public.galeria_fotos;

CREATE POLICY "Clientes veem fotos do seu barbeiro"
ON public.galeria_fotos
FOR SELECT
TO authenticated
USING (
  public.is_client_of(adm_id)
  OR auth.uid() = adm_id
  OR public.has_role(auth.uid(), 'ceo'::app_role)
);
