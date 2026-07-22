-- =====================================================================
-- FASE 9 — Testes/Verificações de RLS
-- Substitua {UUIDs} pelos valores do seu ambiente.
-- =====================================================================

-- 1) OWNER: vê toda a linha do tempo da empresa
--    set local "request.jwt.claim.sub" = '{OWNER_UUID}';
select kind, entity_type, count(*) from public.financial_audit_events
 where company_id='{COMPANY}' group by 1,2 order by 3 desc;

-- 2) MANAGER: também vê tudo da empresa, mas em outra empresa não
select count(*) from public.financial_audit_events where company_id <> '{COMPANY}';
-- Deve retornar 0

-- 3) BARBER: vê APENAS eventos entity_type='payout' dos seus payouts
--    set local "request.jwt.claim.sub" = '{BARBER_UUID}';
select entity_type, count(*) from public.financial_audit_events group by 1;
-- Espere ver apenas 'payout'

-- 4) PLATFORM STAFF: vê todas as empresas
select count(distinct company_id) from public.financial_audit_events;

-- 5) Append-only: tentativas de UPDATE/DELETE devem falhar
--    update public.financial_audit_events set amount=0 where id='{FAE}';
--    delete from public.financial_audit_events where id='{FAE}';

-- 6) Ledger e exportação
select account, sum(debit) as debit, sum(credit) as credit
  from public.accounting_ledger('{COMPANY}','2026-06-01','2026-06-30')
 group by account;
-- Regra: sum(debit) == sum(credit) por partida dobrada (dentro de arredondamentos)

--    select public.register_accounting_export('{COMPANY}','2026-06-01','2026-06-30','csv','<sha256>');
select id, row_count, total_debit, total_credit
  from public.accounting_exports where company_id='{COMPANY}' order by generated_at desc;

-- 7) Sem permissão: cliente/barbeiro NÃO consegue INSERT em accounting_exports
--    insert into public.accounting_exports(company_id, period_start, period_end)
--    values ('{COMPANY}','2026-06-01','2026-06-30'); -- deve falhar
