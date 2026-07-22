-- =====================================================================
-- FASE 4 — Clientes (end-customers das barbearias)
-- Pré-requisitos: phase2_tenant.sql e phase3_security.sql executados.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'client_status') then
    create type public.client_status as enum ('active','inactive','blocked');
  end if;

  if not exists (select 1 from pg_type where typname = 'client_gender') then
    create type public.client_gender as enum ('male','female','other','unspecified');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2) TABELA: clients
--    Cadastro do cliente final de UMA empresa (multi-tenant).
--    Se o cliente também tiver conta de usuário (auth.users), user_id
--    faz a ligação. Mesma pessoa em empresas diferentes = 2 clients.
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,

  full_name      text not null,
  email          text,
  phone          text,
  document       text,                 -- CPF/CNPJ/etc
  birthdate      date,
  gender         public.client_gender not null default 'unspecified',

  avatar_url     text,
  notes          text,                 -- observações internas (não expor ao cliente)
  tags           text[] not null default '{}',

  status         public.client_status not null default 'active',

  marketing_opt_in boolean not null default false,
  whatsapp_opt_in  boolean not null default true,

  first_visit_at   timestamptz,
  last_visit_at    timestamptz,
  visits_count     integer not null default 0,
  total_spent      numeric(12,2) not null default 0,

  metadata       jsonb not null default '{}'::jsonb,

  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint clients_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Unicidade por empresa (case-insensitive p/ email; ignora nulos)
create unique index if not exists uq_clients_company_email
  on public.clients(company_id, lower(email))
  where email is not null and deleted_at is null;

create unique index if not exists uq_clients_company_phone
  on public.clients(company_id, phone)
  where phone is not null and deleted_at is null;

create unique index if not exists uq_clients_company_document
  on public.clients(company_id, document)
  where document is not null and deleted_at is null;

-- Índices de busca
create index if not exists idx_clients_company        on public.clients(company_id);
create index if not exists idx_clients_user           on public.clients(user_id);
create index if not exists idx_clients_status         on public.clients(company_id, status);
create index if not exists idx_clients_name_trgm      on public.clients using gin (full_name gin_trgm_ops);
create index if not exists idx_clients_tags           on public.clients using gin (tags);
create index if not exists idx_clients_last_visit     on public.clients(company_id, last_visit_at desc nulls last);

-- Extensão para busca textual (idempotente)
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 3) TABELA: client_addresses (1..n endereços por cliente)
-- ---------------------------------------------------------------------
create table if not exists public.client_addresses (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  label        text,
  line1        text not null,
  line2        text,
  district     text,
  city         text,
  state        text,
  postal_code  text,
  country      text default 'BR',
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_client_addr_client  on public.client_addresses(client_id);
create index if not exists idx_client_addr_company on public.client_addresses(company_id);

-- Garante coerência company_id do endereço = do cliente
create or replace function public.tg_client_addr_coherence()
returns trigger
language plpgsql
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.clients where id = new.client_id;
  if v_company is null then
    raise exception 'client not found';
  end if;
  new.company_id := v_company;
  return new;
end;
$$;

drop trigger if exists trg_client_addr_coherence on public.client_addresses;
create trigger trg_client_addr_coherence
  before insert or update on public.client_addresses
  for each row execute function public.tg_client_addr_coherence();

-- ---------------------------------------------------------------------
-- 4) TABELA: client_notes (histórico de anotações internas)
-- ---------------------------------------------------------------------
create table if not exists public.client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  author_id   uuid references auth.users(id) on delete set null,
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_client_notes_client  on public.client_notes(client_id, created_at desc);
create index if not exists idx_client_notes_company on public.client_notes(company_id);

create or replace function public.tg_client_note_coherence()
returns trigger
language plpgsql
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.clients where id = new.client_id;
  if v_company is null then
    raise exception 'client not found';
  end if;
  new.company_id := v_company;
  new.author_id  := coalesce(new.author_id, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_client_note_coherence on public.client_notes;
create trigger trg_client_note_coherence
  before insert on public.client_notes
  for each row execute function public.tg_client_note_coherence();

-- ---------------------------------------------------------------------
-- 5) updated_at automático (reusa helper da Fase 2 se existir)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.tg_set_updated_at()') is null then
    execute $f$
      create or replace function public.tg_set_updated_at()
      returns trigger language plpgsql as $body$
      begin new.updated_at := now(); return new; end;
      $body$;
    $f$;
  end if;
