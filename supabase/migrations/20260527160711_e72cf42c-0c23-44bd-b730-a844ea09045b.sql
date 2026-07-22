
-- Platform PIX key lives in internal_secrets (name='app_pix_key')
-- Already RLS-locked; we expose read via a SECURITY DEFINER function.

CREATE OR REPLACE FUNCTION public.get_app_pix_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT value FROM public.internal_secrets WHERE name = 'app_pix_key' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.set_app_pix_key(_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ceo'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.internal_secrets(name, value, updated_at)
  VALUES ('app_pix_key', COALESCE(_key, ''), now())
  ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;

-- Ensure unique name in internal_secrets so the ON CONFLICT above works
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='internal_secrets_name_key'
  ) THEN
    ALTER TABLE public.internal_secrets ADD CONSTRAINT internal_secrets_name_key UNIQUE (name);
  END IF;
END $$;

-- Summary of app fees owed by a shop (finalized appointments not paid via approved MP × R$3)
CREATE OR REPLACE FUNCTION public.app_fees_pending(_shop_owner_id uuid)
RETURNS TABLE(
  finalized_total bigint,
  paid_via_mp bigint,
  owed_count bigint,
  owed_amount numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH scope AS (
    SELECT a.id, COALESCE(a.taxa_app, 3.00) AS fee
    FROM public.agendamentos a
    WHERE a.status = 'finalizado'
      AND (
        a.barbeiro_id = _shop_owner_id
        OR a.barbeiro_id IN (
          SELECT barber_id FROM public.barbershop_team
          WHERE shop_owner_id = _shop_owner_id AND active = true
        )
      )
      AND (auth.uid() = _shop_owner_id OR public.has_role(auth.uid(),'ceo'::app_role))
  ),
  paid AS (
    SELECT s.id, s.fee FROM scope s
    INNER JOIN public.payment_logs pl
      ON pl.agendamento_id = s.id AND pl.status = 'approved'
  )
  SELECT
    (SELECT count(*) FROM scope)::bigint,
    (SELECT count(*) FROM paid)::bigint,
    ((SELECT count(*) FROM scope) - (SELECT count(*) FROM paid))::bigint,
    COALESCE((SELECT sum(fee) FROM scope) - (SELECT sum(fee) FROM paid), 0)::numeric;
$$;

GRANT EXECUTE ON FUNCTION public.get_app_pix_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_pix_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_fees_pending(uuid) TO authenticated;
