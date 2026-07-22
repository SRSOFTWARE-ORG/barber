-- =====================================================================
-- FASE 3 — Segurança, Auditoria e Sessões
-- Pré-requisitos: phase2_tenant.sql executado com sucesso.
-- Idempotente: pode ser reexecutado sem erros.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'security_event_type') then
    create type public.security_event_type as enum (
      'login_success',
      'login_failed',
      'logout',
      'password_reset_requested',
      'password_changed',
      'email_changed',
      'mfa_enabled',
      'mfa_disabled',
      'mfa_challenge_failed',
      'role_granted',
      'role_revoked',
      'suspicious_activity',
      'account_locked',
      'account_unlocked'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type public.audit_action as enum ('insert','update','delete');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 2) AUTH LOGS (tentativas de autenticação)
-- ---------------------------------------------------------------------
create table if not exists public.auth_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  email          text,
  event          public.security_event_type not null,
  success        boolean not null default false,
  ip_address     inet,
  user_agent     text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_auth_logs_user_id     on public.auth_logs(user_id);
create index if not exists idx_auth_logs_email       on public.auth_logs(lower(email));
create index if not exists idx_auth_logs_event       on public.auth_logs(event);
create index if not exists idx_auth_logs_created_at  on public.auth_logs(created_at desc);

-- ---------------------------------------------------------------------
-- 3) SECURITY EVENTS (eventos de segurança de negócio)
-- ---------------------------------------------------------------------
create table if not exists public.security_events (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references public.companies(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  actor_id       uuid references auth.users(id) on delete set null,
  event          public.security_event_type not null,
  severity       text not null default 'info'
                 check (severity in ('info','low','medium','high','critical')),
  description    text,
  ip_address     inet,
  user_agent     text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_sec_events_company    on public.security_events(company_id);
create index if not exists idx_sec_events_user       on public.security_events(user_id);
create index if not exists idx_sec_events_event      on public.security_events(event);
create index if not exists idx_sec_events_severity   on public.security_events(severity);
create index if not exists idx_sec_events_created_at on public.security_events(created_at desc);

-- ---------------------------------------------------------------------
-- 4) ACTIVE SESSIONS (sessões ativas rastreadas pelo app)
-- ---------------------------------------------------------------------
create table if not exists public.active_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  session_token  text unique,
  ip_address     inet,
  user_agent     text,
  device         text,
  platform       text,
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_active_sessions_user       on public.active_sessions(user_id);
create index if not exists idx_active_sessions_last_seen  on public.active_sessions(last_seen_at desc);
create index if not exists idx_active_sessions_active
  on public.active_sessions(user_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------
-- 5) AUDIT EVENTS (mudanças em dados sensíveis)
-- ---------------------------------------------------------------------
create table if not exists public.audit_events (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references public.companies(id) on delete set null,
  actor_id       uuid references auth.users(id) on delete set null,
  table_name     text not null,
  record_id      text,
  action         public.audit_action not null,
  old_data       jsonb,
  new_data       jsonb,
  diff           jsonb,
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_events_company    on public.audit_events(company_id);
create index if not exists idx_audit_events_actor      on public.audit_events(actor_id);
create index if not exists idx_audit_events_table      on public.audit_events(table_name);
create index if not exists idx_audit_events_record     on public.audit_events(table_name, record_id);
create index if not exists idx_audit_events_created_at on public.audit_events(created_at desc);

-- ---------------------------------------------------------------------
-- 6) TRIGGER GENÉRICO DE AUDITORIA
--    Uso: create trigger ... execute function public.tg_audit_row('company_id');
--    Passe o nome da coluna que carrega company_id (ou nulo se não houver).
-- ---------------------------------------------------------------------
create or replace function public.tg_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_col text := coalesce(tg_argv[0], 'company_id');
  v_company_id  uuid;
  v_old         jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new         jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_diff        jsonb;
  v_record_id   text;
begin
  -- extrai company_id se a coluna existir no payload
  if v_new ? v_company_col then
    v_company_id := nullif(v_new ->> v_company_col, '')::uuid;
  elsif v_old ? v_company_col then
    v_company_id := nullif(v_old ->> v_company_col, '')::uuid;
  end if;

  -- id do registro (assume coluna "id")
  v_record_id := coalesce(v_new ->> 'id', v_old ->> 'id');

  -- diff simples: chaves alteradas
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('old', v_old -> key, 'new', v_new -> key))
      into v_diff
      from (
        select key from jsonb_each(v_new)
        where v_new -> key is distinct from v_old -> key
      ) s;
  end if;

  insert into public.audit_events(
    company_id, actor_id, table_name, record_id, action, old_data, new_data, diff
  ) values (
    v_company_id,
    auth.uid(),
    tg_table_schema || '.' || tg_table_name,
    v_record_id,
    lower(tg_op)::public.audit_action,
    v_old,
    v_new,
    v_diff
  );

  return coalesce(new, old);
end;
$$;

