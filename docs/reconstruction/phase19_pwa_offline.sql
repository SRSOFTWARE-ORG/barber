-- =====================================================================
-- FASE 19: PWA / Offline sync (mutations enfileiradas do cliente)
-- =====================================================================
begin;

create table if not exists public.offline_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  client_mutation_id text not null,
  entity text not null,
  op text not null check (op in ('insert','update','delete')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','applied','rejected','conflict')),
  applied_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, client_mutation_id)
);
create index if not exists om_user_status_idx on public.offline_mutations(user_id, status);

create table if not exists public.pwa_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  platform text,
  push_endpoint text,
  push_p256dh text,
  push_auth text,
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_fingerprint)
);

grant select, insert, update on public.offline_mutations to authenticated;
grant select, insert, update, delete on public.pwa_devices to authenticated;
grant all on public.offline_mutations, public.pwa_devices to service_role;

alter table public.offline_mutations enable row level security;
alter table public.pwa_devices enable row level security;

create policy om_self on public.offline_mutations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pd_self on public.pwa_devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

commit;
