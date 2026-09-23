create table if not exists public.user_applications (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  stage text not null default '未申请'
    check (stage in ('未申请','已收藏','已投递','笔试','一面','二面/终面','Offer','已拒绝','已放弃')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.user_applications enable row level security;

drop policy if exists "read own" on public.user_applications;
create policy "read own" on public.user_applications for select using (auth.uid() = user_id);

drop policy if exists "insert own" on public.user_applications;
create policy "insert own" on public.user_applications for insert with check (auth.uid() = user_id);

drop policy if exists "update own" on public.user_applications;
create policy "update own" on public.user_applications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own" on public.user_applications;
create policy "delete own" on public.user_applications for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_touch_user_applications on public.user_applications;
create trigger trg_touch_user_applications before update on public.user_applications
for each row execute function public.touch_updated_at();
