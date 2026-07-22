-- =====================================================================
-- FASE 9 — Analytics, KPIs, Feature Gating (PWA Premium) e Dashboards
-- =====================================================================
-- Objetivo
--   * Consolidar métricas por empresa/unidade/barbeiro em tabelas e
--     views performáticas para alimentar os dashboards por papel
--     (CEO/suporte, proprietário, gerente, barbeiro, cliente).
--   * Persistir eventos de produto (page views, ações) com PII mínima.
--   * Habilitar "PWA Premium" e recursos pagos via feature flags e
--     assinaturas de plataforma (SaaS), com checagem via função SQL.
--
-- Pré-requisitos: Fases 1 a 8 aplicadas.
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. Feature flags e planos de plataforma (SaaS)
-- ---------------------------------------------------------------------
create table if not exists public.platform_plans (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,          -- 'free' | 'pro' | 'premium'
  name         text not null,
  price_cents  int  not null default 0,
  currency     text not null default 'BRL',
  features     jsonb not null default '{}'::jsonb, -- { pwa_premium: true, whatsapp: true, ... }
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

grant select on public.platform_plans to anon, authenticated;
grant all    on public.platform_plans to service_role;
alter table public.platform_plans enable row level security;
drop policy if exists pp_read on public.platform_plans;
create policy pp_read on public.platform_plans for select using (is_active = true);
drop policy if exists pp_admin on public.platform_plans;
create policy pp_admin on public.platform_plans for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

insert into public.platform_plans(code, name, price_cents, features, sort_order) values
  ('free',    'Free',      0,     '{"pwa_premium": false, "whatsapp": false, "affiliates": false, "analytics_advanced": false}'::jsonb, 0),
  ('pro',     'Pro',       9900,  '{"pwa_premium": true,  "whatsapp": true,  "affiliates": true,  "analytics_advanced": false}'::jsonb, 1),
  ('premium', 'Premium',   19900, '{"pwa_premium": true,  "whatsapp": true,  "affiliates": true,  "analytics_advanced": true }'::jsonb, 2)
on conflict (code) do nothing;

create table if not exists public.company_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  plan_id      uuid not null references public.platform_plans(id),
  status       text not null default 'active'
               check (status in ('trialing','active','past_due','canceled')),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  trial_ends_at timestamptz,
  external_ref text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists company_subscriptions_one_active
  on public.company_subscriptions(company_id)
  where status in ('trialing','active');

grant select, insert, update, delete on public.company_subscriptions to authenticated;
grant all on public.company_subscriptions to service_role;
alter table public.company_subscriptions enable row level security;

drop policy if exists cs_read on public.company_subscriptions;
create policy cs_read on public.company_subscriptions for select
  using (public.user_in_company(auth.uid(), company_id) or public.is_platform_admin(auth.uid()));

drop policy if exists cs_admin on public.company_subscriptions;
create policy cs_admin on public.company_subscriptions for all
  using (public.is_platform_admin(auth.uid())
      or public.has_company_role(auth.uid(), company_id, 'proprietario'))
  with check (public.is_platform_admin(auth.uid())
      or public.has_company_role(auth.uid(), company_id, 'proprietario'));

-- Função central para checar se uma empresa tem uma feature ativa.
create or replace function public.company_has_feature(_company_id uuid, _feature text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (p.features ->> _feature)::boolean
    from public.company_subscriptions cs
    join public.platform_plans p on p.id = cs.plan_id
    where cs.company_id = _company_id
      and cs.status in ('trialing','active')
      and (cs.ends_at is null or cs.ends_at > now())
    order by cs.starts_at desc
    limit 1
  ), false);
$$;

grant execute on function public.company_has_feature(uuid,text) to anon, authenticated;

-- View que o frontend consome para saber quais features estão liberadas.
create or replace view public.v_company_features as
select
  c.id                                            as company_id,
  coalesce(p.code, 'free')                        as plan_code,
  coalesce(p.features, '{}'::jsonb)               as features,
  coalesce((p.features ->> 'pwa_premium')::bool, false)        as pwa_premium,
  coalesce((p.features ->> 'whatsapp')::bool, false)           as whatsapp,
  coalesce((p.features ->> 'affiliates')::bool, false)         as affiliates,
  coalesce((p.features ->> 'analytics_advanced')::bool, false) as analytics_advanced
from public.companies c
left join lateral (
  select cs.plan_id
  from public.company_subscriptions cs
  where cs.company_id = c.id
    and cs.status in ('trialing','active')
    and (cs.ends_at is null or cs.ends_at > now())
  order by cs.starts_at desc
  limit 1
) active on true
left join public.platform_plans p on p.id = active.plan_id;

grant select on public.v_company_features to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Analytics de produto (eventos leves)
-- ---------------------------------------------------------------------
create table if not exists public.analytics_events (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  company_id    uuid references public.companies(id) on delete set null,
  unit_id       uuid references public.units(id)     on delete set null,
  user_id       uuid references auth.users(id)       on delete set null,
  session_id    text,
  event_name    text not null,
  path          text,
  referrer      text,
  ua            text,
  props         jsonb not null default '{}'::jsonb
);
create index if not exists analytics_events_company_time on public.analytics_events(company_id, occurred_at desc);
create index if not exists analytics_events_name_time    on public.analytics_events(event_name, occurred_at desc);
create index if not exists analytics_events_user_time    on public.analytics_events(user_id, occurred_at desc);

grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;
grant all    on public.analytics_events to service_role;

alter table public.analytics_events enable row level security;
drop policy if exists ae_insert on public.analytics_events;
create policy ae_insert on public.analytics_events for insert
  with check (
    user_id is null or user_id = auth.uid()
  );
