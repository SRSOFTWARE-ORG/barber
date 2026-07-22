-- =====================================================================
-- FASE 28: LGPD/GDPR - consentimento, DSR, retenção
-- =====================================================================
begin;

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  purpose text not null,
  version text not null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  revoked_at timestamptz
);
create index if not exists pc_user_idx on public.privacy_consents(user_id);
create index if not exists pc_client_idx on public.privacy_consents(client_id);

create table if not exists public.dsr_requests (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references auth.users(id),
  subject_email text,
  kind text not null check (kind in ('access','rectification','deletion','portability','object')),
  status text not null default 'received' check (status in ('received','processing','completed','rejected')),
  requested_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '15 days'),
  completed_at timestamptz,
  notes text,
  export_url text
);

create table if not exists public.data_retention_policies (
  entity text primary key,
  retention_days int not null check (retention_days>0),
  purge_strategy text not null default 'delete' check (purge_strategy in ('delete','anonymize')),
  updated_at timestamptz not null default now()
);

insert into public.data_retention_policies(entity,retention_days,purge_strategy) values
 ('auth_logs',365,'delete'),
 ('analytics_events',730,'anonymize'),
 ('wa_webhook_events',180,'delete')
on conflict do nothing;

grant select, insert on public.privacy_consents to authenticated;
grant select, insert on public.dsr_requests to authenticated, anon;
grant select on public.data_retention_policies to authenticated;
grant all on public.privacy_consents, public.dsr_requests, public.data_retention_policies to service_role;

alter table public.privacy_consents enable row level security;
alter table public.dsr_requests enable row level security;
alter table public.data_retention_policies enable row level security;

create policy pc_self on public.privacy_consents for select to authenticated
  using (user_id = auth.uid() or exists(select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()) or public.has_role(auth.uid(),'platform_admin'));
create policy pc_insert on public.privacy_consents for insert to authenticated, anon with check (true);

create policy dsr_open on public.dsr_requests for insert to authenticated, anon with check (true);
create policy dsr_read on public.dsr_requests for select to authenticated
  using (subject_user_id = auth.uid() or public.has_role(auth.uid(),'platform_admin'));

create policy drp_read on public.data_retention_policies for select using (true);
create policy drp_admin on public.data_retention_policies for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

commit;
