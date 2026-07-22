-- =====================================================================
-- FASE 21: i18n (traduções, locales, moedas)
-- =====================================================================
begin;

create table if not exists public.locales (
  code text primary key,
  name text not null,
  is_active boolean not null default true,
  is_default boolean not null default false
);

create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  key text not null,
  locale text not null references public.locales(code),
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (namespace, key, locale)
);
create index if not exists tr_ns_locale_idx on public.translations(namespace, locale);

create table if not exists public.currencies (
  code text primary key,
  name text not null,
  symbol text not null,
  decimals int not null default 2,
  is_active boolean not null default true
);

insert into public.locales(code,name,is_default) values
 ('pt-BR','Português (Brasil)', true),
 ('en-US','English (US)', false),
 ('es-ES','Español', false)
on conflict do nothing;

insert into public.currencies(code,name,symbol) values
 ('BRL','Real','R$'),('USD','US Dollar','$'),('EUR','Euro','€')
on conflict do nothing;

grant select on public.locales, public.translations, public.currencies to authenticated, anon;
grant all on public.locales, public.translations, public.currencies to service_role;

alter table public.locales enable row level security;
alter table public.translations enable row level security;
alter table public.currencies enable row level security;

create policy loc_read on public.locales for select using (true);
create policy loc_admin on public.locales for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));
create policy tr_read on public.translations for select using (true);
create policy tr_admin on public.translations for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));
create policy cur_read on public.currencies for select using (true);
create policy cur_admin on public.currencies for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

commit;
