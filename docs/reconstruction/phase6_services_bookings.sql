-- =====================================================================
-- FASE 6 — Serviços, vínculo barbeiro-serviço e agendamentos
-- Pré-requisitos: phases 2, 3, 4, 5 aplicadas.
-- Idempotente.
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname='booking_status') then
    create type public.booking_status as enum (
      'scheduled','confirmed','in_progress','completed','cancelled','no_show'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2) service_categories
-- ---------------------------------------------------------------------
create table if not exists public.service_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, name)
);
create index if not exists idx_svc_cat_company on public.service_categories(company_id);

-- ---------------------------------------------------------------------
-- 3) services
-- ---------------------------------------------------------------------
create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  category_id      uuid references public.service_categories(id) on delete set null,
  name             text not null,
  description      text,
  duration_minutes integer not null check (duration_minutes > 0),
  price            numeric(12,2) not null default 0 check (price >= 0),
  image_url        text,
  color            text,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_services_company on public.services(company_id);
create index if not exists idx_services_active  on public.services(company_id, is_active);
create index if not exists idx_services_name_trgm on public.services using gin (name gin_trgm_ops);
create unique index if not exists uq_services_company_name
  on public.services(company_id, lower(name)) where deleted_at is null;

-- Coerência category.company_id = service.company_id
create or replace function public.tg_service_category_coherence()
returns trigger language plpgsql as $$
declare v_c uuid;
begin
  if new.category_id is not null then
    select company_id into v_c from public.service_categories where id=new.category_id;
    if v_c is null or v_c <> new.company_id then
      raise exception 'category belongs to different company';
    end if;
  end if;
  return new;
end$$;
drop trigger if exists trg_service_cat_coherence on public.services;
create trigger trg_service_cat_coherence
  before insert or update on public.services
  for each row execute function public.tg_service_category_coherence();

-- ---------------------------------------------------------------------
-- 4) barber_services (vínculo N:N + override opcional de preço/duração)
-- ---------------------------------------------------------------------
create table if not exists public.barber_services (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  barber_id         uuid not null references public.barbers(id) on delete cascade,
  service_id        uuid not null references public.services(id) on delete cascade,
  custom_price      numeric(12,2) check (custom_price is null or custom_price >= 0),
  custom_duration   integer check (custom_duration is null or custom_duration > 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (barber_id, service_id)
);
create index if not exists idx_bs_company  on public.barber_services(company_id);
create index if not exists idx_bs_barber   on public.barber_services(barber_id);
create index if not exists idx_bs_service  on public.barber_services(service_id);

create or replace function public.tg_barber_service_coherence()
returns trigger language plpgsql as $$
declare v_b uuid; v_s uuid;
begin
  select company_id into v_b from public.barbers  where id=new.barber_id;
  select company_id into v_s from public.services where id=new.service_id;
  if v_b is null then raise exception 'barber not found'; end if;
  if v_s is null then raise exception 'service not found'; end if;
  if v_b <> v_s then raise exception 'barber and service belong to different companies'; end if;
  new.company_id := v_b;
  return new;
end$$;
drop trigger if exists trg_bs_coherence on public.barber_services;
create trigger trg_bs_coherence
  before insert or update on public.barber_services
  for each row execute function public.tg_barber_service_coherence();

-- ---------------------------------------------------------------------
-- 5) bookings + booking_services
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  unit_id       uuid references public.units(id) on delete set null,
  barber_id     uuid not null references public.barbers(id) on delete restrict,
  client_id     uuid references public.clients(id) on delete set null,

  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        public.booking_status not null default 'scheduled',

  total_amount  numeric(12,2) not null default 0,
  discount      numeric(12,2) not null default 0,
  notes         text,

  created_by    uuid references auth.users(id) on delete set null,
  cancelled_by  uuid references auth.users(id) on delete set null,
  cancelled_at  timestamptz,
  cancel_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (ends_at > starts_at)
);
create index if not exists idx_bookings_company     on public.bookings(company_id);
create index if not exists idx_bookings_barber_time on public.bookings(barber_id, starts_at);
create index if not exists idx_bookings_client      on public.bookings(client_id);
create index if not exists idx_bookings_status      on public.bookings(company_id, status);
create index if not exists idx_bookings_range
  on public.bookings using gist (barber_id, tstzrange(starts_at, ends_at, '[)'));

