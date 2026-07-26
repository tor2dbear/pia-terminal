-- Collaboration notifications. Reuses the push plumbing from reminders.sql:
-- a small outbound queue that the send-due Edge Function drains on the same
-- pg_cron tick as reminders. Triggers on the collaboration tables enqueue rows.
--
-- Applied to the live project via MCP; kept here for reproducibility.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

alter table public.notifications enable row level security;

-- Users may read their own (for a possible in-app inbox later). Inserts happen
-- only from SECURITY DEFINER triggers / the service role, so there is no insert
-- policy on purpose. (Dropped-then-created so re-running this file on a live
-- project that already has the policy is a no-op, not a "already exists" error.)
drop policy if exists "own notifications - select" on public.notifications;
create policy "own notifications - select" on public.notifications
  for select using (auth.uid() = user_id);

create index if not exists notifications_unsent_idx
  on public.notifications (created_at) where sent_at is null;

-- When someone is invited to a shared list, notify them — but only if the
-- invited email already has an account (else they'll see the list on their next
-- login via claim_invites). The inviter is auth.uid(), preserved through the
-- SECURITY DEFINER invite_to_list() RPC that inserts the invite.
create or replace function public.notify_on_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid;
  v_list    text;
  v_inviter text;
begin
  select id into v_user from auth.users where lower(email) = lower(new.email) limit 1;
  if v_user is null then
    return new;
  end if;
  select name into v_list from public.shared_lists where id = new.list_id;
  select coalesce(email, 'someone') into v_inviter from auth.users where id = auth.uid();
  insert into public.notifications (user_id, title, body)
    values (
      v_user,
      '📋 Shared list',
      coalesce(v_inviter, 'someone') || ' shared "' || coalesce(v_list, 'a list') || '" with you'
    );
  return new;
end;
$$;

drop trigger if exists shared_list_invites_notify on public.shared_list_invites;
create trigger shared_list_invites_notify
  after insert on public.shared_list_invites
  for each row execute function public.notify_on_invite();

-- Trigger functions fire as the table owner, so they need no direct grant —
-- and shouldn't be callable via the REST API. (Flagged by the security linter.)
revoke execute on function public.notify_on_invite() from public, anon, authenticated;

-- ---- "list updated" notifications (coalesced) ------------------------------
-- The todo app saves the whole list on every toggle/add, so a naive AFTER
-- UPDATE → notify trigger would be chatty (several a second during an edit).
-- Instead the trigger only *logs* one lightweight row per content change into
-- shared_list_activity; flush_list_activity() (below) folds each settled burst
-- into a single summary per member and enqueues it on the notifications queue
-- above. The send-due Edge Function calls that function each tick — the queue
-- it fills is then delivered by the same drain that handles invites/reminders.

create table if not exists public.shared_list_activity (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.shared_lists (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.shared_list_activity enable row level security;
-- RLS on with *no* policies = deny-all for anon/authenticated. Only the
-- SECURITY DEFINER trigger writes it and only the service-role Edge Function
-- reads/clears it, so no client ever touches this table directly.
create index if not exists shared_list_activity_list_idx
  on public.shared_list_activity (list_id, created_at);

-- Log one row per *content* edit to a shared list. Runs as the table owner
-- (SECURITY DEFINER) so it can write the log whatever the editor's grants;
-- auth.uid() is the editing member, preserved through the direct PostgREST
-- update. No-op saves (unchanged content) are skipped so they don't inflate the
-- count. flush_list_activity() does the coalescing and the actual notifying.
create or replace function public.record_list_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.content is distinct from old.content then
    insert into public.shared_list_activity (list_id, actor_id)
      values (new.id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists shared_lists_activity on public.shared_lists;
create trigger shared_lists_activity
  after update on public.shared_lists
  for each row execute function public.record_list_activity();

revoke execute on function public.record_list_activity() from public, anon, authenticated;

-- Coalesce settled activity into the notifications queue. Called every tick by
-- send-due. The whole claim → summarise → enqueue happens in ONE statement /
-- transaction, which is what makes it correct under the every-minute schedule:
--   * Atomic claim. `delete … returning` removes each settled list's rows in
--     the same statement that reads them, so two overlapping ticks can't both
--     process the same burst and double-send (the second's delete finds them
--     already gone). No cross-call advisory lock — those don't survive the
--     connection pooler anyway.
--   * No lost rows. Enqueue and delete share the transaction: either the
--     summaries are inserted AND the rows cleared, or neither. A failure rolls
--     back and the burst is retried next tick.
--   * No row cap. Grouping runs server-side, so it never sees only the first
--     PostgREST page of a large table the way a client-side select would.
-- A list is "settled" once quiet for p_debounce_seconds, or open (oldest row)
-- for p_maxhold_seconds — so a nonstop-edited list still fires. Each member is
-- told about everyone's changes but their own. Returns rows enqueued.
create or replace function public.flush_list_activity(
  p_debounce_seconds integer,
  p_maxhold_seconds  integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enqueued integer;
begin
  with settled as (
    select list_id
      from public.shared_list_activity
      group by list_id
      having max(created_at) < now() - (p_debounce_seconds * interval '1 second')
          or min(created_at) < now() - (p_maxhold_seconds  * interval '1 second')
  ),
  claimed as (
    delete from public.shared_list_activity a
      using settled s
      where a.list_id = s.list_id
      returning a.list_id, a.actor_id
  ),
  by_actor as (
    select list_id, actor_id, count(*)::int as n
      from claimed group by list_id, actor_id
  ),
  totals as (
    select list_id, sum(n)::int as total from by_actor group by list_id
  ),
  per_member as (
    select m.user_id,
           t.list_id,
           t.total - coalesce(
             (select ba.n from by_actor ba
               where ba.list_id = t.list_id
                 and ba.actor_id is not distinct from m.user_id), 0) as others
      from totals t
      join public.shared_list_members m on m.list_id = t.list_id
  ),
  enqueued as (
    insert into public.notifications (user_id, title, body)
      select pm.user_id,
             '📋 Shared list',
             pm.others || ' ' || case when pm.others = 1 then 'update' else 'updates' end
               || ' to "' || coalesce(sl.name, 'a list') || '"'
        from per_member pm
        join public.shared_lists sl on sl.id = pm.list_id
        where pm.others > 0
      returning 1
  )
  select count(*)::int into v_enqueued from enqueued;
  return coalesce(v_enqueued, 0);
end;
$$;

revoke execute on function public.flush_list_activity(integer, integer) from public, anon, authenticated;
grant  execute on function public.flush_list_activity(integer, integer) to service_role;

revoke execute on function public.record_list_activity() from public, anon, authenticated;

-- ---- housekeeping ----------------------------------------------------------
-- Drop delivered notifications and fired one-off reminders older than 30 days.
-- Runs entirely inside Postgres (scheduled by pg_cron, daily) — never touches
-- recent rows, pending reminders, or push subscriptions.
create or replace function public.prune_push_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications
    where sent_at is not null and sent_at < now() - interval '30 days';
  delete from public.reminders
    where enabled = false and coalesce(last_sent, next_run) < now() - interval '30 days';
  -- Safety net: send-due clears activity rows as it delivers, so this only ever
  -- catches leftovers if the tick lagged for days.
  delete from public.shared_list_activity
    where created_at < now() - interval '7 days';
$$;
revoke execute on function public.prune_push_data() from public, anon, authenticated;

select cron.schedule('push-cleanup', '17 3 * * *', $job$ select public.prune_push_data(); $job$);
