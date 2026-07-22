-- =====================================================================
-- FASE 16: Onboarding e trial de empresa (wizard multi-etapas)
-- =====================================================================
begin;

create table if not exists public.onboarding_flows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  started_by uuid not null references auth.users(id),
  current_step int not null default 1,
  total_steps int not null default 6,
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  data jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (company_id)
);

create table if not exists public.onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.onboarding_flows(id) on delete cascade,
  step_number int not null,
  step_key text not null,
  completed boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  unique (flow_id, step_number)
);
create index if not exists onboarding_steps_flow_idx on public.onboarding_steps(flow_id);

grant select, insert, update, delete on public.onboarding_flows, public.onboarding_steps to authenticated;
grant all on public.onboarding_flows, public.onboarding_steps to service_role;

alter table public.onboarding_flows enable row level security;
alter table public.onboarding_steps enable row level security;

create policy of_owner_rw on public.onboarding_flows for all to authenticated
  using (public.is_member_of(company_id) and public.has_role(auth.uid(),'owner'))
  with check (public.is_member_of(company_id) and public.has_role(auth.uid(),'owner'));

create policy os_via_flow on public.onboarding_steps for all to authenticated
  using (exists(select 1 from public.onboarding_flows f where f.id=flow_id and public.is_member_of(f.company_id) and public.has_role(auth.uid(),'owner')))
  with check (exists(select 1 from public.onboarding_flows f where f.id=flow_id and public.is_member_of(f.company_id) and public.has_role(auth.uid(),'owner')));

create or replace function public.onboarding_advance(_flow_id uuid, _step_key text, _payload jsonb default '{}'::jsonb)
returns int language plpgsql security definer set search_path=public as $$
declare v_step int; v_total int;
begin
  select current_step, total_steps into v_step, v_total from public.onboarding_flows where id=_flow_id for update;
  insert into public.onboarding_steps(flow_id, step_number, step_key, completed, payload, completed_at)
    values (_flow_id, v_step, _step_key, true, _payload, now())
    on conflict (flow_id, step_number) do update set completed=true, payload=excluded.payload, completed_at=now();
  if v_step >= v_total then
    update public.onboarding_flows set status='completed', completed_at=now(), current_step=v_total where id=_flow_id;
  else
    update public.onboarding_flows set current_step = v_step+1 where id=_flow_id;
  end if;
  return v_step+1;
end $$;
grant execute on function public.onboarding_advance(uuid,text,jsonb) to authenticated;

commit;
