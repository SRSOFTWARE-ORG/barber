-- =====================================================================
-- FASE 22: Marketing site / landing / lead capture
-- =====================================================================
begin;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  company_name text,
  city text,
  source text,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','lost')),
  notes text,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  converted_company_id uuid references public.companies(id)
);
create index if not exists leads_status_idx on public.leads(status, created_at desc);
create index if not exists leads_email_idx on public.leads(lower(email));

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body text,
  cover_url text,
  author_id uuid references auth.users(id),
  is_published boolean not null default false,
  published_at timestamptz,
  tags text[] not null default '{}',
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant insert on public.leads to anon, authenticated;
grant select, update on public.leads to authenticated;
grant all on public.leads to service_role;
grant select on public.landing_pages, public.blog_posts to anon, authenticated;
grant all on public.landing_pages, public.blog_posts to service_role;

alter table public.leads enable row level security;
alter table public.landing_pages enable row level security;
alter table public.blog_posts enable row level security;

create policy leads_insert_public on public.leads for insert to anon, authenticated with check (true);
create policy leads_read_platform on public.leads for select to authenticated using (public.has_role(auth.uid(),'platform_admin') or public.has_role(auth.uid(),'platform_support'));
create policy leads_update_platform on public.leads for update to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

create policy lp_read on public.landing_pages for select using (is_published or public.has_role(auth.uid(),'platform_admin'));
create policy lp_admin on public.landing_pages for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));
create policy bp_read on public.blog_posts for select using (is_published or public.has_role(auth.uid(),'platform_admin'));
create policy bp_admin on public.blog_posts for all to authenticated using (public.has_role(auth.uid(),'platform_admin')) with check (public.has_role(auth.uid(),'platform_admin'));

commit;
