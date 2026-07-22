-- =====================================================================
-- FASE 13 — Testes de RLS e limites
-- =====================================================================

-- 0) Seed mínimo (rode como service_role)
-- INSERT INTO public.platform_plans(code,name,status,billing_cycle,price_cents,currency,trial_days,is_public)
--   VALUES ('starter','Starter','active','monthly', 9900,'BRL',14,true),
--          ('pro',    'Pro',    'active','monthly',29900,'BRL', 7,true),
--          ('scale',  'Scale',  'active','monthly',79900,'BRL', 0,true)
--   ON CONFLICT (code) DO NOTHING;
-- INSERT INTO public.platform_plan_limits(plan_id, metric, max_value, is_unlimited)
--   SELECT id, m.metric, m.max_value, m.is_unlimited FROM public.platform_plans p
--   JOIN (VALUES
--     ('starter','units',      1, false),
--     ('starter','barbers',    3, false),
--     ('starter','bookings_month', 300, false),
--     ('starter','wa_messages_month', 200, false),
--     ('pro','units',    3, false),
--     ('pro','barbers', 10, false),
--     ('pro','bookings_month', 2000, false),
--     ('pro','wa_messages_month', 2000, false),
--     ('scale','units', 0, true),
--     ('scale','barbers', 0, true),
--     ('scale','bookings_month', 0, true),
--     ('scale','wa_messages_month', 0, true)
--   ) AS m(code, metric, max_value, is_unlimited) ON m.code = p.code
--   ON CONFLICT (plan_id, metric) DO NOTHING;

-- 1) Um único active/trial por empresa
--   INSERT INTO public.platform_subscriptions(company_id, plan_id, status)
--     VALUES ('<c>','<plan>','active');
--   INSERT INTO public.platform_subscriptions(company_id, plan_id, status)
--     VALUES ('<c>','<plan>','active');  -- deve violar índice único parcial

-- 2) RLS
--   SET request.jwt.claims TO owner_A
--   SELECT * FROM public.platform_subscriptions WHERE company_id='<company_a>';  -- ok
--   SELECT * FROM public.platform_subscriptions WHERE company_id='<company_b>';  -- 0
--   SET request.jwt.claims TO barber_A
--   SELECT count(*) FROM public.platform_subscriptions; -- 0
--   SET request.jwt.claims TO platform_admin
--   INSERT INTO public.platform_plans(code,name,status) VALUES ('demo','Demo','active'); -- ok

-- 3) Cotas
--   -- starter: bookings_month=300
--   SELECT public.platform_consume('<company_starter>','bookings_month',1);  -- ok
--   -- forçar excesso:
--   SELECT public.platform_usage_increment('<company_starter>','bookings_month',299);
--   SELECT public.platform_check_quota('<company_starter>','bookings_month',2); -- exceção quota_exceeded

-- 4) Unlimited
--   SELECT public.platform_check_quota('<company_scale>','bookings_month',10000);  -- true

-- 5) Eventos de billing append-only
--   INSERT INTO public.platform_billing_events(provider, event_type, external_id, payload)
--     VALUES ('stripe','invoice.paid','evt_1','{}'::jsonb);
--   UPDATE public.platform_billing_events SET payload='{"x":1}'::jsonb WHERE external_id='evt_1';  -- deve falhar
--   UPDATE public.platform_billing_events SET processed_at=now() WHERE external_id='evt_1';        -- ok
--   DELETE FROM public.platform_billing_events WHERE external_id='evt_1';                          -- deve falhar

-- 6) Views
--   SELECT * FROM public.v_platform_subscription_status WHERE company_id='<company_a>';
--   SELECT * FROM public.v_platform_usage_snapshot WHERE company_id='<company_a>';
