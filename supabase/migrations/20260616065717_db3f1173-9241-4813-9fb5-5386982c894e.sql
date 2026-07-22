-- 1) planos
CREATE TABLE public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_owner_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  preco numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planos TO authenticated;
GRANT ALL ON public.planos TO service_role;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planos select shop scope" ON public.planos FOR SELECT TO authenticated
USING (shop_owner_id = public.get_shop_owner(auth.uid()) OR public.has_role(auth.uid(),'ceo'::app_role));
CREATE POLICY "planos admin manage" ON public.planos FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) AND shop_owner_id = public.get_shop_owner(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) AND shop_owner_id = public.get_shop_owner(auth.uid()));

-- 2) plano_servicos
CREATE TABLE public.plano_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  limite_mensal integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plano_id, servico_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_servicos TO authenticated;
GRANT ALL ON public.plano_servicos TO service_role;
ALTER TABLE public.plano_servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plano_servicos select shop scope" ON public.plano_servicos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.planos p WHERE p.id = plano_id
  AND (p.shop_owner_id = public.get_shop_owner(auth.uid()) OR public.has_role(auth.uid(),'ceo'::app_role))));
CREATE POLICY "plano_servicos admin manage" ON public.plano_servicos FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.planos p WHERE p.id = plano_id
  AND public.has_role(auth.uid(),'admin'::app_role) AND p.shop_owner_id = public.get_shop_owner(auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.planos p WHERE p.id = plano_id
  AND public.has_role(auth.uid(),'admin'::app_role) AND p.shop_owner_id = public.get_shop_owner(auth.uid())));

-- 3) cliente_planos
CREATE TABLE public.cliente_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_owner_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente',
  confirmado_por uuid,
  confirmado_em timestamptz,
  inicio date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_planos TO authenticated;
GRANT ALL ON public.cliente_planos TO service_role;
ALTER TABLE public.cliente_planos ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX cliente_planos_one_active
  ON public.cliente_planos (cliente_id, shop_owner_id) WHERE status = 'ativo';

CREATE POLICY "cliente_planos select" ON public.cliente_planos FOR SELECT TO authenticated
USING (cliente_id = auth.uid()
  OR (public.has_role(auth.uid(),'admin'::app_role) AND shop_owner_id = public.get_shop_owner(auth.uid()))
  OR public.has_role(auth.uid(),'ceo'::app_role));
CREATE POLICY "cliente_planos admin manage" ON public.cliente_planos FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) AND shop_owner_id = public.get_shop_owner(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) AND shop_owner_id = public.get_shop_owner(auth.uid()));

-- 4) plano_consumo
CREATE TABLE public.plano_consumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_plano_id uuid NOT NULL REFERENCES public.cliente_planos(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL,
  agendamento_id uuid NOT NULL,
  periodo date NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agendamento_id, servico_id)
);
GRANT SELECT ON public.plano_consumo TO authenticated;
GRANT ALL ON public.plano_consumo TO service_role;
ALTER TABLE public.plano_consumo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plano_consumo select" ON public.plano_consumo FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.cliente_planos c WHERE c.id = cliente_plano_id
  AND (c.cliente_id = auth.uid()
       OR (public.has_role(auth.uid(),'admin'::app_role) AND c.shop_owner_id = public.get_shop_owner(auth.uid()))
       OR public.has_role(auth.uid(),'ceo'::app_role))));

-- updated_at triggers
CREATE TRIGGER update_planos_updated_at BEFORE UPDATE ON public.planos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cliente_planos_updated_at BEFORE UPDATE ON public.cliente_planos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) coverage RPC for the logged-in client
CREATE OR REPLACE FUNCTION public.get_my_plan_coverage(_barber_id uuid)
RETURNS TABLE(servico_id uuid, limite_mensal integer, usados integer, restante integer, plano_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cp AS (
    SELECT c.id, c.plano_id, p.nome
    FROM public.cliente_planos c
    JOIN public.planos p ON p.id = c.plano_id
    WHERE c.cliente_id = auth.uid()
      AND c.shop_owner_id = public.get_shop_owner(_barber_id)
      AND c.status = 'ativo'
    LIMIT 1
  )
  SELECT
    ps.servico_id,
    ps.limite_mensal,
    COALESCE((SELECT SUM(pc.quantidade)::int FROM public.plano_consumo pc
              WHERE pc.cliente_plano_id = cp.id AND pc.servico_id = ps.servico_id
                AND pc.periodo = date_trunc('month', now())::date), 0) AS usados,
    CASE WHEN ps.limite_mensal IS NULL THEN 999999
         ELSE GREATEST(ps.limite_mensal - COALESCE((SELECT SUM(pc.quantidade)::int FROM public.plano_consumo pc
              WHERE pc.cliente_plano_id = cp.id AND pc.servico_id = ps.servico_id
                AND pc.periodo = date_trunc('month', now())::date), 0), 0)
    END AS restante,
    cp.nome
  FROM cp
  JOIN public.plano_servicos ps ON ps.plano_id = cp.plano_id;
$$;

-- 6) consumption recorder trigger
CREATE OR REPLACE FUNCTION public.record_plano_consumo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop uuid;
  v_cp_id uuid;
  v_plano_id uuid;
  v_sid uuid;
  v_limite integer;
  v_used integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      DELETE FROM public.plano_consumo WHERE agendamento_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NULL OR NEW.barbeiro_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') = 'cancelled' THEN RETURN NEW; END IF;
  IF NEW.servico_ids IS NULL THEN RETURN NEW; END IF;

  v_shop := public.get_shop_owner(NEW.barbeiro_id);
  SELECT c.id, c.plano_id INTO v_cp_id, v_plano_id
    FROM public.cliente_planos c
    WHERE c.cliente_id = NEW.cliente_id AND c.shop_owner_id = v_shop AND c.status = 'ativo'
    LIMIT 1;
  IF v_cp_id IS NULL THEN RETURN NEW; END IF;

  FOREACH v_sid IN ARRAY NEW.servico_ids LOOP
    SELECT ps.limite_mensal INTO v_limite
      FROM public.plano_servicos ps
      WHERE ps.plano_id = v_plano_id AND ps.servico_id = v_sid
      LIMIT 1;
    IF FOUND THEN
      SELECT COALESCE(SUM(quantidade),0) INTO v_used
        FROM public.plano_consumo
        WHERE cliente_plano_id = v_cp_id AND servico_id = v_sid
          AND periodo = date_trunc('month', now())::date;
      IF v_limite IS NULL OR v_used < v_limite THEN
        INSERT INTO public.plano_consumo(cliente_plano_id, servico_id, agendamento_id, periodo, quantidade)
        VALUES (v_cp_id, v_sid, NEW.id, date_trunc('month', now())::date, 1)
        ON CONFLICT (agendamento_id, servico_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_record_plano_consumo
AFTER INSERT OR UPDATE OF status ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.record_plano_consumo();

-- 7) BarberHub link on profile + getter
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS barberhub_link text;

CREATE OR REPLACE FUNCTION public.get_shop_barberhub_link(_barber_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.barberhub_link
  FROM public.profiles p
  WHERE p.id = public.get_shop_owner(_barber_id)
  LIMIT 1
$$;