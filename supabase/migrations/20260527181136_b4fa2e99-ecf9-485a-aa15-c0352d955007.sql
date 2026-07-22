CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.cron_generate_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.barbershop_team t
        WHERE t.barber_id = ur.user_id AND t.active = true
      )
  LOOP
    PERFORM public.generate_invoice_for_shop(r.user_id, (date_trunc('month', now()))::date);
    n := n + 1;
  END LOOP;
  UPDATE public.platform_subscriptions
    SET status='atrasado', updated_at=now()
    WHERE status='pendente' AND due_date < current_date;
  RETURN n;
END $$;