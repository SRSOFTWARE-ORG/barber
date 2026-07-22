-- Add PIX fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chave_pix TEXT,
  ADD COLUMN IF NOT EXISTS qr_code_pix_url TEXT;

-- Add payment tracking fields to agendamentos
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS sinal_pago BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_sinal NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS taxa_app NUMERIC(10,2) NOT NULL DEFAULT 3.00;

-- Make 'pix' storage bucket for QR codes (reuse avatars bucket is fine, but a dedicated one is cleaner)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pix-qr', 'pix-qr', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for PIX QR images
DROP POLICY IF EXISTS "PIX QR public read" ON storage.objects;
CREATE POLICY "PIX QR public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pix-qr');

DROP POLICY IF EXISTS "Barbers upload own PIX QR" ON storage.objects;
CREATE POLICY "Barbers upload own PIX QR"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pix-qr' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Barbers update own PIX QR" ON storage.objects;
CREATE POLICY "Barbers update own PIX QR"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'pix-qr' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Barbers delete own PIX QR" ON storage.objects;
CREATE POLICY "Barbers delete own PIX QR"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'pix-qr' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RPC to expose PIX of a barber to clients/anon (read only)
CREATE OR REPLACE FUNCTION public.get_barber_pix(_barber_id uuid)
RETURNS TABLE(chave_pix text, qr_code_pix_url text, telefone text, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.chave_pix, p.qr_code_pix_url, p.telefone, p.full_name
  FROM public.profiles p
  WHERE p.id = _barber_id
  LIMIT 1
$$;