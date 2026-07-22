-- =====================================================================
-- FASE 7 — Assinaturas de clientes / Planos internos
-- Cobertura, quota mensal e distribuição 60/40 (barbeiro/casa)
-- Pré-requisitos: fases 2, 3, 4, 5, 6 aplicadas.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname='subscription_status') then
    create type public.subscription_status as enum (
      'pending','active','paused','cancelled','expired'
    );
  end if;
  if not exists (select 1 from pg_type where typname='billing_cycle') then
    create type public.billing_cycle as enum ('monthly','quarterly','yearly');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2) subscription_plans (planos internos por empresa)
-- ---------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null,
  description    text,
  price          numeric(12,2) not null default 0 check (price >= 0),
  billing_cycle  public.billing_cycle not null default 'monthly',
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (company_id, name)
);
create index if not exists idx_sub_plans_company on public.subscription_plans(company_id);
create index if not exists idx_sub_plans_active  on public.subscription_plans(company_id, is_active);

-- ---------------------------------------------------------------------
-- 3) plan_services (cobertura + quota mensal)
-- ---------------------------------------------------------------------
create table if not exists public.plan_services (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.subscription_plans(id) on delete cascade,
  service_id         uuid not null references public.services(id) on delete cascade,
  monthly_quota      integer,                -- null = ilimitado
  discount_percent   numeric(5,2) not null default 100 check (discount_percent between 0 and 100),
  created_at         timestamptz not null default now(),
  unique (plan_id, service_id)
);
create index if not exists idx_plan_services_plan on public.plan_services(plan_id);
create index if not exists idx_plan_services_svc  on public.plan_services(service_id);

-- Coerência: plano e serviço devem pertencer à mesma empresa
create or replace function public.tg_plan_service_coherence()
returns trigger language plpgsql as $$
declare v_pc uuid; v_sc uuid;
begin
  select company_id into v_pc from public.subscription_plans where id=new.plan_id;
  select company_id into v_sc from public.services where id=new.service_id;
  if v_pc is null or v_sc is null or v_pc <> v_sc then
    raise exception 'plan and service must belong to the same company';
  end if;
  return new;
end$$;
drop trigger if exists trg_plan_service_coherence on public.plan_services;
create trigger trg_plan_service_coherence
  before insert or update on public.plan_services
  for each row execute function public.tg_plan_service_coherence();

-- ---------------------------------------------------------------------
-- 4) client_subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.client_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  client_id             uuid not null references public.clients(id) on delete cascade,
  plan_id               uuid not null references public.subscription_plans(id) on delete restrict,
  status                public.subscription_status not null default 'pending',
  started_at            timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancelled_at          timestamptz,
  confirmed_by          uuid references auth.users(id),
  confirmed_at          timestamptz,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_cs_company on public.client_subscriptions(company_id);
create index if not exists idx_cs_client  on public.client_subscriptions(client_id);
create index if not exists idx_cs_plan    on public.client_subscriptions(plan_id);
create index if not exists idx_cs_status  on public.client_subscriptions(company_id, status);
-- Um cliente só pode ter 1 assinatura ativa por vez na mesma empresa
create unique index if not exists uq_cs_one_active
  on public.client_subscriptions(company_id, client_id)
  where status in ('active','pending','paused');

create or replace function public.tg_client_sub_coherence()
returns trigger language plpgsql as $$
declare v_cc uuid; v_pc uuid;
begin
  select company_id into v_cc from public.clients where id=new.client_id;
  select company_id into v_pc from public.subscription_plans where id=new.plan_id;
  if v_cc <> new.company_id or v_pc <> new.company_id then
    raise exception 'client and plan must belong to the subscription company';
  end if;
  return new;
end$$;
drop trigger if exists trg_cs_coherence on public.client_subscriptions;
create trigger trg_cs_coherence
  before insert or update on public.client_subscriptions
  for each row execute function public.tg_client_sub_coherence();

