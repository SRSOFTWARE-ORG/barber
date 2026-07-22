-- ============================================================================
-- Security hardening: valor_sinal_bypass, agendamentos_cliente_telefone_barber_read,
-- profiles_sensitive_fields_exposure, whatsapp_queue_staff_read_missing
-- ============================================================================

-- 1) valor_sinal_bypass: enforce the deposit server-side.
CREATE OR REPLACE FUNCTION public.enforce_agendamento_insert_financials()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_taxa numeric;
  v_pct integer;
  v_subtotal numeric;
  v_max numeric;
BEGIN
  IF NEW.barbeiro_id IS NOT NULL THEN
    v_taxa := public.get_barber_taxa(NEW.barbeiro_id);
  ELSE
    v_taxa := 3.00;
  END IF;
  NEW.taxa_app := v_taxa;

  NEW.valor_pago := 0;
  NEW.sinal_pago := false;

  v_pct := COALESCE((SELECT sinal_percentual FROM public.profiles WHERE id = NEW.barbeiro_id), 50);
  v_subtotal := COALESCE((SELECT SUM(preco) FROM public.servicos WHERE id = ANY(NEW.servico_ids)), 0);
  v_max := round(v_subtotal * (v_pct::numeric / 100.0), 2) + v_taxa;

  -- Floor: a deposit can never be below the platform fee.
  IF NEW.valor_sinal IS NULL OR NEW.valor_sinal < v_taxa THEN
    NEW.valor_sinal := v_taxa;
  END IF;
  -- Ceiling: a deposit can never exceed the full (undiscounted) expected amount.
  IF v_max > 0 AND NEW.valor_sinal > v_max + 0.01 THEN
    NEW.valor_sinal := v_max;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) agendamentos_cliente_telefone_barber_read: remove direct column read, expose via RPC.
REVOKE SELECT ON public.agendamentos FROM authenticated;
GRANT SELECT (
  id, created_at, cliente_nome, cliente_sobrenome, data, hora, servico_ids,
  status, cliente_id, valor_pago, barbeiro_id, barbeiro_nome, arquivado,
  sinal_pago, valor_sinal, taxa_app, comprovante_url, pix_gerado_em,
  eh_fracionado, fase1_duracao, espera_duracao, fase2_duracao
) ON public.agendamentos TO authenticated;

CREATE OR REPLACE FUNCTION public.list_agendamentos_full(_id uuid DEFAULT NULL)
  RETURNS SETOF public.agendamentos
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT a.*
  FROM public.agendamentos a
  WHERE (_id IS NULL OR a.id = _id)
    AND (
      a.cliente_id = auth.uid()
      OR a.barbeiro_id = auth.uid()
      OR public.has_role(auth.uid(), 'ceo'::app_role)
    )
  ORDER BY a.created_at DESC
$function$;

REVOKE ALL ON FUNCTION public.list_agendamentos_full(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_agendamentos_full(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_agendamentos_full(uuid) TO authenticated;

-- 3) profiles_sensitive_fields_exposure: revoke remaining sinal_percentual column read.
REVOKE SELECT (sinal_percentual) ON public.profiles FROM authenticated;
REVOKE SELECT (sinal_percentual) ON public.profiles FROM anon;

-- 4) whatsapp_queue_staff_read_missing: add staff SELECT policy + masked RPC.
DROP POLICY IF EXISTS "Staff read own queue" ON public.whatsapp_queue;
CREATE POLICY "Staff read own queue"
  ON public.whatsapp_queue
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = barbeiro_id
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND public.get_shop_owner(auth.uid()) = public.get_shop_owner(barbeiro_id)
    )
  );

CREATE OR REPLACE FUNCTION public.list_whatsapp_queue(_barbeiro_id uuid DEFAULT NULL, _limit integer DEFAULT 100)
  RETURNS TABLE(
    id uuid,
    destinatario text,
    mensagem text,
    tipo text,
    agendamento_id uuid,
    status text,
    tentativas integer,
    max_tentativas integer,
    erro text,
    resposta jsonb,
    created_at timestamptz,
    sent_at timestamptz,
    next_attempt_at timestamptz,
    delivered_at timestamptz,
    read_at timestamptz,
    external_id text,
    barbeiro_id uuid
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT
    q.id,
    CASE
      WHEN length(COALESCE(q.destinatario, '')) > 4 THEN '****' || right(q.destinatario, 4)
      ELSE COALESCE(q.destinatario, '')
    END AS destinatario,
    q.mensagem, q.tipo, q.agendamento_id, q.status, q.tentativas, q.max_tentativas,
    q.erro, q.resposta, q.created_at, q.sent_at, q.next_attempt_at, q.delivered_at,
    q.read_at, q.external_id, q.barbeiro_id
  FROM public.whatsapp_queue q
  WHERE (
      public.has_role(auth.uid(), 'ceo'::app_role)
      OR q.barbeiro_id = auth.uid()
      OR (
        public.has_role(auth.uid(), 'admin'::app_role)
        AND public.get_shop_owner(auth.uid()) = public.get_shop_owner(q.barbeiro_id)
      )
    )
    AND (_barbeiro_id IS NULL OR q.barbeiro_id = _barbeiro_id)
  ORDER BY q.created_at DESC
  LIMIT COALESCE(_limit, 100)
$function$;

REVOKE ALL ON FUNCTION public.list_whatsapp_queue(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_whatsapp_queue(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_whatsapp_queue(uuid, integer) TO authenticated;