
-- Status log
CREATE TABLE public.agendamento_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL,
  status text NOT NULL,
  mensagem text,
  criado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_log_agendamento ON public.agendamento_status_log(agendamento_id, created_at);

ALTER TABLE public.agendamento_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Log visivel para todos" ON public.agendamento_status_log
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Insert log para todos" ON public.agendamento_status_log
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Comprovante column
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS comprovante_url text;

-- Trigger to auto-log status changes
CREATE OR REPLACE FUNCTION public.log_agendamento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.agendamento_status_log (agendamento_id, status, mensagem, criado_por)
    VALUES (NEW.id, 'aguardando_sinal', 'Agendamento criado, aguardando pagamento do sinal', 'sistema');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.sinal_pago = true AND OLD.sinal_pago = false THEN
      INSERT INTO public.agendamento_status_log (agendamento_id, status, mensagem, criado_por)
      VALUES (NEW.id, 'sinal_pago', 'Sinal confirmado pelo barbeiro', 'barbeiro');
    END IF;
    IF NEW.comprovante_url IS NOT NULL AND (OLD.comprovante_url IS NULL OR OLD.comprovante_url <> NEW.comprovante_url) THEN
      INSERT INTO public.agendamento_status_log (agendamento_id, status, mensagem, criado_por)
      VALUES (NEW.id, 'comprovante_enviado', 'Cliente enviou comprovante de pagamento', 'cliente');
    END IF;
    IF NEW.status <> OLD.status THEN
      INSERT INTO public.agendamento_status_log (agendamento_id, status, mensagem, criado_por)
      VALUES (NEW.id, NEW.status, 'Status alterado para ' || NEW.status, 'sistema');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_agendamento_status ON public.agendamentos;
CREATE TRIGGER trg_log_agendamento_status
AFTER INSERT OR UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.log_agendamento_status();

-- Storage bucket for comprovantes
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Comprovantes publicos read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'comprovantes');

CREATE POLICY "Comprovantes upload publico" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'comprovantes');

CREATE POLICY "Comprovantes update publico" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'comprovantes');
