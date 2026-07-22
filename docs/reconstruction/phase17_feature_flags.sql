-- =====================================================================
-- FASE 17: Feature flags e configuração por empresa
-- =====================================================================
begin;

create table if not exists public.feature_flags (
  key text primary key,
  description text,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.company_feature_flags (
  company_id uuid not null references public.companies(id) on delete cascade,
  flag_key text not null references public.feature_flags(key) on delete cascade,
  enabled boolean not null,
  overridden_by uuid references auth.users(id),
  overridden_at timestamptz not null default now(),
  primary key (company_id, flag_key)
);

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL',
  locale text not null default 'pt-BR',
  business_hours jsonb not null default '{}'::jsonb,
  booking_lead_minutes int not null default 30,
  booking_cancellation_hours int not null default 24,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

grant select on public.feature_flags to authenticated;
grant all on public.feature_flags to service_role;
grant select, insert, update, delete on public.company_feature_flags, public.company_settings to authenticated;
grant all on public.company_feature_flags, public.company_settings to service_role;

alter table public.feature_flags enable row level security;
alter table public.company_feature_flags enable row level security;
alter table public.company_settings enable row level security;

create policy ff_read_all on public.feature_flags for select to authenticated using (true);
create policy ff_platform_write on public.feature_flags for all to authenticated
  using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

create policy cff_read on public.company_feature_flags for select to authenticated using (public.is_member_of(company_id));
create policy cff_owner_write on public.company_feature_flags for all to authenticated
  using (public.is_member_of(company_id) and public.has_role(auth.uid(),'owner'))
  with check (public.is_member_of(company_id) and public.has_role(auth.uid(),'owner'));

create policy cs_read on public.company_settings for select to authenticated using (public.is_member_of(company_id));
create policy cs_owner_write on public.company_settings for all to authenticated
  using (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')))
  with check (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')));

create or replace function public.feature_enabled(_company_id uuid, _flag text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    (select enabled from public.company_feature_flags where company_id=_company_id and flag_key=_flag),
    (select default_enabled from public.feature_flags where key=_flag),
    false
  )
$$;
grant execute on function public.feature_enabled(uuid,text) to authenticated;

commit;