-- Anti-conflito: mesma barbeiro não pode ter 2 reservas ativas sobrepostas
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='bookings_no_overlap_excl'
  ) then
    alter table public.bookings
      add constraint bookings_no_overlap_excl
      exclude using gist (
        barber_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status in ('scheduled','confirmed','in_progress'));
  end if;
end$$;

create table if not exists public.booking_services (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references public.bookings(id) on delete cascade,
  service_id            uuid not null references public.services(id) on delete restrict,
  company_id            uuid not null references public.companies(id) on delete cascade,
  price_at_booking      numeric(12,2) not null default 0,
  duration_at_booking   integer not null default 0,
  created_at            timestamptz not null default now()
);
create index if not exists idx_bsv_booking on public.booking_services(booking_id);
create index if not exists idx_bsv_service on public.booking_services(service_id);
create index if not exists idx_bsv_company on public.booking_services(company_id);

-- Coerência: booking.company = service.company = client.company; created_by
create or replace function public.tg_booking_coherence()
returns trigger language plpgsql as $$
declare v_b uuid; v_c uuid; v_cli uuid;
begin
  select company_id into v_b from public.barbers where id=new.barber_id;
  if v_b is null then raise exception 'barber not found'; end if;
  if new.company_id is null then new.company_id := v_b; end if;
  if v_b <> new.company_id then raise exception 'barber belongs to different company'; end if;

  if new.client_id is not null then
    select company_id into v_cli from public.clients where id=new.client_id;
    if v_cli is null or v_cli <> new.company_id then
      raise exception 'client belongs to different company';
    end if;
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end$$;
drop trigger if exists trg_booking_coherence on public.bookings;
create trigger trg_booking_coherence
  before insert or update on public.bookings
  for each row execute function public.tg_booking_coherence();

-- Coerência booking_services
create or replace function public.tg_booking_service_coherence()
returns trigger language plpgsql as $$
declare v_bc uuid; v_sc uuid;
begin
  select company_id into v_bc from public.bookings where id=new.booking_id;
  select company_id into v_sc from public.services where id=new.service_id;
  if v_bc is null then raise exception 'booking not found'; end if;
  if v_sc is null then raise exception 'service not found'; end if;
  if v_bc <> v_sc then raise exception 'service belongs to different company'; end if;
  new.company_id := v_bc;
  return new;
end$$;
drop trigger if exists trg_bsv_coherence on public.booking_services;
create trigger trg_bsv_coherence
  before insert or update on public.booking_services
  for each row execute function public.tg_booking_service_coherence();

-- Recalcula total do booking ao inserir/remover booking_services
create or replace function public.tg_recalc_booking_total()
returns trigger language plpgsql as $$
declare v_id uuid; v_sum numeric(12,2);
begin
  v_id := coalesce(new.booking_id, old.booking_id);
  select coalesce(sum(price_at_booking),0) into v_sum
    from public.booking_services where booking_id=v_id;
  update public.bookings set total_amount = v_sum, updated_at = now()
   where id = v_id;
  return null;
end$$;
drop trigger if exists trg_recalc_total on public.booking_services;
create trigger trg_recalc_total
  after insert or update or delete on public.booking_services
  for each row execute function public.tg_recalc_booking_total();

-- ---------------------------------------------------------------------
-- 6) updated_at + auditoria
-- ---------------------------------------------------------------------
drop trigger if exists trg_svc_cat_updated_at on public.service_categories;
create trigger trg_svc_cat_updated_at before update on public.service_categories
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at before update on public.services
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at before update on public.bookings
  for each row execute function public.tg_set_updated_at();

