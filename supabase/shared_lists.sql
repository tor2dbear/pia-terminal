-- PIA collaboration: shared checklists, with roles.
--
-- A shared list is a cloud object that lives outside any single user's
-- filesystem tree, so two logged-in people can edit the same list (e.g. a
-- shopping list shared between partners). Membership is by invitation:
-- the inviter adds an *email*; the invitee *claims* it on their next login.
--
-- Each membership carries a ROLE — the collaboration analogue of the /etc
-- write-guard (see roadmap/permissions.md, roadmap/shared-file-roles.md):
--   owner   — the creator. Edits, invites, removes members, deletes the list.
--   editor  — edits content and invites others (the old "everyone" behaviour).
--   viewer  — read-only: sees the list and live updates, but can't edit or invite.
-- The boundary is enforced *here* (RLS + SECURITY DEFINER RPCs), not just in the
-- client, so a hand-rolled request can't write a list you may only read.
--
-- Run this in the Supabase SQL editor once (after schema.sql). It is idempotent
-- and safe to re-run — it upgrades an existing flat-membership install in place.

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
  role    text not null default 'editor',
  primary key (list_id, user_id)
);

create table if not exists public.shared_list_invites (
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  email   text not null,
  role    text not null default 'editor',
  primary key (list_id, email)
);

-- Upgrade an existing install: add the role columns if they predate roles, and
-- (re)assert the allowed values. Existing members default to 'editor' (the old
-- everyone-can-edit behaviour); backfill the creator as 'owner' further down.
alter table public.shared_list_members
  add column if not exists role text not null default 'editor';
alter table public.shared_list_invites
  add column if not exists role text not null default 'editor';

alter table public.shared_list_members drop constraint if exists shared_list_members_role_check;
alter table public.shared_list_members
  add constraint shared_list_members_role_check check (role in ('owner', 'editor', 'viewer'));
-- You can't invite someone straight to 'owner' (ownership is the creator's, and
-- transfer is a later step) — invites are 'editor' or 'viewer' only.
alter table public.shared_list_invites drop constraint if exists shared_list_invites_role_check;
alter table public.shared_list_invites
  add constraint shared_list_invites_role_check check (role in ('editor', 'viewer'));

alter table public.shared_lists        enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_invites enable row level security;

-- ---- membership helpers ----------------------------------------------------
-- SECURITY DEFINER so they bypass RLS on shared_list_members — that is what
-- lets the *_lists / *_members policies reference membership without the policy
-- recursing into itself.

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

