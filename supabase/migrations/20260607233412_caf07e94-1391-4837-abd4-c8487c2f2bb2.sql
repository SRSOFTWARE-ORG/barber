-- =========================================================
-- 1) SUPPORT: two-way conversation, open to all logged users
-- =========================================================

-- Allow ANY authenticated user (client/barber/ceo) to open a ticket they own.
DROP POLICY IF EXISTS "Adms criam tickets" ON public.suporte;
CREATE POLICY "Usuarios criam tickets"
  ON public.suporte FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = adm_id);

-- (Existing "Adms veem seus tickets" already filters by auth.uid() = adm_id, so it
--  works for every owner. CEO read/update policies stay as they are.)

-- Threaded messages within a ticket.
CREATE TABLE IF NOT EXISTS public.suporte_mensagens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.suporte(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.suporte_mensagens TO authenticated;
GRANT ALL ON public.suporte_mensagens TO service_role;

ALTER TABLE public.suporte_mensagens ENABLE ROW LEVEL SECURITY;

-- Participants: ticket owner OR CEO. Each only sees threads they belong to.
CREATE POLICY "Participantes veem mensagens do chamado"
  ON public.suporte_mensagens FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'ceo'::app_role)
    OR EXISTS (SELECT 1 FROM public.suporte s WHERE s.id = ticket_id AND s.adm_id = auth.uid())
  );

CREATE POLICY "Participantes enviam mensagens"
  ON public.suporte_mensagens FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'ceo'::app_role)
      OR EXISTS (SELECT 1 FROM public.suporte s WHERE s.id = ticket_id AND s.adm_id = auth.uid())
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.suporte_mensagens;

-- =========================================================
-- 2) EXEMPTION HIDES INVOICES
-- =========================================================

-- While a shop owner is exempt (taxa_isenta_ate in the future), hide unpaid invoices.
CREATE OR REPLACE FUNCTION public.get_my_subscription_status()
 RETURNS TABLE(id uuid, period_month date, total_amount numeric, base_amount numeric, team_count integer, per_barber_amount numeric, status text, due_date date, paid_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.period_month, s.total_amount, s.base_amount, s.team_count, s.per_barber_amount, s.status, s.due_date, s.paid_at
  FROM public.platform_subscriptions s
  WHERE s.shop_owner_id = auth.uid()
    AND NOT (
      s.status <> 'pago'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.taxa_isenta_ate IS NOT NULL AND p.taxa_isenta_ate > now()
      )
    )
  ORDER BY s.period_month DESC
  LIMIT 12
$function$;

-- Do not generate invoices for shops that are currently exempt.
CREATE OR REPLACE FUNCTION public.generate_invoice_for_shop(_shop_owner_id uuid, _period date DEFAULT (date_trunc('month'::text, now()))::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_team int;
  v_base numeric;
  v_per numeric;
  v_total numeric;
  v_id uuid;
  v_due date;
  v_exempt boolean;
BEGIN
  SELECT (taxa_isenta_ate IS NOT NULL AND taxa_isenta_ate > now())
    INTO v_exempt FROM public.profiles WHERE id = _shop_owner_id;
  IF COALESCE(v_exempt, false) THEN
    RETURN NULL; -- isento: não gera fatura
  END IF;

  SELECT base_price, per_barber_price INTO v_base, v_per FROM public.get_subscription_prices();
  SELECT count(*) INTO v_team FROM public.barbershop_team
    WHERE shop_owner_id = _shop_owner_id AND active = true;
  v_total := v_base + (v_team * v_per);
  v_due := (_period + interval '10 days')::date;

  INSERT INTO public.platform_subscriptions
    (shop_owner_id, period_month, base_amount, team_count, per_barber_amount, total_amount, due_date)
  VALUES
    (_shop_owner_id, _period, v_base, v_team, v_per, v_total, v_due)
  ON CONFLICT (shop_owner_id, period_month) DO UPDATE
    SET team_count = EXCLUDED.team_count,
        base_amount = EXCLUDED.base_amount,
        per_barber_amount = EXCLUDED.per_barber_amount,
        total_amount = CASE WHEN platform_subscriptions.status = 'pago' THEN platform_subscriptions.total_amount ELSE EXCLUDED.total_amount END,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- =========================================================
-- 3) CEO: Mercado Pago connection status per barber/shop
-- =========================================================
CREATE OR REPLACE FUNCTION public.ceo_list_admins_mp_status()
 RETURNS TABLE(user_id uuid, display_name text, mp_connected boolean, taxa_isenta_ate timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ur.user_id,
    ur.display_name,
    public.mp_is_connected(ur.user_id),
    p.taxa_isenta_ate
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'
    AND public.has_role(auth.uid(), 'ceo'::app_role)
  ORDER BY ur.display_name ASC
$function$;