do $$
begin
  if to_regprocedure('public.tg_audit_row()') is not null then
    drop trigger if exists audit_service_categories on public.service_categories;
    create trigger audit_service_categories after insert or update or delete on public.service_categories
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_services on public.services;
    create trigger audit_services after insert or update or delete on public.services
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_barber_services on public.barber_services;
    create trigger audit_barber_services after insert or update or delete on public.barber_services
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_bookings on public.bookings;
    create trigger audit_bookings after insert or update or delete on public.bookings
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_booking_services on public.booking_services;
    create trigger audit_booking_services after insert or update or delete on public.booking_services
      for each row execute function public.tg_audit_row('company_id');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 7) GRANTS
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.service_categories to authenticated;
grant all                            on public.service_categories to service_role;
grant select, insert, update, delete on public.services           to authenticated;
grant all                            on public.services           to service_role;
grant select, insert, update, delete on public.barber_services    to authenticated;
grant all                            on public.barber_services    to service_role;
grant select, insert, update, delete on public.bookings           to authenticated;
grant all                            on public.bookings           to service_role;
grant select, insert, update, delete on public.booking_services   to authenticated;
grant all                            on public.booking_services   to service_role;

-- ---------------------------------------------------------------------
-- 8) RLS
-- ---------------------------------------------------------------------
alter table public.service_categories enable row level security;
alter table public.services           enable row level security;
alter table public.barber_services    enable row level security;
alter table public.bookings           enable row level security;
alter table public.booking_services   enable row level security;

-- ---------- service_categories ----------
drop policy if exists sc_select_public   on public.service_categories;
drop policy if exists sc_select_platform on public.service_categories;
drop policy if exists sc_write_staff     on public.service_categories;
drop policy if exists sc_write_platform  on public.service_categories;

create policy sc_select_public on public.service_categories
  for select to authenticated using (is_active = true);
create policy sc_select_platform on public.service_categories
  for select to authenticated using (public.is_platform_staff(auth.uid()));
create policy sc_write_staff on public.service_categories
  for all to authenticated
  using (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)))
  with check (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)));
create policy sc_write_platform on public.service_categories
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- services ----------
drop policy if exists svc_select_public   on public.services;
drop policy if exists svc_select_staff    on public.services;
drop policy if exists svc_select_platform on public.services;
drop policy if exists svc_write_staff     on public.services;
drop policy if exists svc_write_platform  on public.services;

-- Autenticado vê serviços ativos (para reservar)
create policy svc_select_public on public.services
  for select to authenticated
  using (is_active = true and deleted_at is null);
-- Staff vê todos (inclui inativos) da empresa
create policy svc_select_staff on public.services
  for select to authenticated
  using (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)
    or public.has_role(auth.uid(),'suporte'::public.app_role)));
create policy svc_select_platform on public.services
  for select to authenticated using (public.is_platform_staff(auth.uid()));
create policy svc_write_staff on public.services
  for all to authenticated
  using (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)))
  with check (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)));
create policy svc_write_platform on public.services
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- barber_services ----------
drop policy if exists bs_select_public   on public.barber_services;
drop policy if exists bs_select_platform on public.barber_services;
drop policy if exists bs_write_staff     on public.barber_services;
drop policy if exists bs_write_self      on public.barber_services;
drop policy if exists bs_write_platform  on public.barber_services;

-- Público autenticado: vê vínculos ativos (para escolher barbeiro no booking)
create policy bs_select_public on public.barber_services
  for select to authenticated using (active = true);
create policy bs_select_platform on public.barber_services
  for select to authenticated using (public.is_platform_staff(auth.uid()));
create policy bs_write_staff on public.barber_services
  for all to authenticated
  using (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)))
  with check (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)));
-- Barbeiro pode ativar/desativar os próprios vínculos (não criar novos)
create policy bs_write_self on public.barber_services
  for update to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()))
  with check (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));
