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
-- policy on purpose.
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

-- Follow-up (not built): "list updated" notifications. The todo app saves on
-- every toggle/add, so a naive AFTER UPDATE trigger would be chatty — it needs
-- coalescing (e.g. at most one per list, per member, per N minutes) first.
