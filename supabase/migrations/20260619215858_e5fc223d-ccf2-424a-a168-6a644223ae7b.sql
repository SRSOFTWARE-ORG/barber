-- 1) Fix missing privileges on profiles (authenticated users were getting 403
--    reading/updating their own profile, which falsely triggered the
--    "Complete seu perfil" gate even when the profile was complete).
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2) Remove exact-name duplicate services per barber (keep the oldest row,
--    preferring one that already has a photo). Case/space-insensitive match.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY shop_owner_id, lower(btrim(nome))
           ORDER BY (foto_url IS NOT NULL) DESC, created_at ASC, id ASC
         ) AS rn
  FROM public.servicos
)
DELETE FROM public.servicos s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;