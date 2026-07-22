
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tema_cores jsonb,
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS hero_object_fit text DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS hero_object_position text DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS plano_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS plano_modo text DEFAULT 'whatsapp';

CREATE OR REPLACE FUNCTION public.get_barber_theme(_barber_id uuid)
RETURNS TABLE(
  tema_cores jsonb,
  hero_image_url text,
  hero_object_fit text,
  hero_object_position text,
  plano_enabled boolean,
  plano_modo text,
  link_planos text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.tema_cores,
    p.hero_image_url,
    COALESCE(p.hero_object_fit, 'cover'),
    COALESCE(p.hero_object_position, 'center'),
    COALESCE(p.plano_enabled, true),
    COALESCE(p.plano_modo, 'whatsapp'),
    p.link_planos
  FROM public.profiles p
  WHERE p.id = _barber_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_barber_theme(uuid) TO anon, authenticated;

-- Storage policies: barbeiros podem fazer upload na pasta hero/<seu-id>/...
DO $$ BEGIN
  CREATE POLICY "Barbeiros gerenciam suas heros"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'gallery' AND (storage.foldername(name))[1] = 'hero' AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'gallery' AND (storage.foldername(name))[1] = 'hero' AND (storage.foldername(name))[2] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
