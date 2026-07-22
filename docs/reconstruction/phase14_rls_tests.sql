-- =====================================================================
-- FASE 14 — Testes de RLS e idempotência
-- =====================================================================

-- 1) Idempotência do register_event
-- SELECT * FROM public.platform_webhook_register_event('stripe','invoice.paid','evt_abc','{}'::jsonb); -- inserted=true
-- SELECT * FROM public.platform_webhook_register_event('stripe','invoice.paid','evt_abc','{}'::jsonb); -- inserted=false
-- SELECT * FROM public.platform_webhook_register_event('paddle','invoice.paid','evt_abc','{}'::jsonb); -- inserted=true (outro provider)

-- 2) Idempotência dos reconcilers
-- SELECT public.platform_reconcile_subscription('stripe','<company>','<plan>','cus_1','sub_1',
--   'active', NULL, now(), now()+interval '30 days', false, NULL, now(), '{}'::jsonb);
-- -- rodar de novo com mesmo sub_1 => atualiza, não duplica.

-- 3) Unicidade de assinatura ativa por empresa (herdado da Fase 13)
-- SELECT public.platform_reconcile_subscription('stripe','<c>','<p1>','cus_1','sub_1','active',...);
-- SELECT public.platform_reconcile_subscription('stripe','<c>','<p2>','cus_1','sub_2','active',...);
-- -- a primeira (sub_1) deve virar 'canceled'.

-- 4) RLS platform_provider_prices
-- SET request.jwt.claims TO authenticated_user;    SELECT count(*) FROM public.platform_provider_prices;  -- ok (leitura pública autenticada)
-- SET request.jwt.claims TO authenticated_user;    INSERT INTO public.platform_provider_prices(...);       -- deve falhar
-- SET request.jwt.claims TO platform_admin;        INSERT INTO public.platform_provider_prices(...);       -- ok

-- 5) RLS platform_provider_customers
-- owner_A vê customers da company_A; owner_B não vê.
-- platform_admin escreve; owner não escreve.

-- 6) Views
-- SELECT * FROM public.v_platform_webhook_health;
-- SELECT * FROM public.v_platform_webhook_unprocessed;

-- 7) Fluxo completo (Stripe invoice.paid)
-- BEGIN;
--   WITH e AS (SELECT * FROM public.platform_webhook_register_event('stripe','invoice.paid','evt_1','{}'::jsonb))
--   SELECT public.platform_reconcile_invoice('stripe','<c>','<sub>','in_1','paid','BRL',9900,9900,now(),NULL,now(),NULL,NULL,'{}'::jsonb);
--   SELECT public.platform_reconcile_payment('stripe','<c>','<inv>','pi_1','succeeded',9900,'BRL','card',now(),'{}'::jsonb);
--   SELECT public.platform_webhook_mark_processed('<event_id>');
-- COMMIT;
