-- =====================================================================
-- FASE 11 — Testes de RLS (Notificações)
-- =====================================================================

-- 1) Usuário só enxerga as próprias notificações
--   SET request.jwt.claims TO user_x
--   SELECT count(*) FROM public.notifications WHERE user_id <> auth.uid(); -- 0

-- 2) Owner/manager da empresa A vê notificações da empresa A
--   SELECT count(*) FROM public.notifications WHERE company_id = '<company_a>'; -- > 0

-- 3) Usuário edita apenas suas próprias preferências
--   INSERT INTO public.communication_preferences(user_id, company_id, category, email)
--     VALUES ('<other_user>', '<company_a>', 'marketing', false); -- deve falhar (WITH CHECK)

-- 4) Auditoria é append-only
--   UPDATE public.notification_audit SET metadata='{}'::jsonb WHERE id='<x>'; -- falha
--   DELETE FROM public.notification_audit WHERE id='<x>';                     -- falha

-- 5) notif_enqueue respeita preferências
--   -- Desliga marketing por e-mail:
--   INSERT INTO public.communication_preferences(user_id, company_id, category, email)
--     VALUES (auth.uid(), '<company_a>', 'marketing', false)
--     ON CONFLICT (user_id, company_id, category) DO UPDATE SET email = EXCLUDED.email;
--   SELECT public.notif_enqueue('<company_a>', auth.uid(), 'email','marketing','oi','sub','x@y.com');
--   -- Notificação deve ficar em status='skipped'

-- 6) Categoria 'security' ignora preferência (sempre enfileira)
--   SELECT public.notif_enqueue('<company_a>', auth.uid(), 'email','security','alerta','sub','x@y.com');
--   -- status='queued'

-- 7) Templates: barbeiro/cliente NÃO edita
--   INSERT INTO public.email_templates(company_id, code, name, subject, body_html)
--     VALUES ('<company_a>','x','x','x','x'); -- falha para não-owner/manager

-- 8) Marcar como lida
--   SELECT public.notif_mark_read('<my_notif_id>'); -- ok
--   SELECT public.notif_mark_read('<other_user_notif_id>'); -- erro

-- 9) v_notifications_unread_count filtrada por RLS
--   SELECT * FROM public.v_notifications_unread_count; -- somente linhas próprias/da empresa
