
-- 1. Gallery table for portfolio photos
CREATE TABLE public.galeria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  descricao text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.galeria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gallery visible to all" ON public.galeria FOR SELECT USING (true);
CREATE POLICY "Admins manage gallery" ON public.galeria FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "Admins delete gallery" ON public.galeria FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

-- 2. Add barbeiro_id and comissao_percent to agendamentos
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS barbeiro_id uuid;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS barbeiro_nome text;

-- 3. Create storage bucket for gallery
INSERT INTO storage.buckets (id, name, public) VALUES ('gallery', 'gallery', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;

-- 4. Storage RLS for gallery bucket
CREATE POLICY "Gallery images public read" ON storage.objects FOR SELECT USING (bucket_id = 'gallery');
CREATE POLICY "Admins upload gallery" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gallery');
CREATE POLICY "Admins delete gallery" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'gallery');

-- 5. Storage RLS for avatars bucket  
CREATE POLICY "Avatar images public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Users update avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
