-- =====================================================================
-- FASE 2 — ESTRUTURA MULTI-TENANT (base de todas as próximas fases)
-- =====================================================================
-- Cria: companies, units, company_settings, profiles, roles,
--       permissions, role_permissions, user_roles
-- Isolamento por company_id e unit_id em toda leitura/escrita.
-- Papéis em tabela separada (nunca no profile).
-- =====================================================================

-- 0) Extensões necessárias
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =====================================================================
-- 1) ENUM DE PAPÉIS DA PLATAFORMA
-- =====================================================================
do $$ begin
  create type public.app_role as enum ('ceo','suporte','proprietario','gerente','barbeiro','cliente');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 2) COMPANIES (tenant raiz)
-- =====================================================================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null check (length(trim(name)) between 2 and 120),
  legal_name text,
  document text,                       -- CNPJ/NIF/EIN etc.
  country_code char(2) not null default 'BR',
  default_timezone text not null default 'America/Sao_Paulo',
  default_currency char(3) not null default 'BRL',
  status text not null default 'active' check (status in ('active','suspended','canceled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_companies_status on public.companies(status) where deleted_at is null;

grant select, insert, update on public.companies to authenticated;
grant all on public.companies to service_role;

-- =====================================================================
-- 3) UNITS (unidades/filiais de uma company)
-- =====================================================================
create table public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  slug citext not null,
  name text not null check (length(trim(name)) between 2 and 120),
  timezone text,                       -- se null, herda da company
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country_code char(2),
  phone text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);
create index idx_units_company on public.units(company_id) where deleted_at is null;

grant select, insert, update on public.units to authenticated;
grant all on public.units to service_role;

-- =====================================================================
-- 4) COMPANY_SETTINGS (chave-valor por empresa)
-- =====================================================================
create table public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  branding jsonb not null default '{}'::jsonb,     -- logo_url, primary_color, ...
  booking jsonb not null default '{}'::jsonb,      -- min_notice_minutes, max_advance_days, cancel_window_min
  finance jsonb not null default '{}'::jsonb,      -- pot_split_company_pct, pot_split_barbers_pct
  whatsapp jsonb not null default '{}'::jsonb,     -- instance_id etc (segredos NÃO ficam aqui)
  locale jsonb not null default '{"lang":"pt-BR"}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.company_settings to authenticated;
grant all on public.company_settings to service_role;

-- =====================================================================
-- 5) PROFILES (1:1 com auth.users) — NUNCA guardar role aqui
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  display_name text,
  avatar_url text,
  phone text,
  locale text default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Trigger de auto-criação do profile no signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, avatar_url)
  values (new.id,
          nullif(new.raw_user_meta_data->>'full_name',''),
          nullif(new.raw_user_meta_data->>'avatar_url',''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 6) USER_ROLES (papel por usuário / company / unit)
--    - CEO/SUPORTE: papéis globais (company_id null, unit_id null)
--    - Demais: sempre atrelados a uma company; unit_id opcional
-- =====================================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  company_id uuid references public.companies(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role, company_id, unit_id),
  -- Regras de escopo:
  check (
    (role in ('ceo','suporte') and company_id is null and unit_id is null)
    or
    (role not in ('ceo','suporte') and company_id is not null)
  )
);
create index idx_user_roles_user on public.user_roles(user_id);
create index idx_user_roles_company on public.user_roles(company_id);
create index idx_user_roles_unit on public.user_roles(unit_id);

-- user_roles é lido só por authenticated (via has_role); não expor a anon
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

-- Coerência unit↔company: uma unit só pode ser referenciada se pertence à mesma company
create or replace function public.tg_user_roles_unit_matches_company()
returns trigger language plpgsql as $$
declare v_c uuid;
begin
  if new.unit_id is not null then
    select company_id into v_c from public.units where id = new.unit_id;
    if v_c is null or v_c is distinct from new.company_id then
      raise exception 'unit_id % não pertence à company_id %', new.unit_id, new.company_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_user_roles_scope on public.user_roles;
create trigger trg_user_roles_scope
  before insert or update on public.user_roles
  for each row execute function public.tg_user_roles_unit_matches_company();

-- =====================================================================
-- 7) FUNÇÕES DE AUTORIZAÇÃO (SECURITY DEFINER, evitam recursão em RLS)
-- =====================================================================

-- has_role global (ignora escopo)
create or replace function public.has_role(_user uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user and role = _role)
$$;

-- É staff da plataforma (ceo/suporte)?
create or replace function public.is_platform_staff(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user and role in ('ceo','suporte')
  )
$$;

-- Pertence à company (qualquer papel)?
create or replace function public.is_member_of(_user uuid, _company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user and company_id = _company
  ) or public.is_platform_staff(_user)
$$;

-- É proprietário/gerente da company?
create or replace function public.is_company_admin(_user uuid, _company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user and company_id = _company
      and role in ('proprietario','gerente')
  ) or public.is_platform_staff(_user)
$$;

-- Tem acesso a esta unidade?
create or replace function public.has_unit_access(_user uuid, _unit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.units u
    join public.user_roles ur on ur.company_id = u.company_id
    where u.id = _unit
      and ur.user_id = _user
      and (ur.unit_id is null or ur.unit_id = _unit)
  ) or public.is_platform_staff(_user)
$$;

