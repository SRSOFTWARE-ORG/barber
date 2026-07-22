-- =====================================================================
-- FASE 25: Programa de afiliados
-- =====================================================================
begin;

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique,
  commission_pct numeric(5,2) not null default 20 check (commission_pct between 0 and 100),
  status text not null default 'active' check (status in ('active','paused','revoked')),
  payout_method text,
  payout_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  referred_company_id uuid references public.companies(id) on delete set null,
  referred_email text,
  visited_at timestamptz not null default now(),
  signed_up_at timestamptz,
  first_paid_at timestamptz,
  status text not null default 'visited' check (status in ('visited','signed_up','paid','churned'))
);
create index if not exists ar_aff_idx on public.affiliate_referrals(affiliate_id);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  referral_id uuid not null references public.affiliate_referrals(id) on delete cascade,
  invoice_id uuid references public.platform_invoices(id) on delete set null,
  amount numeric(12,2) not null check (amount>=0),
  status text not null default 'accrued' check (status in ('accrued','approved','paid','void')),
  accrued_at timestamptz not null default now(),
  paid_at timestamptz
);

grant select, insert, update on public.affiliates to authenticated;
grant select on public.affiliate_referrals, public.affiliate_commissions to authenticated;
grant all on public.affiliates, public.affiliate_referrals, public.affiliate_commissions to service_role;

alter table public.affiliates enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;

create policy aff_self on public.affiliates for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'platform_admin'));
create policy aff_signup on public.affiliates for insert to authenticated
  with check (user_id = auth.uid());
create policy aff_admin on public.affiliates for update to authenticated
  using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

create policy ar_read on public.affiliate_referrals for select to authenticated
  using (exists(select 1 from public.affiliates a where a.id=affiliate_id and a.user_id=auth.uid()) or public.has_role(auth.uid(),'platform_admin'));

create policy ac_read on public.affiliate_commissions for select to authenticated
  using (exists(select 1 from public.affiliates a where a.id=affiliate_id and a.user_id=auth.uid()) or public.has_role(auth.uid(),'platform_admin'));

commit;
