
-- Helper genérico de updated_at (não existia)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- =========================================================
-- 1) TABELA: barbershop_team
-- =========================================================
CREATE TABLE public.barbershop_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_owner_id uuid NOT NULL,
  barber_id uuid NOT NULL UNIQUE,
  commission_type text NOT NULL DEFAULT 'percentage' CHECK (commission_type IN ('percentage','fixed')),
  commission_value numeric(10,2) NOT NULL DEFAULT 50,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT barbershop_team_no_self CHECK (shop_owner_id <> barber_id)
);
CREATE INDEX idx_barbershop_team_owner ON public.barbershop_team(shop_owner_id);
CREATE INDEX idx_barbershop_team_barber ON public.barbershop_team(barber_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.barbershop_team TO authenticated;
GRANT ALL ON public.barbershop_team TO service_role;
ALTER TABLE public.barbershop_team ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_team_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.barbershop_team
  WHERE shop_owner_id = NEW.shop_owner_id AND active = true;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Limite de 20 barbeiros por barbearia atingido';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_team_limit BEFORE INSERT ON public.barbershop_team
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_limit();

CREATE TRIGGER trg_team_updated BEFORE UPDATE ON public.barbershop_team
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2) HELPERS de tenancy
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_shop_owner(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT shop_owner_id FROM public.barbershop_team
       WHERE barber_id = _user_id AND active = true LIMIT 1),
    (SELECT _user_id WHERE public.has_role(_user_id, 'admin'::app_role)),
    (SELECT adm_responsavel_id FROM public.profiles WHERE id = _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_member(_user_id uuid, _shop_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = _shop_owner_id OR EXISTS (
    SELECT 1 FROM public.barbershop_team
    WHERE shop_owner_id = _shop_owner_id AND barber_id = _user_id AND active = true
  );
$$;

CREATE POLICY "Dono gerencia seu time"
ON public.barbershop_team FOR ALL TO authenticated
USING (auth.uid() = shop_owner_id) WITH CHECK (auth.uid() = shop_owner_id);

CREATE POLICY "Barbeiro ve seu vinculo"
ON public.barbershop_team FOR SELECT TO authenticated
USING (auth.uid() = barber_id);

CREATE POLICY "CEO gerencia times"
ON public.barbershop_team FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'ceo'::app_role));

-- =========================================================
-- 3) TABELA: mp_credentials  (acesso só via service_role)
-- =========================================================
CREATE TABLE public.mp_credentials (
  shop_owner_id uuid PRIMARY KEY,
  mp_user_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  public_key text,
  expires_at timestamptz,
  scope text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mp_credentials TO service_role;
ALTER TABLE public.mp_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny mp_credentials auth"
ON public.mp_credentials FOR ALL TO authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Deny mp_credentials anon"
ON public.mp_credentials FOR ALL TO anon
USING (false) WITH CHECK (false);

CREATE TRIGGER trg_mp_credentials_updated BEFORE UPDATE ON public.mp_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.mp_is_connected(_shop_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.mp_credentials WHERE shop_owner_id = _shop_owner_id);
$$;

-- =========================================================
-- 4) TABELA: payment_logs
-- =========================================================
CREATE TABLE public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid,
  shop_owner_id uuid NOT NULL,
  barber_id uuid,
  preference_id text,
  payment_id text UNIQUE,
  status text,
  payment_method text,
  amount_total numeric(10,2) NOT NULL DEFAULT 0,
  amount_app_fee numeric(10,2) NOT NULL DEFAULT 0,
  amount_card_fee numeric(10,2) NOT NULL DEFAULT 0,
  amount_net numeric(10,2) NOT NULL DEFAULT 0,
  amount_barber numeric(10,2) NOT NULL DEFAULT 0,
  amount_shop numeric(10,2) NOT NULL DEFAULT 0,
  commission_type text,
  commission_value numeric(10,2),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_logs_shop ON public.payment_logs(shop_owner_id, created_at DESC);
CREATE INDEX idx_payment_logs_barber ON public.payment_logs(barber_id, created_at DESC);
CREATE INDEX idx_payment_logs_agendamento ON public.payment_logs(agendamento_id);

GRANT SELECT ON public.payment_logs TO authenticated;
GRANT ALL ON public.payment_logs TO service_role;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dono ve logs"
ON public.payment_logs FOR SELECT TO authenticated
USING (auth.uid() = shop_owner_id);

