-- =====================================================================
-- FASE 23: Analytics, KPIs e dashboards
-- =====================================================================
begin;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists ae_company_time_idx on public.analytics_events(company_id, occurred_at desc);
create index if not exists ae_event_time_idx on public.analytics_events(event_name, occurred_at desc);

create table if not exists public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  granularity text not null check (granularity in ('day','week','month')),
  bookings_count int not null default 0,
  revenue_gross numeric(14,2) not null default 0,
  revenue_net numeric(14,2) not null default 0,
  active_clients int not null default 0,
  new_clients int not null default 0,
  no_show_count int not null default 0,
  cancellation_count int not null default 0,
  avg_ticket numeric(12,2) not null default 0,
  computed_at timestamptz not null default now(),
  unique (company_id, granularity, period_start)
);

create or replace view public.v_bookings_daily as
  select company_id, date_trunc('day', starts_at)::date as day,
         count(*) filter (where status not in ('cancelled')) as booked,
         count(*) filter (where status='completed') as completed,
         count(*) filter (where status='no_show') as no_show,
         count(*) filter (where status='cancelled') as cancelled
    from public.bookings
   group by 1,2;

grant select, insert on public.analytics_events to authenticated;
grant select on public.kpi_snapshots to authenticated;
grant all on public.analytics_events, public.kpi_snapshots to service_role;

alter table public.analytics_events enable row level security;
alter table public.kpi_snapshots enable row level security;

create policy ae_insert on public.analytics_events for insert to authenticated
  with check (user_id = auth.uid() and (company_id is null or public.is_member_of(company_id)));
create policy ae_read on public.analytics_events for select to authenticated
  using (public.has_role(auth.uid(),'platform_admin') or (company_id is not null and public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager'))));

create policy ks_read on public.kpi_snapshots for select to authenticated
  using (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')) or public.has_role(auth.uid(),'platform_admin'));

commit;
