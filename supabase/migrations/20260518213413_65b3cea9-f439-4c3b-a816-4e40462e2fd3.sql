
-- 1) Coluna para armazenar a senha em texto plano (somente o CEO pode ler via edge function com service role)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plain_password text;

-- 2) Tornar bucket de comprovantes privado
UPDATE storage.buckets SET public = false WHERE id = 'comprovantes';

-- 3) Função SECURITY DEFINER para checar se usuário pode acessar comprovante de um agendamento
CREATE OR REPLACE FUNCTION public.can_access_comprovante(_agendamento_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = _agendamento_id
      AND (
        a.cliente_id = _user_id
        OR a.barbeiro_id = _user_id
        OR public.has_role(_user_id, 'ceo'::app_role)
      )
  )
$$;

-- 4) Remover policies antigas (se existirem) do bucket comprovantes
DROP POLICY IF EXISTS "Comprovantes publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload comprovante" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes select" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes insert" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes update" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes delete" ON storage.objects;

-- 5) Policies privadas: somente cliente/barbeiro do agendamento (ou CEO) podem ler/escrever
-- Convenção de path: "{agendamento_id}/arquivo.ext"
CREATE POLICY "Comprovantes select"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (
  bucket_id = 'comprovantes'
  AND (
    auth.uid() IS NOT NULL
    AND public.can_access_comprovante(
      (split_part(name, '/', 1))::uuid,
      auth.uid()
    )
  )
);

CREATE POLICY "Comprovantes insert"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (
  bucket_id = 'comprovantes'
  AND (
    auth.uid() IS NOT NULL
    AND public.can_access_comprovante(
      (split_part(name, '/', 1))::uuid,
      auth.uid()
    )
  )
);

CREATE POLICY "Comprovantes update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.can_access_comprovante(
    (split_part(name, '/', 1))::uuid,
    auth.uid()
  )
);

-- 6) RPC para o PaymentPage e Admin obterem signed URL do comprovante
CREATE OR REPLACE FUNCTION public.get_comprovante_signed_url(_agendamento_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
BEGIN
  IF NOT public.can_access_comprovante(_agendamento_id, auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT comprovante_url INTO v_path FROM public.agendamentos WHERE id = _agendamento_id;
  RETURN v_path;
END;
$$;
