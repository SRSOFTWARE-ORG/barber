-- =====================================================================
-- FASE 12 — Testes de RLS e comportamento (Fila de envio)
-- =====================================================================

-- 1) Auto-enfileiramento
--   INSERT INTO public.notifications(company_id, user_id, channel, category, body)
--     VALUES ('<company_a>', '<user>', 'email','transactional','oi');
--   SELECT * FROM public.dispatch_queue WHERE ref_table='notifications' ORDER BY created_at DESC LIMIT 1;

-- 2) Claim/complete (service_role)
--   SELECT public.dispatch_worker_heartbeat('worker-email','email');
--   SELECT * FROM public.dispatch_claim('<worker_id>','notification',5,60);
--   SELECT public.dispatch_complete('<queue_id>','<worker_id>','success',200,NULL,'{}'::jsonb);

-- 3) Backoff exponencial
--   SELECT public.dispatch_backoff_seconds(1);   -- ~15–25s
--   SELECT public.dispatch_backoff_seconds(5);   -- ~480s

-- 4) DLQ ao esgotar max_attempts
--   -- forçar erros permanentes:
--   SELECT public.dispatch_complete('<queue_id>','<worker_id>','permanent_error',500,'boom','{}'::jsonb);
--   SELECT * FROM public.dispatch_dead_letter ORDER BY moved_at DESC LIMIT 1;

-- 5) RLS
--   SET request.jwt.claims TO barber_A -- barbeiro não vê dispatch_queue
--   SELECT count(*) FROM public.dispatch_queue; -- 0
--   SET request.jwt.claims TO owner_A
--   SELECT count(*) FROM public.dispatch_queue WHERE company_id='<company_a>'; -- >0
--   SELECT count(*) FROM public.dispatch_queue WHERE company_id='<company_b>'; -- 0

-- 6) Reap de locks expirados
--   UPDATE public.dispatch_queue SET status='sending', lock_expires_at=now()-interval '5 min' WHERE id='<x>';
--   SELECT public.dispatch_reap_locks();  -- devolve para queued

-- 7) Requeue da DLQ
--   SELECT public.dispatch_requeue_from_dlq('<dlq_id>');

-- 8) attempts append-only
--   UPDATE public.dispatch_attempts SET queue_id = gen_random_uuid() WHERE id='<x>'; -- falha
--   DELETE FROM public.dispatch_attempts WHERE id='<x>';                              -- falha

-- 9) Observabilidade
--   SELECT * FROM public.v_dispatch_queue_stats;
--   SELECT * FROM public.v_dispatch_worker_health;
--   SELECT * FROM public.v_dispatch_recent_failures LIMIT 20;
--   SELECT * FROM public.v_dispatch_throughput_hourly LIMIT 20;
