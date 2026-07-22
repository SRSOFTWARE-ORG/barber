# Fase 9 — Checklist de validação

## Ordem de execução
1. `docs/reconstruction/phase9_finance_audit.sql`
2. (Opcional) `docs/reconstruction/phase9_rls_tests.sql`
3. Rollback: `docs/reconstruction/phase9_rollback.sql`

## Estruturas
- [ ] Enums `fin_audit_kind`, `export_format`
- [ ] `financial_audit_events` (append-only via trigger `tg_fae_no_mutate`)
- [ ] `accounting_exports` (registro de cada exportação com checksum)
- [ ] View `v_financial_timeline`

## Triggers geradoras (auto-populate)
- [ ] Insert em `revenue_splits` → `split_created`
- [ ] Update `revenue_splits.paid_payout_id` (null→uuid) → `split_paid`
- [ ] Insert em `period_closings` → `closing_created`
- [ ] Update `period_closings.status` → `closing_closed` / `closing_reopened`
- [ ] Insert em `payouts` → `payout_created`
- [ ] Update em `payouts` → `payout_updated` / `payout_paid` / `payout_cancelled`
- [ ] Insert/Delete em `payout_receipts` → `receipt_uploaded` / `receipt_deleted`

## Append-only
- [ ] `update` e `delete` em `financial_audit_events` falham com `append-only`
- [ ] `insert` direto por qualquer usuário (não service_role) falha por RLS

## Ledger contábil
- [ ] `accounting_ledger(company, start, end)` retorna linhas com colunas: `entry_date, doc, description, account, debit, credit, ref_type, ref_id`
- [ ] Contas usadas: `REVENUE.GROSS`, `HOUSE.MARGIN`, `PAYOUT.BARBER`
- [ ] Para cada `revenue_split`: 1 crédito em REVENUE.GROSS, 1 crédito em HOUSE.MARGIN (40%), 1 crédito em PAYOUT.BARBER (60%)
- [ ] Para cada `payout` pago no período: 1 débito em PAYOUT.BARBER

## Exportação
- [ ] `register_accounting_export(company, start, end, 'csv', sha256)` grava linha em `accounting_exports`
- [ ] Campos `row_count`, `total_debit`, `total_credit` são preenchidos a partir do ledger
- [ ] `checksum_sha256` guarda o hash do arquivo entregue (calculado no cliente/edge function)

## RLS
- [ ] Owner/manager: leem `financial_audit_events` e `accounting_exports` da empresa
- [ ] Manager/owner: podem chamar `register_accounting_export`
- [ ] Barbeiro: vê APENAS eventos `entity_type='payout'` dos seus payouts
- [ ] Cliente final: sem acesso a nenhuma das tabelas
- [ ] Platform staff: leitura completa em todas as empresas
