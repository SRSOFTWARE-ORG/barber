
-- 1) Notifica o barbeiro quando um novo cliente é vinculado a ele
CREATE OR REPLACE FUNCTION public.notify_barber_new_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
BEGIN
  IF NEW.adm_responsavel_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.adm_responsavel_id IS DISTINCT FROM NEW.adm_responsavel_id) THEN
    v_client_name := COALESCE(NEW.full_name, 'Novo cliente');
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem)
    VALUES (
      NEW.adm_responsavel_id,
      'novo_cliente',
      '👤 Novo cliente cadastrado!',
      v_client_name || ' acabou de se vincular à sua barbearia.'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_barber_new_client ON public.profiles;
CREATE TRIGGER trg_notify_barber_new_client
AFTER INSERT OR UPDATE OF adm_responsavel_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_barber_new_client();

-- 2) Notifica o barbeiro quando recebe um novo agendamento
CREATE OR REPLACE FUNCTION public.notify_barber_new_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.barbeiro_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, agendamento_id)
    VALUES (
      NEW.barbeiro_id,
      'novo_agendamento',
      '📅 Novo agendamento!',
      COALESCE(NEW.cliente_nome,'Cliente') || ' agendou para ' || to_char(NEW.data,'DD/MM') || ' às ' || to_char(NEW.hora,'HH24:MI'),
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_barber_new_appointment ON public.agendamentos;
CREATE TRIGGER trg_notify_barber_new_appointment
AFTER INSERT ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.notify_barber_new_appointment();

-- 3) Notifica o barbeiro quando o cliente envia comprovante de pagamento
CREATE OR REPLACE FUNCTION public.notify_barber_payment_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.barbeiro_id IS NOT NULL
     AND NEW.comprovante_url IS NOT NULL
     AND (OLD.comprovante_url IS NULL OR OLD.comprovante_url <> NEW.comprovante_url) THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, agendamento_id)
    VALUES (
      NEW.barbeiro_id,
      'comprovante',
      '💰 Comprovante recebido',
      COALESCE(NEW.cliente_nome,'Cliente') || ' enviou o comprovante do agendamento de ' || to_char(NEW.data,'DD/MM') || ' às ' || to_char(NEW.hora,'HH24:MI'),
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_barber_payment_proof ON public.agendamentos;
CREATE TRIGGER trg_notify_barber_payment_proof
AFTER UPDATE OF comprovante_url ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.notify_barber_payment_proof();