-- Anexa auditoria às tabelas sensíveis da Fase 2
do $$
begin
  if to_regclass('public.companies') is not null then
    drop trigger if exists audit_companies on public.companies;
    create trigger audit_companies
      after insert or update or delete on public.companies
      for each row execute function public.tg_audit_row('id');
  end if;

  if to_regclass('public.units') is not null then
    drop trigger if exists audit_units on public.units;
    create trigger audit_units
      after insert or update or delete on public.units
      for each row execute function public.tg_audit_row('company_id');
  end if;

  if to_regclass('public.user_roles') is not null then
    drop trigger if exists audit_user_roles on public.user_roles;
    create trigger audit_user_roles
      after insert or update or delete on public.user_roles
      for each row execute function public.tg_audit_row('company_id');
  end if;

  if to_regclass('public.role_permissions') is not null then
    drop trigger if exists audit_role_permissions on public.role_permissions;
    create trigger audit_role_permissions
      after insert or update or delete on public.role_permissions
      for each row execute function public.tg_audit_row();
  end if;

  if to_regclass('public.company_settings') is not null then
    drop trigger if exists audit_company_settings on public.company_settings;
    create trigger audit_company_settings
      after insert or update or delete on public.company_settings
      for each row execute function public.tg_audit_row('company_id');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 7) HELPERS DE SEGURANÇA
-- ---------------------------------------------------------------------
create or replace function public.log_security_event(
  _event       public.security_event_type,
  _company_id  uuid default null,
  _user_id     uuid default null,
  _severity    text default 'info',
  _description text default null,
  _metadata    jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.security_events(
    company_id, user_id, actor_id, event, severity, description, metadata
  ) values (
    _company_id, coalesce(_user_id, auth.uid()), auth.uid(),
    _event, _severity, _description, coalesce(_metadata, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.touch_active_session(
  _session_token text,
  _ip inet default null,
  _user_agent text default null,
  _device text default null,
  _platform text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.active_sessions(
    user_id, session_token, ip_address, user_agent, device, platform, last_seen_at
  ) values (
    v_uid, _session_token, _ip, _user_agent, _device, _platform, now()
  )
  on conflict (session_token) do update
    set last_seen_at = now(),
        ip_address   = coalesce(excluded.ip_address, public.active_sessions.ip_address),
        user_agent   = coalesce(excluded.user_agent, public.active_sessions.user_agent),
        device       = coalesce(excluded.device, public.active_sessions.device),
        platform     = coalesce(excluded.platform, public.active_sessions.platform),
        revoked_at   = null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_active_session(_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.active_sessions
     set revoked_at = now()
   where id = _session_id
     and (user_id = auth.uid() or public.is_platform_staff(auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------
-- 8) GRANTS (Data API)
-- ---------------------------------------------------------------------
grant select                on public.auth_logs        to authenticated;
grant all                   on public.auth_logs        to service_role;

grant select                on public.security_events  to authenticated;
grant all                   on public.security_events  to service_role;

grant select, update        on public.active_sessions  to authenticated;
grant all                   on public.active_sessions  to service_role;

grant select                on public.audit_events     to authenticated;
grant all                   on public.audit_events     to service_role;

grant execute on function public.log_security_event(public.security_event_type, uuid, uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.touch_active_session(text, inet, text, text, text) to authenticated, service_role;
grant execute on function public.revoke_active_session(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9) RLS
-- ---------------------------------------------------------------------
alter table public.auth_logs       enable row level security;
alter table public.security_events enable row level security;
alter table public.active_sessions enable row level security;
alter table public.audit_events    enable row level security;

-- auth_logs: usuário vê os próprios; staff da plataforma vê tudo
drop policy if exists auth_logs_select_own       on public.auth_logs;
drop policy if exists auth_logs_select_platform  on public.auth_logs;
create policy auth_logs_select_own on public.auth_logs
  for select to authenticated
  using (user_id = auth.uid());
create policy auth_logs_select_platform on public.auth_logs
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

-- security_events: dono da empresa/gerente vêem da empresa; usuário vê os próprios; staff tudo
drop policy if exists sec_events_select_company  on public.security_events;
drop policy if exists sec_events_select_own      on public.security_events;
drop policy if exists sec_events_select_platform on public.security_events;
create policy sec_events_select_own on public.security_events
  for select to authenticated
  using (user_id = auth.uid());
create policy sec_events_select_company on public.security_events
  for select to authenticated
  using (
    company_id is not null
    and (
      public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
    )
    and public.is_member_of(auth.uid(), company_id)
  );
create policy sec_events_select_platform on public.security_events
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

-- active_sessions: usuário gerencia as próprias; staff vê tudo
drop policy if exists active_sessions_select_own      on public.active_sessions;
drop policy if exists active_sessions_update_own      on public.active_sessions;
drop policy if exists active_sessions_select_platform on public.active_sessions;
create policy active_sessions_select_own on public.active_sessions
  for select to authenticated
  using (user_id = auth.uid());
create policy active_sessions_update_own on public.active_sessions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy active_sessions_select_platform on public.active_sessions
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

-- audit_events: proprietário/gerente vêem da empresa; staff tudo
drop policy if exists audit_events_select_company  on public.audit_events;
drop policy if exists audit_events_select_platform on public.audit_events;
create policy audit_events_select_company on public.audit_events
  for select to authenticated
  using (
    company_id is not null
    and (
      public.has_role(auth.uid(), 'proprietario'::public.app_role)
      or public.has_role(auth.uid(), 'gerente'::public.app_role)
    )
    and public.is_member_of(auth.uid(), company_id)
  );
create policy audit_events_select_platform on public.audit_events
  for select to authenticated
  using (public.is_platform_staff(auth.uid()));

-- Nenhuma policy de INSERT/UPDATE/DELETE direta:
-- inserções ocorrem via triggers/funções SECURITY DEFINER ou service_role.

-- =====================================================================
-- FIM DA FASE 3
-- =====================================================================
