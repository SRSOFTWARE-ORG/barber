
ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS apagada_remetente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apagada_destinatario boolean NOT NULL DEFAULT false;

-- Permite ao usuário marcar como apagada para si (UPDATE da própria flag)
DROP POLICY IF EXISTS "Users soft delete own messages" ON public.mensagens;
CREATE POLICY "Users soft delete own messages"
ON public.mensagens
FOR UPDATE
TO authenticated
USING ((auth.uid() = remetente_id) OR (auth.uid() = destinatario_id));

-- Função que remove fisicamente quando ambos apagaram
CREATE OR REPLACE FUNCTION public.cleanup_mensagens_apagadas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.apagada_remetente = true AND NEW.apagada_destinatario = true THEN
    DELETE FROM public.mensagens WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_mensagens ON public.mensagens;
CREATE TRIGGER trg_cleanup_mensagens
AFTER UPDATE OF apagada_remetente, apagada_destinatario ON public.mensagens
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_mensagens_apagadas();
