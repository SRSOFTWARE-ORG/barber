-- =====================================================================
-- FASE 18: Integrações externas (calendars, apis, oauth tokens)
-- =====================================================================
begin;

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  status text not null default 'active' check (status in ('active','revoked','error')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (company_id, provider)
);

create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  scopes text[],
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists it_integration_idx on public.integration_tokens(integration_id);

create table if not exists public.calendar_sync_map (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  external_event_id text not null,
  last_synced_at timestamptz not null default now(),
  unique (integration_id, booking_id),
  unique (integration_id, external_event_id)
);

grant select, insert, update, delete on public.integrations to authenticated;
grant select on public.integration_tokens to authenticated;
grant all on public.integration_tokens to service_role;
grant select, insert, update, delete on public.calendar_sync_map to authenticated;
grant all on public.integrations, public.calendar_sync_map to service_role;

alter table public.integrations enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.calendar_sync_map enable row level security;

create policy int_rw on public.integrations for all to authenticated
  using (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')))
  with check (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')));

create policy it_owner_read on public.integration_tokens for select to authenticated
  using (exists(select 1 from public.integrations i where i.id=integration_id and public.is_member_of(i.company_id) and public.has_role(auth.uid(),'owner')));

create policy csm_rw on public.calendar_sync_map for all to authenticated
  using (exists(select 1 from public.integrations i where i.id=integration_id and public.is_member_of(i.company_id)))
  with check (exists(select 1 from public.integrations i where i.id=integration_id and public.is_member_of(i.company_id)));

commit;
