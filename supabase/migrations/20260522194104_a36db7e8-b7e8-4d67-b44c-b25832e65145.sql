
-- 1) Restringir storage 'comprovantes insert' a apenas usuários autenticados
DROP POLICY IF EXISTS "Comprovantes insert" ON storage.objects;
CREATE POLICY "Comprovantes insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comprovantes'
  AND auth.uid() IS NOT NULL
  AND public.can_access_comprovante((split_part(name, '/', 1))::uuid, auth.uid())
);

-- 2) Restringir Realtime: apenas usuários autenticados podem assinar canais
-- (RLS no postgres_changes ainda usa as policies da tabela origem;
--  isso só impede leitura crua de realtime.messages por anon)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated only realtime" ON realtime.messages;
CREATE POLICY "Authenticated only realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

-- 3) internal_secrets: silenciar warning "RLS enabled no policy" com deny-all explícito
-- A tabela só é acessada via service_role (que bypassa RLS).
DROP POLICY IF EXISTS "Deny all internal_secrets" ON public.internal_secrets;
CREATE POLICY "Deny all internal_secrets"
ON public.internal_secrets
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
