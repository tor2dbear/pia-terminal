-- MCP connector backend. Applied to the live project via MCP; kept here for
-- reproducibility. Lets an external AI client authenticate as a user with a
-- bearer token and read/write that user's filesystem row through the `mcp` Edge
-- Function.
--
-- Companion pieces:
--   supabase/functions/mcp/index.ts        — the Edge Function this backs.
--   src/mcp/tokens.ts / src/supabase/tokens.ts — the client seam.
--
-- No secrets live here: the Edge Function reads SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY from the auto-injected function env, so there is
-- nothing to put in Vault for this feature.

-- ── Table (RLS keyed on auth.uid(), same as filesystems/reminders) ───────────
-- Only the SHA-256 hash of each token is stored; the plaintext is shown once at
-- creation (client-side) and never persisted. The Edge Function hashes the
-- presented bearer token the same way and looks the row up with the service role
-- (bypassing RLS), then acts only on that row's owner.

create table if not exists public.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  label        text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  -- Per-token write scope: home-relative dir prefixes the token may write. The
  -- default keeps the original "safe by default" behaviour (only ~/inbox/); `{}`
  -- is read-only, `{.}` is the whole home. Read access is always the full home.
  -- The Edge Function enforces this shape (parity with src/mcp/tokens.ts).
  write_scope  text[] not null default '{inbox}',
  unique (user_id, label)   -- labels are unique per user, so `mcp revoke` is unambiguous
);
alter table public.mcp_tokens enable row level security;
-- Idempotent add for projects created before write_scope existed (rerunnable).
alter table public.mcp_tokens add column if not exists write_scope text[] not null default '{inbox}';

-- The owner manages their own tokens from the browser (mint / list / revoke).
-- There is deliberately NO update policy: last_used_at is bumped only by the
-- Edge Function via the service role, never by the client. `drop … if exists`
-- first so the whole file re-runs cleanly (create policy is not idempotent).
drop policy if exists "own tokens - select" on public.mcp_tokens;
create policy "own tokens - select" on public.mcp_tokens for select using (auth.uid() = user_id);
drop policy if exists "own tokens - insert" on public.mcp_tokens;
create policy "own tokens - insert" on public.mcp_tokens for insert with check (auth.uid() = user_id);
drop policy if exists "own tokens - delete" on public.mcp_tokens;
create policy "own tokens - delete" on public.mcp_tokens for delete using (auth.uid() = user_id);

-- Fast lookup on the hot path: every connector request hashes its bearer token
-- and finds the row by hash. (The unique constraint already indexes it, but this
-- documents the access pattern.)
create index if not exists mcp_tokens_hash_idx on public.mcp_tokens (token_hash);

-- Deploy the Edge Function with JWT verification OFF — it authenticates with our
-- own opaque bearer token, not a Supabase JWT:
--   supabase functions deploy mcp --no-verify-jwt

-- ── OAuth 2.1 (so OAuth-only clients like Claude's connector can connect) ─────
-- The same Edge Function also speaks OAuth 2.1 (discovery / register / authorize
-- / token), routed by path. The authorize step authenticates the user by a token
-- they minted with `mcp token` — the terminal stays the source of truth, no
-- separate login page. These two tables are touched ONLY by the Edge Function
-- (service role); RLS is enabled with NO policies so anon/authenticated can't
-- read them (oauth_codes briefly holds a raw access token between authorize and
-- the token exchange, then deletes it).

create table if not exists public.oauth_clients (
  client_id     text primary key,
  redirect_uris text[] not null,
  client_name   text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz  -- bumped when a code is issued for this client
);
alter table public.oauth_clients enable row level security;

create table if not exists public.oauth_codes (
  code           text primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  access_token   text not null,   -- the minted token, returned once at exchange
  code_challenge text not null,   -- PKCE S256 challenge
  redirect_uri   text not null,
  client_id      text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);
alter table public.oauth_codes enable row level security;
create index if not exists oauth_codes_expiry_idx on public.oauth_codes (expires_at);

-- Sweep expired auth codes independently of /token traffic: an abandoned flow
-- (authorize submitted, token never exchanged) must not leave its short-lived
-- raw token sitting past its 10-min expiry. Runs every minute (pg_cron, same as
-- the reminders tick). cron.schedule upserts by job name, so this is rerunnable.
create extension if not exists pg_cron;
select cron.schedule(
  'oauth-codes-cleanup', '* * * * *',
  $$ delete from public.oauth_codes where expires_at < now() $$
);

-- Dynamic Client Registration is public by the MCP/OAuth spec (any client may
-- register), so bound the retention: sweep clients not used in 7 days (an active
-- connector re-registers freely). Keeps an anonymous /register spammer from
-- growing the table without bound. Runs hourly.
select cron.schedule(
  'oauth-clients-cleanup', '0 * * * *',
  $$ delete from public.oauth_clients where coalesce(last_used_at, created_at) < now() - interval '7 days' $$
);
