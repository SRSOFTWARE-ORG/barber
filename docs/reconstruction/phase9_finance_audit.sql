-- =====================================================================
-- FASE 9 — Auditoria financeira & Exportação contábil
-- Pré-requisitos: fases 2, 3, 5, 6, 7, 8 aplicadas.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname='fin_audit_kind') then
    create type public.fin_audit_kind as enum (
      'split_created','split_paid',
      'closing_created','closing_closed','closing_reopened',
      'payout_created','payout_updated','payout_paid','payout_cancelled',
      'receipt_uploaded','receipt_deleted'
    );
  end if;
  if not exists (select 1 from pg_type where typname='export_format') then
    create type public.export_format as enum ('csv','ofx','json');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2) financial_audit_events (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.financial_audit_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  kind         public.fin_audit_kind not null,
  entity_type  text not null,     -- 'revenue_split','period_closing','payout','payout_receipt'
  entity_id    uuid not null,
  actor_id     uuid references auth.users(id),
  amount       numeric(12,2),
  old_value    jsonb,
  new_value    jsonb,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_fae_company_created on public.financial_audit_events(company_id, created_at desc);
create index if not exists idx_fae_kind            on public.financial_audit_events(company_id, kind, created_at desc);
create index if not exists idx_fae_entity          on public.financial_audit_events(entity_type, entity_id);

-- Impede UPDATE/DELETE (append-only) via trigger
create or replace function public.tg_fae_no_mutate()
returns trigger language plpgsql as $$
begin
  raise exception 'financial_audit_events is append-only';
end$$;
drop trigger if exists trg_fae_no_update on public.financial_audit_events;
drop trigger if exists trg_fae_no_delete on public.financial_audit_events;
create trigger trg_fae_no_update before update on public.financial_audit_events
  for each row execute function public.tg_fae_no_mutate();
create trigger trg_fae_no_delete before delete on public.financial_audit_events
  for each row execute function public.tg_fae_no_mutate();

-- ---------------------------------------------------------------------
-- 3) Triggers geradoras de auditoria
-- ---------------------------------------------------------------------
-- 3.1 revenue_splits
create or replace function public.tg_fae_revenue_splits()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, amount, new_value)
    values (new.company_id, 'split_created', 'revenue_split', new.id, auth.uid(), new.gross_amount, to_jsonb(new));
  elsif tg_op='UPDATE' then
    if new.paid_payout_id is not null and (old.paid_payout_id is null) then
      insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, amount, old_value, new_value)
      values (new.company_id, 'split_paid', 'revenue_split', new.id, auth.uid(), new.gross_amount, to_jsonb(old), to_jsonb(new));
    end if;
  end if;
  return new;
end$$;
drop trigger if exists trg_fae_revenue_splits on public.revenue_splits;
create trigger trg_fae_revenue_splits
  after insert or update on public.revenue_splits
  for each row execute function public.tg_fae_revenue_splits();

-- 3.2 period_closings
create or replace function public.tg_fae_period_closings()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_kind public.fin_audit_kind;
begin
  if tg_op='INSERT' then
    v_kind := 'closing_created';
    insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, amount, new_value)
    values (new.company_id, v_kind, 'period_closing', new.id, auth.uid(), new.gross_total, to_jsonb(new));
  elsif tg_op='UPDATE' then
    if new.status is distinct from old.status then
      v_kind := case new.status
        when 'closed'   then 'closing_closed'::public.fin_audit_kind
        when 'reopened' then 'closing_reopened'::public.fin_audit_kind
        else null end;
      if v_kind is not null then
        insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, amount, old_value, new_value)
        values (new.company_id, v_kind, 'period_closing', new.id, auth.uid(), new.gross_total, to_jsonb(old), to_jsonb(new));
      end if;
    end if;
  end if;
  return new;
end$$;
drop trigger if exists trg_fae_period_closings on public.period_closings;
create trigger trg_fae_period_closings
  after insert or update on public.period_closings
  for each row execute function public.tg_fae_period_closings();

