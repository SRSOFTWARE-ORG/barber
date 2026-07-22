
-- 1) MP por barbeiro
ALTER TABLE public.mp_credentials ADD COLUMN IF NOT EXISTS barber_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS mp_credentials_barber_id_uidx ON public.mp_credentials(barber_id) WHERE barber_id IS NOT NULL;

-- 2) profiles: sinal_modo, sinal_percentual e check da taxa
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS sinal_modo text NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS sinal_percentual int NOT NULL DEFAULT 50;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_sinal_modo_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_sinal_modo_check CHECK (sinal_modo IN ('pix','mp'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_sinal_percentual_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_sinal_percentual_check CHECK (sinal_percentual BETWEEN 10 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_taxa_app_valor_range') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_taxa_app_valor_range CHECK (taxa_app_valor BETWEEN 0 AND 3);
  END IF;
END $$;

-- 3) Bloqueio por inadimplência
CREATE OR REPLACE FUNCTION public.is_shop_blocked(_shop_owner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.platform_subscriptions
    WHERE shop_owner_id = _shop_owner_id
      AND status IN ('pendente','atrasado')
      AND due_date < (current_date - INTERVAL '30 days')::date
  )
$$;

-- Versão para o usuário logado (resolve dono via barbershop_team se for membro)
CREATE OR REPLACE FUNCTION public.am_i_blocked()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_shop_blocked(public.get_shop_owner(auth.uid()))
$$;

-- 4) Atualizar get_barber_taxa para considerar 0
-- (já lida com COALESCE; só ajustamos para permitir zero como válido)
CREATE OR REPLACE FUNCTION public.get_barber_taxa(_barber_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p.taxa_isenta_ate IS NOT NULL AND p.taxa_isenta_ate > now() THEN 0
    ELSE LEAST(GREATEST(COALESCE(p.taxa_app_valor, 3.00), 0), 3)
  END
  FROM public.profiles p WHERE p.id = _barber_id LIMIT 1
$$;

-- 5) Helpers para o app ler sinal_modo e sinal_percentual
CREATE OR REPLACE FUNCTION public.get_barber_payment_config(_barber_id uuid)
RETURNS TABLE(sinal_modo text, sinal_percentual int, taxa_app_valor numeric, mp_connected boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.sinal_modo,'pix'),
    COALESCE(p.sinal_percentual,50),
    public.get_barber_taxa(_barber_id),
    EXISTS(SELECT 1 FROM public.mp_credentials WHERE barber_id = _barber_id)
      OR EXISTS(SELECT 1 FROM public.mp_credentials WHERE shop_owner_id = _barber_id)
  FROM public.profiles p WHERE p.id = _barber_id
$$;
