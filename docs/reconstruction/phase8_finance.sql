-- =====================================================================
-- FASE 8 — Financeiro: fechamento de período, repasses e comprovantes
-- Pré-requisitos: fases 2, 3, 5, 6, 7 aplicadas.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname='closing_status') then
    create type public.closing_status as enum ('open','closed','reopened');
  end if;
  if not exists (select 1 from pg_type where typname='payout_status') then
    create type public.payout_status as enum ('pending','processing','paid','failed','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname='payout_method') then
    create type public.payout_method as enum ('pix','bank_transfer','cash','other');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2) period_closings (fechamento mensal por empresa)
-- ---------------------------------------------------------------------
create table if not exists public.period_closings (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  status         public.closing_status not null default 'open',
  gross_total    numeric(12,2) not null default 0,
  barber_total   numeric(12,2) not null default 0,
  house_total    numeric(12,2) not null default 0,
  bookings_count integer       not null default 0,
  closed_by      uuid references auth.users(id),
  closed_at      timestamptz,
  reopened_by    uuid references auth.users(id),
  reopened_at    timestamptz,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start),
  unique (company_id, period_start, period_end)
);
create index if not exists idx_pc_company_period on public.period_closings(company_id, period_start desc);

-- ---------------------------------------------------------------------
-- 3) payouts (repasse a um barbeiro dentro de um fechamento)
-- ---------------------------------------------------------------------
create table if not exists public.payouts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  closing_id    uuid not null references public.period_closings(id) on delete cascade,
  barber_id     uuid not null references public.barbers(id) on delete restrict,
  gross_amount  numeric(12,2) not null default 0,
  barber_amount numeric(12,2) not null default 0,
  house_amount  numeric(12,2) not null default 0,
  bookings_count integer      not null default 0,
  method        public.payout_method,
  status        public.payout_status not null default 'pending',
  reference     text,                 -- e.g. TXID Pix / número de transferência
  paid_at       timestamptz,
  paid_by       uuid references auth.users(id),
  notes         text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (closing_id, barber_id)
);
create index if not exists idx_payouts_company on public.payouts(company_id, created_at desc);
create index if not exists idx_payouts_barber  on public.payouts(barber_id, created_at desc);
create index if not exists idx_payouts_status  on public.payouts(company_id, status);

-- ---------------------------------------------------------------------
-- 4) payout_splits (elo N:N entre payouts e revenue_splits)
-- ---------------------------------------------------------------------
create table if not exists public.payout_splits (
  payout_id uuid not null references public.payouts(id) on delete cascade,
  split_id  uuid not null references public.revenue_splits(id) on delete restrict,
  primary key (payout_id, split_id)
);
create index if not exists idx_payout_splits_split on public.payout_splits(split_id);

-- Marca no revenue_splits que ele já foi incluído em um payout (evita duplicar)
alter table public.revenue_splits
  add column if not exists paid_payout_id uuid references public.payouts(id) on delete set null,
  add column if not exists paid_at        timestamptz;
create index if not exists idx_rs_paid on public.revenue_splits(paid_payout_id);

-- ---------------------------------------------------------------------
-- 5) payout_receipts (comprovantes)
-- ---------------------------------------------------------------------
create table if not exists public.payout_receipts (
  id           uuid primary key default gen_random_uuid(),
  payout_id    uuid not null references public.payouts(id) on delete cascade,
  file_url     text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references auth.users(id),
  uploaded_at  timestamptz not null default now(),
  notes        text
);
create index if not exists idx_receipts_payout on public.payout_receipts(payout_id);

-- ---------------------------------------------------------------------
-- 6) Funções: preview, geração e fechamento
-- ---------------------------------------------------------------------
-- 6.1 Preview: retorna totais por barbeiro no período (sem gravar)
create or replace function public.preview_closing(_company uuid, _start date, _end date)
returns table(barber_id uuid, bookings_count int, gross_amount numeric, barber_amount numeric, house_amount numeric)
language sql stable security definer set search_path=public as $$
  select rs.barber_id,
         count(*)::int as bookings_count,
         coalesce(sum(rs.gross_amount),0)  as gross_amount,
         coalesce(sum(rs.barber_share),0)  as barber_amount,
         coalesce(sum(rs.house_share),0)   as house_amount
    from public.revenue_splits rs
   where rs.company_id = _company
     and rs.created_at >= _start
     and rs.created_at <  (_end + 1)
     and rs.paid_payout_id is null
   group by rs.barber_id
$$;

