-- =====================================================================
-- FASE 5 — Testes de RLS (execute LOGADO no SQL Editor)
-- Substitua os UUIDs antes de rodar.
-- =====================================================================

-- Pré-checagens
select 'barbers'             as tbl, to_regclass('public.barbers')             is not null as ok
union all
select 'barber_units',              to_regclass('public.barber_units')         is not null
union all
select 'barber_availability',       to_regclass('public.barber_availability')  is not null
union all
select 'barber_time_off',           to_regclass('public.barber_time_off')      is not null;

-- RLS ativo
select relname, relrowsecurity from pg_class
 where relname in ('barbers','barber_units','barber_availability','barber_time_off');

-- Policies (esperado: barbers=7, barber_units=5, availability=8, time_off=6)
select tablename, count(*) from pg_policies
 where schemaname='public'
   and tablename in ('barbers','barber_units','barber_availability','barber_time_off')
 group by tablename order by tablename;

-- --------------------------------------------------------
-- Simulações (descomente e substitua UUIDs)
-- --------------------------------------------------------
-- 1) Proprietário vê barbeiros da própria empresa
-- set local role authenticated;
-- set local request.jwt.claims to json_build_object('sub', :'owner_uid')::text;
-- select id, display_name from public.barbers where company_id = :'company_id';

-- 2) Proprietário de OUTRA empresa NÃO vê
-- set local request.jwt.claims to json_build_object('sub', :'other_owner_uid')::text;
-- select count(*) from public.barbers where company_id = :'company_id';   -- 0

-- 3) Barbeiro vê próprio registro e próprias disponibilidades
-- set local request.jwt.claims to json_build_object('sub', :'barber_uid')::text;
-- select id from public.barbers where user_id = :'barber_uid';
-- select count(*) from public.barber_availability where barber_id = :'barber_id';

-- 4) Barbeiro NÃO cria outro barbeiro
-- insert into public.barbers(company_id, display_name) values (:'company_id','X');
-- Esperado: erro de RLS.

-- 5) Barbeiro cria a própria disponibilidade
-- insert into public.barber_availability(barber_id, weekday, start_time, end_time)
-- values (:'barber_id', 1, '09:00', '18:00');

-- 6) Sobreposição deve falhar
-- insert into public.barber_availability(barber_id, weekday, start_time, end_time)
-- values (:'barber_id', 1, '10:00', '12:00');
-- Esperado: 'availability overlaps existing slot'.

-- 7) Cliente autenticado (não staff) vê apenas barbeiros ATIVOS/bookable
-- set local request.jwt.claims to json_build_object('sub', :'client_uid')::text;
-- select id, display_name, status, is_bookable from public.barbers;

reset role;
