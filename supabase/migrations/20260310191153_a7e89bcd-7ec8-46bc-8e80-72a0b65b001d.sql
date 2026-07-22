-- Drop existing policies on user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "CEO can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "CEO can manage roles" ON public.user_roles;

-- Simple permissive policy: authenticated users can read their own roles
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- CEO can read all roles (for admin list)
CREATE POLICY "CEO reads all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'ceo'));

-- CEO can insert/delete roles
CREATE POLICY "CEO inserts roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "CEO deletes roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'ceo'));