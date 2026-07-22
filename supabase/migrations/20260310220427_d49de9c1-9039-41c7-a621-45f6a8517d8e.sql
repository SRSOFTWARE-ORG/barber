
-- Trigger: notify client when appointment is marked as finalizado
CREATE OR REPLACE FUNCTION public.notify_appointment_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalizado' AND OLD.status != 'finalizado' AND NEW.cliente_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, agendamento_id)
    VALUES (
      NEW.cliente_id,
      'concluido',
      '✅ Serviço Concluído!',
      'Seu atendimento em ' || to_char(NEW.data, 'DD/MM') || ' às ' || to_char(NEW.hora, 'HH24:MI') || ' foi finalizado. Avalie sua experiência!',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_completed
  AFTER UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_appointment_completed();
