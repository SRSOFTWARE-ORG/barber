-- =====================================================================
-- FASE 26: Loyalty / pontos / cashback
-- =====================================================================
begin;

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  currency text not null default 'points',
  earn_rate numeric(6,4) not null default 1,
  redeem_rate numeric(6,4) not null default 0.01,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  balance numeric(14,4) not null default 0,
  lifetime_earned numeric(14,4) not null default 0,
  lifetime_redeemed numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (program_id, client_id)
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in ('earn','redeem','adjust','expire')),
  amount numeric(14,4) not null,
  balance_after numeric(14,4) not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists lt_account_idx on public.loyalty_transactions(account_id, created_at desc);

grant select, insert, update on public.loyalty_programs, public.loyalty_accounts, public.loyalty_transactions to authenticated;
grant all on public.loyalty_programs, public.loyalty_accounts, public.loyalty_transactions to service_role;

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;

create policy lp_rw on public.loyalty_programs for all to authenticated
  using (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')))
  with check (public.is_member_of(company_id) and (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'manager')));

create policy la_read on public.loyalty_accounts for select to authenticated
  using (exists(select 1 from public.loyalty_programs p where p.id=program_id and public.is_member_of(p.company_id))
      or exists(select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));

create policy lt_read on public.loyalty_transactions for select to authenticated
  using (exists(select 1 from public.loyalty_accounts a join public.loyalty_programs p on p.id=a.program_id
                where a.id=account_id and (public.is_member_of(p.company_id) or exists(select 1 from public.clients c where c.id=a.client_id and c.user_id=auth.uid()))));

create or replace function public.loyalty_apply(_account_id uuid, _kind text, _amount numeric, _booking_id uuid default null, _reason text default null)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_new numeric(14,4);
begin
  update public.loyalty_accounts
     set balance = balance + case when _kind='earn' then _amount when _kind='redeem' then -_amount when _kind='adjust' then _amount when _kind='expire' then -_amount end,
         lifetime_earned = lifetime_earned + case when _kind='earn' then _amount else 0 end,
         lifetime_redeemed = lifetime_redeemed + case when _kind='redeem' then _amount else 0 end,
         updated_at = now()
   where id=_account_id returning balance into v_new;
  insert into public.loyalty_transactions(account_id,booking_id,kind,amount,balance_after,reason,created_by)
    values (_account_id,_booking_id,_kind,_amount,v_new,_reason,auth.uid());
  return v_new;
end $$;
grant execute on function public.loyalty_apply(uuid,text,numeric,uuid,text) to authenticated;

commit;
