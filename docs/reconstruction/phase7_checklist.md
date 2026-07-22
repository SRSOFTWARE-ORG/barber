# Fase 7 — Checklist de validação

## Ordem de execução no SQL Editor
1. `docs/reconstruction/phase7_subscriptions.sql`
2. (Opcional) `docs/reconstruction/phase7_rls_tests.sql` — trocar UUIDs
3. Rollback disponível em `docs/reconstruction/phase7_rollback.sql`

## Estruturas criadas
- [ ] Enum `subscription_status` (`pending|active|paused|cancelled|expired`)
- [ ] Enum `billing_cycle` (`monthly|quarterly|yearly`)
- [ ] `subscription_plans` (planos internos por empresa)
- [ ] `plan_services` (cobertura + quota mensal + desconto)
- [ ] `client_subscriptions` (com índice único de assinatura ativa por cliente)
- [ ] `subscription_usage` (consumo por mês)
- [ ] `revenue_splits` (60/40, único por booking)
- [ ] Trigger `trg_booking_split` em `bookings` (gera split ao completar)
- [ ] Views `v_monthly_coverage_report`, `v_monthly_barber_split`

## Coerência
- [ ] Insert em `plan_services` com plano/serviço de empresas diferentes falha
- [ ] Insert em `client_subscriptions` com client/plan de outra empresa falha
- [ ] Segundo `pending/active/paused` para o mesmo cliente/empresa falha (índice único)

## RLS
- [ ] Owner/manager: CRUD em planos, plan_services e client_subscriptions da própria empresa
- [ ] Barbeiro: vê apenas seus `revenue_splits`; NÃO vê assinaturas de terceiros
- [ ] Cliente final: vê apenas a própria assinatura e o próprio `subscription_usage`
- [ ] Platform staff: vê tudo em todas as empresas
- [ ] Nenhum usuário consegue INSERT direto em `revenue_splits` (trigger + service_role)

## Split 60/40
- [ ] Ao setar `bookings.status='completed'`, cria-se linha em `revenue_splits`
- [ ] `barber_share` = 60% de `sum(booking_services.price_charged)`
- [ ] `house_share` = 40%
- [ ] `covered_by_subscription=true` quando o cliente tem assinatura ativa

## Cobertura
- [ ] `check_coverage(sub, service)` retorna `{covered, quota, used, remaining, discount_percent, exhausted}`
- [ ] `remaining=null` quando `monthly_quota` é nulo (ilimitado)
- [ ] `exhausted=true` quando `used >= quota`

## UI
- [ ] `/subscriptions` lista/cria/edita planos, gerencia cobertura e assinaturas
- [ ] Exportação CSV do relatório mensal disponível para owner/manager/platform staff
