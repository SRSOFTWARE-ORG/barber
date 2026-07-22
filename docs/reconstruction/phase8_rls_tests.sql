-- =====================================================================
-- FASE 8 — Testes/Verificações de RLS
-- Substitua {UUIDs} pelos valores do seu ambiente.
-- =====================================================================

-- 1) OWNER: gera fechamento e vê todos os payouts da empresa
--    select public.generate_closing('{COMPANY}','2026-06-01','2026-06-30');
select id, status, gross_total, barber_total, house_total
  from public.period_closings where company_id='{COMPANY}';
select count(*) from public.payouts where company_id='{COMPANY}';

-- 2) MANAGER: consegue chamar generate_closing e pay_payout; NÃO consegue reopen (só owner/platform)
--    select public.pay_payout('{PAYOUT}','pix','txid-abc');
--    select public.reopen_period('{CLOSING}');  -- deve falhar 'forbidden'

-- 3) BARBER: vê apenas seus payouts e comprovantes; NÃO vê payouts de terceiros
--    set local "request.jwt.claim.sub" = '{BARBER_UUID}';
select id, status, barber_amount from public.payouts
 where barber_id in (select id from public.barbers where user_id=auth.uid());
-- Tentativa de select em outra empresa deve retornar 0

-- 4) PLATFORM STAFF: vê tudo em todas as empresas
--    set local "request.jwt.claim.sub" = '{SUPPORT_UUID}';
select count(distinct company_id) as companies_visible from public.period_closings;
select count(distinct company_id) as companies_visible_payouts from public.payouts;

-- 5) Integridade: ao pagar payout, splits do período viram paid_payout_id NOT NULL
--    select count(*) from public.revenue_splits
--     where company_id='{COMPANY}' and barber_id='{BARBER}' and paid_payout_id is not null;

-- 6) Fechamento: após close_period, generate_closing deve falhar até reopen
--    select public.close_period('{CLOSING}');
--    select public.generate_closing('{COMPANY}','2026-06-01','2026-06-30'); -- deve dar exception

-- 7) Comprovantes: owner insere payout_receipt; barbeiro consegue SELECT do seu; escrita direta por barbeiro deve falhar
