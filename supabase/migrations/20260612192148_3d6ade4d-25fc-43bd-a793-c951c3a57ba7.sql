-- 1) Anti-duplicidade: bloqueia agendamento duplicado no mesmo barbeiro/data/hora
CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.barbeiro_id IS NOT NULL
     AND COALESCE(NEW.status, '') <> 'cancelled'
     AND COALESCE(NEW.arquivado, false) = false THEN
    IF EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.barbeiro_id = NEW.barbeiro_id
        AND a.data = NEW.data
        AND a.hora = NEW.hora
        AND a.id <> NEW.id
        AND a.status <> 'cancelled'
        AND COALESCE(a.arquivado, false) = false
    ) THEN
      RAISE EXCEPTION 'Este horário acabou de ser reservado. Escolha outro horário.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_double_booking ON public.agendamentos;
CREATE TRIGGER trg_prevent_double_booking
  BEFORE INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_double_booking();

-- 2) Marca quando o cliente foi vinculado a um barbeiro (badge "Cliente novo")
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vinculo_em timestamptz;

CREATE OR REPLACE FUNCTION public.set_vinculo_em()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.adm_responsavel_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.adm_responsavel_id IS DISTINCT FROM NEW.adm_responsavel_id) THEN
    NEW.vinculo_em := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_vinculo_em ON public.profiles;
CREATE TRIGGER trg_set_vinculo_em
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_vinculo_em();