drop policy if exists ae_read on public.analytics_events;
create policy ae_read on public.analytics_events for select
  using (
    public.is_platform_admin(auth.uid())
    or (company_id is not null and public.user_in_company(auth.uid(), company_id))
  );

-- ---------------------------------------------------------------------
-- 3. KPIs agregados por dia (empresa / unidade / barbeiro)
-- ---------------------------------------------------------------------
create table if not exists public.kpi_daily (
  company_id       uuid not null references public.companies(id) on delete cascade,
  unit_id          uuid references public.units(id)              on delete cascade,
  barber_id        uuid references public.barbers(id)            on delete set null,
  day              date not null,
  bookings_total   int  not null default 0,
  bookings_done    int  not null default 0,
  bookings_canceled int not null default 0,
  gross_cents      bigint not null default 0,
  net_cents        bigint not null default 0,
  commissions_cents bigint not null default 0,
  new_clients      int  not null default 0,
  reviews_count    int  not null default 0,
  rating_avg       numeric(3,2),
  primary key (company_id, coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(barber_id,'00000000-0000-0000-0000-000000000000'::uuid), day)
);
create index if not exists kpi_daily_day on public.kpi_daily(day);
grant select on public.kpi_daily to authenticated;
grant all    on public.kpi_daily to service_role;

alter table public.kpi_daily enable row level security;
drop policy if exists kpi_read on public.kpi_daily;
create policy kpi_read on public.kpi_daily for select
  using (public.is_platform_admin(auth.uid())
      or public.user_in_company(auth.uid(), company_id));

-- Função de recomputação (chamável via pg_cron / edge function noturna).
create or replace function public.kpi_recompute_day(_company_id uuid, _day date)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.kpi_daily where company_id = _company_id and day = _day;

  insert into public.kpi_daily(company_id, unit_id, barber_id, day,
       bookings_total, bookings_done, bookings_canceled, gross_cents, net_cents)
  select b.company_id, b.unit_id, b.barber_id, _day,
         count(*),
         count(*) filter (where b.status = 'completed'),
         count(*) filter (where b.status = 'canceled'),
         coalesce(sum(b.total_cents),0),
         coalesce(sum(b.total_cents) filter (where b.status = 'completed'),0)
  from public.bookings b
  where b.company_id = _company_id
    and b.starts_at::date = _day
  group by b.company_id, b.unit_id, b.barber_id;
end $$;

grant execute on function public.kpi_recompute_day(uuid,date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Views prontas para dashboards por papel
-- ---------------------------------------------------------------------
-- Dashboard proprietário/gerente: últimos 30 dias por empresa
create or replace view public.v_dashboard_company_30d as
select
  company_id,
  sum(bookings_total)                              as bookings_total,
  sum(bookings_done)                               as bookings_done,
  sum(bookings_canceled)                           as bookings_canceled,
  sum(gross_cents)                                 as gross_cents,
  sum(net_cents)                                   as net_cents,
  sum(new_clients)                                 as new_clients,
  avg(rating_avg)                                  as rating_avg
from public.kpi_daily
where day >= (current_date - interval '30 days')::date
group by company_id;

grant select on public.v_dashboard_company_30d to authenticated;

-- Dashboard barbeiro: agenda de hoje + ganhos do mês
create or replace view public.v_dashboard_barber_today as
select
  b.id                as barber_id,
  b.company_id,
  (select count(*) from public.bookings bk
    where bk.barber_id = b.id and bk.starts_at::date = current_date
      and bk.status in ('confirmed','pending','in_progress')) as today_bookings,
  (select coalesce(sum(bk.total_cents),0) from public.bookings bk
    where bk.barber_id = b.id
      and date_trunc('month', bk.starts_at) = date_trunc('month', now())
      and bk.status = 'completed') as month_gross_cents,
  b.rating_avg,
  b.rating_count
from public.barbers b;

grant select on public.v_dashboard_barber_today to authenticated;

-- Dashboard CEO/plataforma: totais globais
create or replace view public.v_dashboard_platform as
select
  (select count(*) from public.companies where is_active) as companies_active,
  (select count(*) from public.units)                     as units_total,
  (select count(*) from public.barbers)                   as barbers_total,
  (select count(*) from public.clients)                   as clients_total,
  (select coalesce(sum(gross_cents),0) from public.kpi_daily
    where day >= (current_date - interval '30 days')::date) as gross_30d_cents,
  (select count(*) from public.company_subscriptions
    where status in ('trialing','active'))                 as paying_companies;

grant select on public.v_dashboard_platform to authenticated;

-- Restringe leitura de v_dashboard_platform a platform admins via wrapper:
create or replace function public.dashboard_platform()
returns setof public.v_dashboard_platform
language sql stable security definer set search_path = public as $$
  select * from public.v_dashboard_platform
  where public.is_platform_admin(auth.uid());
$$;
grant execute on function public.dashboard_platform() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Auditoria
-- ---------------------------------------------------------------------
do $$ begin
  perform public.attach_audit('public.platform_plans');
  perform public.attach_audit('public.company_subscriptions');
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 6. (Opcional) Agendamento noturno via pg_cron
-- ---------------------------------------------------------------------
-- select cron.schedule('kpi-nightly', '15 3 * * *', $$
--   do $b$
--   declare c record;
--   begin
--     for c in select id from public.companies where is_active loop
--       perform public.kpi_recompute_day(c.id, current_date - 1);
--     end loop;
--   end $b$;
-- $$);

-- =====================================================================
-- FIM DA FASE 9
-- =====================================================================
