-- 1) Campos de "mensagem de retorno" por barbeiro
ALTER TABLE public.evolution_config
  ADD COLUMN IF NOT EXISTS retorno_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retorno_dias integer NOT NULL DEFAULT 30;

-- 2) Template global de retorno (editável pelo CEO)
INSERT INTO public.whatsapp_templates (tipo, titulo, conteudo, ativo)
VALUES (
  'retorno',
  'Lembrete de Retorno',
  'Ola {cliente}! Ja faz {dias} dias desde o seu ultimo atendimento com {barbeiro}. Que tal agendar um novo horario para manter o visual em dia? Estamos te esperando.',
  true
)
ON CONFLICT (tipo) DO NOTHING;

-- 3) Função do cron: aciona o disparador de lembretes de retorno (1x ao dia)
CREATE OR REPLACE FUNCTION public.cron_enqueue_return_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://sxgpoobmvsnrrqnsibuh.supabase.co/functions/v1/return-reminders';
  v_secret text;
BEGIN
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

REVOKE EXECUTE ON FUNCTION public.cron_enqueue_return_reminders() FROM PUBLIC, anon, authenticated;

-- 4) Agenda diariamente às 13:00 UTC (10:00 BRT)
DO $$
BEGIN
  PERFORM cron.unschedule('enqueue-return-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('enqueue-return-reminders', '0 13 * * *', $$SELECT public.cron_enqueue_return_reminders();$$);