-- =====================================================================
-- FASE 20: Capacitor / mobile (push tokens, versões, force update)
-- =====================================================================
begin;

create table if not exists public.mobile_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  device_id text not null,
  push_token text,
  app_version text,
  os_version text,
  model text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);
create index if not exists md_token_idx on public.mobile_devices(push_token) where push_token is not null;

create table if not exists public.mobile_app_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios','android')),
  version text not null,
  min_supported boolean not null default false,
  force_update boolean not null default false,
  release_notes text,
  released_at timestamptz not null default now(),
  unique (platform, version)
);

grant select, insert, update, delete on public.mobile_devices to authenticated;
grant select on public.mobile_app_versions to authenticated;
grant all on public.mobile_devices, public.mobile_app_versions to service_role;

alter table public.mobile_devices enable row level security;
alter table public.mobile_app_versions enable row level security;

create policy md_self on public.mobile_devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mav_read on public.mobile_app_versions for select to authenticated using (true);
create policy mav_platform_write on public.mobile_app_versions for all to authenticated
  using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

commit;
