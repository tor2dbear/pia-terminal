-- PIA collaboration: shared checklists.
--
-- A shared list is a cloud object that lives outside any single user's
-- filesystem tree, so two logged-in people can edit the same list (e.g. a
-- shopping list shared between partners). Membership is by invitation:
-- the inviter adds an *email*; the invitee *claims* it on their next login.
--
-- Run this in the Supabase SQL editor once (after schema.sql).

-- ---- tables ----------------------------------------------------------------

create table if not exists public.shared_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  content    text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_list_members (
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (list_id, user_id)
);

create table if not exists public.shared_list_invites (
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  email   text not null,
  primary key (list_id, email)
);

alter table public.shared_lists        enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_invites enable row level security;

-- ---- membership helper -----------------------------------------------------
-- SECURITY DEFINER so it bypasses RLS on shared_list_members — that is what
-- lets the *_lists / *_members policies reference membership without the
-- policy recursing into itself.

create or replace function public.is_list_member(p_list uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.shared_list_members m
    where m.list_id = p_list and m.user_id = auth.uid()
  );
$$;

-- ---- policies --------------------------------------------------------------
-- Reads/updates of list content go straight through PostgREST (gated here).
-- All membership/invite *writes* go through the SECURITY DEFINER RPCs below,
-- so there are deliberately no direct insert/delete policies for them.

drop policy if exists "shared list - member select" on public.shared_lists;
create policy "shared list - member select"
  on public.shared_lists for select
  using (public.is_list_member(id));

drop policy if exists "shared list - member update" on public.shared_lists;
create policy "shared list - member update"
  on public.shared_lists for update
  using (public.is_list_member(id))
  with check (public.is_list_member(id));

drop policy if exists "shared members - visible to members" on public.shared_list_members;
create policy "shared members - visible to members"
  on public.shared_list_members for select
  using (user_id = auth.uid() or public.is_list_member(list_id));

drop policy if exists "shared invites - visible to invitee or members" on public.shared_list_invites;
create policy "shared invites - visible to invitee or members"
  on public.shared_list_invites for select
  using (lower(email) = lower(auth.jwt() ->> 'email') or public.is_list_member(list_id));

-- ---- RPCs (the only write path for membership) -----------------------------

-- Create a shared list and make the caller its first member.
create or replace function public.create_shared_list(p_name text, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.shared_lists (name, content, created_by)
    values (p_name, coalesce(p_content, ''), v_uid)
    returning id into v_id;
  insert into public.shared_list_members (list_id, user_id)
    values (v_id, v_uid);
  return v_id;
end;
$$;

-- Invite an email to a list. The caller must already be a member.
create or replace function public.invite_to_list(p_list uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.shared_list_members
    where list_id = p_list and user_id = v_uid
  ) then
    raise exception 'not a member of this list';
  end if;
  insert into public.shared_list_invites (list_id, email)
    values (p_list, lower(trim(p_email)))
    on conflict do nothing;
end;
$$;

-- Turn every pending invite addressed to the caller's email into a membership.
-- Returns how many were claimed.
create or replace function public.claim_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_count integer := 0;
begin
  if v_uid is null or v_email is null then
    return 0;
  end if;
  with claimed as (
    insert into public.shared_list_members (list_id, user_id)
      select i.list_id, v_uid
        from public.shared_list_invites i
        where lower(i.email) = v_email
      on conflict do nothing
      returning list_id
  )
  delete from public.shared_list_invites i
    using claimed c
    where i.list_id = c.list_id and lower(i.email) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Keep updated_at fresh on content edits (reuses schema.sql's helper).
drop trigger if exists shared_lists_touch_updated_at on public.shared_lists;
create trigger shared_lists_touch_updated_at
  before update on public.shared_lists
  for each row execute function public.touch_updated_at();

-- ---- grants ----------------------------------------------------------------

grant select, update on public.shared_lists        to authenticated;
grant select          on public.shared_list_members to authenticated;
grant select          on public.shared_list_invites to authenticated;

grant execute on function public.is_list_member(uuid)          to authenticated;
grant execute on function public.create_shared_list(text, text) to authenticated;
grant execute on function public.invite_to_list(uuid, text)     to authenticated;
grant execute on function public.claim_invites()               to authenticated;

-- ---- live-sync -------------------------------------------------------------
-- Publish shared_lists changes over Realtime so co-editors see each other's
-- updates live. Realtime "postgres_changes" honours the RLS SELECT policy
-- above, so only members receive a given list's events.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'shared_lists'
  ) then
    alter publication supabase_realtime add table public.shared_lists;
  end if;
end $$;

-- ...and strip the default PUBLIC grant so the anon (unauthenticated) role can't
-- reach the SECURITY DEFINER functions via /rest/v1/rpc. Signed-in users keep
-- the explicit grant above; the functions still self-check auth.uid() as a
-- second line of defence.
revoke execute on function public.is_list_member(uuid)           from public, anon;
revoke execute on function public.create_shared_list(text, text) from public, anon;
revoke execute on function public.invite_to_list(uuid, text)     from public, anon;
revoke execute on function public.claim_invites()                from public, anon;
