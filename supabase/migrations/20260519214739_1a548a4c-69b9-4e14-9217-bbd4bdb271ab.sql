
-- 1. Multi-instance Evolution: per-barber config
ALTER TABLE public.evolution_config ADD COLUMN IF NOT EXISTS barbeiro_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS evolution_config_barbeiro_unique ON public.evolution_config(barbeiro_id);

-- Atribui o registro atual ao barbeiro JEFFÃO (admin com display_name contendo "jeff")
UPDATE public.evolution_config
   SET barbeiro_id = (
     SELECT user_id FROM public.user_roles
     WHERE role = 'admin' AND lower(display_name) LIKE '%jeff%'
     LIMIT 1
   )
 WHERE barbeiro_id IS NULL;

-- RLS por barbeiro
DROP POLICY IF EXISTS "Barber manage own evolution_config" ON public.evolution_config;
CREATE POLICY "Barber manage own evolution_config" ON public.evolution_config
  FOR ALL TO authenticated
  USING (auth.uid() = barbeiro_id)
  WITH CHECK (auth.uid() = barbeiro_id);

-- 2. whatsapp_queue: barbeiro_id para roteamento de instância
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS barbeiro_id uuid;
CREATE INDEX IF NOT EXISTS whatsapp_queue_barbeiro_idx ON public.whatsapp_queue(barbeiro_id);
CREATE INDEX IF NOT EXISTS whatsapp_queue_status_idx ON public.whatsapp_queue(status, next_attempt_at);

-- Barbeiros leem/atualizam fila do próprio negócio
DROP POLICY IF EXISTS "Barbeiro read own queue" ON public.whatsapp_queue;
CREATE POLICY "Barbeiro read own queue" ON public.whatsapp_queue FOR SELECT TO authenticated
  USING (auth.uid() = barbeiro_id);
DROP POLICY IF EXISTS "Barbeiro update own queue" ON public.whatsapp_queue;
CREATE POLICY "Barbeiro update own queue" ON public.whatsapp_queue FOR UPDATE TO authenticated
  USING (auth.uid() = barbeiro_id);

-- 3. Logs de webhook Evolution
CREATE TABLE IF NOT EXISTS public.evolution_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  instance text,
  status text,
  remote_jid text,
  external_id text,
  queue_id uuid,
  matched boolean NOT NULL DEFAULT false,
  payload jsonb
);
CREATE INDEX IF NOT EXISTS evolution_webhook_logs_created_idx ON public.evolution_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS evolution_webhook_logs_event_idx ON public.evolution_webhook_logs(event);
ALTER TABLE public.evolution_webhook_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read webhook logs" ON public.evolution_webhook_logs;
CREATE POLICY "Staff read webhook logs" ON public.evolution_webhook_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));
DROP POLICY IF EXISTS "CEO delete webhook logs" ON public.evolution_webhook_logs;
CREATE POLICY "CEO delete webhook logs" ON public.evolution_webhook_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'ceo'));

-- 4. Endurecer policies "always true"
-- agendamentos UPDATE
DROP POLICY IF EXISTS "Update agendamentos" ON public.agendamentos;
CREATE POLICY "Update agendamentos" ON public.agendamentos FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo')
    OR auth.uid() = cliente_id OR auth.uid() = barbeiro_id
  );

-- agendamento_status_log INSERT: anon e auth podem, mas precisa ter agendamento existente
DROP POLICY IF EXISTS "Insert log para todos" ON public.agendamento_status_log;
CREATE POLICY "Insert log via agendamento" ON public.agendamento_status_log
  FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = agendamento_id));

-- configuracoes UPDATE
DROP POLICY IF EXISTS "Update config" ON public.configuracoes;
CREATE POLICY "Update config" ON public.configuracoes FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));

-- horarios_bloqueados INSERT/DELETE
DROP POLICY IF EXISTS "Insert bloqueios" ON public.horarios_bloqueados;
DROP POLICY IF EXISTS "Delete bloqueios" ON public.horarios_bloqueados;
CREATE POLICY "Insert bloqueios" ON public.horarios_bloqueados FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));
CREATE POLICY "Delete bloqueios" ON public.horarios_bloqueados FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));

-- servicos INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Insert serviços" ON public.servicos;
DROP POLICY IF EXISTS "Update serviços" ON public.servicos;
DROP POLICY IF EXISTS "Delete serviços" ON public.servicos;
CREATE POLICY "Insert serviços" ON public.servicos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));
CREATE POLICY "Update serviços" ON public.servicos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));
CREATE POLICY "Delete serviços" ON public.servicos FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'));

-- 5. Public buckets — restringir SELECT a arquivos com extensão de imagem (evita listagem de pastas)
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Public read images by extension" ON storage.objects';
EXCEPTION WHEN others THEN NULL; END $$;

CREATE POLICY "Public read images by extension" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id IN ('avatars','gallery','pix-qr')
    AND lower(right(name, 4)) IN ('.jpg','.png','.gif','jpeg','webp','.svg')
  );

-- 6. Fix search_path em validate_avaliacao_nota
CREATE OR REPLACE FUNCTION public.validate_avaliacao_nota()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.nota < 1 OR NEW.nota > 5 THEN
    RAISE EXCEPTION 'Nota deve ser entre 1 e 5';
  END IF;
  RETURN NEW;
END;
$function$;

-- 7. Revogar EXECUTE de funções SECURITY DEFINER que NÃO são chamadas via RPC pelo cliente
REVOKE EXECUTE ON FUNCTION public.cleanup_mensagens_apagadas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_web_push(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_push_notificacao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_push_mensagem() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_agendamento_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_appointment_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_appointment_reminder() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_avaliacao_nota() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_comprovante(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- RPCs públicas (chamadas pelo client) — restringir a authenticated apenas
REVOKE EXECUTE ON FUNCTION public.get_barber_location(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_barbers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_shop_location() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_barber_name(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_barber_pix(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_comprovante_signed_url(uuid) FROM PUBLIC, anon;
