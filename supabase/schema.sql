-- PIA cloud storage: one filesystem tree (jsonb) per user.
-- Run this in the Supabase SQL editor once, after creating the project.

create table if not exists public.filesystems (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  tree       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.filesystems enable row level security;

-- Each user may only read and write their own row.
create policy "own filesystem - select"
  on public.filesystems for select
  using (auth.uid() = user_id);

create policy "own filesystem - insert"
  on public.filesystems for insert
  with check (auth.uid() = user_id);

create policy "own filesystem - update"
  on public.filesystems for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at current on every write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger filesystems_touch_updated_at
  before update on public.filesystems
  for each row execute function public.touch_updated_at();
