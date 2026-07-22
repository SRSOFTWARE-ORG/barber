GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagens TO authenticated;
GRANT ALL ON public.mensagens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.fire_web_push(_user_id uuid, _title text, _body text, _url text, _tag text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://sxgpoobmvsnrrqnsibuh.supabase.co/functions/v1/web-push-send';
  v_secret text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT value INTO v_secret FROM public.internal_secrets WHERE name = 'webhook_push';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'user_id', _user_id,
      'title', COALESCE(_title, 'Barbearia'),
      'message', COALESCE(_body, ''),
      'url', COALESCE(_url, '/'),
      'tag', COALESCE(_tag, 'barbearia')
    )
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_push_notificacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Logs/status da Evolution são apenas internos e nunca devem disparar push.
  IF COALESCE(NEW.tipo, '') = 'whatsapp' THEN
    RETURN NEW;
  END IF;

  PERFORM public.fire_web_push(
    NEW.user_id,
    COALESCE(NEW.titulo, 'Barbearia'),
    COALESCE(NEW.mensagem, ''),
    '/notifications',
    'notif-' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_push_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.destinatario_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.fire_web_push(
    NEW.destinatario_id,
    'Nova mensagem',
    LEFT(COALESCE(NEW.conteudo, ''), 120),
    '/chat',
    'msg-' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_notificacao ON public.notificacoes;
CREATE TRIGGER push_on_notificacao
AFTER INSERT ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION public.trg_push_notificacao();

DROP TRIGGER IF EXISTS push_on_mensagem ON public.mensagens;
CREATE TRIGGER push_on_mensagem
AFTER INSERT ON public.mensagens
FOR EACH ROW EXECUTE FUNCTION public.trg_push_mensagem();

DROP POLICY IF EXISTS "Marketplace sellers upload product images" ON storage.objects;
CREATE POLICY "Marketplace sellers upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND lower(right(name, 4)) IN ('.jpg', '.png', '.gif', 'jpeg', 'webp', '.svg')
);

DROP POLICY IF EXISTS "Marketplace sellers update product images" ON storage.objects;
CREATE POLICY "Marketplace sellers update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND lower(right(name, 4)) IN ('.jpg', '.png', '.gif', 'jpeg', 'webp', '.svg')
);

DROP POLICY IF EXISTS "Marketplace sellers delete product images" ON storage.objects;
CREATE POLICY "Marketplace sellers delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

REVOKE EXECUTE ON FUNCTION public.fire_web_push(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_push_notificacao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_push_mensagem() FROM PUBLIC, anon, authenticated;