-- ---------------------------------------------------------------------
-- 5) subscription_usage (consumo de quota mensal)
-- ---------------------------------------------------------------------
create table if not exists public.subscription_usage (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.client_subscriptions(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete restrict,
  booking_id      uuid references public.bookings(id) on delete set null,
  period_month    date not null,           -- primeiro dia do mês
  used_at         timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);
create index if not exists idx_su_sub on public.subscription_usage(subscription_id, period_month);
create index if not exists idx_su_svc on public.subscription_usage(service_id);

-- ---------------------------------------------------------------------
-- 6) revenue_splits (distribuição 60/40 por booking concluído)
-- ---------------------------------------------------------------------
create table if not exists public.revenue_splits (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  barber_id     uuid not null references public.barbers(id) on delete restrict,
  gross_amount  numeric(12,2) not null check (gross_amount >= 0),
  barber_share  numeric(12,2) not null check (barber_share >= 0),
  house_share   numeric(12,2) not null check (house_share  >= 0),
  barber_pct    numeric(5,2)  not null default 60 check (barber_pct between 0 and 100),
  covered_by_subscription boolean not null default false,
  subscription_id uuid references public.client_subscriptions(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (booking_id)
);
create index if not exists idx_rs_company_created on public.revenue_splits(company_id, created_at desc);
create index if not exists idx_rs_barber_created  on public.revenue_splits(barber_id, created_at desc);

-- ---------------------------------------------------------------------
-- 7) Helpers: cobertura, quota, geração de split
-- ---------------------------------------------------------------------
-- Retorna a assinatura ativa do cliente na empresa (ou null)
create or replace function public.active_subscription_for_client(_client_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select id from public.client_subscriptions
   where client_id = _client_id
     and status = 'active'
     and (current_period_end is null or current_period_end > now())
   order by started_at desc nulls last
   limit 1
$$;

-- Cobertura de um serviço por assinatura: retorna JSON com quota, used, remaining, discount
create or replace function public.check_coverage(_subscription_id uuid, _service_id uuid, _period date default date_trunc('month', now())::date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_plan uuid;
  v_quota int;
  v_disc  numeric;
  v_used  int;
begin
  select plan_id into v_plan from public.client_subscriptions where id=_subscription_id;
  if v_plan is null then
    return jsonb_build_object('covered', false, 'reason','no_subscription');
  end if;
  select monthly_quota, discount_percent into v_quota, v_disc
    from public.plan_services where plan_id=v_plan and service_id=_service_id;
  if not found then
    return jsonb_build_object('covered', false, 'reason','not_in_plan');
  end if;
  select count(*) into v_used from public.subscription_usage
    where subscription_id=_subscription_id
      and service_id=_service_id
      and period_month=_period;
  return jsonb_build_object(
    'covered', true,
    'quota', v_quota,
    'used',  v_used,
    'remaining', case when v_quota is null then null else greatest(v_quota - v_used, 0) end,
    'discount_percent', v_disc,
    'exhausted', case when v_quota is null then false else v_used >= v_quota end
  );
end$$;

-- Gera revenue_split ao concluir booking (60/40 configurável)
create or replace function public.tg_booking_generate_split()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_gross numeric(12,2) := 0;
  v_barber_pct numeric(5,2) := 60;
  v_sub uuid;
  v_covered boolean := false;
  v_client uuid;
begin
  if new.status <> 'completed' then return new; end if;
  if tg_op='UPDATE' and old.status = 'completed' then return new; end if;

  select coalesce(sum(bs.price_charged),0) into v_gross
    from public.booking_services bs where bs.booking_id = new.id;

  select client_id into v_client from public.bookings where id=new.id;
  if v_client is not null then
    v_sub := public.active_subscription_for_client(v_client);
    v_covered := v_sub is not null;
  end if;

  insert into public.revenue_splits(company_id, booking_id, barber_id, gross_amount, barber_share, house_share, barber_pct, covered_by_subscription, subscription_id)
  values (new.company_id, new.id, new.barber_id, v_gross,
          round(v_gross * v_barber_pct/100.0, 2),
          round(v_gross * (100 - v_barber_pct)/100.0, 2),
          v_barber_pct, v_covered, v_sub)
  on conflict (booking_id) do nothing;

  return new;
end$$;
drop trigger if exists trg_booking_split on public.bookings;
create trigger trg_booking_split
  after insert or update of status on public.bookings
  for each row execute function public.tg_booking_generate_split();

-- ---------------------------------------------------------------------
-- 8) View: relatório mensal por empresa
-- ---------------------------------------------------------------------
create or replace view public.v_monthly_coverage_report
with (security_invoker=on) as
select
  rs.company_id,
  date_trunc('month', rs.created_at)::date as period_month,
  count(*)                                  as bookings_completed,
  sum(rs.gross_amount)                      as gross_total,
  sum(rs.barber_share)                      as barber_total,
  sum(rs.house_share)                       as house_total,
  count(*) filter (where rs.covered_by_subscription) as bookings_covered,
  sum(rs.gross_amount) filter (where rs.covered_by_subscription) as covered_gross
from public.revenue_splits rs
group by rs.company_id, date_trunc('month', rs.created_at);

grant select on public.v_monthly_coverage_report to authenticated;

create or replace view public.v_monthly_barber_split
with (security_invoker=on) as
select
  rs.company_id,
  rs.barber_id,
  date_trunc('month', rs.created_at)::date as period_month,
  count(*)               as bookings,
  sum(rs.gross_amount)   as gross_total,
  sum(rs.barber_share)   as barber_share_total,
  sum(rs.house_share)    as house_share_total
from public.revenue_splits rs
group by rs.company_id, rs.barber_id, date_trunc('month', rs.created_at);

grant select on public.v_monthly_barber_split to authenticated;

-- ---------------------------------------------------------------------
-- 9) GRANTS
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.subscription_plans      to authenticated;
grant select, insert, update, delete on public.plan_services           to authenticated;
grant select, insert, update, delete on public.client_subscriptions    to authenticated;
grant select, insert                 on public.subscription_usage      to authenticated;
grant select                         on public.revenue_splits          to authenticated;
grant all on public.subscription_plans, public.plan_services, public.client_subscriptions,
           public.subscription_usage, public.revenue_splits to service_role;

