-- =====================================================================
-- FASE 10 — Testes de RLS (WhatsApp / Evolution)
-- Execute como service_role para preparar dados; troque JWT para simular usuários.
-- =====================================================================

-- 1) Owner da empresa A deve enxergar apenas canais/templates/mensagens da empresa A
--   SET request.jwt.claims TO owner_A
--   SELECT count(*) FROM public.wa_channels;         -- só da empresa A
--   SELECT count(*) FROM public.wa_templates;        -- só da empresa A
--   SELECT count(*) FROM public.wa_messages;         -- só da empresa A

-- 2) Manager pode criar template/canal/mensagem
--   INSERT INTO public.wa_templates(company_id, code, name, body, status)
--     VALUES ('<company_a>', 'lembrete', 'Lembrete', 'Olá {{nome}}', 'active');
--   SELECT public.wa_enqueue_message('<company_a>', '+5511999999999', 'Teste', NULL, '{}'::jsonb);

-- 3) Barbeiro/cliente da empresa A NÃO deve conseguir alterar canais/templates
--   UPDATE public.wa_channels SET name = 'hack' WHERE company_id = '<company_a>'; -- deve retornar 0
--   INSERT INTO public.wa_templates(company_id, code, name, body) VALUES ('<company_a>','x','x','x'); -- 42501

-- 4) Owner da empresa B NÃO deve enxergar dados da empresa A
--   SET request.jwt.claims TO owner_B
--   SELECT count(*) FROM public.wa_messages WHERE company_id = '<company_a>';  -- 0

-- 5) Auditoria é append-only
--   UPDATE public.wa_message_audit SET note = 'x' WHERE id = '<any>';  -- deve falhar
--   DELETE FROM public.wa_message_audit WHERE id = '<any>';            -- deve falhar

-- 6) Webhook events append-only (exceto processed_at/process_error)
--   UPDATE public.wa_webhook_events SET payload = '{}'::jsonb WHERE id = '<any>'; -- deve falhar
--   UPDATE public.wa_webhook_events SET processed_at = now() WHERE id = '<any>';   -- deve permitir

-- 7) Platform admin vê tudo
--   SET request.jwt.claims TO platform_admin
--   SELECT count(*) FROM public.wa_messages;   -- total geral

-- 8) Cancelamento
--   SELECT public.wa_cancel_message('<queued_msg_id>');  -- ok
--   SELECT public.wa_cancel_message('<sent_msg_id>');    -- erro

-- 9) Render de template
--   SELECT public.wa_render_template('Olá {{nome}}, seu horário é {{hora}}',
--          jsonb_build_object('nome','João','hora','14:00'));
