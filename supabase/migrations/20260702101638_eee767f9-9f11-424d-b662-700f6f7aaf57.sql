-- 1) Frequência de pagamento por barbeiro (default semanal)
ALTER TABLE public.barbershop_team
  ADD COLUMN IF NOT EXISTS pay_frequency text NOT NULL DEFAULT 'semanal';

ALTER TABLE public.barbershop_team
  DROP CONSTRAINT IF EXISTS barbershop_team_pay_frequency_chk;
ALTER TABLE public.barbershop_team
  ADD CONSTRAINT barbershop_team_pay_frequency_chk
  CHECK (pay_frequency IN ('diario','semanal','quinzenal','mensal','anual'));

-- 2) Tabela de pagamentos aos barbeiros
CREATE TABLE IF NOT EXISTS public.barber_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_owner_id uuid NOT NULL,
  barber_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  period_start date,
  period_end date,
  metodo text,
  observacoes text,
  paid_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.barber_payments TO authenticated;
GRANT ALL ON public.barber_payments TO service_role;
ALTER TABLE public.barber_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop owner manage barber payments"
  ON public.barber_payments FOR ALL
  USING (auth.uid() = shop_owner_id OR public.has_role(auth.uid(), 'ceo'::app_role))
  WITH CHECK (auth.uid() = shop_owner_id OR public.has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "barber view own payments"
  ON public.barber_payments FOR SELECT
  USING (auth.uid() = barber_id);

CREATE INDEX IF NOT EXISTS idx_barber_payments_shop_barber
  ON public.barber_payments (shop_owner_id, barber_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_barber_payments_barber_created
  ON public.barber_payments (barber_id, created_at DESC);

CREATE TRIGGER trg_barber_payments_updated_at
  BEFORE UPDATE ON public.barber_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Auditoria financeira
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_owner_id uuid,
  actor_id uuid,
  action text NOT NULL,
  payment_id uuid,
  barber_id uuid,
  amount numeric,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_audit_log TO authenticated;
GRANT ALL ON public.financial_audit_log TO service_role;
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop owner view financial audit"
  ON public.financial_audit_log FOR SELECT
  USING (auth.uid() = shop_owner_id OR public.has_role(auth.uid(), 'ceo'::app_role));

CREATE INDEX IF NOT EXISTS idx_financial_audit_shop_created
  ON public.financial_audit_log (shop_owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_barber_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.financial_audit_log(shop_owner_id, actor_id, action, payment_id, barber_id, amount, details)
  VALUES (
    COALESCE(NEW.shop_owner_id, OLD.shop_owner_id),
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'create'
      WHEN TG_OP = 'DELETE' THEN 'hard_delete'
      WHEN TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'soft_delete'
      WHEN TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN 'restore'
      ELSE 'update'
    END,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.barber_id, OLD.barber_id),
    COALESCE(NEW.amount, OLD.amount),
    jsonb_build_object('op', TG_OP)
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_audit_barber_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.barber_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_barber_payment();

-- 4) Índice p/ performance das estatísticas por barbeiro
CREATE INDEX IF NOT EXISTS idx_agendamentos_barber_status_data
  ON public.agendamentos (barbeiro_id, status, data);

-- 5) Registrar pagamento (validação + dedup + atômico)
CREATE OR REPLACE FUNCTION public.register_barber_payment(
  _barber_id uuid,
  _amount numeric,
  _period_start date DEFAULT NULL,
  _period_end date DEFAULT NULL,
  _metodo text DEFAULT NULL,
  _observacoes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid; v_id uuid; v_dup uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_shop := public.get_shop_owner(auth.uid());
  IF v_shop IS NULL OR (auth.uid() <> v_shop AND NOT public.has_role(auth.uid(), 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'Apenas o dono da barbearia pode registrar pagamentos';
  END IF;
  IF _barber_id <> v_shop
     AND NOT EXISTS (SELECT 1 FROM public.barbershop_team WHERE shop_owner_id = v_shop AND barber_id = _barber_id AND active)
     AND NOT public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RAISE EXCEPTION 'Barbeiro não pertence à sua barbearia';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  -- Proteção contra duplicação: mesmo barbeiro/valor nos últimos 30s
  SELECT id INTO v_dup FROM public.barber_payments
    WHERE shop_owner_id = v_shop AND barber_id = _barber_id AND amount = _amount
      AND deleted_at IS NULL AND created_at > now() - interval '30 seconds'
    LIMIT 1;
  IF v_dup IS NOT NULL THEN RETURN v_dup; END IF;

  INSERT INTO public.barber_payments(shop_owner_id, barber_id, amount, period_start, period_end, metodo, observacoes, paid_by)
  VALUES (v_shop, _barber_id, _amount, _period_start, _period_end, _metodo, _observacoes, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 6) Soft delete / restore
CREATE OR REPLACE FUNCTION public.delete_barber_payment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid;
BEGIN
  v_shop := public.get_shop_owner(auth.uid());
  UPDATE public.barber_payments
     SET deleted_at = now()
   WHERE id = _id
     AND (shop_owner_id = v_shop OR public.has_role(auth.uid(), 'ceo'::app_role))
     AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado ou sem permissão'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.restore_barber_payment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid;
BEGIN
  v_shop := public.get_shop_owner(auth.uid());
  UPDATE public.barber_payments
     SET deleted_at = NULL
   WHERE id = _id
     AND (shop_owner_id = v_shop OR public.has_role(auth.uid(), 'ceo'::app_role))
     AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado ou sem permissão'; END IF;
END; $$;

-- 7) Painel de ganhos por barbeiro (backend calcula tudo)
CREATE OR REPLACE FUNCTION public.barber_earnings_dashboard(
  _from date DEFAULT (current_date - interval '7 days')::date,
  _to date DEFAULT current_date
) RETURNS TABLE(
  barber_id uuid, barber_name text, avatar_url text, is_owner boolean,
  commission_type text, commission_value numeric, pay_frequency text,
  total_appointments bigint, total_revenue numeric, avg_ticket numeric,
  commission_amount numeric, amount_paid numeric, status text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH shop AS (SELECT public.get_shop_owner(auth.uid()) AS sid),
  guard AS (
    SELECT sid FROM shop
    WHERE sid IS NOT NULL AND (auth.uid() = sid OR public.has_role(auth.uid(), 'ceo'::app_role))
  ),
  team AS (
    SELECT b.user_id,
           COALESCE(NULLIF(btrim(b.full_name), ''), b.display_name, 'Barbeiro') AS bname,
           b.avatar_url, b.is_owner, b.commission_type, b.commission_value,
           COALESCE((SELECT t.pay_frequency FROM public.barbershop_team t
                     WHERE t.shop_owner_id = (SELECT sid FROM guard)
                       AND t.barber_id = b.user_id AND t.active LIMIT 1), 'semanal') AS pay_frequency
    FROM guard, public.list_barbers_of_shop((SELECT sid FROM guard)) b
  ),
  stats AS (
    SELECT a.barbeiro_id AS bid,
           count(*)::bigint AS appts,
           COALESCE(SUM(sv.subtotal), 0) AS revenue
    FROM public.agendamentos a
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(s.preco), 0) AS subtotal
      FROM public.servicos s WHERE s.id = ANY(a.servico_ids)
    ) sv ON true
    WHERE a.status = 'finalizado' AND a.data BETWEEN _from AND _to
    GROUP BY a.barbeiro_id
  ),
  paid AS (
    SELECT p.barber_id AS bid, COALESCE(SUM(p.amount), 0) AS amt
    FROM public.barber_payments p
    WHERE p.deleted_at IS NULL AND p.created_at::date BETWEEN _from AND _to
    GROUP BY p.barber_id
  )
  SELECT t.user_id, t.bname, t.avatar_url, t.is_owner,
         t.commission_type, t.commission_value, t.pay_frequency,
         COALESCE(st.appts, 0),
         COALESCE(st.revenue, 0),
         CASE WHEN COALESCE(st.appts, 0) > 0 THEN ROUND(COALESCE(st.revenue, 0) / st.appts, 2) ELSE 0 END,
         (CASE
            WHEN t.is_owner THEN COALESCE(st.revenue, 0)
            WHEN t.commission_type = 'fixed' THEN ROUND(COALESCE(t.commission_value, 0) * COALESCE(st.appts, 0), 2)
            ELSE ROUND(COALESCE(st.revenue, 0) * COALESCE(t.commission_value, 50) / 100.0, 2)
          END) AS commission_amount,
         COALESCE(pd.amt, 0),
         (CASE
            WHEN COALESCE(pd.amt, 0) <= 0 THEN 'pendente'
            WHEN COALESCE(pd.amt, 0) >= (CASE
                 WHEN t.is_owner THEN COALESCE(st.revenue, 0)
                 WHEN t.commission_type = 'fixed' THEN ROUND(COALESCE(t.commission_value, 0) * COALESCE(st.appts, 0), 2)
                 ELSE ROUND(COALESCE(st.revenue, 0) * COALESCE(t.commission_value, 50) / 100.0, 2)
               END) THEN 'pago'
            ELSE 'parcial'
          END) AS status
  FROM team t
  LEFT JOIN stats st ON st.bid = t.user_id
  LEFT JOIN paid pd ON pd.bid = t.user_id
  ORDER BY t.is_owner DESC, t.bname ASC;
$$;

-- 8) Histórico de serviços por barbeiro
CREATE OR REPLACE FUNCTION public.barber_service_history(
  _barber_id uuid,
  _from date DEFAULT (current_date - interval '30 days')::date,
  _to date DEFAULT current_date
) RETURNS TABLE(
  agendamento_id uuid, cliente_nome text, servicos text,
  valor numeric, data date, hora time without time zone, status text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         COALESCE(a.cliente_nome, 'Cliente'),
         COALESCE((SELECT string_agg(s.nome, ', ') FROM public.servicos s WHERE s.id = ANY(a.servico_ids)), '—'),
         COALESCE((SELECT SUM(s.preco) FROM public.servicos s WHERE s.id = ANY(a.servico_ids)), 0),
         a.data, a.hora, a.status
  FROM public.agendamentos a
  WHERE a.barbeiro_id = _barber_id
    AND a.data BETWEEN _from AND _to
    AND (
      auth.uid() = _barber_id
      OR public.get_shop_owner(auth.uid()) = public.get_shop_owner(_barber_id)
      OR public.has_role(auth.uid(), 'ceo'::app_role)
    )
  ORDER BY a.data DESC, a.hora DESC;
$$;

-- 9) Histórico de pagamentos por barbeiro
CREATE OR REPLACE FUNCTION public.barber_payment_history(_barber_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, barber_id uuid, amount numeric, period_start date, period_end date,
  metodo text, observacoes text, paid_by uuid, paid_by_name text, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.barber_id, p.amount, p.period_start, p.period_end,
         p.metodo, p.observacoes, p.paid_by,
         COALESCE(ur.display_name, pr.full_name, 'Barbearia') AS paid_by_name,
         p.created_at
  FROM public.barber_payments p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.paid_by AND ur.role = 'admin'
  LEFT JOIN public.profiles pr ON pr.id = p.paid_by
  WHERE p.deleted_at IS NULL
    AND (_barber_id IS NULL OR p.barber_id = _barber_id)
    AND (
      p.shop_owner_id = public.get_shop_owner(auth.uid())
      OR p.barber_id = auth.uid()
      OR public.has_role(auth.uid(), 'ceo'::app_role)
    )
  ORDER BY p.created_at DESC;
$$;