-- Owner-or-editor: allowed to change content and to invite.
create or replace function public.can_edit_list(p_list uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.shared_list_members m
    where m.list_id = p_list and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

-- Owner: allowed to manage members and delete the list.
create or replace function public.is_list_owner(p_list uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.shared_list_members m
    where m.list_id = p_list and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- ---- policies --------------------------------------------------------------
-- Reads go to any member; content *updates* only to owner/editor (viewers are
-- blocked here, on the server). Membership/invite *writes* all go through the
-- SECURITY DEFINER RPCs below, so there are deliberately no direct insert/delete
-- policies for them.

drop policy if exists "shared list - member select" on public.shared_lists;
create policy "shared list - member select"
  on public.shared_lists for select
  using (public.is_list_member(id));

drop policy if exists "shared list - member update" on public.shared_lists;
create policy "shared list - member update"
  on public.shared_lists for update
  using (public.can_edit_list(id))
  with check (public.can_edit_list(id));

drop policy if exists "shared members - visible to members" on public.shared_list_members;
create policy "shared members - visible to members"
  on public.shared_list_members for select
  using (user_id = auth.uid() or public.is_list_member(list_id));

drop policy if exists "shared invites - visible to invitee or members" on public.shared_list_invites;
create policy "shared invites - visible to invitee or members"
  on public.shared_list_invites for select
  using (lower(email) = lower(auth.jwt() ->> 'email') or public.is_list_member(list_id));

-- ---- RPCs (the only write path for membership) -----------------------------

-- Create a shared list and make the caller its first member — the OWNER.
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
  insert into public.shared_list_members (list_id, user_id, role)
    values (v_id, v_uid, 'owner');
  return v_id;
end;
$$;

-- Invite an email to a list with a role ('editor' or 'viewer'). The caller must
-- be able to edit (owner or editor). Re-inviting the same email updates the
-- pending role. Signature changed (added p_role) — drop the old 2-arg overload.
drop function if exists public.invite_to_list(uuid, text);
create or replace function public.invite_to_list(p_list uuid, p_email text, p_role text default 'editor')
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
  if not public.can_edit_list(p_list) then
    raise exception 'not allowed to invite to this list';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'invalid role: %', p_role;
  end if;
  insert into public.shared_list_invites (list_id, email, role)
    values (p_list, lower(trim(p_email)), p_role)
    on conflict (list_id, email) do update set role = excluded.role;
end;
$$;

-- Remove a member (or cancel a pending invite) by email. Owner only. Can't
-- remove an owner (transfer/leave is the owner's own path), and can't remove
-- yourself here (use leave_list).
create or replace function public.remove_member(p_list uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(trim(p_email));
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_list_owner(p_list) then
    raise exception 'only the owner can remove members';
  end if;
  -- Drop a pending invite for this email, if any.
  delete from public.shared_list_invites
    where list_id = p_list and lower(email) = v_email;
  -- And drop a joined member with this email — but never an owner, and never
  -- yourself via this path.
  select u.id into v_target from auth.users u where lower(u.email) = v_email;
  if v_target is not null and v_target <> v_uid then
    delete from public.shared_list_members
      where list_id = p_list and user_id = v_target and role <> 'owner';
  end if;
end;
$$;

-- Delete a whole list. Owner only. Cascades to members and invites.
create or replace function public.delete_list(p_list uuid)
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
  if not public.is_list_owner(p_list) then
    raise exception 'only the owner can delete this list';
  end if;
  delete from public.shared_lists where id = p_list;
end;
$$;

-- Leave a list: drop the caller's own membership. The list stays for everyone
-- else. The sole owner can't leave a list that still has other members (it would
-- orphan it) — they remove the others or delete the list (ownership transfer is
-- a later step).
create or replace function public.leave_list(p_list uuid)
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
  if public.is_list_owner(p_list)
     and exists (select 1 from public.shared_list_members
                 where list_id = p_list and user_id <> v_uid)
     and not exists (select 1 from public.shared_list_members
                     where list_id = p_list and user_id <> v_uid and role = 'owner')
  then
    raise exception 'you are the only owner — remove the other members or delete the list first';
  end if;
  delete from public.shared_list_members
    where list_id = p_list and user_id = v_uid;
end;
$$;

-- Turn every pending invite addressed to the caller's email into a membership,
-- carrying the invited role. Returns how many were claimed.
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
    insert into public.shared_list_members (list_id, user_id, role)
      select i.list_id, v_uid, i.role
        from public.shared_list_invites i
        where lower(i.email) = v_email
      on conflict (list_id, user_id) do nothing
      returning list_id
  )
  delete from public.shared_list_invites i
    using claimed c
    where i.list_id = c.list_id and lower(i.email) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The caller's lists, each with the caller's own role — the read side of `mine`.
-- An RPC (not a plain select) so the role join rides along in one round-trip.
create or replace function public.my_shared_lists()
returns table (id uuid, name text, content text, role text)
language sql
security definer
set search_path = ''
stable
as $$
  select l.id, l.name, l.content, m.role
    from public.shared_lists l
    join public.shared_list_members m on m.list_id = l.id
    where m.user_id = auth.uid();
$$;

-- The members of a list (joined + still-pending invites), for `todo members`.
-- Visible to any member of the list.
create or replace function public.list_members(p_list uuid)
returns table (email text, role text, status text)
language sql
security definer
set search_path = ''
stable
as $$
  select u.email, m.role, 'member' as status
    from public.shared_list_members m
    join auth.users u on u.id = m.user_id
    where m.list_id = p_list and public.is_list_member(p_list)
  union all
  select i.email, i.role, 'invited' as status
    from public.shared_list_invites i
    where i.list_id = p_list and public.is_list_member(p_list);
$$;

-- Backfill: on an install that predates roles, promote each list's creator to
-- owner so every list has exactly one. Lists whose creator already left keep
-- their (editor) members; an owner can be re-established by whoever remains via
-- a future transfer step. No-op once roles exist.
update public.shared_list_members m
  set role = 'owner'
  from public.shared_lists l
  where m.list_id = l.id and m.user_id = l.created_by and m.role <> 'owner';

-- Keep updated_at fresh on content edits (reuses schema.sql's helper).
drop trigger if exists shared_lists_touch_updated_at on public.shared_lists;
create trigger shared_lists_touch_updated_at
  before update on public.shared_lists
  for each row execute function public.touch_updated_at();

-- ---- grants ----------------------------------------------------------------

grant select, update on public.shared_lists        to authenticated;
grant select          on public.shared_list_members to authenticated;
grant select          on public.shared_list_invites to authenticated;

grant execute on function public.is_list_member(uuid)           to authenticated;
grant execute on function public.can_edit_list(uuid)            to authenticated;
grant execute on function public.is_list_owner(uuid)            to authenticated;
grant execute on function public.create_shared_list(text, text) to authenticated;
grant execute on function public.invite_to_list(uuid, text, text) to authenticated;
grant execute on function public.remove_member(uuid, text)      to authenticated;
grant execute on function public.delete_list(uuid)              to authenticated;
grant execute on function public.leave_list(uuid)              to authenticated;
grant execute on function public.claim_invites()               to authenticated;
grant execute on function public.my_shared_lists()             to authenticated;
grant execute on function public.list_members(uuid)            to authenticated;

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
revoke execute on function public.is_list_member(uuid)             from public, anon;
revoke execute on function public.can_edit_list(uuid)              from public, anon;
revoke execute on function public.is_list_owner(uuid)              from public, anon;
revoke execute on function public.create_shared_list(text, text)   from public, anon;
revoke execute on function public.invite_to_list(uuid, text, text) from public, anon;
revoke execute on function public.remove_member(uuid, text)        from public, anon;
revoke execute on function public.delete_list(uuid)                from public, anon;
revoke execute on function public.leave_list(uuid)                 from public, anon;
revoke execute on function public.claim_invites()                  from public, anon;
revoke execute on function public.my_shared_lists()                from public, anon;
revoke execute on function public.list_members(uuid)               from public, anon;
