-- PIA account deletion: delete your own account and all its data.
--
-- Almost everything a user owns cascade-deletes with the `auth.users` row
-- (filesystems, notifications, push_subscriptions, reminders,
-- shared_list_members, shared_list_activity — all `on delete cascade`). Two
-- cases need care first, both on shared lists:
--   • a list the caller SOLELY owns with other members would be left ownerless
--     (created_by → null, the owner membership cascades away) — so promote a
--     deterministic remaining member to owner (the ownership-transfer seed).
--   • a list whose only member is the caller would linger empty (created_by
--     nulled) — so delete it outright.
--
-- Run this in the Supabase SQL editor once (after shared_lists.sql). Idempotent.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select email into v_email from auth.users where id = v_uid;

  -- Take locks in the SAME order the ownership RPCs use — list rows first, then
  -- the auth row (which claim_invites/create_shared_list lock implicitly via the
  -- membership FK on insert). A consistent order avoids a deadlock that would
  -- abort the deletion. Holding the auth row before the cleanup below still means
  -- no *new* membership can commit between our scan and the `delete from
  -- auth.users`, so a concurrently-created list can't be left orphaned.
  perform 1
    from public.shared_lists l
    where l.id in (
      select m.list_id from public.shared_list_members m where m.user_id = v_uid
    )
    for update;
  perform 1 from auth.users where id = v_uid for update;

  -- Promote an heir for every list I solely own that still has other members.
  with sole_owned as (
    select m.list_id
      from public.shared_list_members m
      where m.user_id = v_uid and m.role = 'owner'
        and not exists (
          select 1 from public.shared_list_members o
          where o.list_id = m.list_id and o.user_id <> v_uid and o.role = 'owner'
        )
        and exists (
          select 1 from public.shared_list_members x
          where x.list_id = m.list_id and x.user_id <> v_uid
        )
  ),
  heir as (
    select s.list_id, min(m.user_id::text) as uid
      from sole_owned s
      join public.shared_list_members m
        on m.list_id = s.list_id and m.user_id <> v_uid
      group by s.list_id
  )
  update public.shared_list_members m
    set role = 'owner'
    from heir h
    where m.list_id = h.list_id and m.user_id::text = h.uid;

  -- Delete lists whose only member is me (they'd otherwise linger empty).
  delete from public.shared_lists l
    where exists (
      select 1 from public.shared_list_members m
      where m.list_id = l.id and m.user_id = v_uid
    )
    and not exists (
      select 1 from public.shared_list_members m
      where m.list_id = l.id and m.user_id <> v_uid
    );

  -- Delete pending invites addressed to my email too — they're keyed by email,
  -- not user_id (so they don't cascade), and would otherwise let a new account
  -- registered with the same address reclaim a pre-deletion share.
  delete from public.shared_list_invites i where lower(i.email) = lower(v_email);

  -- Scrub my email out of *other* users' notifications. notify_on_invite() bakes
  -- the inviter's email into the recipient's notification body (that row is the
  -- recipient's, so it doesn't cascade from my auth.users delete). Redact it back
  -- to the same 'someone' fallback the trigger uses, so no email of mine survives
  -- in someone else's data.
  if v_email is not null then
    update public.notifications
      set body = replace(body, v_email, 'someone')
      where position(v_email in body) > 0;
  end if;

  -- Now delete the auth user. Its app data (filesystems, notifications,
  -- push_subscriptions, reminders, remaining shared_list_members, activity) and
  -- its auth child rows (sessions, identities, refresh_tokens) all cascade from
  -- auth.users. A SECURITY DEFINER function owned by postgres may delete it.
  delete from auth.users where id = v_uid;
end;
$$;

-- Signed-in users only; strip the default PUBLIC grant so anon can't reach it
-- via /rest/v1/rpc (the function self-checks auth.uid() as a second line too).
grant execute on function public.delete_own_account() to authenticated;
revoke execute on function public.delete_own_account() from public, anon;