-- =====================================================================
-- 8) PERMISSIONS + ROLE_PERMISSIONS (matriz declarativa, opcional em queries)
-- =====================================================================
create table public.permissions (
  code text primary key,           -- ex: 'appointments.write', 'finance.read'
  description text not null
);
grant select on public.permissions to authenticated;
grant all on public.permissions to service_role;

create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);
grant select on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;

-- Seeds mínimos (podem crescer nas próximas fases)
insert into public.permissions(code, description) values
  ('company.manage','Gerenciar dados e configurações da empresa'),
  ('unit.manage','Gerenciar unidades'),
  ('user.manage','Convidar/remover usuários e papéis'),
  ('client.read','Visualizar clientes'),
  ('client.write','Criar/editar clientes'),
  ('barber.read','Visualizar barbeiros'),
  ('barber.write','Criar/editar barbeiros'),
  ('service.manage','Gerenciar serviços'),
  ('appointment.read','Ver agenda'),
  ('appointment.write','Criar/editar/cancelar agendamentos'),
  ('finance.read','Ver financeiro'),
  ('finance.write','Lançar financeiro'),
  ('plan.manage','Gerenciar planos de assinatura'),
  ('review.reply','Responder avaliações'),
  ('support.manage','Gerenciar tickets de suporte')
on conflict do nothing;

insert into public.role_permissions(role, permission_code)
select r::public.app_role, p from (values
  ('ceo','company.manage'),('ceo','unit.manage'),('ceo','user.manage'),
  ('ceo','client.read'),('ceo','barber.read'),('ceo','service.manage'),
  ('ceo','appointment.read'),('ceo','finance.read'),('ceo','plan.manage'),
  ('ceo','review.reply'),('ceo','support.manage'),
  ('suporte','company.manage'),('suporte','user.manage'),
  ('suporte','client.read'),('suporte','appointment.read'),('suporte','support.manage'),
  ('proprietario','company.manage'),('proprietario','unit.manage'),
  ('proprietario','user.manage'),('proprietario','client.read'),
  ('proprietario','client.write'),('proprietario','barber.read'),
  ('proprietario','barber.write'),('proprietario','service.manage'),
  ('proprietario','appointment.read'),('proprietario','appointment.write'),
  ('proprietario','finance.read'),('proprietario','finance.write'),
  ('proprietario','plan.manage'),('proprietario','review.reply'),
  ('gerente','unit.manage'),('gerente','user.manage'),
  ('gerente','client.read'),('gerente','client.write'),
  ('gerente','barber.read'),('gerente','barber.write'),
  ('gerente','service.manage'),('gerente','appointment.read'),
  ('gerente','appointment.write'),('gerente','finance.read'),
  ('gerente','review.reply'),
  ('barbeiro','client.read'),('barbeiro','appointment.read'),
  ('barbeiro','appointment.write'),
  ('cliente','appointment.read')
) as t(r,p)
on conflict do nothing;

-- =====================================================================
-- 9) ROW LEVEL SECURITY
-- =====================================================================
alter table public.companies enable row level security;
alter table public.units enable row level security;
alter table public.company_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

-- companies
create policy companies_read on public.companies
  for select to authenticated
  using (deleted_at is null and public.is_member_of(auth.uid(), id));

create policy companies_insert on public.companies
  for insert to authenticated
  with check (public.is_platform_staff(auth.uid()) or created_by = auth.uid());

create policy companies_update on public.companies
  for update to authenticated
  using (public.is_company_admin(auth.uid(), id))
  with check (public.is_company_admin(auth.uid(), id));

-- units
create policy units_read on public.units
  for select to authenticated
  using (deleted_at is null and public.is_member_of(auth.uid(), company_id));

create policy units_write on public.units
  for all to authenticated
  using (public.is_company_admin(auth.uid(), company_id))
  with check (public.is_company_admin(auth.uid(), company_id));

-- company_settings
create policy cs_read on public.company_settings
  for select to authenticated
  using (public.is_member_of(auth.uid(), company_id));

create policy cs_write on public.company_settings
  for all to authenticated
  using (public.is_company_admin(auth.uid(), company_id))
  with check (public.is_company_admin(auth.uid(), company_id));

-- profiles: cada usuário vê/edita o próprio; staff da plataforma vê todos
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_staff(auth.uid()));

create policy profiles_self_write on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_self_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- user_roles: usuário vê seus papéis; admins da company veem os da company
create policy ur_self_read on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_staff(auth.uid())
    or (company_id is not null and public.is_company_admin(auth.uid(), company_id))
  );

create policy ur_admin_write on public.user_roles
  for all to authenticated
  using (
    public.is_platform_staff(auth.uid())
    or (company_id is not null and public.is_company_admin(auth.uid(), company_id))
  )
  with check (
    public.is_platform_staff(auth.uid())
    or (company_id is not null and public.is_company_admin(auth.uid(), company_id))
  );

-- permissions e role_permissions: leitura para autenticados
create policy perms_read on public.permissions for select to authenticated using (true);
create policy rp_read on public.role_permissions for select to authenticated using (true);

-- =====================================================================
-- 10) updated_at automático
-- =====================================================================
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text;
begin
  for t in select unnest(array['companies','units','company_settings','profiles']) loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$s;
                    create trigger trg_%1$s_touch before update on public.%1$s
                    for each row execute function public.tg_touch_updated_at();', t);
  end loop;
end $$;
