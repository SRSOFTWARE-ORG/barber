# Reconstrução Barber Shop — Plano de Fases

Backend: **Supabase próprio** (`ddrwahpcbsbxhflhskuh`) — todas as migrations
são entregues como arquivos SQL em `docs/reconstruction/` para você executar
manualmente no **SQL Editor**.

## Ordem de execução

| Fase | Escopo | Entregável | Status |
|------|--------|-----------|--------|
| **1** | Núcleo multi-tenant: companies, units, profiles, user_roles, platform_admins (super-admin configurável), audit_logs, RLS, triggers | `phase1_core.sql` | ✅ pronto |
| **2** | Clientes, barbeiros (multi-unidade), categorias, serviços, barber_services (comissão override) + storage buckets | `phase2_catalog.sql` | ✅ pronto |

| **3** | Agendamentos, status, bloqueios (isolados por barbeiro), exclusion constraints anti-conflito, coerência multi-tenant | `phase3_bookings.sql` | ✅ pronto |
| **4** | Planos de assinatura + serviços cobertos + saldo/quota por ciclo + selo PLANO + trigger de cobertura em bookings | `phase4_plans.sql` | ✅ pronto |
| **5** | Financeiro: contas, categorias, transações, pagamentos, comissões automáticas, **pote de assinaturas 60/40**, meritocracia, payouts | `phase5_finance.sql` | ✅ pronto |
| **6** | Avaliações (só clientes, 1 por booking, com resposta), portfólio (imagens/vídeos/gifs) por barbeiro/empresa, banners/carrossel com janela de exibição | `phase6_engagement.sql` | ✅ pronto |
| **7** | Mensageria: templates, prefs, outbox (fila+retries+dedupe), WhatsApp via Evolution (envio + webhook inbound/status), push (stub), e-mail (Resend), triggers de booking | `phase7_messaging.sql` + `edge-functions/messaging-dispatcher` + `edge-functions/evolution-webhook` | ✅ pronto |
| **8** | Afiliados: programa por empresa, código/link, tracking de referências, comissão recorrente sobre assinaturas e bookings, payouts | `phase8_affiliates.sql` | ✅ pronto |
| **9** | Dashboards por papel (KPIs por empresa/barbeiro/plataforma), feature flags SaaS + PWA premium, analytics de produto (eventos) | `phase9_analytics.sql` | ✅ pronto |

Cada fase inclui **auditoria de consistência** antes de fechar
(FKs, índices, RLS, triggers, grants) e um checklist frontend↔backend.

## Como executar a Fase 1

1. Abra o SQL Editor do seu Supabase:
   https://supabase.com/dashboard/project/ddrwahpcbsbxhflhskuh/sql/new
2. Cole o conteúdo de `docs/reconstruction/phase1_core.sql` e execute.
3. Faça login uma vez em `/auth` com **srcj9975@gmail.com** (Google ou senha)
   para criar a linha em `auth.users`.
4. Volte ao SQL Editor e rode o bloco de bootstrap do CEO no final do arquivo.
5. (Opcional) Rode `npx supabase gen types typescript --project-id ddrwahpcbsbxhflhskuh > src/integrations/supabase/types.ts` para atualizar os tipos e remover o `as any` do AuthContext.

## Decisões travadas

- **Super-admin configurável**: tabela `platform_admins` (roles `ceo`/`suporte`).
  Frontend não tem mais allowlist por email.
- **Roles de empresa**: `proprietario`, `gerente`, `barbeiro`, `cliente`
  em `user_roles`, sempre escopadas por `company_id` (+ `unit_id` opcional).
- **Auditoria**: trigger genérico `audit_row_change()` aplicado em
  cada tabela crítica; `audit_logs` guarda `old_data`/`new_data` em jsonb.
- **Timezone**: banco em UTC; empresa define timezone próprio; conversão no
  frontend/edge functions.
- **Storage buckets** (criados na fase 2): `avatars`, `logos`, `portfolio`,
  `services`, `banners`, `videos`, `documents`, `support`.

## Reaproveitamento do frontend existente

Mantidos (após audit): `contexts/AuthContext`, `contexts/LanguageContext`,
`contexts/ThemeContext`, `components/ui/*` (shadcn), `SocialAuthButtons`,
`ProtectedRoute`, `Seo`, `BottomNav`, `SplashScreen`, `NavLink`, `LazyVisible`.

A serem reescritos em fases posteriores: painéis específicos
(`CeoDashboard`, `FinanceiroPanel`, `WhatsApp*`, `PlanosPanel`, `AdminCalendar`)
para usar o novo schema multi-tenant.
