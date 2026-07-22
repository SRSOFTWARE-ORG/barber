-- 1) Novos campos em agendamentos
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS pix_gerado_em timestamptz,
  ADD COLUMN IF NOT EXISTS eh_fracionado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fase1_duracao integer,
  ADD COLUMN IF NOT EXISTS espera_duracao integer,
  ADD COLUMN IF NOT EXISTS fase2_duracao integer;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pix_pending
  ON public.agendamentos (pix_gerado_em)
  WHERE sinal_pago = false AND status <> 'cancelled';

-- 2) Novos campos em servicos (fracionados)
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS eh_fracionado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duracao_fase1 integer,
  ADD COLUMN IF NOT EXISTS duracao_espera integer,
  ADD COLUMN IF NOT EXISTS duracao_fase2 integer;

-- 3) Função que cancela agendamentos com PIX expirado (>5min sem pagamento)
CREATE OR REPLACE FUNCTION public.cancel_expired_pix_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id, cliente_id, data, hora, barbeiro_id
    FROM public.agendamentos
    WHERE sinal_pago = false
      AND status NOT IN ('cancelled','finalizado')
      AND pix_gerado_em IS NOT NULL
      AND pix_gerado_em < (now() - interval '5 minutes')
  LOOP
    UPDATE public.agendamentos
      SET status = 'cancelled',
          arquivado = true
      WHERE id = r.id;

    IF r.cliente_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, agendamento_id)
      VALUES (
        r.cliente_id,
        'cancelado',
        '⛔ Agendamento cancelado',
        'Seu horário de ' || to_char(r.data, 'DD/MM') || ' às ' || to_char(r.hora, 'HH24:MI') ||
        ' foi cancelado automaticamente porque o sinal não foi pago em 5 minutos. O horário voltou a ficar disponível.',
        r.id
      );
    END IF;

    IF r.barbeiro_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, agendamento_id)
      VALUES (
        r.barbeiro_id,
        'cancelado',
        '⛔ Agendamento expirado',
        'Cliente não pagou o sinal em 5 minutos. Horário ' || to_char(r.data, 'DD/MM') || ' ' || to_char(r.hora, 'HH24:MI') || ' liberado.',
        r.id
      );
    END IF;

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- 4) Agendar via pg_cron (a cada 1 minuto)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cancel-expired-pix') THEN
    PERFORM cron.unschedule('cancel-expired-pix');
  END IF;
  PERFORM cron.schedule(
    'cancel-expired-pix',
    '* * * * *',
    $cron$SELECT public.cancel_expired_pix_appointments();$cron$
  );
END $$;

-- 5) Atualiza get_busy_slots para retornar info de fracionado
DROP FUNCTION IF EXISTS public.get_busy_slots(date, integer);
CREATE OR REPLACE FUNCTION public.get_busy_slots(_data_inicio date DEFAULT CURRENT_DATE, _dias integer DEFAULT 30)
 RETURNS TABLE(id uuid, data date, hora time without time zone, barbeiro_id uuid, servico_ids uuid[], status text, arquivado boolean, eh_fracionado boolean, fase1_duracao integer, espera_duracao integer, fase2_duracao integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.data, a.hora, a.barbeiro_id, a.servico_ids, a.status, a.arquivado,
         COALESCE(a.eh_fracionado, false), a.fase1_duracao, a.espera_duracao, a.fase2_duracao
  FROM public.agendamentos a
  WHERE a.data >= _data_inicio
    AND a.data <= _data_inicio + (_dias || ' days')::interval
    AND a.status NOT IN ('cancelled')
    AND a.arquivado = false;
$function$;