create policy bs_write_platform on public.barber_services
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- bookings ----------
drop policy if exists bk_select_staff     on public.bookings;
drop policy if exists bk_select_barber    on public.bookings;
drop policy if exists bk_select_client    on public.bookings;
drop policy if exists bk_select_platform  on public.bookings;
drop policy if exists bk_insert_staff     on public.bookings;
drop policy if exists bk_insert_client    on public.bookings;
drop policy if exists bk_update_staff     on public.bookings;
drop policy if exists bk_update_barber    on public.bookings;
drop policy if exists bk_update_client    on public.bookings;
drop policy if exists bk_delete_staff     on public.bookings;
drop policy if exists bk_write_platform   on public.bookings;

-- SELECT: staff/plataforma/barbeiro-dono/cliente-dono
create policy bk_select_staff on public.bookings
  for select to authenticated
  using (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)
    or public.has_role(auth.uid(),'suporte'::public.app_role)));
create policy bk_select_barber on public.bookings
  for select to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));
create policy bk_select_client on public.bookings
  for select to authenticated
  using (client_id is not null and exists (
    select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));
create policy bk_select_platform on public.bookings
  for select to authenticated using (public.is_platform_staff(auth.uid()));

-- INSERT: staff da empresa, OU cliente marcando pra si
create policy bk_insert_staff on public.bookings
  for insert to authenticated
  with check (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)
    or public.has_role(auth.uid(),'suporte'::public.app_role)));
create policy bk_insert_client on public.bookings
  for insert to authenticated
  with check (client_id is not null and exists (
    select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));

-- UPDATE: staff, barbeiro-dono (marcar in_progress/completed) e cliente-dono (só cancelar)
create policy bk_update_staff on public.bookings
  for update to authenticated
  using (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)
    or public.has_role(auth.uid(),'suporte'::public.app_role)))
  with check (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)
    or public.has_role(auth.uid(),'suporte'::public.app_role)));
create policy bk_update_barber on public.bookings
  for update to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()))
  with check (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));
create policy bk_update_client on public.bookings
  for update to authenticated
  using (client_id is not null and exists (
    select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()))
  with check (client_id is not null and exists (
    select 1 from public.clients c where c.id=client_id and c.user_id=auth.uid()));

-- DELETE: só staff/plataforma
create policy bk_delete_staff on public.bookings
  for delete to authenticated
  using (public.is_member_of(auth.uid(), company_id) and (
    public.has_role(auth.uid(),'proprietario'::public.app_role)
    or public.has_role(auth.uid(),'gerente'::public.app_role)));
create policy bk_write_platform on public.bookings
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- booking_services ----------
drop policy if exists bsv_select_via_booking on public.booking_services;
drop policy if exists bsv_write_via_booking  on public.booking_services;
drop policy if exists bsv_platform            on public.booking_services;

create policy bsv_select_via_booking on public.booking_services
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id=booking_id));
create policy bsv_write_via_booking on public.booking_services
  for all to authenticated
  using (exists (select 1 from public.bookings b where b.id=booking_id
    and (
      public.is_platform_staff(auth.uid())
      or (public.is_member_of(auth.uid(), b.company_id) and (
           public.has_role(auth.uid(),'proprietario'::public.app_role)
        or public.has_role(auth.uid(),'gerente'::public.app_role)
        or public.has_role(auth.uid(),'suporte'::public.app_role)))
      or exists (select 1 from public.clients c where c.id=b.client_id and c.user_id=auth.uid())
    )))
  with check (exists (select 1 from public.bookings b where b.id=booking_id
    and (
      public.is_platform_staff(auth.uid())
      or (public.is_member_of(auth.uid(), b.company_id) and (
           public.has_role(auth.uid(),'proprietario'::public.app_role)
        or public.has_role(auth.uid(),'gerente'::public.app_role)
        or public.has_role(auth.uid(),'suporte'::public.app_role)))
      or exists (select 1 from public.clients c where c.id=b.client_id and c.user_id=auth.uid())
    )));
create policy bsv_platform on public.booking_services
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- =====================================================================
-- FIM DA FASE 6
-- =====================================================================