end$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_client_addr_updated_at on public.client_addresses;
create trigger trg_client_addr_updated_at
  before update on public.client_addresses
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 6) Auditoria (usa tg_audit_row da Fase 3, se disponível)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.tg_audit_row()') is not null then
    drop trigger if exists audit_clients on public.clients;
    create trigger audit_clients
      after insert or update or delete on public.clients
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_client_addresses on public.client_addresses;
    create trigger audit_client_addresses
      after insert or update or delete on public.client_addresses
      for each row execute function public.tg_audit_row('company_id');

    drop trigger if exists audit_client_notes on public.client_notes;
    create trigger audit_client_notes
      after insert or update or delete on public.client_notes
      for each row execute function public.tg_audit_row('company_id');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 7) GRANTS (Data API — sem anon; clientes finais operam autenticados)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.clients           to authenticated;
grant all                            on public.clients           to service_role;

grant select, insert, update, delete on public.client_addresses  to authenticated;
grant all                            on public.client_addresses  to service_role;

grant select, insert, delete         on public.client_notes      to authenticated;
grant all                            on public.client_notes      to service_role;

-- ---------------------------------------------------------------------
-- 8) RLS
-- ---------------------------------------------------------------------
alter table public.clients           enable row level security;
alter table public.client_addresses  enable row level security;
alter table public.client_notes      enable row level security;

-- ---------- clients ----------
drop policy if exists clients_select_staff     on public.clients;
drop policy if exists clients_select_self      on public.clients;
drop policy if exists clients_select_platform  on public.clients;
drop policy if exists clients_write_staff      on public.clients;
drop policy if exists clients_update_self      on public.clients;
drop policy if exists clients_write_platform   on public.clients;

-- Equipe da empresa (proprietário/gerente/barbeiro/suporte) vê os clientes da própria empresa
create policy clients_select_staff on public.clients
  for select to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
      or public.has_role(auth.uid(), 'barbeiro'::public.app_role)
      or public.has_role(auth.uid(), 'suporte'::public.app_role)
    )
  );

-- Cliente final vê o próprio cadastro
create policy clients_select_self on public.clients
  for select to authenticated
  using (user_id = auth.uid());

-- Plataforma (CEO/staff global) vê tudo
create policy clients_select_platform on public.clients
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

-- Escrita: apenas equipe da empresa (proprietário/gerente) OU plataforma
create policy clients_write_staff on public.clients
  for all to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
    )
  )
  with check (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
    )
  );

-- Cliente pode atualizar campos do próprio cadastro (marketing opt-in, avatar, etc.)
create policy clients_update_self on public.clients
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy clients_write_platform on public.clients
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- client_addresses ----------
drop policy if exists client_addr_select_staff    on public.client_addresses;
drop policy if exists client_addr_select_self     on public.client_addresses;
drop policy if exists client_addr_select_platform on public.client_addresses;
drop policy if exists client_addr_write_staff     on public.client_addresses;
drop policy if exists client_addr_write_self      on public.client_addresses;
drop policy if exists client_addr_write_platform  on public.client_addresses;

create policy client_addr_select_staff on public.client_addresses
  for select to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
      or public.has_role(auth.uid(), 'barbeiro'::public.app_role)
      or public.has_role(auth.uid(), 'suporte'::public.app_role)
    )
  );

create policy client_addr_select_self on public.client_addresses
  for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy client_addr_select_platform on public.client_addresses
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

create policy client_addr_write_staff on public.client_addresses
  for all to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
    )
  )
  with check (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
    )
  );

create policy client_addr_write_self on public.client_addresses
  for all to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy client_addr_write_platform on public.client_addresses
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- ---------- client_notes (interno; cliente final NÃO vê) ----------
drop policy if exists client_notes_select_staff    on public.client_notes;
drop policy if exists client_notes_select_platform on public.client_notes;
drop policy if exists client_notes_write_staff     on public.client_notes;
drop policy if exists client_notes_delete_author   on public.client_notes;
drop policy if exists client_notes_write_platform  on public.client_notes;

create policy client_notes_select_staff on public.client_notes
  for select to authenticated
  using (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
      or public.has_role(auth.uid(), 'barbeiro'::public.app_role)
    )
  );

create policy client_notes_select_platform on public.client_notes
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

create policy client_notes_write_staff on public.client_notes
  for insert to authenticated
  with check (
    public.is_member_of(auth.uid(), company_id)
    and (
         public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
      or public.has_role(auth.uid(), 'barbeiro'::public.app_role)
    )
  );

-- Autor pode apagar a própria nota; proprietário/gerente podem apagar qualquer nota da empresa
create policy client_notes_delete_author on public.client_notes
  for delete to authenticated
  using (
    author_id = auth.uid()
    or (
      public.is_member_of(auth.uid(), company_id)
      and (
           public.has_role(auth.uid(), 'proprietario'::public.app_role)
        or public.has_role(auth.uid(), 'gerente'::public.app_role)
      )
    )
  );

create policy client_notes_write_platform on public.client_notes
  for all to authenticated
  using (public.is_platform_staff(auth.uid()))
  with check (public.is_platform_staff(auth.uid()));

-- =====================================================================
-- FIM DA FASE 4
-- =====================================================================
