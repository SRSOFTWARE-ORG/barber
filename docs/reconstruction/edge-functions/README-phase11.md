# Fase 11 — Deploy das Edge Functions

## Segredos (Supabase → Project Settings → Edge Functions → Secrets)
- `STRIPE_SECRET_KEY` — `sk_live_...` ou `sk_test_...`
- `STRIPE_WEBHOOK_SECRET` — `whsec_...` (do endpoint criado no Stripe)
- `APP_URL` — ex.: `https://app.suabarbearia.com`
- (já existem) `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Deploy (CLI)
```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```
> O webhook precisa ser público (sem JWT) porque quem chama é o Stripe.

## Stripe Dashboard
1. Products → crie os planos Pro e Premium; copie os `price_id`.
2. Rode no SQL:
   ```sql
   update public.platform_plans set stripe_price_id='price_XXX' where code='pro';
   update public.platform_plans set stripe_price_id='price_YYY' where code='premium';
   ```
3. Developers → Webhooks → Add endpoint:
   - URL: `https://<PROJECT>.functions.supabase.co/stripe-webhook`
   - Eventos:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.trial_will_end`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copie o `whsec_...` para o secret `STRIPE_WEBHOOK_SECRET`.

## Fluxo
- Usuário clica **Assinar** → `stripe-checkout` retorna URL → redireciona.
- Stripe finaliza → dispara webhook → `company_subscriptions` é atualizado com
  status/`trial_ends_at`/`current_period_end`.
- Trial de 14 dias: aplicado no Stripe (`trial_period_days`) e também
  garantido no banco pela função `apply_trial_if_first` (fallback para
  inserções manuais/admin).
- **Portal de gestão**: botão chama `stripe-portal` e abre o Billing Portal do
  Stripe (mudar plano, cartão, cancelar) sem sair do app.
- **Auditoria**: cada mudança de status/plano grava em `subscription_audit`
  (visível por CEO/owner/admin da empresa e platform_admins).
