-- =====================================================================
-- Fase 8 — Afiliados
-- Programa de afiliados por empresa: código/link único, tracking de
-- referências, conversão em cliente/assinatura, comissão recorrente
-- calculada sobre pagamentos de assinatura (e opcionalmente bookings).
--
-- Requer fases 1..7 executadas (companies, clients, client_subscriptions,
-- booking_payments, finance_transactions, subscription_events, audit).
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. Programa de afiliados (config por empresa)
-- ---------------------------------------------------------------------
create table if not exists public.affiliate_programs (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null unique references public.companies(id) on delete cascade,
  is_active             boolean not null default true,
  -- comissão sobre pagamentos de assinatura do indicado
  subscription_bps      integer not null default 1000 check (subscription_bps between 0 and 10000),
  -- comissão sobre pagamentos avulsos (bookings) do indicado
  booking_bps           integer not null default 0    check (booking_bps between 0 and 10000),
  -- duração da recorrência: null = vitalício, senão N meses após 1ª conversão
  recurrence_months     integer check (recurrence_months is null or recurrence_months > 0),
  cookie_days           integer not null default 30 check (cookie_days > 0),
  min_payout_cents      integer not null default 5000 check (min_payout_cents >= 0),
  terms                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

grant select, insert, update, delete on public.affiliate_programs to authenticated;
grant all on public.affiliate_programs to service_role;
alter table public.affiliate_programs enable row level security;

create policy "program_select_company" on public.affiliate_programs
  for select to authenticated
  using (public.user_in_company(company_id));

create policy "program_manage_owners" on public.affiliate_programs
  for all to authenticated
  using (public.has_company_role(company_id, array['proprietario','gerente']))
  with check (public.has_company_role(company_id, array['proprietario','gerente']));

-- ---------------------------------------------------------------------
-- 2. Afiliados (usuário/cliente/parceiro externo)
-- ---------------------------------------------------------------------
create table if not exists public.affiliates (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  code              text not null,
  name              text not null,
  email             text,
  phone             text,
  -- vínculo opcional a um usuário logado (para portal do afiliado)
  user_id           uuid references auth.users(id) on delete set null,
  -- ou a um cliente já cadastrado
  client_id         uuid references public.clients(id) on delete set null,
  status            text not null default 'active'
                    check (status in ('active','paused','blocked')),
  custom_subscription_bps integer check (custom_subscription_bps between 0 and 10000),
  custom_booking_bps      integer check (custom_booking_bps between 0 and 10000),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, user_id)
);

create index if not exists ix_affiliates_company on public.affiliates(company_id) where status = 'active';
create index if not exists ix_affiliates_user    on public.affiliates(user_id);
create index if not exists ix_affiliates_client  on public.affiliates(client_id);

grant select, insert, update, delete on public.affiliates to authenticated;
grant all on public.affiliates to service_role;
alter table public.affiliates enable row level security;

create policy "affiliates_select_company" on public.affiliates
  for select to authenticated
  using (
    public.user_in_company(company_id)
    or user_id = auth.uid()
  );

create policy "affiliates_manage_staff" on public.affiliates
  for all to authenticated
  using (public.has_company_role(company_id, array['proprietario','gerente']))
  with check (public.has_company_role(company_id, array['proprietario','gerente']));

create policy "affiliates_self_update" on public.affiliates
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'active');

-- ---------------------------------------------------------------------
-- 3. Referências / tracking de clique e conversão
-- ---------------------------------------------------------------------
create table if not exists public.affiliate_referrals (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  affiliate_id      uuid not null references public.affiliates(id) on delete cascade,
  -- token opaco salvo em cookie/localStorage no landing
  visitor_token     text not null,
  landing_url       text,
  utm               jsonb not null default '{}'::jsonb,
  ip_hash           text,
  user_agent        text,
  clicked_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  -- populado quando o visitante vira cliente/assinante
  converted_client_id       uuid references public.clients(id) on delete set null,
  converted_subscription_id uuid references public.client_subscriptions(id) on delete set null,
  converted_at              timestamptz,
  recurrence_ends_at        timestamptz,
  unique (company_id, visitor_token)
);

create index if not exists ix_referrals_affiliate on public.affiliate_referrals(affiliate_id);
create index if not exists ix_referrals_client    on public.affiliate_referrals(converted_client_id);
create index if not exists ix_referrals_active    on public.affiliate_referrals(company_id, expires_at)
  where converted_at is null;

