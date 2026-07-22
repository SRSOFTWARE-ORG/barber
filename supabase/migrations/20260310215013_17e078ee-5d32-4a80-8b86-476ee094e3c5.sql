
-- Notifications table
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'lembrete',
  titulo text NOT NULL,
  mensagem text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users read own notifications"
  ON public.notificacoes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update (mark as read) their own notifications  
CREATE POLICY "Users update own notifications"
  ON public.notificacoes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- System can insert (via trigger with security definer)
CREATE POLICY "System insert notifications"
  ON public.notificacoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admins/CEO can see all notifications
CREATE POLICY "Admins read all notifications"
  ON public.notificacoes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo'));

-- Trigger function to auto-create reminder on new appointment
CREATE OR REPLACE FUNCTION public.create_appointment_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create notification if client is logged in (has cliente_id)
  IF NEW.cliente_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, agendamento_id)
    VALUES (
      NEW.cliente_id,
      'lembrete',
      '📅 Agendamento Confirmado!',
      'Seu horário está marcado para ' || to_char(NEW.data, 'DD/MM') || ' às ' || to_char(NEW.hora, 'HH24:MI') || '. Não se atrase!',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_reminder
  AFTER INSERT ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.create_appointment_reminder();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