-- 6.2 Cria (ou reutiliza) um fechamento em status 'open' e gera payouts a partir dos splits pendentes
create or replace function public.generate_closing(_company uuid, _start date, _end date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_closing uuid;
  v_actor   uuid := auth.uid();
begin
  -- Permissão: owner/manager ou platform staff
  if not (public.is_platform_staff(v_actor)
          or public.has_role(v_actor, _company, 'owner')
          or public.has_role(v_actor, _company, 'manager')) then
    raise exception 'forbidden';
  end if;

  insert into public.period_closings(company_id, period_start, period_end)
  values (_company, _start, _end)
  on conflict (company_id, period_start, period_end) do update
      set updated_at = now()
  returning id into v_closing;

  -- Recusa se já estiver fechado
  if (select status from public.period_closings where id = v_closing) = 'closed' then
    raise exception 'closing already closed; reopen before regenerating';
  fi;

  -- Cria payouts por barbeiro
  insert into public.payouts(company_id, closing_id, barber_id, gross_amount, barber_amount, house_amount, bookings_count)
  select _company, v_closing, p.barber_id, p.gross_amount, p.barber_amount, p.house_amount, p.bookings_count
    from public.preview_closing(_company, _start, _end) p
  on conflict (closing_id, barber_id) do update
    set gross_amount   = excluded.gross_amount,
        barber_amount  = excluded.barber_amount,
        house_amount   = excluded.house_amount,
        bookings_count = excluded.bookings_count,
        updated_at     = now();

  -- Recompute totais no closing
  update public.period_closings pc
     set gross_total    = coalesce((select sum(gross_amount)  from public.payouts where closing_id = pc.id), 0),
         barber_total   = coalesce((select sum(barber_amount) from public.payouts where closing_id = pc.id), 0),
         house_total    = coalesce((select sum(house_amount)  from public.payouts where closing_id = pc.id), 0),
         bookings_count = coalesce((select sum(bookings_count) from public.payouts where closing_id = pc.id), 0),
         updated_at     = now()
   where pc.id = v_closing;

  return v_closing;
end$$;
-- Correção do 'fi' → 'end if' (Postgres não aceita 'fi')
create or replace function public.generate_closing(_company uuid, _start date, _end date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_closing uuid; v_actor uuid := auth.uid();
begin
  if not (public.is_platform_staff(v_actor)
          or public.has_role(v_actor, _company, 'owner')
          or public.has_role(v_actor, _company, 'manager')) then
    raise exception 'forbidden';
  end if;

  insert into public.period_closings(company_id, period_start, period_end)
  values (_company, _start, _end)
  on conflict (company_id, period_start, period_end) do update set updated_at = now()
  returning id into v_closing;

  if (select status from public.period_closings where id = v_closing) = 'closed' then
    raise exception 'closing already closed; reopen before regenerating';
  end if;

  insert into public.payouts(company_id, closing_id, barber_id, gross_amount, barber_amount, house_amount, bookings_count)
  select _company, v_closing, p.barber_id, p.gross_amount, p.barber_amount, p.house_amount, p.bookings_count
    from public.preview_closing(_company, _start, _end) p
  on conflict (closing_id, barber_id) do update
    set gross_amount=excluded.gross_amount, barber_amount=excluded.barber_amount,
        house_amount=excluded.house_amount, bookings_count=excluded.bookings_count, updated_at=now();

  update public.period_closings pc
     set gross_total    = coalesce((select sum(gross_amount)  from public.payouts where closing_id=pc.id),0),
         barber_total   = coalesce((select sum(barber_amount) from public.payouts where closing_id=pc.id),0),
         house_total    = coalesce((select sum(house_amount)  from public.payouts where closing_id=pc.id),0),
         bookings_count = coalesce((select sum(bookings_count) from public.payouts where closing_id=pc.id),0),
         updated_at     = now()
   where pc.id = v_closing;

  return v_closing;
end$$;

-- 6.3 Marca payout como pago e amarra os revenue_splits do período do closing
create or replace function public.pay_payout(_payout uuid, _method public.payout_method, _reference text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_company uuid; v_closing uuid; v_barber uuid;
  v_start date; v_end date; v_actor uuid := auth.uid();
begin
  select p.company_id, p.closing_id, p.barber_id, pc.period_start, pc.period_end
    into v_company, v_closing, v_barber, v_start, v_end
    from public.payouts p join public.period_closings pc on pc.id=p.closing_id
   where p.id=_payout;
  if v_company is null then raise exception 'payout not found'; end if;

  if not (public.is_platform_staff(v_actor)
          or public.has_role(v_actor, v_company, 'owner')
          or public.has_role(v_actor, v_company, 'manager')) then
    raise exception 'forbidden';
  end if;

  -- amarra splits pendentes do período/barbeiro a este payout
  with candidates as (
    select id from public.revenue_splits
     where company_id=v_company and barber_id=v_barber
       and created_at >= v_start and created_at < (v_end + 1)
       and paid_payout_id is null
  ),
  ins as (
    insert into public.payout_splits(payout_id, split_id)
    select _payout, id from candidates
    on conflict do nothing
    returning split_id
  )
  update public.revenue_splits set paid_payout_id=_payout, paid_at=now()
   where id in (select id from candidates);

  update public.payouts
     set status='paid', method=_method, reference=_reference, paid_at=now(), paid_by=v_actor, updated_at=now()
   where id=_payout;
end$$;

-- 6.4 Fecha um período (impede regeneração até reopen)
create or replace function public.close_period(_closing uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_actor uuid := auth.uid();
begin
  select company_id into v_company from public.period_closings where id=_closing;
  if v_company is null then raise exception 'closing not found'; end if;
  if not (public.is_platform_staff(v_actor)
          or public.has_role(v_actor, v_company, 'owner')
          or public.has_role(v_actor, v_company, 'manager')) then
    raise exception 'forbidden';
  end if;
  update public.period_closings
     set status='closed', closed_at=now(), closed_by=v_actor, updated_at=now()
   where id=_closing;
end$$;

create or replace function public.reopen_period(_closing uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_actor uuid := auth.uid();
begin
  select company_id into v_company from public.period_closings where id=_closing;
  if v_company is null then raise exception 'closing not found'; end if;
  if not (public.is_platform_staff(v_actor)
          or public.has_role(v_actor, v_company, 'owner')) then
    raise exception 'forbidden';
  end if;
  update public.period_closings
     set status='reopened', reopened_at=now(), reopened_by=v_actor, updated_at=now()
   where id=_closing;
end$$;

-- ---------------------------------------------------------------------
-- 7) Views auxiliares
-- ---------------------------------------------------------------------
create or replace view public.v_closing_summary
with (security_invoker=on) as
select pc.id, pc.company_id, pc.period_start, pc.period_end, pc.status,
       pc.gross_total, pc.barber_total, pc.house_total, pc.bookings_count,
       (select count(*) from public.payouts p where p.closing_id=pc.id) as payouts_count,
       (select count(*) from public.payouts p where p.closing_id=pc.id and p.status='paid') as payouts_paid,
       (select count(*) from public.payouts p where p.closing_id=pc.id and p.status='pending') as payouts_pending
  from public.period_closings pc;

grant select on public.v_closing_summary to authenticated;

-- ---------------------------------------------------------------------
-- 8) GRANTS
-- ---------------------------------------------------------------------
grant select on public.period_closings, public.payouts, public.payout_splits, public.payout_receipts to authenticated;
grant insert, update on public.payout_receipts to authenticated;
grant all on public.period_closings, public.payouts, public.payout_splits, public.payout_receipts to service_role;

-- ---------------------------------------------------------------------
-- 9) RLS
-- ---------------------------------------------------------------------
alter table public.period_closings enable row level security;
alter table public.payouts         enable row level security;
alter table public.payout_splits   enable row level security;
alter table public.payout_receipts enable row level security;

-- period_closings: staff da empresa lê; platform staff lê tudo; escrita apenas via funções (security definer)
drop policy if exists pc_read on public.period_closings;
create policy pc_read on public.period_closings for select to authenticated
using (public.is_platform_staff(auth.uid()) or public.is_member_of(auth.uid(), company_id));

-- payouts: owner/manager/platform staff vê todos; barbeiro vê os seus
drop policy if exists pay_read on public.payouts;
create policy pay_read on public.payouts for select to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
  or exists(select 1 from public.barbers b where b.id = payouts.barber_id and b.user_id = auth.uid())
);

-- payout_splits: leitura casada com payouts
drop policy if exists ps_read on public.payout_splits;
create policy ps_read on public.payout_splits for select to authenticated
using (
  exists(select 1 from public.payouts p
          where p.id = payout_splits.payout_id
            and (
              public.is_platform_staff(auth.uid())
              or public.has_role(auth.uid(), p.company_id, 'owner')
              or public.has_role(auth.uid(), p.company_id, 'manager')
              or exists(select 1 from public.barbers b where b.id=p.barber_id and b.user_id=auth.uid())
            ))
);

-- payout_receipts: leitura pelo mesmo escopo do payout; upload pelo owner/manager; barbeiro pode ver seus comprovantes
drop policy if exists rec_read on public.payout_receipts;
create policy rec_read on public.payout_receipts for select to authenticated
using (
  exists(select 1 from public.payouts p
          where p.id = payout_receipts.payout_id
            and (
              public.is_platform_staff(auth.uid())
              or public.has_role(auth.uid(), p.company_id, 'owner')
              or public.has_role(auth.uid(), p.company_id, 'manager')
              or exists(select 1 from public.barbers b where b.id=p.barber_id and b.user_id=auth.uid())
            ))
);
drop policy if exists rec_write on public.payout_receipts;
create policy rec_write on public.payout_receipts for insert to authenticated
with check (
  exists(select 1 from public.payouts p
          where p.id = payout_receipts.payout_id
            and (
              public.is_platform_staff(auth.uid())
              or public.has_role(auth.uid(), p.company_id, 'owner')
              or public.has_role(auth.uid(), p.company_id, 'manager')
            ))
);
drop policy if exists rec_update on public.payout_receipts;
create policy rec_update on public.payout_receipts for update to authenticated
using (
  exists(select 1 from public.payouts p
          where p.id = payout_receipts.payout_id
            and (
              public.is_platform_staff(auth.uid())
              or public.has_role(auth.uid(), p.company_id, 'owner')
              or public.has_role(auth.uid(), p.company_id, 'manager')
            ))
);
