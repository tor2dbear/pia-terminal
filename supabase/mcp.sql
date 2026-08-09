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
  unique (user_id, label)   -- labels are unique per user, so `mcp revoke` is unambiguous
);
alter table public.mcp_tokens enable row level security;

-- The owner manages their own tokens from the browser (mint / list / revoke).
-- There is deliberately NO update policy: last_used_at is bumped only by the
-- Edge Function via the service role, never by the client.
create policy "own tokens - select" on public.mcp_tokens for select using (auth.uid() = user_id);
create policy "own tokens - insert" on public.mcp_tokens for insert with check (auth.uid() = user_id);
create policy "own tokens - delete" on public.mcp_tokens for delete using (auth.uid() = user_id);

-- Fast lookup on the hot path: every connector request hashes its bearer token
-- and finds the row by hash. (The unique constraint already indexes it, but this
-- documents the access pattern.)
create index if not exists mcp_tokens_hash_idx on public.mcp_tokens (token_hash);

-- Deploy the Edge Function with JWT verification OFF — it authenticates with our
-- own opaque bearer token, not a Supabase JWT:
--   supabase functions deploy mcp --no-verify-jwt
