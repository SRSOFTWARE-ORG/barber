-- =====================================================================
-- FASE 5 — Barbeiros, disponibilidades e vínculos
-- Pré-requisitos: phase2_tenant.sql, phase3_security.sql, phase4_clients.sql
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname='barber_status') then
    create type public.barber_status as enum ('active','inactive','vacation','blocked');
  end if;
  if not exists (select 1 from pg_type where typname='time_off_reason') then
    create type public.time_off_reason as enum ('vacation','sick','personal','holiday','other');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2) TABELA: barbers
-- ---------------------------------------------------------------------
create table if not exists public.barbers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,

  display_name   text not null,
  slug           text,
  bio            text,
  avatar_url     text,
  phone          text,
  email          text,

  commission_rate numeric(5,2) not null default 40.00
    check (commission_rate >= 0 and commission_rate <= 100),

  status         public.barber_status not null default 'active',
  is_bookable    boolean not null default true,
  accepts_walkin boolean not null default true,

  rating_avg     numeric(3,2) not null default 0,
  rating_count   integer not null default 0,
  metadata       jsonb not null default '{}'::jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint barbers_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index if not exists uq_barbers_company_user
  on public.barbers(company_id, user_id)
  where user_id is not null and deleted_at is null;

create unique index if not exists uq_barbers_company_slug
  on public.barbers(company_id, slug)
  where slug is not null and deleted_at is null;

