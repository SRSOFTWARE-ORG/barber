
-- Drop old galeria table
DROP TABLE IF EXISTS public.galeria;

-- Create new galeria_fotos table (no FK to auth.users)
CREATE TABLE public.galeria_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adm_id uuid NOT NULL,
  url_foto text NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.galeria_fotos ENABLE ROW LEVEL SECURITY;

-- Everyone can see all photos (public portfolio)
CREATE POLICY "Fotos visíveis para todos"
  ON public.galeria_fotos FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admins can insert their own photos
CREATE POLICY "Adms inserem suas fotos"
  ON public.galeria_fotos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = adm_id
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo'))
  );

-- Admins can delete their own photos
CREATE POLICY "Adms deletam suas fotos"
  ON public.galeria_fotos FOR DELETE
  TO authenticated
  USING (
    auth.uid() = adm_id
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo'))
  );

-- CEO can delete any photo
CREATE POLICY "CEO deleta qualquer foto"
  ON public.galeria_fotos FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'ceo'));
