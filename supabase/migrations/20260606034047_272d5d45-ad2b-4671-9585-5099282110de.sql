-- Fix 1: Force platform-fee and payment fields server-side on INSERT into agendamentos.
CREATE OR REPLACE FUNCTION public.enforce_agendamento_insert_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Never trust client-supplied platform fee; force the configured rate.
  IF NEW.barbeiro_id IS NOT NULL THEN
    NEW.taxa_app := public.get_barber_taxa(NEW.barbeiro_id);
  ELSE
    NEW.taxa_app := 3.00;
  END IF;
  -- A brand-new booking is always unpaid.
  NEW.valor_pago := 0;
  NEW.sinal_pago := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_agendamento_insert_financials ON public.agendamentos;
CREATE TRIGGER trg_enforce_agendamento_insert_financials
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agendamento_insert_financials();

-- Fix 3: Restrict the free-text "motivo" column on horarios_bloqueados from anonymous readers
-- via column-level grants, while keeping date/time publicly readable for booking.
REVOKE SELECT ON public.horarios_bloqueados FROM anon;
GRANT SELECT (id, data, hora, created_at, shop_owner_id) ON public.horarios_bloqueados TO anon;