-- =====================================================================
-- FASE 7 — Testes/Verificações de RLS
-- Rode logado como cada papel via impostor (set request.jwt.claims) ou em contas reais.
-- Substitua {UUIDs} pelos valores do seu ambiente.
-- =====================================================================

-- 1) OWNER: deve ver todos os planos, assinaturas e splits da sua empresa
--    set local role authenticated; set local "request.jwt.claim.sub" = '{OWNER_UUID}';
select count(*) as plans_visible          from public.subscription_plans     where company_id = '{COMPANY_UUID}';
select count(*) as subs_visible           from public.client_subscriptions   where company_id = '{COMPANY_UUID}';
select count(*) as splits_visible         from public.revenue_splits         where company_id = '{COMPANY_UUID}';
-- Deve permitir INSERT/UPDATE em subscription_plans e client_subscriptions

-- 2) MANAGER: mesma visibilidade que owner; UPDATE permitido
--    Verifique também que NÃO consegue escrever em empresas alheias

-- 3) BARBER: NÃO deve enxergar client_subscriptions de terceiros; deve ver seus revenue_splits
--    set local "request.jwt.claim.sub" = '{BARBER_UUID}';
select count(*) as my_splits from public.revenue_splits
  where barber_id in (select id from public.barbers where user_id = auth.uid());
-- Tentativa de INSERT em subscription_plans deve falhar

-- 4) CLIENT FINAL: só vê sua própria assinatura e seu próprio consumo
--    set local "request.jwt.claim.sub" = '{CLIENT_USER_UUID}';
select id, status from public.client_subscriptions
  where client_id in (select id from public.clients where user_id = auth.uid());
select count(*) from public.subscription_usage
  where subscription_id in (
    select cs.id from public.client_subscriptions cs
    join public.clients c on c.id = cs.client_id
    where c.user_id = auth.uid()
  );
-- Tentativa de ler splits deve retornar 0

-- 5) PLATFORM STAFF (suporte): vê TODAS as empresas
--    set local "request.jwt.claim.sub" = '{SUPPORT_UUID}';
select count(distinct company_id) as companies_seen from public.subscription_plans;
select count(distinct company_id) as companies_seen_rs from public.revenue_splits;

-- 6) Cobertura: função check_coverage retorna JSON correto
select public.check_coverage('{SUBSCRIPTION_UUID}', '{SERVICE_UUID}');

-- 7) Trigger 60/40: ao marcar booking completed, deve criar revenue_split
--    update public.bookings set status='completed' where id='{BOOKING_UUID}';
--    select * from public.revenue_splits where booking_id='{BOOKING_UUID}';
--    Espere: gross = soma booking_services.price_charged; barber_share = 60%; house_share = 40%.
