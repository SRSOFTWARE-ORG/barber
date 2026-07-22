
-- 1. Comprovantes: remove overly permissive policies
DROP POLICY IF EXISTS "Comprovantes publicos read" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes upload publico" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes update publico" ON storage.objects;

-- 2. Avatars: scope to user's own folder (path prefix = auth.uid())
DROP POLICY IF EXISTS "Users upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users update avatars" ON storage.objects;

CREATE POLICY "Users upload own avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users update own avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Gallery: require admin or ceo role for upload/delete
DROP POLICY IF EXISTS "Admins upload gallery" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete gallery" ON storage.objects;

CREATE POLICY "Admins upload gallery"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'gallery'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ceo'::app_role))
);

CREATE POLICY "Admins delete gallery"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'gallery'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ceo'::app_role))
);

-- 4. Agendamento status log: restrict inserts to participants/staff
DROP POLICY IF EXISTS "Insert log via agendamento" ON public.agendamento_status_log;

CREATE POLICY "Insert log via agendamento"
ON public.agendamento_status_log FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = agendamento_status_log.agendamento_id
      AND (
        a.cliente_id = auth.uid()
        OR a.barbeiro_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'ceo'::app_role)
      )
  )
);

-- 5. Notificacoes: drop overly broad admin read across all users
DROP POLICY IF EXISTS "Admins read all notifications" ON public.notificacoes;

-- 6. Fix mutable search_path on gen_invite_code
CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  chars text := 'abcdefghijkmnpqrstuvwxyz23456789';
  code text;
  exists_count int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    SELECT count(*) INTO exists_count FROM public.profiles WHERE invite_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$function$;

-- 7. Revoke EXECUTE on internal/trigger SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.log_agendamento_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_mensagens_apagadas() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_push_notificacao() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_push_mensagem() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_web_push(uuid, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_avaliacao_nota() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_appointment_completed() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_appointment_reminder() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_invite_code_for_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_barber_new_client() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_barber_new_appointment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_barber_payment_proof() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_invite_code() FROM anon, authenticated;
