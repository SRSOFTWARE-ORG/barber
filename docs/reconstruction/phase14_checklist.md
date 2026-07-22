# Fase 14 — Checklist (Webhook de billing: Stripe/Paddle)

## Aplicar
1. Confirme que a Fase 13 (`phase13_platform_saas.sql`) já rodou.
2. Rode `phase14_billing_webhooks.sql` no SQL Editor.
3. (Opcional) Rode os cenários de `phase14_rls_tests.sql`.

## Estrutura
- [ ] Tabelas: `platform_provider_prices`, `platform_provider_customers`.
- [ ] Funções: `platform_webhook_register_event`, `platform_webhook_mark_processed`,
      `platform_reconcile_subscription`, `platform_reconcile_invoice`,
      `platform_reconcile_payment`.
- [ ] Views: `v_platform_webhook_health`, `v_platform_webhook_unprocessed`.
- [ ] Todas as funções `SECURITY DEFINER` com `EXECUTE` apenas para `service_role`.

## Idempotência
- [ ] `register_event` retorna `inserted=false` para `(provider, external_id)` duplicado.
- [ ] Reconcilers de subscription/invoice/payment fazem UPSERT por id do provedor.
- [ ] Ordem correta no webhook: **register_event → reconcile_* → mark_processed**.
- [ ] Erros persistem `error_message` via `mark_processed(event_id, err)` e permitem retry.

## Reconciliação
- [ ] `platform_reconcile_subscription` encerra outras ativas da mesma empresa.
- [ ] `platform_reconcile_invoice` liga a fatura ao `subscription_id` correto.
- [ ] `platform_reconcile_payment` liga o pagamento à `invoice_id` correta.
- [ ] Mapeamento `provider_customer_id → company_id` via `platform_provider_customers`
      é gravado no primeiro evento.

## Edge functions (fora do SQL)
- Stripe webhook: usa `constructEventAsync` com `STRIPE_WEBHOOK_SECRET`, chama
  `platform_webhook_register_event`, e em `inserted=true` executa os reconcilers.
- Paddle webhook: valida assinatura HMAC e segue o mesmo fluxo.
- Ambos rodam com `verify_jwt = false` e usam `SUPABASE_SERVICE_ROLE_KEY`.
- Ver `docs/reconstruction/edge-functions/stripe-webhook/index.ts` como referência
  para adaptação ao novo esquema `platform_*`.

## RLS
- [ ] `platform_provider_prices` legível por qualquer usuário autenticado; escrita
      só para `platform_admin`.
- [ ] `platform_provider_customers` legível por membros da empresa e
      `platform_admin`; escrita só para `platform_admin`.
- [ ] Reconcilers só podem ser executados pelo `service_role` (edge functions).

## Rollback
- Rode `phase14_rollback.sql`.

## Próximo passo
Após validar, avise para iniciar a **Fase 15 (Portal de billing self-service: trocar plano, atualizar cartão, ver faturas)**.
