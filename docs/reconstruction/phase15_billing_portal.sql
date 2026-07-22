-- =====================================================================
-- FASE 15: Portal de billing self-service
-- Requer: Fases 13, 14
-- =====================================================================
begin;

create table if not exists public.billing_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe','paddle')),
  provider_session_id text,
  return_url text,
  url text,
  status text not null default 'pending' check (status in ('pending','active','closed','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  closed_at timestamptz
);
create index if not exists billing_portal_sessions_company_idx on public.billing_portal_sessions(company_id);
create index if not exists billing_portal_sessions_user_idx on public.billing_portal_sessions(user_id);

create table if not exists public.billing_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  from_plan_id uuid references public.platform_plans(id),
  to_plan_id uuid not null references public.platform_plans(id),
  cycle text not null check (cycle in ('monthly','yearly')),
  status text not null default 'pending' check (status in ('pending','applied','failed','cancelled')),
  reason text,
  scheduled_for timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bpcr_company_idx on public.billing_plan_change_requests(company_id, status);

create table if not exists public.billing_payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  provider_pm_id text not null,
  brand text,
  last4 text,
  exp_month int,
  exp_year int,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, provider_pm_id)
);
create index if not exists bpm_company_idx on public.billing_payment_methods(company_id);

grant select, insert, update, delete on public.billing_portal_sessions to authenticated;
grant select, insert, update, delete on public.billing_plan_change_requests to authenticated;
grant select, insert, update, delete on public.billing_payment_methods to authenticated;
grant all on public.billing_portal_sessions, public.billing_plan_change_requests, public.billing_payment_methods to service_role;

alter table public.billing_portal_sessions enable row level security;
alter table public.billing_plan_change_requests enable row level security;
alter table public.billing_payment_methods enable row level security;

create policy bps_owner_read on public.billing_portal_sessions for select to authenticated
  using (public.has_role(auth.uid(), 'owner') and public.is_member_of(company_id));
create policy bps_owner_write on public.billing_portal_sessions for insert to authenticated
  with check (user_id = auth.uid() and public.has_role(auth.uid(), 'owner') and public.is_member_of(company_id));
create policy bps_platform_all on public.billing_portal_sessions for all to authenticated
  using (public.has_role(auth.uid(), 'platform_admin')) with check (public.has_role(auth.uid(), 'platform_admin'));

create policy bpcr_owner_rw on public.billing_plan_change_requests for all to authenticated
  using (public.has_role(auth.uid(), 'owner') and public.is_member_of(company_id))
  with check (public.has_role(auth.uid(), 'owner') and public.is_member_of(company_id));
create policy bpcr_platform_all on public.billing_plan_change_requests for all to authenticated
  using (public.has_role(auth.uid(), 'platform_admin')) with check (public.has_role(auth.uid(), 'platform_admin'));

create policy bpm_owner_read on public.billing_payment_methods for select to authenticated
  using (public.is_member_of(company_id) and (public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'manager')));
create policy bpm_service_write on public.billing_payment_methods for all to service_role using (true) with check (true);

-- Apply a plan change request (called by webhook reconciler after payment confirms)
create or replace function public.billing_apply_plan_change(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.billing_plan_change_requests%rowtype;
begin
  select * into r from public.billing_plan_change_requests where id = _request_id for update;
  if r.id is null then raise exception 'request not found'; end if;
  if r.status <> 'pending' then return; end if;
  update public.platform_subscriptions
     set plan_id = r.to_plan_id, cycle = r.cycle, updated_at = now()
   where company_id = r.company_id and status in ('active','trialing');
  update public.billing_plan_change_requests set status='applied', applied_at=now() where id=_request_id;
end $$;
revoke all on function public.billing_apply_plan_change(uuid) from public;
grant execute on function public.billing_apply_plan_change(uuid) to service_role;

commit;
