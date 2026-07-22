# Checklist Fases 15 a 30 — Reconstrução Barber Shop

Ordem de execução no SQL Editor do Supabase (dependência de Fases 1–14 já aplicadas):

| Fase | Arquivo | Depende de | Status |
| --- | --- | --- | --- |
| 15 | `phase15_billing_portal.sql` | 13, 14 | [ ] |
| 16 | `phase16_onboarding.sql` | 2 | [ ] |
| 17 | `phase17_feature_flags.sql` | 2 | [ ] |
| 18 | `phase18_integrations.sql` | 2, 6 | [ ] |
| 19 | `phase19_pwa_offline.sql` | 2 | [ ] |
| 20 | `phase20_mobile_capacitor.sql` | 2 | [ ] |
| 21 | `phase21_i18n.sql` | — | [ ] |
| 22 | `phase22_marketing_site.sql` | 2 | [ ] |
| 23 | `phase23_analytics_kpi.sql` | 2, 6 | [ ] |
| 24 | `phase24_reviews_nps.sql` | 4, 5, 6 | [ ] |
| 25 | `phase25_affiliates.sql` | 2, 13 | [ ] |
| 26 | `phase26_loyalty.sql` | 4, 6 | [ ] |
| 27 | `phase27_support_tickets.sql` | 2 | [ ] |
| 28 | `phase28_lgpd_privacy.sql` | 2, 4 | [ ] |
| 29 | `phase29_backups_dr.sql` | — | [ ] |
| 30 | `phase30_release_observability.sql` | 2 | [ ] |

## Como rodar
1. Abra o SQL Editor do Supabase.
2. Cole o conteúdo de cada `phaseNN_*.sql` em ordem crescente e execute.
3. Se falhar, use `phases_15_30_rollback.sql` (idempotente, ordem inversa).

## Validações rápidas (por fase)
- **15** Billing portal: `select count(*) from public.billing_portal_sessions;` (0 rows, sem erro).
- **16** Onboarding: `select public.onboarding_advance` existe em `pg_proc`.
- **17** Feature flags: `select public.feature_enabled('00000000-0000-0000-0000-000000000000','x');` retorna `false`.
- **18** Integrations: tabelas `integrations`, `integration_tokens`, `calendar_sync_map` com RLS on.
- **19** Offline: `offline_mutations` com unique `(user_id, client_mutation_id)`.
- **20** Mobile: `mobile_app_versions` com unique `(platform, version)`.
- **21** i18n: `select code from public.locales;` inclui `pt-BR`, `en-US`, `es-ES`.
- **22** Marketing: `leads` aceita insert de `anon`.
- **23** Analytics: view `v_bookings_daily` retorna linhas quando existem bookings.
- **24** Reviews: unique `(booking_id)` impede duas reviews da mesma reserva.
- **25** Afiliados: `affiliates.code` unique.
- **26** Loyalty: `loyalty_apply` grava transação e atualiza saldo.
- **27** Suporte: cliente vê apenas seus tickets; staff vê tudo.
- **28** LGPD: `dsr_requests` aceita insert de `anon`.
- **29** Backups: apenas `platform_admin` lê `backup_runs`.
- **30** Observabilidade: `error_events` aceita insert autenticado; leitura restrita a staff.

## RLS smoke tests (executar como cada persona via `set local role`/JWT)
- Owner de empresa A não vê dados de empresa B em qualquer tabela nova com `company_id`.
- Barbeiro não vê `platform_invoices`, `backup_runs`, `error_events`, tickets alheios.
- Cliente final vê apenas: seus consents, seus reviews, seu loyalty_account, seus tickets, seu nps.
- Platform admin vê tudo.
- `anon` só grava em `leads`, `dsr_requests`, `privacy_consents` (nunca lê tabelas privadas).

## Rollback
Rode `phases_15_30_rollback.sql` inteiro. Ele derruba tudo da 30 para a 15 sem afetar Fases 1–14.