CREATE POLICY "Barbeiro ve seus logs"
ON public.payment_logs FOR SELECT TO authenticated
USING (auth.uid() = barber_id);

CREATE POLICY "CEO ve todos logs"
ON public.payment_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::app_role));

CREATE TRIGGER trg_payment_logs_updated BEFORE UPDATE ON public.payment_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5) RPCs públicas
-- =========================================================
CREATE OR REPLACE FUNCTION public.list_shops_showcase()
RETURNS TABLE(
  shop_owner_id uuid, shop_name text, display_name text, avatar_url text,
  rating_avg numeric, rating_count int, team_size int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ur.user_id,
    COALESCE(NULLIF(btrim(p.nome_barbearia), ''), 'Barbearia ' || ur.display_name),
    ur.display_name,
    p.avatar_url,
    COALESCE(ROUND(AVG(a.nota)::numeric, 1), 0),
    COALESCE(COUNT(DISTINCT a.id), 0)::int,
    (1 + COALESCE((SELECT count(*) FROM public.barbershop_team t
       WHERE t.shop_owner_id = ur.user_id AND t.active = true), 0))::int
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.avaliacoes a ON a.adm_id = ur.user_id
  WHERE ur.role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM public.barbershop_team t
      WHERE t.barber_id = ur.user_id AND t.active = true
    )
  GROUP BY ur.user_id, ur.display_name, p.nome_barbearia, p.avatar_url
  ORDER BY 5 DESC, 6 DESC, 3 ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_barbers_of_shop(_shop_owner_id uuid)
RETURNS TABLE(
  user_id uuid, display_name text, full_name text, avatar_url text,
  is_owner boolean, rating_avg numeric, rating_count int,
  commission_type text, commission_value numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH members AS (
    SELECT _shop_owner_id AS uid, true AS is_owner, NULL::text AS ctype, NULL::numeric AS cval
    UNION ALL
    SELECT t.barber_id, false, t.commission_type, t.commission_value
    FROM public.barbershop_team t
    WHERE t.shop_owner_id = _shop_owner_id AND t.active = true
  )
  SELECT
    m.uid, ur.display_name, p.full_name, p.avatar_url, m.is_owner,
    COALESCE(ROUND(AVG(a.nota)::numeric, 1), 0),
    COALESCE(COUNT(DISTINCT a.id), 0)::int,
    m.ctype, m.cval
  FROM members m
  LEFT JOIN public.user_roles ur ON ur.user_id = m.uid AND ur.role = 'admin'
  LEFT JOIN public.profiles p ON p.id = m.uid
  LEFT JOIN public.avaliacoes a ON a.adm_id = m.uid
  GROUP BY m.uid, ur.display_name, p.full_name, p.avatar_url, m.is_owner, m.ctype, m.cval
  ORDER BY m.is_owner DESC, ur.display_name ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_barbers_showcase()
RETURNS TABLE(
  user_id uuid, display_name text, full_name text, nome_barbearia text,
  avatar_url text, rating_avg numeric, rating_count int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH shop AS (SELECT public.get_shop_owner(auth.uid()) AS sid)
  SELECT
    b.user_id, b.display_name, b.full_name, p.nome_barbearia,
    b.avatar_url, b.rating_avg, b.rating_count
  FROM shop, public.list_barbers_of_shop(shop.sid) b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE shop.sid IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.shop_dashboard(
  _shop_owner_id uuid,
  _from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  _to date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  barber_id uuid, barber_name text, total_appointments bigint,
  total_revenue numeric, total_barber_share numeric, total_shop_share numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    pl.barber_id,
    COALESCE(ur.display_name, 'Barbeiro'),
    COUNT(*)::bigint,
    COALESCE(SUM(pl.amount_total),0),
    COALESCE(SUM(pl.amount_barber),0),
    COALESCE(SUM(pl.amount_shop),0)
  FROM public.payment_logs pl
  LEFT JOIN public.user_roles ur ON ur.user_id = pl.barber_id AND ur.role='admin'
  WHERE pl.shop_owner_id = _shop_owner_id
    AND pl.status = 'approved'
    AND pl.created_at::date BETWEEN _from AND _to
    AND (auth.uid() = _shop_owner_id OR public.has_role(auth.uid(), 'ceo'::app_role))
  GROUP BY pl.barber_id, ur.display_name
  ORDER BY 4 DESC;
$$;
