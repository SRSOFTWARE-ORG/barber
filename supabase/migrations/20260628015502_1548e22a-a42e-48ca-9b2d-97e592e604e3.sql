-- Permite que cada barbeiro/admin gerencie suas próprias imagens de fundo do app
-- (appbg) e logo personalizada (applogo) dentro do bucket gallery, em pastas
-- escopadas pelo seu user id. Antes, apenas o CEO conseguia enviar para essas
-- pastas, então o upload de fundo do tema e da logo falhava silenciosamente
-- (RLS) para administradores.

CREATE POLICY "Admins gerenciam seu app bg"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'appbg'
  AND (storage.foldername(name))[2] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'appbg'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Admins gerenciam sua app logo"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'applogo'
  AND (storage.foldername(name))[2] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'gallery'
  AND (storage.foldername(name))[1] = 'applogo'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);