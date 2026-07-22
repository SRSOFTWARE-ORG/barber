-- Função genérica: define shop_owner_id a partir do usuário autenticado
CREATE OR REPLACE FUNCTION public.set_shop_owner_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.shop_owner_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.shop_owner_id := public.get_shop_owner(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- ===== horarios_bloqueados: isolamento por barbearia =====
ALTER TABLE public.horarios_bloqueados ADD COLUMN IF NOT EXISTS shop_owner_id uuid;

UPDATE public.horarios_bloqueados
  SET shop_owner_id = (
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'admin' ORDER BY ur.user_id LIMIT 1
  )
  WHERE shop_owner_id IS NULL;

DROP TRIGGER IF EXISTS trg_set_shop_owner_horarios ON public.horarios_bloqueados;
CREATE TRIGGER trg_set_shop_owner_horarios
  BEFORE INSERT ON public.horarios_bloqueados
  FOR EACH ROW EXECUTE FUNCTION public.set_shop_owner_from_auth();

DROP POLICY IF EXISTS "Insert bloqueios" ON public.horarios_bloqueados;
CREATE POLICY "Insert bloqueios" ON public.horarios_bloqueados
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'ceo'::app_role)
    OR (has_role(auth.uid(), 'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
  );

DROP POLICY IF EXISTS "Delete bloqueios" ON public.horarios_bloqueados;
CREATE POLICY "Delete bloqueios" ON public.horarios_bloqueados
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'ceo'::app_role)
    OR (has_role(auth.uid(), 'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
  );

-- ===== sobre: isolamento por barbearia =====
ALTER TABLE public.sobre ADD COLUMN IF NOT EXISTS shop_owner_id uuid;

UPDATE public.sobre
  SET shop_owner_id = (
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'admin' ORDER BY ur.user_id LIMIT 1
  )
  WHERE shop_owner_id IS NULL;

DROP TRIGGER IF EXISTS trg_set_shop_owner_sobre ON public.sobre;
CREATE TRIGGER trg_set_shop_owner_sobre
  BEFORE INSERT ON public.sobre
  FOR EACH ROW EXECUTE FUNCTION public.set_shop_owner_from_auth();

DROP POLICY IF EXISTS "Admins atualizam sobre" ON public.sobre;
CREATE POLICY "Admins atualizam sobre" ON public.sobre
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'ceo'::app_role)
    OR (has_role(auth.uid(), 'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
  );

DROP POLICY IF EXISTS "Admins inserem sobre" ON public.sobre;
CREATE POLICY "Admins inserem sobre" ON public.sobre
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'ceo'::app_role)
    OR (has_role(auth.uid(), 'admin'::app_role) AND get_shop_owner(auth.uid()) = shop_owner_id)
  );