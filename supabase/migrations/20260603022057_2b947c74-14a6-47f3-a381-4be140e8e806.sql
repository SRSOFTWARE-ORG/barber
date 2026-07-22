CREATE OR REPLACE FUNCTION public.guard_profile_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard tenant-scope self-assignment.
  IF NEW.adm_responsavel_id IS DISTINCT FROM OLD.adm_responsavel_id THEN
    IF coalesce(current_setting('app.allow_self_link', true), '') = '1' THEN
      NULL;
    ELSIF auth.uid() IS NULL THEN
      NULL;
    ELSIF has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ceo'::app_role) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Vínculo de barbeiro deve ser feito pelo fluxo oficial';
    END IF;
  END IF;

  -- Guard platform fee fields: only CEO or backend (service_role) may change them.
  IF (NEW.taxa_app_valor IS DISTINCT FROM OLD.taxa_app_valor
      OR NEW.taxa_isenta_ate IS DISTINCT FROM OLD.taxa_isenta_ate) THEN
    IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'ceo'::app_role) THEN
      RAISE EXCEPTION 'Apenas o CEO pode alterar taxas da plataforma';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;