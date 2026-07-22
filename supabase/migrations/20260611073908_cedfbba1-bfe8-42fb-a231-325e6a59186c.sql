-- Tighten gallery upload policy so an admin can only upload into their OWN folder
-- (folder name must equal their auth uid). Mirrors the existing DELETE policy and
-- prevents cross-tenant uploads into another shop's gallery folder.
DROP POLICY IF EXISTS "Admins upload gallery" ON storage.objects;

CREATE POLICY "Admins upload gallery"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gallery'
  AND (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);