-- =====================================================================
-- FASE 30: Deploy, releases e observabilidade
-- =====================================================================
begin;

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  channel text not null default 'stable' check (channel in ('canary','beta','stable','hotfix')),
  git_sha text,
  released_at timestamptz not null default now(),
  released_by uuid references auth.users(id),
  changelog text,
  rollback_of uuid references public.releases(id)
);

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  release_version text,
  environment text not null default 'production',
  level text not null default 'error' check (level in ('debug','info','warn','error','fatal')),
  message text not null,
  stack text,
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  fingerprint text
);
create index if not exists ee_fingerprint_idx on public.error_events(fingerprint, occurred_at desc);
create index if not exists ee_time_idx on public.error_events(occurred_at desc);

create table if not exists public.metrics_samples (
  id bigserial primary key,
  metric text not null,
  value numeric not null,
  labels jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists ms_metric_time_idx on public.metrics_samples(metric, observed_at desc);

create table if not exists public.slo_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  target_pct numeric(5,2) not null check (target_pct between 0 and 100),
  window_days int not null default 30,
  metric text not null,
  threshold numeric not null,
  created_at timestamptz not null default now()
);

grant select on public.releases to authenticated;
grant select, insert on public.error_events to authenticated;
grant select, insert on public.metrics_samples to authenticated;
grant select on public.slo_definitions to authenticated;
grant all on public.releases, public.error_events, public.metrics_samples, public.slo_definitions to service_role;

alter table public.releases enable row level security;
alter table public.error_events enable row level security;
alter table public.metrics_samples enable row level security;
alter table public.slo_definitions enable row level security;

create policy rel_read on public.releases for select using (true);
create policy rel_admin on public.releases for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

create policy ee_insert on public.error_events for insert to authenticated
  with check (user_id is null or user_id = auth.uid());
create policy ee_read on public.error_events for select to authenticated
  using (public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support'));

create policy ms_insert on public.metrics_samples for insert to authenticated with check (true);
create policy ms_read on public.metrics_samples for select to authenticated using (public.has_role(auth.uid(),'platform_admin'));

create policy slo_read on public.slo_definitions for select to authenticated using (true);
create policy slo_admin on public.slo_definitions for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

commit;
