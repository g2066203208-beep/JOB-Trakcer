-- UniJob AI database schema v2
-- PostgreSQL / Supabase

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  industry text,
  sector text,
  nature text,
  headquarters text,
  website text,
  career_url text,
  logo_url text,
  description text,
  tags text[] not null default '{}',
  source_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.majors (
  id text primary key,
  discipline text not null,
  name text not null unique,
  aliases text[] not null default '{}'
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null unique,
  aliases text[] not null default '{}'
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  company_id uuid references public.companies(id) on delete set null,
  company_name text not null,
  title text not null,
  unit text,
  industry text,
  job_type text,
  location text,
  degree text,
  majors_text text,
  major_tags text[] not null default '{}',
  skill_tags text[] not null default '{}',
  headcount text,
  salary_min numeric,
  salary_max numeric,
  salary_period text,
  open_date date,
  deadline date,
  requirements text,
  process text,
  apply_url text not null,
  source_url text,
  source_name text,
  verified boolean not null default false,
  auto_discovered boolean not null default false,
  published boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_deadline_idx on public.jobs(deadline);
create index if not exists jobs_company_idx on public.jobs(company_name);
create index if not exists jobs_industry_idx on public.jobs(industry);
create index if not exists jobs_major_tags_idx on public.jobs using gin(major_tags);
create index if not exists jobs_skill_tags_idx on public.jobs using gin(skill_tags);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  school text,
  degree text,
  major text,
  graduation_year integer,
  target_industries text[] not null default '{}',
  target_roles text[] not null default '{}',
  target_cities text[] not null default '{}',
  skills text[] not null default '{}',
  certificates text[] not null default '{}',
  salary_min numeric,
  salary_max numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_applications (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_external_id text not null,
  stage text not null default '未申请' check(stage in ('未申请','已申请','被拒')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key(user_id, job_external_id)
);

create table if not exists public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_external_id text not null,
  created_at timestamptz not null default now(),
  primary key(user_id, job_external_id)
);

alter table public.user_profiles enable row level security;
alter table public.user_applications enable row level security;
alter table public.user_favorites enable row level security;

drop policy if exists "profile own select" on public.user_profiles;
create policy "profile own select" on public.user_profiles for select using (auth.uid()=user_id);
drop policy if exists "profile own insert" on public.user_profiles;
create policy "profile own insert" on public.user_profiles for insert with check (auth.uid()=user_id);
drop policy if exists "profile own update" on public.user_profiles;
create policy "profile own update" on public.user_profiles for update using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "applications own select" on public.user_applications;
create policy "applications own select" on public.user_applications for select using (auth.uid()=user_id);
drop policy if exists "applications own insert" on public.user_applications;
create policy "applications own insert" on public.user_applications for insert with check (auth.uid()=user_id);
drop policy if exists "applications own update" on public.user_applications;
create policy "applications own update" on public.user_applications for update using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "applications own delete" on public.user_applications;
create policy "applications own delete" on public.user_applications for delete using (auth.uid()=user_id);

drop policy if exists "favorites own select" on public.user_favorites;
create policy "favorites own select" on public.user_favorites for select using (auth.uid()=user_id);
drop policy if exists "favorites own insert" on public.user_favorites;
create policy "favorites own insert" on public.user_favorites for insert with check (auth.uid()=user_id);
drop policy if exists "favorites own delete" on public.user_favorites;
create policy "favorites own delete" on public.user_favorites for delete using (auth.uid()=user_id);

-- Public employment data can be read by anyone.
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.majors enable row level security;
alter table public.skills enable row level security;

drop policy if exists "companies public read" on public.companies;
create policy "companies public read" on public.companies for select using (true);
drop policy if exists "jobs public read" on public.jobs;
create policy "jobs public read" on public.jobs for select using (published=true);
drop policy if exists "majors public read" on public.majors;
create policy "majors public read" on public.majors for select using (true);
drop policy if exists "skills public read" on public.skills;
create policy "skills public read" on public.skills for select using (true);
