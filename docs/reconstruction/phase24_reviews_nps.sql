-- =====================================================================
-- FASE 24: Reviews, NPS e reputação
-- =====================================================================
begin;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  barber_id uuid references public.barbers(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text,
  reply text,
  replied_by uuid references auth.users(id),
  replied_at timestamptz,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  unique (booking_id)
);
create index if not exists rev_company_idx on public.reviews(company_id, created_at desc);
create index if not exists rev_barber_idx on public.reviews(barber_id) where barber_id is not null;

create table if not exists public.nps_surveys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  score int not null check (score between 0 and 10),
  category text generated always as (case when score>=9 then 'promoter' when score>=7 then 'passive' else 'detractor' end) stored,
  feedback text,
  sent_at timestamptz not null default now(),
  answered_at timestamptz
);

grant select, insert, update on public.reviews to authenticated;
grant select, insert on public.nps_surveys to authenticated;
grant all on public.reviews, public.nps_surveys to service_role;

alter table public.reviews enable row level security;
alter table public.nps_surveys enable row level security;

create policy rev_public_read on public.reviews for select using (is_public);
create policy rev_owner_write on public.reviews for insert to authenticated
  with check (public.is_member_of(company_id) or exists(select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));
create policy rev_staff_reply on public.reviews for update to authenticated
  using (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')))
  with check (public.is_member_of(company_id));

create policy nps_read on public.nps_surveys for select to authenticated
  using (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')) or exists(select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));
create policy nps_insert on public.nps_surveys for insert to authenticated
  with check (exists(select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));

commit;