-- 3.3 payouts
create or replace function public.tg_fae_payouts()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_kind public.fin_audit_kind;
begin
  if tg_op='INSERT' then
    insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, amount, new_value)
    values (new.company_id, 'payout_created', 'payout', new.id, auth.uid(), new.barber_amount, to_jsonb(new));
  elsif tg_op='UPDATE' then
    if new.status is distinct from old.status and new.status='paid' then
      v_kind := 'payout_paid';
    elsif new.status is distinct from old.status and new.status='cancelled' then
      v_kind := 'payout_cancelled';
    else
      v_kind := 'payout_updated';
    end if;
    insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, amount, old_value, new_value)
    values (new.company_id, v_kind, 'payout', new.id, auth.uid(), new.barber_amount, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end$$;
drop trigger if exists trg_fae_payouts on public.payouts;
create trigger trg_fae_payouts
  after insert or update on public.payouts
  for each row execute function public.tg_fae_payouts();

-- 3.4 payout_receipts
create or replace function public.tg_fae_receipts()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_company uuid;
begin
  if tg_op='INSERT' then
    select company_id into v_company from public.payouts where id=new.payout_id;
    insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, new_value)
    values (v_company, 'receipt_uploaded', 'payout_receipt', new.id, auth.uid(), to_jsonb(new));
  elsif tg_op='DELETE' then
    select company_id into v_company from public.payouts where id=old.payout_id;
    insert into public.financial_audit_events(company_id, kind, entity_type, entity_id, actor_id, old_value)
    values (v_company, 'receipt_deleted', 'payout_receipt', old.id, auth.uid(), to_jsonb(old));
  end if;
  return coalesce(new, old);
end$$;
drop trigger if exists trg_fae_receipts_ins on public.payout_receipts;
drop trigger if exists trg_fae_receipts_del on public.payout_receipts;
create trigger trg_fae_receipts_ins after insert on public.payout_receipts
  for each row execute function public.tg_fae_receipts();
create trigger trg_fae_receipts_del after delete on public.payout_receipts
  for each row execute function public.tg_fae_receipts();

-- ---------------------------------------------------------------------
-- 4) accounting_exports (registro de cada exportação gerada)
-- ---------------------------------------------------------------------
create table if not exists public.accounting_exports (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  format         public.export_format not null default 'csv',
  row_count      integer not null default 0,
  total_debit    numeric(14,2) not null default 0,
  total_credit   numeric(14,2) not null default 0,
  checksum_sha256 text,
  generated_by   uuid references auth.users(id),
  generated_at   timestamptz not null default now(),
  file_url       text,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  check (period_end >= period_start)
);
create index if not exists idx_ae_company_period on public.accounting_exports(company_id, period_start desc);

-- ---------------------------------------------------------------------
-- 5) Função de geração do lançamento contábil (partidas dobradas)
--    Para cada payout PAGO no período: crédito na conta da casa (receita 60/40)
--    e débito no barbeiro. E para cada revenue_split gerado: registra receita bruta.
-- ---------------------------------------------------------------------
-- Conta lógica: 'REVENUE.GROSS', 'PAYOUT.BARBER', 'HOUSE.MARGIN'
create or replace function public.accounting_ledger(_company uuid, _start date, _end date)
returns table(
  entry_date date, doc text, description text,
  account text, debit numeric, credit numeric,
  ref_type text, ref_id uuid
) language sql stable security definer set search_path=public as $$
  -- Receita bruta (crédito em REVENUE.GROSS na data do split)
  select rs.created_at::date, 'RS-'||substr(rs.id::text,1,8),
         'Receita de reserva concluída',
         'REVENUE.GROSS'::text, 0::numeric, rs.gross_amount, 'revenue_split', rs.id
    from public.revenue_splits rs
   where rs.company_id=_company
     and rs.created_at::date between _start and _end
  union all
  -- Casa (débito em REVENUE.GROSS 40%, crédito em HOUSE.MARGIN)
  select rs.created_at::date, 'RS-'||substr(rs.id::text,1,8),
         'Margem da casa (40%)',
         'HOUSE.MARGIN'::text, 0::numeric, rs.house_share, 'revenue_split', rs.id
    from public.revenue_splits rs
   where rs.company_id=_company
     and rs.created_at::date between _start and _end
  union all
  -- Barbeiro (débito em REVENUE.GROSS 60%, crédito em PAYOUT.BARBER a pagar)
  select rs.created_at::date, 'RS-'||substr(rs.id::text,1,8),
         'Provisão de repasse ao barbeiro (60%)',
         'PAYOUT.BARBER'::text, 0::numeric, rs.barber_share, 'revenue_split', rs.id
    from public.revenue_splits rs
   where rs.company_id=_company
     and rs.created_at::date between _start and _end
  union all
  -- Pagamento efetivo do payout (débito em PAYOUT.BARBER)
  select p.paid_at::date, 'PAY-'||substr(p.id::text,1,8),
         'Pagamento de repasse '||coalesce(p.method::text,''),
         'PAYOUT.BARBER'::text, p.barber_amount, 0::numeric, 'payout', p.id
    from public.payouts p
   where p.company_id=_company and p.status='paid'
     and p.paid_at::date between _start and _end
  order by 1, 2
