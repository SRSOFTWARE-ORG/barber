# Fase 10 — Checklist (WhatsApp / Evolution)

## Como aplicar
1. Abra o SQL Editor do Supabase.
2. Cole e execute `phase10_whatsapp.sql` inteiro.
3. Confirme que não houve erros no output.

## Verificações estruturais
- [ ] Tabelas criadas: `wa_channels`, `wa_templates`, `wa_messages`, `wa_webhook_events`, `wa_message_audit`.
- [ ] Enums: `wa_channel_status`, `wa_message_direction`, `wa_message_status`, `wa_template_category`, `wa_template_status`.
- [ ] Funções: `wa_render_template`, `wa_enqueue_message`, `wa_cancel_message`.
- [ ] Triggers: auditoria de mensagens (INSERT/UPDATE), immutabilidade de auditoria e webhook.
- [ ] RLS habilitado em todas as 5 tabelas.

## Verificações funcionais
- [ ] Criar um `wa_channel` (owner/manager).
- [ ] Criar `wa_template` com `status='active'` e variáveis (`{{nome}}`).
- [ ] Chamar `wa_enqueue_message(...)` — mensagem entra em `queued`.
- [ ] Alterar `status` da mensagem gera linha em `wa_message_audit` (não editável).
- [ ] `wa_cancel_message` funciona apenas para `queued|sending`.

## Verificações de segurança
- Rode `phase10_rls_tests.sql` seguindo os cenários (owner A, owner B, manager, barbeiro, cliente, platform admin).
- [ ] Isolamento entre empresas.
- [ ] Barbeiro/cliente NÃO alteram canais/templates.
- [ ] `wa_message_audit` e `wa_webhook_events` são append-only (respeitando exceção `processed_at`/`process_error`).

## Rollback
- Execute `phase10_rollback.sql` para remover a fase por completo.

## Próximo passo
Após validar, avise para iniciar a **Fase 11 (Notificações internas, e-mail e preferências de comunicação)**.
