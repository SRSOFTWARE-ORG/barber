REVOKE EXECUTE ON FUNCTION public.barber_earnings_dashboard(date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.barber_service_history(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.barber_payment_history(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_barber_payment(uuid, numeric, date, date, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_barber_payment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_barber_payment(uuid) FROM anon;