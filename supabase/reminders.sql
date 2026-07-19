-- Push reminders backend. Applied to the live project via MCP; kept here for
-- reproducibility. Secrets are NOT in this file — they go into Vault separately
-- (see the "secrets" note below) so they never land in migration history.
--
-- Companion pieces:
--   supabase/functions/send-due/index.ts  — the Edge Function this schedules.
--   src/pia/reminders.ts / src/supabase/reminders.ts — the client seam.

-- ── Tables (RLS keyed on auth.uid(), same as filesystems/shared_lists) ───────

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy "own subs - select" on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "own subs - insert" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "own subs - delete" on public.push_subscriptions for delete using (auth.uid() = user_id);

create table if not exists public.reminders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null,
  next_run   timestamptz not null,
  cron       text,          -- null = one-off; else a recurring cron expression
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  last_sent  timestamptz
);
alter table public.reminders enable row level security;
create policy "own reminders - select" on public.reminders for select using (auth.uid() = user_id);
create policy "own reminders - insert" on public.reminders for insert with check (auth.uid() = user_id);
create policy "own reminders - update" on public.reminders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminders - delete" on public.reminders for delete using (auth.uid() = user_id);
create index if not exists reminders_due_idx on public.reminders (next_run) where enabled;

-- ── Vault-backed config, readable only by the Edge Function (service role) ───

create or replace function public.get_push_config()
returns table (vapid_public text, vapid_private text, cron_secret text, vapid_subject text)
language sql
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
    'mailto:torbjorn.hedberg@lokalguiden.se';
$$;
revoke execute on function public.get_push_config() from public, anon, authenticated;
grant  execute on function public.get_push_config() to service_role;

-- Secrets (run once, with real values — NOT committed):
--   select vault.create_secret('<VAPID_PUBLIC>',  'vapid_public');
--   select vault.create_secret('<VAPID_PRIVATE>', 'vapid_private');
--   select vault.create_secret('<CRON_SECRET>',   'cron_secret');
-- Generate a VAPID keypair with `web-push generate-vapid-keys` (or the snippet
-- in this PR). The public key also goes in src/pia/reminders.ts (it's public).

-- ── Scheduler: every minute, ping the Edge Function with the cron secret ─────

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule('push-tick', '* * * * *', $job$
  select net.http_post(
    url := 'https://fmamkwyiaojwgayhbdyk.supabase.co/functions/v1/send-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
$job$);
