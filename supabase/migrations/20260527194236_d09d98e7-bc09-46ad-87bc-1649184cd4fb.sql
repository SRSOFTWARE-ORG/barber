
-- Fix 1: gallery storage delete — restrict admins to own folder
DROP POLICY IF EXISTS "Admins delete gallery" ON storage.objects;
CREATE POLICY "Admins delete own gallery files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'gallery'
  AND (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- Fix 2: notificacoes insert — restrict target user to same tenant
DROP POLICY IF EXISTS "Staff insert notifications" ON public.notificacoes;
CREATE POLICY "Staff insert notifications"
ON public.notificacoes FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.get_shop_owner(user_id) = public.get_shop_owner(auth.uid())
  )
);

-- Fix 3: whatsapp_queue insert — non-CEO admins can only insert for self
DROP POLICY IF EXISTS "Staff insert queue" ON public.whatsapp_queue;
CREATE POLICY "Staff insert queue"
ON public.whatsapp_queue FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'ceo'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND barbeiro_id = auth.uid()
  )
);