create index if not exists idx_barbers_company on public.barbers(company_id);
create index if not exists idx_barbers_user    on public.barbers(user_id);
create index if not exists idx_barbers_status  on public.barbers(company_id, status);
create index if not exists idx_barbers_name_trgm on public.barbers using gin (display_name gin_trgm_ops);

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 3) TABELA: barber_units  (vínculo barbeiro <-> unidade)
--    Um barbeiro pode atender em várias unidades da mesma empresa.
-- ---------------------------------------------------------------------
create table if not exists public.barber_units (
  id           uuid primary key default gen_random_uuid(),
  barber_id    uuid not null references public.barbers(id) on delete cascade,
  unit_id      uuid not null references public.units(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  is_primary   boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (barber_id, unit_id)
);

create index if not exists idx_barber_units_company on public.barber_units(company_id);
create index if not exists idx_barber_units_barber  on public.barber_units(barber_id);
create index if not exists idx_barber_units_unit    on public.barber_units(unit_id);

-- Coerência: company_id do vínculo = do barbeiro = da unidade
create or replace function public.tg_barber_unit_coherence()
returns trigger language plpgsql as $$
declare
  v_b_company uuid; v_u_company uuid;
begin
  select company_id into v_b_company from public.barbers where id=new.barber_id;
  select company_id into v_u_company from public.units   where id=new.unit_id;
  if v_b_company is null then raise exception 'barber not found'; end if;
  if v_u_company is null then raise exception 'unit not found';   end if;
  if v_b_company <> v_u_company then
    raise exception 'unit and barber belong to different companies';
  end if;
  new.company_id := v_b_company;
  return new;
end;
$$;

drop trigger if exists trg_barber_unit_coherence on public.barber_units;
create trigger trg_barber_unit_coherence
  before insert or update on public.barber_units
  for each row execute function public.tg_barber_unit_coherence();

-- ---------------------------------------------------------------------
-- 4) TABELA: barber_availability (horário semanal recorrente)
--    weekday: 0=domingo ... 6=sábado (padrão ISO/JS)
-- ---------------------------------------------------------------------
create table if not exists public.barber_availability (
  id           uuid primary key default gen_random_uuid(),
  barber_id    uuid not null references public.barbers(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  unit_id      uuid references public.units(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists idx_avail_barber   on public.barber_availability(barber_id, weekday);
create index if not exists idx_avail_company  on public.barber_availability(company_id);
create index if not exists idx_avail_unit     on public.barber_availability(unit_id);

-- Sem sobreposição no mesmo dia/unidade
create index if not exists idx_avail_no_overlap
  on public.barber_availability(barber_id, weekday, unit_id);

create or replace function public.tg_avail_coherence()
returns trigger language plpgsql as $$
declare v_company uuid; v_u_company uuid;
begin
  select company_id into v_company from public.barbers where id=new.barber_id;
  if v_company is null then raise exception 'barber not found'; end if;
  new.company_id := v_company;
  if new.unit_id is not null then
    select company_id into v_u_company from public.units where id=new.unit_id;
    if v_u_company is null or v_u_company <> v_company then
      raise exception 'unit does not belong to barber company';
    end if;
  end if;
  -- Sobreposição
  if exists (
    select 1 from public.barber_availability a
     where a.barber_id = new.barber_id
       and a.weekday   = new.weekday
       and coalesce(a.unit_id::text,'') = coalesce(new.unit_id::text,'')
       and a.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and a.active = true
       and new.active = true
       and a.start_time < new.end_time
       and a.end_time   > new.start_time
  ) then
    raise exception 'availability overlaps existing slot';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_avail_coherence on public.barber_availability;
create trigger trg_avail_coherence
  before insert or update on public.barber_availability
  for each row execute function public.tg_avail_coherence();

-- ---------------------------------------------------------------------
-- 5) TABELA: barber_time_off (folgas/férias por período)
-- ---------------------------------------------------------------------
create table if not exists public.barber_time_off (
  id           uuid primary key default gen_random_uuid(),
  barber_id    uuid not null references public.barbers(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  reason       public.time_off_reason not null default 'other',
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_time_off_barber   on public.barber_time_off(barber_id, starts_at);
create index if not exists idx_time_off_company  on public.barber_time_off(company_id);
create index if not exists idx_time_off_range    on public.barber_time_off using gist (
  tstzrange(starts_at, ends_at, '[)')
);

create or replace function public.tg_time_off_coherence()
returns trigger language plpgsql as $$
declare v_company uuid;
begin
  select company_id into v_company from public.barbers where id=new.barber_id;
  if v_company is null then raise exception 'barber not found'; end if;
  new.company_id := v_company;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_time_off_coherence on public.barber_time_off;
create trigger trg_time_off_coherence
  before insert on public.barber_time_off
  for each row execute function public.tg_time_off_coherence();

-- ---------------------------------------------------------------------
-- 6) updated_at + auditoria
-- ---------------------------------------------------------------------
drop trigger if exists trg_barbers_updated_at on public.barbers;
create trigger trg_barbers_updated_at
  before update on public.barbers
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_avail_updated_at on public.barber_availability;
create trigger trg_avail_updated_at
  before update on public.barber_availability
  for each row execute function public.tg_set_updated_at();

do $$
begin
  if to_regprocedure('public.tg_audit_row()') is not null then
    drop trigger if exists audit_barbers on public.barbers;
    create trigger audit_barbers after insert or update or delete on public.barbers
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_barber_units on public.barber_units;
    create trigger audit_barber_units after insert or update or delete on public.barber_units
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_barber_availability on public.barber_availability;
    create trigger audit_barber_availability after insert or update or delete on public.barber_availability
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_barber_time_off on public.barber_time_off;
    create trigger audit_barber_time_off after insert or update or delete on public.barber_time_off
      for each row execute function public.tg_audit_row('company_id');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 7) GRANTS
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.barbers              to authenticated;
grant all                            on public.barbers              to service_role;
grant select, insert, update, delete on public.barber_units         to authenticated;
grant all                            on public.barber_units         to service_role;
grant select, insert, update, delete on public.barber_availability  to authenticated;
grant all                            on public.barber_availability  to service_role;
grant select, insert, update, delete on public.barber_time_off      to authenticated;
grant all                            on public.barber_time_off      to service_role;

-- Leitura pública (clientes autenticados) do catálogo de barbeiros ativos
-- via RLS abaixo — não damos anon.

-- ---------------------------------------------------------------------
-- 8) RLS
-- ---------------------------------------------------------------------
alter table public.barbers             enable row level security;
alter table public.barber_units        enable row level security;
alter table public.barber_availability enable row level security;
alter table public.barber_time_off     enable row level security;

-- ---------- barbers ----------
drop policy if exists barbers_select_staff       on public.barbers;
drop policy if exists barbers_select_self        on public.barbers;
drop policy if exists barbers_select_bookable    on public.barbers;
drop policy if exists barbers_select_platform    on public.barbers;
drop policy if exists barbers_write_staff        on public.barbers;
drop policy if exists barbers_update_self        on public.barbers;
drop policy if exists barbers_write_platform     on public.barbers;

-- Equipe (owner/gerente/suporte) vê tudo da empresa
create policy barbers_select_staff on public.barbers
  for select to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
      or public.has_role(auth.uid(),'suporte'::public.app_role)
    )
  );