$$;

-- Registra uma exportação e retorna o id
create or replace function public.register_accounting_export(_company uuid, _start date, _end date, _format public.export_format, _checksum text, _file_url text default null, _notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_rows int; v_debit numeric; v_credit numeric;
begin
  if not (public.is_platform_staff(v_actor)
          or public.has_role(v_actor, _company, 'owner')
          or public.has_role(v_actor, _company, 'manager')) then
    raise exception 'forbidden';
  end if;

  select count(*), coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_rows, v_debit, v_credit
    from public.accounting_ledger(_company, _start, _end);

  insert into public.accounting_exports(company_id, period_start, period_end, format, row_count, total_debit, total_credit, checksum_sha256, generated_by, file_url, notes)
  values (_company, _start, _end, _format, v_rows, v_debit, v_credit, _checksum, v_actor, _file_url, _notes)
  returning id into v_id;

  return v_id;
end$$;

-- ---------------------------------------------------------------------
-- 6) View: linha do tempo unificada da auditoria financeira
-- ---------------------------------------------------------------------
create or replace view public.v_financial_timeline
with (security_invoker=on) as
select fae.id, fae.company_id, fae.created_at, fae.kind, fae.entity_type, fae.entity_id,
       fae.actor_id, fae.amount,
       coalesce(fae.new_value->>'status', fae.old_value->>'status') as status,
       fae.metadata
  from public.financial_audit_events fae;

grant select on public.v_financial_timeline to authenticated;

-- ---------------------------------------------------------------------
-- 7) GRANTS
-- ---------------------------------------------------------------------
grant select on public.financial_audit_events to authenticated;
grant select, insert on public.accounting_exports to authenticated;
grant all on public.financial_audit_events, public.accounting_exports to service_role;

-- ---------------------------------------------------------------------
-- 8) RLS
-- ---------------------------------------------------------------------
alter table public.financial_audit_events enable row level security;
alter table public.accounting_exports     enable row level security;

-- Auditoria: owner/manager/platform staff da empresa lê tudo; barbeiro lê apenas eventos que referenciam seus payouts
drop policy if exists fae_read on public.financial_audit_events;
create policy fae_read on public.financial_audit_events for select to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
  or (
    entity_type = 'payout'
    and exists(
      select 1 from public.payouts p join public.barbers b on b.id=p.barber_id
       where p.id = financial_audit_events.entity_id and b.user_id = auth.uid()
    )
  )
);
-- INSERT direto bloqueado (só via triggers/service_role)
drop policy if exists fae_no_write on public.financial_audit_events;
create policy fae_no_write on public.financial_audit_events for insert to authenticated
with check (false);

-- Exportações: owner/manager/platform staff lêem e criam
drop policy if exists ae_read on public.accounting_exports;
create policy ae_read on public.accounting_exports for select to authenticated
using (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
);
drop policy if exists ae_write on public.accounting_exports;
create policy ae_write on public.accounting_exports for insert to authenticated
with check (
  public.is_platform_staff(auth.uid())
  or public.has_role(auth.uid(), company_id, 'owner')
  or public.has_role(auth.uid(), company_id, 'manager')
);
