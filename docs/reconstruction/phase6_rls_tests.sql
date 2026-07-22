-- =====================================================================
-- FASE 6 — Testes de RLS extendidos
-- Cobre: services, barber_services, bookings, booking_services
--        + revalidação de barber_availability e barber_units (fase 5)
-- Substitua os UUIDs antes de rodar. Rode bloco a bloco.
-- =====================================================================

-- Pré-checagens estruturais
select tablename, count(*) as policies
  from pg_policies
 where schemaname='public'
   and tablename in ('service_categories','services','barber_services',
                     'bookings','booking_services',
                     'barber_availability','barber_units')
 group by tablename order by tablename;
-- Esperado (mínimo): services=5, barber_services=5, bookings=11,
--                    booking_services=3, service_categories=4,
--                    barber_availability=8, barber_units=5

select relname, relrowsecurity from pg_class
 where relname in ('service_categories','services','barber_services',
                   'bookings','booking_services');

-- ---------------------------------------------------------------------
-- Simulações (descomente e substitua)
-- ---------------------------------------------------------------------
-- set local role authenticated;

-- (A) OWNER — cria serviço, vincula barbeiro, agenda booking
-- set local request.jwt.claims to json_build_object('sub', :'owner_uid')::text;
-- insert into public.services(company_id, name, duration_minutes, price)
--   values (:'company_id', 'Corte social', 30, 45.00) returning id;   -- guarde :service_id
-- insert into public.barber_services(barber_id, service_id)
--   values (:'barber_id', :'service_id');
-- insert into public.bookings(company_id, barber_id, client_id, starts_at, ends_at, status)
--   values (:'company_id', :'barber_id', :'client_id',
--           now() + interval '1 day', now() + interval '1 day 30 minutes', 'scheduled')
--   returning id;                                                     -- guarde :booking_id
-- insert into public.booking_services(booking_id, service_id, price_at_booking, duration_at_booking)
--   values (:'booking_id', :'service_id', 45.00, 30);
-- select total_amount from public.bookings where id = :'booking_id';  -- deve virar 45.00

-- (B) CONFLITO — outro booking sobreposto para o mesmo barbeiro deve FALHAR
-- insert into public.bookings(company_id, barber_id, starts_at, ends_at, status)
--   values (:'company_id', :'barber_id',
--           now() + interval '1 day 15 minutes',
--           now() + interval '1 day 45 minutes', 'scheduled');
-- Esperado: erro de exclusion constraint (bookings_no_overlap_excl).

-- (C) GERENTE — mesmas permissões de escrita que owner
-- set local request.jwt.claims to json_build_object('sub', :'manager_uid')::text;
-- update public.bookings set status='confirmed' where id = :'booking_id';

-- (D) BARBEIRO — vê o próprio booking, pode marcar completed, NÃO cria serviço
-- set local request.jwt.claims to json_build_object('sub', :'barber_uid')::text;
-- select id, status from public.bookings where barber_id = :'barber_id';
-- update public.bookings set status='in_progress' where id = :'booking_id';
-- insert into public.services(company_id, name, duration_minutes, price)
--   values (:'company_id','Hack',30,10);   -- Esperado: erro RLS.

-- (E) CLIENTE FINAL — vê apenas os próprios bookings; pode cancelar; NÃO vê outros
-- set local request.jwt.claims to json_build_object('sub', :'client_uid')::text;
-- select id, status from public.bookings;              -- só linhas dele
-- update public.bookings set status='cancelled', cancelled_at=now(), cancelled_by=auth.uid()
--   where id = :'booking_id';
-- select count(*) from public.booking_services;        -- só das próprias bookings

-- (F) OUTRO OWNER — não vê nada da empresa alvo
-- set local request.jwt.claims to json_build_object('sub', :'other_owner_uid')::text;
-- select count(*) from public.services         where company_id = :'company_id';    -- 0
-- select count(*) from public.bookings         where company_id = :'company_id';    -- 0
-- select count(*) from public.barber_services  where company_id = :'company_id';    -- 0

-- (G) PLATFORM STAFF — vê tudo
-- set local request.jwt.claims to json_build_object('sub', :'platform_admin_uid')::text;
-- select count(*) from public.bookings;   -- total global

-- (H) COERÊNCIA — serviço de outra empresa em booking desta empresa deve FALHAR
-- insert into public.booking_services(booking_id, service_id, price_at_booking, duration_at_booking)
--   values (:'booking_id', :'service_from_other_company', 10, 10);
-- Esperado: erro "service belongs to different company".

-- (I) DISPONIBILIDADE (revalidação Fase 5) — sobreposição bloqueada
-- set local request.jwt.claims to json_build_object('sub', :'barber_uid')::text;
-- insert into public.barber_availability(barber_id, weekday, start_time, end_time)
--   values (:'barber_id', 1, '09:00', '12:00');
-- insert into public.barber_availability(barber_id, weekday, start_time, end_time)
--   values (:'barber_id', 1, '10:00', '11:00');    -- deve falhar

-- (J) VÍNCULO BARBEIRO x UNIDADE (revalidação Fase 5)
-- insert into public.barber_units(barber_id, unit_id)
--   values (:'barber_id', :'unit_of_other_company');  -- deve falhar

reset role;