-- Próprio barbeiro vê o próprio registro
create policy barbers_select_self on public.barbers
  for select to authenticated
  using (user_id = auth.uid());

-- Qualquer usuário autenticado vê barbeiros ATIVOS e bookable (para reserva)
create policy barbers_select_bookable on public.barbers
  for select to authenticated
  using (status = 'active' and is_bookable = true and deleted_at is null);

create policy barbers_select_platform on public.barbers
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

-- Escrita: proprietário/gerente da empresa
create policy barbers_write_staff on public.barbers
  for all to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  )
  with check (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  );

-- Barbeiro atualiza campos do próprio perfil
create policy barbers_update_self on public.barbers
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy barbers_write_platform on public.barbers
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- barber_units ----------
drop policy if exists bu_select_staff    on public.barber_units;
drop policy if exists bu_select_self     on public.barber_units;
drop policy if exists bu_select_platform on public.barber_units;
drop policy if exists bu_write_staff     on public.barber_units;
drop policy if exists bu_write_platform  on public.barber_units;

create policy bu_select_staff on public.barber_units
  for select to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
      or public.has_role(auth.uid(),'suporte'::public.app_role)
    )
  );

create policy bu_select_self on public.barber_units
  for select to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));

create policy bu_select_platform on public.barber_units
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

create policy bu_write_staff on public.barber_units
  for all to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  )
  with check (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  );

create policy bu_write_platform on public.barber_units
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- barber_availability ----------
drop policy if exists ava_select_staff    on public.barber_availability;
drop policy if exists ava_select_self     on public.barber_availability;
drop policy if exists ava_select_public   on public.barber_availability;
drop policy if exists ava_select_platform on public.barber_availability;
drop policy if exists ava_write_staff     on public.barber_availability;
drop policy if exists ava_write_self      on public.barber_availability;
drop policy if exists ava_write_platform  on public.barber_availability;

create policy ava_select_staff on public.barber_availability
  for select to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
      or public.has_role(auth.uid(),'suporte'::public.app_role)
    )
  );

-- Próprio barbeiro vê suas disponibilidades
create policy ava_select_self on public.barber_availability
  for select to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));

-- Qualquer autenticado vê disponibilidade de barbeiros ativos/bookable (para agendar)
create policy ava_select_public on public.barber_availability
  for select to authenticated
  using (
    active = true
    and exists (
      select 1 from public.barbers b
       where b.id = barber_id
         and b.status='active' and b.is_bookable=true and b.deleted_at is null
    )
  );

create policy ava_select_platform on public.barber_availability
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

-- Escrita: proprietário/gerente OU o próprio barbeiro
create policy ava_write_staff on public.barber_availability
  for all to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  )
  with check (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  );

create policy ava_write_self on public.barber_availability
  for all to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()))
  with check (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));

create policy ava_write_platform on public.barber_availability
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- barber_time_off ----------
drop policy if exists tof_select_staff    on public.barber_time_off;
drop policy if exists tof_select_self     on public.barber_time_off;
drop policy if exists tof_select_platform on public.barber_time_off;
drop policy if exists tof_write_staff     on public.barber_time_off;
drop policy if exists tof_write_self      on public.barber_time_off;
drop policy if exists tof_write_platform  on public.barber_time_off;

create policy tof_select_staff on public.barber_time_off
  for select to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
      or public.has_role(auth.uid(),'suporte'::public.app_role)
    )
  );

create policy tof_select_self on public.barber_time_off
  for select to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));

create policy tof_select_platform on public.barber_time_off
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

create policy tof_write_staff on public.barber_time_off
  for all to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  )
  with check (
    public.is_member_of(auth.uid(), company_id)
    and (
      public.has_role(auth.uid(),'proprietario'::public.app_role)
      or public.has_role(auth.uid(),'gerente'::public.app_role)
    )
  );

create policy tof_write_self on public.barber_time_off
  for all to authenticated
  using (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()))
  with check (exists (select 1 from public.barbers b where b.id=barber_id and b.user_id=auth.uid()));

create policy tof_write_platform on public.barber_time_off
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- =====================================================================
-- FIM DA FASE 5
-- =====================================================================
