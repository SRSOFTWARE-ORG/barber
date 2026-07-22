# Fase 11 — Checklist (Notificações, e-mail e preferências)

## Aplicar
1. Rode `phase11_notifications.sql` no SQL Editor.
2. Verifique se não houve erros.

## Estrutura
- [ ] Enums: `notif_channel`, `notif_category`, `notif_status`, `notif_priority`, `email_template_status`.
- [ ] Tabelas: `email_templates`, `communication_preferences`, `notifications`, `notification_audit`.
- [ ] View: `v_notifications_unread_count`.
- [ ] Funções: `notif_render`, `notif_channel_allowed`, `notif_enqueue`, `notif_mark_read`, `notif_mark_all_read`, `notif_cancel`.
- [ ] Triggers de auditoria e imutabilidade ativos.
- [ ] RLS habilitado em todas as tabelas.

## Regras funcionais
- [ ] Preferência salva por usuário / (empresa opcional) / categoria.
- [ ] `notif_enqueue` grava `skipped` se preferência bloquear canal.
- [ ] Categorias `security | system | financial` ignoram preferências.
- [ ] `notif_mark_read` e `notif_mark_all_read` funcionam para o próprio usuário.
- [ ] `notification_audit` recebe linha em INSERT e em mudanças de status.
- [ ] `notification_audit` bloqueia UPDATE/DELETE.

## RLS (rode `phase11_rls_tests.sql`)
- [ ] Usuário só vê suas notificações e suas preferências.
- [ ] Owner/manager veem notificações da empresa.
- [ ] Platform staff enxerga tudo.
- [ ] Barbeiro/cliente NÃO edita templates.

## Rollback
- Rode `phase11_rollback.sql`.

## Próximo passo
Após validar, avise para iniciar a **Fase 12 (Fila de envio: workers, retries e observabilidade)**.
