# Fase 1 — Relatório de Auditoria

Preencha após rodar `phase1_audit.sql`. Cada seção corresponde a um bloco `=== N. ... ===` do script.

## Contexto
- Data da auditoria:
- Projeto Supabase: `ddrwahpcbsbxhflhskuh`
- Estado declarado: banco vazio (a confirmar via bloco 3)
- Executor:

## Sumário executivo
- [ ] Banco vazio confirmado (bloco 3 sem tabelas ou apenas tabelas de auth/storage)
- [ ] Auth habilitado (bloco 18/19)
- [ ] Storage sem buckets legados (bloco 16)
- [ ] Nenhuma extensão inesperada (bloco 1)
- [ ] Nenhuma tabela com RLS off (bloco 22)
- [ ] Nenhuma tabela órfã (bloco 20)
- [ ] Nenhuma tabela sem PK (bloco 21)

## Achados (bloco a bloco)
### 1. Versão / extensions
### 2. Schemas
### 3. Tabelas + tamanho
### 4. Colunas
### 5. PK/Unique
### 6. Foreign keys
### 7. Check constraints
### 8. Índices
### 9. RLS status
### 10. Policies
### 11. Funções (SECURITY DEFINER)
### 12. Triggers
### 13. Views
### 14. Enums
### 15. Sequências
### 16. Storage buckets
### 17. Policies de storage
### 18. Provedores de auth
### 19. Contagem de usuários
### 20. Tabelas órfãs
### 21. Tabelas sem PK
### 22. RLS desligada
### 23. Cron jobs

## Plano de reconstrução (saída da Fase 1)
Se o banco estiver vazio, o plano é aplicar as fases nesta ordem, sem pular:

1. Fase 2 — Multi-tenant (`companies`, `units`, `company_settings`, `profiles`, `roles`, `permissions`, `role_permissions`)
2. Fase 3 — Auth & Security (`login_logs`, `security_events`, `active_sessions`, `audit_events`)
3. Fase 4 — Clientes
4. Fase 5 — Barbeiros
5. Fase 6 — Serviços
6. Fase 7 — Agenda (+ regra crítica de bloqueio por barbeiro/unidade)
7. Fase 8 — Horários e fusos (UTC no banco, conversão na borda)
8. Fase 9 — Planos de assinatura (+ selo 🏷️ PLANO / `is_from_plan`)
9. Fase 10 — Agendamento pelo barbeiro (mesma trilha do cliente)
10. Fase 11 — Financeiro
11. Fase 12 — Comissões
12. Fase 13 — Pote de assinaturas
13. Fase 14 — Meritocracia
14. Fase 15 — Avaliações (só cliente avalia)
15. Fase 16 — Afiliados (recorrente)
16. Fase 17 — WhatsApp (Evolution, retry/queue/reconexão)
17. Fase 18 — Notificações
18. Fase 19 — Storage/mídia
19. Fase 20 — Portfólio
20. Fase 21 — Banners
21. Fase 22 — Suporte
22. Fase 23 — Marketplace (estrutura)
23. Fase 24 — Dashboards por papel
24. Fase 25 — Feriados/eventos
25. Fase 26 — Analytics
26. Fase 27 — Auditoria absoluta
27. Fase 28 — Performance
28. Fase 29 — PWA premium
29. Fase 30 — Validação final

## Regras transversais confirmadas para todas as fases
- Toda regra crítica deve existir em **frontend + backend/edge + banco** (constraints/triggers/RLS).
- Isolamento por `company_id` **e** `unit_id` em toda leitura/escrita.
- Timestamps em UTC no banco; timezone da empresa aplicado na borda.
- Soft delete e histórico onde a Fase 27 exigir; nunca hard delete de entidades transacionais.
- Nenhuma tabela em `public` sem PK e sem RLS.
- Nenhum bucket público sem policy explícita.
- Sem lógica de negócio duplicada em tabelas — reusar via FK.

## Decisão de continuidade
- [ ] Auditoria aprovada — liberar Fase 2
- [ ] Auditoria reprovada — pendências abaixo:
