
-- Drop existing admin profiles policy and recreate with exclusivity
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Admins can only see profiles assigned to them
CREATE POLICY "Admins can view own clients"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  adm_responsavel_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin')
);

-- CEO can view ALL profiles
CREATE POLICY "CEO can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ceo')
);

-- Admins can update their own clients' profiles
CREATE POLICY "Admins can update own clients"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  adm_responsavel_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin')
);

-- CEO can update all profiles
CREATE POLICY "CEO can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'ceo')
);
