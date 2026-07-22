# Fase 13 — Checklist (Assinaturas SaaS da plataforma)

Diferença importante em relação à Fase 7:
- Fase 7 = assinaturas de **clientes DENTRO da barbearia** (planos internos).
- Fase 13 = assinatura da **EMPRESA na plataforma** (Starter/Pro/Scale, etc.).

## Aplicar
1. Rode `phase13_platform_saas.sql` no SQL Editor.
2. (Opcional) Rode o bloco de seed no `phase13_rls_tests.sql` como service_role para criar planos Starter/Pro/Scale.

## Estrutura
- [ ] Enums: `platform_plan_status`, `platform_billing_cycle`, `platform_sub_status`, `platform_invoice_status`, `platform_payment_status`, `platform_provider`.
- [ ] Tabelas: `platform_plans`, `platform_plan_limits`, `platform_subscriptions`, `platform_invoices`, `platform_invoice_items`, `platform_payments`, `platform_billing_events`, `platform_usage_counters`.
- [ ] Índice único parcial garante 1 assinatura ativa por empresa.
- [ ] `platform_billing_events` append-only.
- [ ] Funções: `platform_active_subscription`, `platform_limit_for`, `platform_check_quota`, `platform_usage_increment`, `platform_consume`.
- [ ] Views: `v_platform_subscription_status`, `v_platform_usage_snapshot`.
- [ ] RLS habilitado em todas as 8 tabelas.

## Regras
- [ ] Membros da empresa (owner/manager) lêem sua assinatura, faturas, pagamentos e uso.
- [ ] Somente platform_admin escreve em planos, assinaturas, faturas, pagamentos.
- [ ] Barbeiros/clientes NÃO vêem cobrança.
- [ ] Cotas mensais rodam sob `period_month = date_trunc('month', now())`.
- [ ] `platform_consume` bloqueia com `quota_exceeded` quando estoura limite.

## Integração com fases anteriores
Chame `platform_consume(company_id, 'bookings_month')` no fluxo de criação de booking, e `platform_consume(company_id, 'wa_messages_month')` ao enfileirar wa_messages, para aplicar limites em runtime. (A integração automática via trigger fica para uma fase de "policy engine"; por ora, use as funções nas edge functions/backend.)

## Provedores
- Campos `provider`, `provider_customer_id`, `provider_subscription_id`, `provider_invoice_id`, `provider_payment_id` já preparados para Stripe/Paddle.
- Webhooks devem gravar em `platform_billing_events` (UNIQUE (provider, external_id) para idempotência) e depois reconciliar com as tabelas normalizadas.

## RLS (rode `phase13_rls_tests.sql`)
- Cenários incluídos: isolamento entre empresas, barbeiro sem acesso, unicidade de assinatura ativa, quota_exceeded, unlimited, append-only de eventos.

## Rollback
- Execute `phase13_rollback.sql`.

## Próximo passo
Após validar, avise para iniciar a **Fase 14 (Webhook de billing: Stripe/Paddle — reconciliação e idempotência)**.
