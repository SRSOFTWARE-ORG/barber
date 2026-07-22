# Fase 8 — Checklist de validação

## Ordem de execução
1. `docs/reconstruction/phase8_finance.sql`
2. (Opcional) `docs/reconstruction/phase8_rls_tests.sql`
3. Rollback: `docs/reconstruction/phase8_rollback.sql`

## Estruturas
- [ ] Enums `closing_status`, `payout_status`, `payout_method`
- [ ] `period_closings` (uma linha por empresa/período)
- [ ] `payouts` (uma linha por barbeiro por fechamento)
- [ ] `payout_splits` (N:N com `revenue_splits`)
- [ ] `payout_receipts` (arquivos: URL, nome, mime, tamanho)
- [ ] Colunas adicionadas em `revenue_splits`: `paid_payout_id`, `paid_at`
- [ ] View `v_closing_summary`

## Funções
- [ ] `preview_closing(company, start, end)` retorna totais por barbeiro sem gravar
- [ ] `generate_closing(company, start, end)` cria/atualiza fechamento **open** e recomputa payouts
- [ ] `pay_payout(payout, method, reference)` marca payout como **paid** e amarra `revenue_splits`
- [ ] `close_period(closing)` bloqueia nova geração até `reopen_period`
- [ ] `reopen_period(closing)` reservado a owner/platform staff

## Regras
- [ ] `revenue_splits` já pagos ficam com `paid_payout_id` e são ignorados em novos `generate_closing`
- [ ] Duas execuções seguidas de `generate_closing` no mesmo intervalo são idempotentes
- [ ] `generate_closing` falha em fechamento com status `closed`

## RLS
- [ ] Owner/manager: lê tudo da empresa; usa `generate_closing`, `pay_payout`, `close_period`
- [ ] Barbeiro: vê apenas seus payouts e comprovantes; não pode inserir/atualizar
- [ ] Manager: NÃO consegue `reopen_period`
- [ ] Cliente final: sem acesso a period_closings/payouts/receipts
- [ ] Platform staff: leitura em todas as empresas

## Comprovantes
- [ ] Owner/manager insere `payout_receipts.file_url` (URL do Storage)
- [ ] Barbeiro lê o comprovante do seu payout
- [ ] Barbeiro NÃO consegue INSERT/UPDATE em `payout_receipts`
