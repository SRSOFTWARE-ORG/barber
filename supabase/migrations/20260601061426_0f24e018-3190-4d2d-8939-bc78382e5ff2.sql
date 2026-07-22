-- Segredo interno usado pelo cron para acionar o processador da fila (evolution-queue)
INSERT INTO public.internal_secrets(name, value, updated_at)
VALUES ('webhook_evolution_queue', encode(extensions.gen_random_bytes(24), 'hex'), now())
ON CONFLICT (name) DO NOTHING;

-- Função do cron: aciona o envio da fila de WhatsApp com pacing seguro (1 chamada/min)
CREATE OR REPLACE FUNCTION public.cron_process_whatsapp_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://sxgpoobmvsnrrqnsibuh.supabase.co/functions/v1/evolution-queue';
  v_secret text;
  v_pending int;
BEGIN
  SELECT count(*) INTO v_pending
  FROM public.whatsapp_queue
  WHERE status = 'pending' AND next_attempt_at <= now();

  IF COALESCE(v_pending, 0) = 0 THEN
    RETURN;
  END IF;

  SELECT value INTO v_secret FROM public.internal_secrets WHERE name = 'webhook_evolution_queue';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', COALESCE(v_secret, '')
    ),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- Agenda a cada minuto (remove agendamento anterior se existir)
DO $$
BEGIN
  PERFORM cron.unschedule('process-whatsapp-queue');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('process-whatsapp-queue', '* * * * *', $$SELECT public.cron_process_whatsapp_queue();$$);