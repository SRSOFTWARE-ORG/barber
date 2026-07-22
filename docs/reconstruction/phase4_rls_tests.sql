-- =====================================================================
-- FASE 4 — Testes de RLS (execute LOGADO no SQL Editor)
-- Cria dados de exemplo em uma empresa fictícia e verifica visibilidade.
-- Requer: pelo menos 1 company, 1 proprietário, 1 barbeiro e 1 cliente
-- final (auth.users) já cadastrados.
-- =====================================================================

-- Substitua estes UUIDs pelos reais do seu ambiente antes de rodar:
--   :company_id      -> id de uma company de teste
--   :owner_uid       -> auth.uid() do proprietário dessa company
--   :barber_uid      -> auth.uid() de um barbeiro dessa company
--   :other_owner_uid -> proprietário de OUTRA company
--   :client_uid      -> auth.uid() de um cliente final (opcional)

-- ---------------------------------------------------------------------
-- 0) Pré-checagens
-- ---------------------------------------------------------------------
select 'clients existe?'            as check, to_regclass('public.clients')          is not null as ok
union all
select 'client_addresses existe?',           to_regclass('public.client_addresses')  is not null
union all
select 'client_notes existe?',                to_regclass('public.client_notes')      is not null
union all
select 'RLS clients ativo?',
       (select relrowsecurity from pg_class where oid = 'public.clients'::regclass)
union all
select 'RLS client_addresses ativo?',
       (select relrowsecurity from pg_class where oid = 'public.client_addresses'::regclass)
union all
select 'RLS client_notes ativo?',
       (select relrowsecurity from pg_class where oid = 'public.client_notes'::regclass);

-- ---------------------------------------------------------------------
-- 1) Contagem de policies por tabela (esperado: clients=7, addr=6, notes=5)
-- ---------------------------------------------------------------------
select tablename, count(*) as n_policies
  from pg_policies
 where schemaname='public'
   and tablename in ('clients','client_addresses','client_notes')
 group by tablename
 order by tablename;

-- ---------------------------------------------------------------------
-- 2) Simulação como PROPRIETÁRIO da empresa (deve VER)
--    Substitua :owner_uid e :company_id.
-- ---------------------------------------------------------------------
-- set local role authenticated;
-- set local request.jwt.claims to json_build_object('sub', :'owner_uid')::text;
-- select id, full_name from public.clients where company_id = :'company_id';
-- Esperado: linhas retornadas para essa company.

-- ---------------------------------------------------------------------
-- 3) Simulação como PROPRIETÁRIO DE OUTRA empresa (NÃO deve ver)
-- ---------------------------------------------------------------------
-- set local request.jwt.claims to json_build_object('sub', :'other_owner_uid')::text;
-- select count(*) from public.clients where company_id = :'company_id';
-- Esperado: 0.

-- ---------------------------------------------------------------------
-- 4) Simulação como BARBEIRO (vê clients, NÃO deve escrever)
-- ---------------------------------------------------------------------
-- set local request.jwt.claims to json_build_object('sub', :'barber_uid')::text;
-- select count(*) from public.clients where company_id = :'company_id';   -- >0
-- insert into public.clients(company_id, full_name) values (:'company_id','Deve Falhar');
-- Esperado: ERRO de RLS na INSERT.

-- ---------------------------------------------------------------------
-- 5) Simulação como CLIENTE FINAL (só o próprio registro)
-- ---------------------------------------------------------------------
-- set local request.jwt.claims to json_build_object('sub', :'client_uid')::text;
-- select id, full_name from public.clients;
-- Esperado: no máximo 1 linha (a que tem user_id = client_uid).
-- select count(*) from public.client_notes;
-- Esperado: 0 (cliente final NÃO vê notas internas).

-- ---------------------------------------------------------------------
-- 6) Simulação como STAFF DE PLATAFORMA (vê tudo)
-- ---------------------------------------------------------------------
-- set local request.jwt.claims to json_build_object('sub', :'platform_admin_uid')::text;
-- select count(*) from public.clients;
-- Esperado: total global.

-- ---------------------------------------------------------------------
-- 7) Unicidade
-- ---------------------------------------------------------------------
-- Tenta inserir 2 clientes com mesmo email na mesma company:
-- insert into public.clients(company_id, full_name, email)
--   values (:'company_id','A','dup@test.com'),(:'company_id','B','dup@test.com');
-- Esperado: ERRO de índice único.

reset role;
-- =====================================================================
