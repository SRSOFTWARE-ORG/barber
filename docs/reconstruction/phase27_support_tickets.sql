-- =====================================================================
-- FASE 27: Suporte e tickets internos
-- =====================================================================
begin;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  subject text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  category text,
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists st_status_idx on public.support_tickets(status, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_internal boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sm_ticket_idx on public.support_messages(ticket_id, created_at);

grant select, insert, update on public.support_tickets, public.support_messages to authenticated;
grant all on public.support_tickets, public.support_messages to service_role;

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy st_participant on public.support_tickets for select to authenticated
  using (requested_by = auth.uid()
      or assigned_to = auth.uid()
      or public.has_role(auth.uid(),'platform_admin')
      or public.has_role(auth.uid(),'platform_support')
      or (company_id is not null and public.is_member_of(company_id) and public.has_role(auth.uid(),'owner')));
create policy st_open on public.support_tickets for insert to authenticated
  with check (requested_by = auth.uid() and (company_id is null or public.is_member_of(company_id)));
create policy st_staff_update on public.support_tickets for update to authenticated
  using (public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support') or assigned_to = auth.uid())
  with check (public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support') or assigned_to = auth.uid());

create policy sm_read on public.support_messages for select to authenticated
  using (exists(select 1 from public.support_tickets t where t.id=ticket_id
                 and (t.requested_by=auth.uid() or t.assigned_to=auth.uid()
                      or public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support')
                      or (t.company_id is not null and public.is_member_of(t.company_id) and public.has_role(auth.uid(),'owner'))))
      and (not is_internal or public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support')));
create policy sm_write on public.support_messages for insert to authenticated
  with check (author_id = auth.uid() and exists(select 1 from public.support_tickets t where t.id=ticket_id
                and (t.requested_by=auth.uid() or t.assigned_to=auth.uid()
                     or public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support'))));

commit;
