-- =====================================================================
-- FASE 29: Backups, Disaster Recovery e health checks
-- =====================================================================
begin;

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('full','incremental','logical','wal')),
  status text not null default 'running' check (status in ('running','success','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  size_bytes bigint,
  location text,
  error text,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists br_time_idx on public.backup_runs(started_at desc);

create table if not exists public.restore_drills (
  id uuid primary key default gen_random_uuid(),
  backup_run_id uuid references public.backup_runs(id) on delete set null,
  executed_by uuid references auth.users(id),
  executed_at timestamptz not null default now(),
  rto_minutes int,
  rpo_minutes int,
  success boolean not null default false,
  notes text
);

create table if not exists public.health_checks (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  status text not null check (status in ('up','degraded','down')),
  latency_ms int,
  message text,
  checked_at timestamptz not null default now()
);
create index if not exists hc_component_time_idx on public.health_checks(component, checked_at desc);

grant select on public.backup_runs, public.restore_drills, public.health_checks to authenticated;
grant all on public.backup_runs, public.restore_drills, public.health_checks to service_role;

alter table public.backup_runs enable row level security;
alter table public.restore_drills enable row level security;
alter table public.health_checks enable row level security;

create policy br_read on public.backup_runs for select to authenticated using (public.has_role(auth.uid(),'platform_admin'));
create policy rd_read on public.restore_drills for select to authenticated using (public.has_role(auth.uid(),'platform_admin'));
create policy hc_read on public.health_checks for select to authenticated using (public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support'));

commit;
