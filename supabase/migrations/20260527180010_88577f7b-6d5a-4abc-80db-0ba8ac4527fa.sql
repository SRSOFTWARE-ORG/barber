
-- Backfill: linhas atuais (donos) recebem barber_id = shop_owner_id
UPDATE public.mp_credentials SET barber_id = shop_owner_id WHERE barber_id IS NULL;

-- Drop PK em shop_owner_id, cria nova PK e unique no barber_id
ALTER TABLE public.mp_credentials DROP CONSTRAINT IF EXISTS mp_credentials_pkey;
ALTER TABLE public.mp_credentials ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.mp_credentials ADD PRIMARY KEY (id);
ALTER TABLE public.mp_credentials ALTER COLUMN barber_id SET NOT NULL;
ALTER TABLE public.mp_credentials ADD CONSTRAINT mp_credentials_barber_uk UNIQUE (barber_id);

-- mp_is_connected agora considera barber_id também
CREATE OR REPLACE FUNCTION public.mp_is_connected(_shop_owner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mp_credentials
    WHERE barber_id = _shop_owner_id OR shop_owner_id = _shop_owner_id
  );
$$;
