-- =====================================================================
-- FASE 11 — Billing: Checkout, Webhooks, Trial 14d, Portal, Auditoria
-- =====================================================================
-- Requer: phase1_core.sql, phase9_analytics.sql
-- Rode no SQL Editor do Supabase.
-- =====================================================================

-- 1) Colunas de integração com provedor em platform_plans
alter table public.platform_plans
  add column if not exists stripe_price_id text,
  add column if not exists paddle_price_id text,
  add column if not exists trial_days int not null default 14;

-- 2) Colunas de integração em company_subscriptions
alter table public.company_subscriptions
  add column if not exists provider text check (provider in ('stripe','paddle','manual')) default 'manual',
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_company_subs_provider_sub
  on public.company_subscriptions(provider_subscription_id);
create index if not exists idx_company_subs_company_status
  on public.company_subscriptions(company_id, status);

-- 3) Trial de 14 dias automático na primeira assinatura da empresa
create or replace function public.apply_trial_if_first()
returns trigger language plpgsql as $$
declare
  v_has_prev boolean;
  v_trial_days int;
begin
  select exists(
    select 1 from public.company_subscriptions
    where company_id = new.company_id and id <> new.id
  ) into v_has_prev;

  select coalesce(trial_days, 14) into v_trial_days
  from public.platform_plans where id = new.plan_id;

  if not v_has_prev and new.status in ('active','trialing') then
    new.status := 'trialing';
    new.trial_ends_at := coalesce(new.trial_ends_at, now() + make_interval(days => v_trial_days));
    new.current_period_start := coalesce(new.current_period_start, now());
    new.current_period_end := coalesce(new.current_period_end, new.trial_ends_at);
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_trial on public.company_subscriptions;
create trigger trg_apply_trial
  before insert on public.company_subscriptions
  for each row execute function public.apply_trial_if_first();

-- 4) Auditoria de mudanças de status de assinatura
create table if not exists public.subscription_audit (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.company_subscriptions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  changed_by uuid references auth.users(id),
  old_status text,
  new_status text,
  old_plan_id uuid,
  new_plan_id uuid,
  provider text,
  event text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant select on public.subscription_audit to authenticated;
grant all on public.subscription_audit to service_role;

alter table public.subscription_audit enable row level security;

create policy "audit_company_read"
  on public.subscription_audit for select
  to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists(
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.company_id = subscription_audit.company_id
        and ur.role in ('ceo','owner','admin')
    )
  );

create or replace function public.log_subscription_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscription_audit(subscription_id, company_id, changed_by, old_status, new_status, new_plan_id, provider, event)
    values (new.id, new.company_id, auth.uid(), null, new.status, new.plan_id, new.provider, 'created');
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status or new.plan_id is distinct from old.plan_id then
      insert into public.subscription_audit(subscription_id, company_id, changed_by, old_status, new_status, old_plan_id, new_plan_id, provider, event)
      values (new.id, new.company_id, auth.uid(), old.status, new.status, old.plan_id, new.plan_id, new.provider, 'updated');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_log_sub_change on public.company_subscriptions;
create trigger trg_log_sub_change
  after insert or update on public.company_subscriptions
  for each row execute function public.log_subscription_change();

-- 5) Revisão de RLS: cada empresa só vê seus próprios dados
alter table public.company_subscriptions enable row level security;

drop policy if exists "cs_company_read" on public.company_subscriptions;
create policy "cs_company_read"
  on public.company_subscriptions for select
  to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists(
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.company_id = company_subscriptions.company_id
    )
  );

drop policy if exists "cs_owner_write" on public.company_subscriptions;
create policy "cs_owner_write"
  on public.company_subscriptions for insert
  to authenticated
  with check (
    public.is_platform_admin(auth.uid())
    or exists(
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.company_id = company_subscriptions.company_id
        and ur.role in ('ceo','owner')
    )
  );

drop policy if exists "cs_owner_update" on public.company_subscriptions;
create policy "cs_owner_update"
  on public.company_subscriptions for update
  to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists(
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.company_id = company_subscriptions.company_id
        and ur.role in ('ceo','owner')
    )
  );

-- Escrita real de eventos de webhook é feita pelo service_role (bypassa RLS).

-- 6) View helper com estado corrente
create or replace view public.v_company_active_subscription
with (security_invoker=on) as
select distinct on (cs.company_id)
  cs.company_id,
  cs.id as subscription_id,
  cs.plan_id,
  pp.code as plan_code,
  pp.name as plan_name,
  cs.status,
  cs.provider,
  cs.trial_ends_at,
  cs.current_period_start,
  cs.current_period_end,
  cs.cancel_at_period_end
from public.company_subscriptions cs
join public.platform_plans pp on pp.id = cs.plan_id
where cs.status in ('trialing','active','past_due')
order by cs.company_id, cs.created_at desc;

grant select on public.v_company_active_subscription to authenticated;