grant select, insert, update on public.affiliate_referrals to authenticated;
grant all on public.affiliate_referrals to service_role;
alter table public.affiliate_referrals enable row level security;

create policy "referrals_select_company" on public.affiliate_referrals
  for select to authenticated
  using (
    public.user_in_company(company_id)
    or exists (
      select 1 from public.affiliates a
      where a.id = affiliate_id and a.user_id = auth.uid()
    )
  );

create policy "referrals_insert_public" on public.affiliate_referrals
  for insert to authenticated
  with check (true);  -- landing público; edge function usa service_role

-- ---------------------------------------------------------------------
-- 4. Comissões geradas por pagamentos do indicado
-- ---------------------------------------------------------------------
create table if not exists public.affiliate_commissions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  affiliate_id          uuid not null references public.affiliates(id) on delete cascade,
  referral_id           uuid references public.affiliate_referrals(id) on delete set null,
  source_type           text not null check (source_type in ('subscription','booking')),
  subscription_event_id uuid references public.subscription_events(id) on delete set null,
  booking_payment_id    uuid references public.booking_payments(id) on delete set null,
  base_cents            integer not null check (base_cents >= 0),
  bps                   integer not null check (bps between 0 and 10000),
  amount_cents          integer not null check (amount_cents >= 0),
  status                text not null default 'pending'
                        check (status in ('pending','approved','paid','reversed','canceled')),
  payout_id             uuid,  -- FK adicionada abaixo
  created_at            timestamptz not null default now(),
  approved_at           timestamptz,
  paid_at               timestamptz,
  meta                  jsonb not null default '{}'::jsonb,
  unique (subscription_event_id),
  unique (booking_payment_id)
);

create index if not exists ix_commissions_affiliate_status
  on public.affiliate_commissions(affiliate_id, status);
create index if not exists ix_commissions_company_created
  on public.affiliate_commissions(company_id, created_at desc);

grant select, insert, update on public.affiliate_commissions to authenticated;
grant all on public.affiliate_commissions to service_role;
alter table public.affiliate_commissions enable row level security;

create policy "commissions_select_company" on public.affiliate_commissions
  for select to authenticated
  using (
    public.user_in_company(company_id)
    or exists (
      select 1 from public.affiliates a
      where a.id = affiliate_id and a.user_id = auth.uid()
    )
  );

create policy "commissions_manage_finance" on public.affiliate_commissions
  for update to authenticated
  using (public.has_company_role(company_id, array['proprietario','gerente']))
  with check (public.has_company_role(company_id, array['proprietario','gerente']));

-- ---------------------------------------------------------------------
-- 5. Payouts (fechamento e pagamento ao afiliado)
-- ---------------------------------------------------------------------
create table if not exists public.affiliate_payouts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  affiliate_id    uuid not null references public.affiliates(id) on delete cascade,
  period_start    date not null,
  period_end      date not null check (period_end >= period_start),
  total_cents     integer not null default 0 check (total_cents >= 0),
  status          text not null default 'open'
                  check (status in ('open','processing','paid','canceled')),
  method          text,
  reference       text,
  transaction_id  uuid references public.finance_transactions(id) on delete set null,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.affiliate_commissions
  drop constraint if exists affiliate_commissions_payout_id_fkey;
alter table public.affiliate_commissions
  add constraint affiliate_commissions_payout_id_fkey
  foreign key (payout_id) references public.affiliate_payouts(id) on delete set null;

create index if not exists ix_payouts_affiliate on public.affiliate_payouts(affiliate_id, period_end desc);

grant select, insert, update, delete on public.affiliate_payouts to authenticated;
grant all on public.affiliate_payouts to service_role;
alter table public.affiliate_payouts enable row level security;

create policy "payouts_select_company" on public.affiliate_payouts
  for select to authenticated
  using (
    public.user_in_company(company_id)
    or exists (
      select 1 from public.affiliates a
      where a.id = affiliate_id and a.user_id = auth.uid()
    )
  );

create policy "payouts_manage_finance" on public.affiliate_payouts
  for all to authenticated
  using (public.has_company_role(company_id, array['proprietario','gerente']))
  with check (public.has_company_role(company_id, array['proprietario','gerente']));

-- ---------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------

-- gera código curto único (8 chars base36) por empresa
create or replace function public.affiliate_generate_code(_company_id uuid)
returns text
language plpgsql
as $$
declare
  candidate text;
  tries     integer := 0;