-- ---------------------------------------------------------------------
-- 10) RLS
-- ---------------------------------------------------------------------
alter table public.subscription_plans   enable row level security;
alter table public.plan_services        enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.subscription_usage   enable row level security;
alter table public.revenue_splits       enable row level security;

-- subscription_plans: staff da empresa lê; owner/manager escreve; platform staff lê tudo
drop policy if exists sp_read on public.subscription_plans;
create policy sp_read on public.subscription_plans for select to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.is_member_of(auth.uid(), company_id)
);
drop policy if exists sp_write on public.subscription_plans;
create policy sp_write on public.subscription_plans for all to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
)
with check (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
);

-- plan_services: mesma regra (via plano)
drop policy if exists ps_read on public.plan_services;
create policy ps_read on public.plan_services for select to authenticated
using (
  exists(
    select 1 from public.subscription_plans sp
    where sp.id = plan_services.plan_id
      and (public.is_platform_staff(auth.uid()) or public.is_member_of(auth.uid(), sp.company_id))
  )
);
drop policy if exists ps_write on public.plan_services;
create policy ps_write on public.plan_services for all to authenticated
using (
  exists(
    select 1 from public.subscription_plans sp
    where sp.id = plan_services.plan_id
      and (public.is_platform_staff(auth.uid())
        or public.has_role(auth.uid(), sp.company_id, 'owner')
        or public.has_role(auth.uid(), sp.company_id, 'manager'))
  )
)
with check (
  exists(
    select 1 from public.subscription_plans sp
    where sp.id = plan_services.plan_id
      and (public.is_platform_staff(auth.uid())
        or public.has_role(auth.uid(), sp.company_id, 'owner')
        or public.has_role(auth.uid(), sp.company_id, 'manager'))
  )
);

-- client_subscriptions: staff da empresa lê; cliente final lê a sua; owner/manager escreve
drop policy if exists cs_read on public.client_subscriptions;
create policy cs_read on public.client_subscriptions for select to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.is_member_of(auth.uid(), company_id)
  or exists(
    select 1 from public.clients c
    where c.id = client_subscriptions.client_id
      and c.user_id = auth.uid()
  )
);
drop policy if exists cs_write on public.client_subscriptions;
create policy cs_write on public.client_subscriptions for all to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
)
with check (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
);

-- subscription_usage: staff da empresa lê; cliente vê seu próprio consumo
drop policy if exists su_read on public.subscription_usage;
create policy su_read on public.subscription_usage for select to authenticated
using (
  exists(
    select 1 from public.client_subscriptions cs
    where cs.id = subscription_usage.subscription_id
      and (
        public.is_platform_staff(auth.uid())
        or public.is_member_of(auth.uid(), cs.company_id)
        or exists(select 1 from public.clients c where c.id = cs.client_id and c.user_id = auth.uid())
      )
  )
);
drop policy if exists su_insert on public.subscription_usage;
create policy su_insert on public.subscription_usage for insert to authenticated
with check (
  exists(
    select 1 from public.client_subscriptions cs
    where cs.id = subscription_usage.subscription_id
      and (public.is_platform_staff(auth.uid())
        or public.has_role(auth.uid(), cs.company_id, 'owner')
        or public.has_role(auth.uid(), cs.company_id, 'manager')
        or public.has_role(auth.uid(), cs.company_id, 'barber'))
  )
);

-- revenue_splits: owner/manager/platform staff vê tudo; barbeiro vê os seus
drop policy if exists rs_read on public.revenue_splits;
create policy rs_read on public.revenue_splits for select to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
  or exists(
    select 1 from public.barbers b
    where b.id = revenue_splits.barber_id
      and b.user_id = auth.uid()
  )
);

-- Escrita apenas via trigger (service_role bypassa RLS)
