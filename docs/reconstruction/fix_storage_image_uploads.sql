-- =============================================================================
-- FIX DEFINITIVO: Uploads de imagem falhando com
--   "permission denied for function can_access_comprovante"
--
-- Causa raiz: existem policies ativas em `storage.objects` para o bucket
-- `comprovantes` que chamam `public.can_access_comprovante(...)`. O Postgres
-- pode validar privilégios/expressões dessas policies durante operações de
-- Storage mesmo quando o upload é para outro bucket (`avatars`). Por isso o
-- upload do avatar quebra antes de chegar na policy de avatars.
--
-- Correção definitiva neste arquivo:
--   1) Audita ACL da função e todas as policies atuais de storage.objects.
--   2) Remove TODAS as policies legadas de comprovantes que chamam a função.
--   3) Recria comprovantes com EXISTS inline, sem chamar função nenhuma.
--   4) Recria avatars com policies simples por bucket + pasta do auth.uid().
--   5) Imprime saída final exata para conferir ACL/policies.
--
-- Rode este bloco inteiro no SQL Editor do projeto ddrwahpcbsbxhflhskuh.
-- É idempotente e seguro re-executar.
-- =============================================================================

-- 1) AUDIT ANTES: ACL da função e policies que ainda referenciam comprovante.
SELECT
  'before_function_acl' AS audit_step,
  n.nspname AS schema,
  p.proname AS function,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  pg_catalog.array_to_string(p.proacl, E'\n') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'can_access_comprovante';

SELECT
  'before_storage_policies' AS audit_step,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname ILIKE '%comprovante%'
    OR qual ILIKE '%can_access_comprovante%'
    OR with_check ILIKE '%can_access_comprovante%'
    OR qual ILIKE '%avatars%'
    OR with_check ILIKE '%avatars%'
  )
ORDER BY policyname;

-- 2) Remove policies antigas de comprovantes, principalmente as que chamavam
--    public.can_access_comprovante(...). Depois deste bloco, upload de avatar
--    não depende mais dessa função quebrada.
DROP POLICY IF EXISTS "Comprovantes publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload comprovante" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes publicos read" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes upload publico" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes update publico" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes select" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes insert" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes update" ON storage.objects;
DROP POLICY IF EXISTS "Comprovantes delete" ON storage.objects;

-- 3) Recria comprovantes SEM chamar função. O ID do agendamento deve ser o
--    primeiro segmento do path: <agendamento_id>/<arquivo>.
CREATE POLICY "comprovantes_select_inline"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.id = (storage.foldername(name))[1]::uuid
        AND (
          a.cliente_id = auth.uid()
          OR a.barbeiro_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles r
            WHERE r.user_id = auth.uid()
              AND r.role IN ('admin', 'ceo')
          )
        )
    )
  );

CREATE POLICY "comprovantes_insert_inline"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.id = (storage.foldername(name))[1]::uuid
        AND (
          a.cliente_id = auth.uid()
          OR a.barbeiro_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles r
            WHERE r.user_id = auth.uid()
              AND r.role IN ('admin', 'ceo')
          )
        )
    )
  );

CREATE POLICY "comprovantes_update_inline"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.id = (storage.foldername(name))[1]::uuid
        AND (
          a.cliente_id = auth.uid()
          OR a.barbeiro_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles r
            WHERE r.user_id = auth.uid()
              AND r.role IN ('admin', 'ceo')
          )
        )
    )
  )
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.id = (storage.foldername(name))[1]::uuid
        AND (
          a.cliente_id = auth.uid()
          OR a.barbeiro_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles r
            WHERE r.user_id = auth.uid()
              AND r.role IN ('admin', 'ceo')
          )
        )
    )
  );

CREATE POLICY "comprovantes_delete_inline"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.id = (storage.foldername(name))[1]::uuid
        AND (
          a.cliente_id = auth.uid()
          OR a.barbeiro_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_roles r
            WHERE r.user_id = auth.uid()
              AND r.role IN ('admin', 'ceo')
          )
        )
    )
  );

-- 4) Policies limpas e escopadas para avatars (idempotente).
DROP POLICY IF EXISTS "Avatar images public read"   ON storage.objects;
DROP POLICY IF EXISTS "Users upload avatars"        ON storage.objects;
DROP POLICY IF EXISTS "Users update avatars"        ON storage.objects;
DROP POLICY IF EXISTS "Users upload own avatars"    ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatars"    ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatars"    ON storage.objects;
DROP POLICY IF EXISTS "avatars_public_read"          ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;

CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (split_part(name, '/', 1))::uuid = auth.uid()
  );

CREATE POLICY "avatars_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (split_part(name, '/', 1))::uuid = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (split_part(name, '/', 1))::uuid = auth.uid()
  );

CREATE POLICY "avatars_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (split_part(name, '/', 1))::uuid = auth.uid()
  );

-- 5) AUDIT DEPOIS: cole esta saída no chat se ainda falhar.
SELECT
  'after_function_acl' AS audit_step,
  n.nspname AS schema,
  p.proname AS function,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  pg_catalog.array_to_string(p.proacl, E'\n') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'can_access_comprovante';

SELECT
  'after_storage_policies' AS audit_step,
  policyname,
  cmd,
  roles,
  qual,
  with_check,
  CASE
    WHEN COALESCE(qual, '') ILIKE '%can_access_comprovante%'
      OR COALESCE(with_check, '') ILIKE '%can_access_comprovante%'
      THEN 'FAIL: still calls can_access_comprovante'
    ELSE 'OK: no can_access_comprovante call'
  END AS policy_eval
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (
    policyname ILIKE '%comprovante%'
    OR policyname ILIKE '%avatar%'
    OR qual ILIKE '%comprovante%'
    OR with_check ILIKE '%comprovante%'
    OR qual ILIKE '%avatars%'
    OR with_check ILIKE '%avatars%'
  )
ORDER BY policyname;