begin
  loop
    candidate := upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 8));
    candidate := regexp_replace(candidate, '[^A-Z0-9]', 'X', 'g');
    exit when not exists (
      select 1 from public.affiliates
      where company_id = _company_id and code = candidate
    );
    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not generate unique affiliate code';
    end if;
  end loop;
  return candidate;
end;
$$;

-- default code no insert
create or replace function public.affiliates_default_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or length(trim(new.code)) = 0 then
    new.code := public.affiliate_generate_code(new.company_id);
  else
    new.code := upper(regexp_replace(new.code, '[^A-Za-z0-9_-]', '', 'g'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_affiliates_default_code on public.affiliates;
create trigger trg_affiliates_default_code
  before insert on public.affiliates
  for each row execute function public.affiliates_default_code();

-- registrar conversão: chamado ao criar cliente / assinatura vinda de referral
create or replace function public.affiliate_mark_conversion(
  _company_id uuid,
  _visitor_token text,
  _client_id uuid,
  _subscription_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ref record;
  prog record;
  months integer;
begin
  select * into ref
    from public.affiliate_referrals
   where company_id = _company_id
     and visitor_token = _visitor_token
     and converted_at is null
     and expires_at > now()
   order by clicked_at desc
   limit 1;

  if not found then
    return null;
  end if;

  select * into prog from public.affiliate_programs where company_id = _company_id;
  months := coalesce(prog.recurrence_months, null);

  update public.affiliate_referrals
     set converted_client_id = _client_id,
         converted_subscription_id = _subscription_id,
         converted_at = now(),
         recurrence_ends_at = case
           when months is null then null
           else now() + (months || ' months')::interval
         end
   where id = ref.id;

  return ref.id;
end;
$$;

grant execute on function public.affiliate_mark_conversion(uuid, text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 7. Trigger de comissão em pagamentos de assinatura
--    (subscription_events com type='payment_captured' ou similar)
-- ---------------------------------------------------------------------
create or replace function public.affiliate_commission_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sub  record;
  ref  record;
  aff  record;
  prog record;
  bps  integer;
  amt  integer;
begin
  if new.event_type not in ('payment_captured','payment_succeeded','invoice_paid') then
    return new;
  end if;
  if coalesce((new.payload->>'amount_cents')::int, 0) <= 0 then
    return new;
  end if;

  select * into sub from public.client_subscriptions where id = new.subscription_id;
  if not found then return new; end if;

  select r.*, a.*
    into ref
    from public.affiliate_referrals r
    join public.affiliates a on a.id = r.affiliate_id
   where r.company_id = sub.company_id
     and r.converted_client_id = sub.client_id
     and r.converted_at is not null
     and (r.recurrence_ends_at is null or r.recurrence_ends_at > now())
     and a.status = 'active'
   order by r.converted_at desc
   limit 1;

  if not found then return new; end if;

  select * into prog from public.affiliate_programs where company_id = sub.company_id;
  if not found or prog.is_active = false then return new; end if;

  bps := coalesce(ref.custom_subscription_bps, prog.subscription_bps, 0);
  if bps <= 0 then return new; end if;

  amt := ((new.payload->>'amount_cents')::int * bps) / 10000;
  if amt <= 0 then return new; end if;

  insert into public.affiliate_commissions(
    company_id, affiliate_id, referral_id, source_type,
    subscription_event_id, base_cents, bps, amount_cents, status
  ) values (
    sub.company_id, ref.affiliate_id, ref.id, 'subscription',
    new.id, (new.payload->>'amount_cents')::int, bps, amt, 'pending'
  )
  on conflict (subscription_event_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_affiliate_commission_sub on public.subscription_events;
create trigger trg_affiliate_commission_sub
  after insert on public.subscription_events
  for each row execute function public.affiliate_commission_from_subscription();

-- ---------------------------------------------------------------------
-- 8. Trigger de comissão em pagamentos de bookings (opcional; só se booking_bps>0)
-- ---------------------------------------------------------------------
create or replace function public.affiliate_commission_from_booking_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bk   record;
  ref  record;
  prog record;
  bps  integer;
  amt  integer;
begin
  if new.status <> 'paid' then return new; end if;
  if coalesce(new.amount_cents, 0) <= 0 then return new; end if;

  select b.*, c.id as cli_id
    into bk
    from public.bookings b
    join public.clients c on c.id = b.client_id
   where b.id = new.booking_id;
  if not found then return new; end if;

  select * into prog from public.affiliate_programs where company_id = bk.company_id;
  if not found or prog.is_active = false or prog.booking_bps <= 0 then
    return new;
  end if;

  select r.*, a.custom_booking_bps as aff_bps, a.status as aff_status
    into ref
    from public.affiliate_referrals r
    join public.affiliates a on a.id = r.affiliate_id
   where r.company_id = bk.company_id
     and r.converted_client_id = bk.cli_id
     and r.converted_at is not null
     and (r.recurrence_ends_at is null or r.recurrence_ends_at > now())
     and a.status = 'active'
   order by r.converted_at desc
   limit 1;

  if not found then return new; end if;

  bps := coalesce(ref.aff_bps, prog.booking_bps, 0);
  if bps <= 0 then return new; end if;
  amt := (new.amount_cents * bps) / 10000;
  if amt <= 0 then return new; end if;

  insert into public.affiliate_commissions(
    company_id, affiliate_id, referral_id, source_type,
    booking_payment_id, base_cents, bps, amount_cents, status
  ) values (
    bk.company_id, ref.affiliate_id, ref.id, 'booking',
    new.id, new.amount_cents, bps, amt, 'pending'
  )
  on conflict (booking_payment_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_affiliate_commission_booking on public.booking_payments;
create trigger trg_affiliate_commission_booking
  after insert or update of status on public.booking_payments
  for each row execute function public.affiliate_commission_from_booking_payment();

-- ---------------------------------------------------------------------
-- 9. Fechamento de payout — agrega comissões aprovadas do período
-- ---------------------------------------------------------------------
create or replace function public.affiliate_close_payout(
  _affiliate_id uuid,
  _period_start date,
  _period_end   date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  aff record;
  payout_id uuid;
  total int;
begin
  select * into aff from public.affiliates where id = _affiliate_id;
  if not found then raise exception 'affiliate not found'; end if;

  if not public.has_company_role(aff.company_id, array['proprietario','gerente']) then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(amount_cents),0) into total
    from public.affiliate_commissions
   where affiliate_id = _affiliate_id
     and status = 'approved'
     and payout_id is null
     and created_at::date between _period_start and _period_end;

  if total <= 0 then
    raise exception 'no approved commissions in period';
  end if;

  insert into public.affiliate_payouts(
    company_id, affiliate_id, period_start, period_end, total_cents, status
  ) values (
    aff.company_id, _affiliate_id, _period_start, _period_end, total, 'open'
  ) returning id into payout_id;

  update public.affiliate_commissions
     set payout_id = payout_id
   where affiliate_id = _affiliate_id
     and status = 'approved'
     and payout_id is null
     and created_at::date between _period_start and _period_end;

  return payout_id;
end;
$$;

grant execute on function public.affiliate_close_payout(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Views
-- ---------------------------------------------------------------------
create or replace view public.v_affiliate_summary as
select
  a.id                as affiliate_id,
  a.company_id,
  a.name,
  a.code,
  a.status,
  (select count(*) from public.affiliate_referrals r
     where r.affiliate_id = a.id)                              as clicks,
  (select count(*) from public.affiliate_referrals r
     where r.affiliate_id = a.id and r.converted_at is not null) as conversions,
  coalesce((select sum(amount_cents) from public.affiliate_commissions c
     where c.affiliate_id = a.id and c.status in ('pending','approved')), 0) as balance_cents,
  coalesce((select sum(amount_cents) from public.affiliate_commissions c
     where c.affiliate_id = a.id and c.status = 'paid'), 0)   as paid_cents
from public.affiliates a;

grant select on public.v_affiliate_summary to authenticated;

-- ---------------------------------------------------------------------
-- 11. Auditoria
-- ---------------------------------------------------------------------
do $$
begin
  perform 1;
  -- reusa trigger genérico da fase 1
  execute 'drop trigger if exists trg_audit_affiliates on public.affiliates';
  execute 'create trigger trg_audit_affiliates after insert or update or delete on public.affiliates for each row execute function public.audit_row_change()';
  execute 'drop trigger if exists trg_audit_commissions on public.affiliate_commissions';
  execute 'create trigger trg_audit_commissions after insert or update or delete on public.affiliate_commissions for each row execute function public.audit_row_change()';
  execute 'drop trigger if exists trg_audit_payouts on public.affiliate_payouts';
  execute 'create trigger trg_audit_payouts after insert or update or delete on public.affiliate_payouts for each row execute function public.audit_row_change()';
end$$;

-- =====================================================================
-- FIM Fase 8
-- =====================================================================
