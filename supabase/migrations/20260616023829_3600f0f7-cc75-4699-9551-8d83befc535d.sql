CREATE OR REPLACE FUNCTION public.trg_push_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.destinatario_id IS NULL OR COALESCE(NEW.apagada_destinatario, false) THEN
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

UPDATE public.mensagens
SET lida = true,
    lida_em = COALESCE(lida_em, now())
WHERE lida = false
  AND COALESCE(apagada_destinatario, false) = true;

REVOKE EXECUTE ON FUNCTION public.trg_push_mensagem() FROM PUBLIC, anon, authenticated;