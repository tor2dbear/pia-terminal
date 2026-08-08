-- Lazy email verification — see roadmap/email-verification-lazy.md
--
-- The project runs with Supabase "Confirm email" OFF, so signup gives a session
-- immediately (frictionless terminal-native `useradd`) and `email_confirmed_at`
-- is always set — i.e. the address is unverified. The whole share model trusts
-- `auth.jwt() ->> 'email'` (see claim_invites), so an unverified address is a
-- soft trust root: register someone else's email and you'd claim lists shared to
-- them. This adds a server-trusted "proved control of the inbox" flag and gates
-- *claiming* on it — nothing else. Signup and personal use stay frictionless.
--
-- APPLY ORDER: apply this file, then (re-)apply the claim_invites change in
-- shared_lists.sql — that function now references public.email_verifications.

-- A row here means: this user proved they control *this email*. Unlike
-- user_metadata (which the user can set via updateUser) this table is *not*
-- user-writable — only confirm_email_control() writes it.
--
-- The `email` is recorded, not just the user_id: with "Confirm email" off a user
-- can change their account email (their JWT `email` claim changes with it), and a
-- verification bound only to user_id would silently carry over to the new,
-- unproven address — so claim_invites would accept invites for it. Binding the
-- row to the email that was proven, and matching it against the current JWT email
-- at claim time, means an email change invalidates the verification until the new
-- inbox is proven too.
create table if not exists public.email_verifications (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  verified_at timestamptz not null default now()
);
-- Upgrade a table created before verification was bound to an email.
alter table public.email_verifications add column if not exists email text;

alter table public.email_verifications enable row level security;

-- Read your own row (so the client can show verified state / decide the nudge).
-- No insert/update/delete policy → direct writes are denied; the SECURITY
-- DEFINER function below is the only writer.
drop policy if exists "read own verification" on public.email_verifications;
create policy "read own verification" on public.email_verifications
  for select using (user_id = auth.uid());

-- Record proof of inbox control. Proof = the *current* session was established
-- via an emailed link/code, not a bare password — GoTrue records this in the JWT
-- `amr` claim. Confirmed live against a real token:
--   password session → amr: [{"method":"password","timestamp":…}]
-- OTP / magic-link sessions carry method 'otp' (older builds: 'magiclink'); we
-- accept a set so we're not brittle on the exact label. Returns whether the
-- caller is (now) verified, so boot can call it unconditionally without raising
-- on an ordinary password session.
create or replace function public.confirm_email_control()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
    where e ->> 'method' in ('otp', 'magiclink', 'email', 'email_otp')
  ) then
    return false;
  end if;
  -- Record the email that was proven. Re-verifying after an email change updates
  -- the row to the new address (and refreshes verified_at).
  insert into public.email_verifications (user_id, email)
    values (auth.uid(), lower(auth.jwt() ->> 'email'))
    on conflict (user_id) do update
      set email = excluded.email, verified_at = now();
  return true;
end;
$$;

-- Cheap read of the caller's own verified state (for a `whoami`/members badge).
create or replace function public.is_email_verified()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.email_verifications
    where user_id = auth.uid()
      and lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- How many pending invites are addressed to the caller's email — so boot can
-- nudge an unverified user ("N lists shared with you — run `verify`") instead of
-- silently claiming nothing.
create or replace function public.my_pending_invites()
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.shared_list_invites
    where lower(email) = lower(auth.jwt() ->> 'email');
$$;

-- Grandfather every existing account: they predate this policy, so verify them
-- once here rather than locking them out of claiming until they re-verify.
insert into public.email_verifications (user_id, email)
  select id, lower(email) from auth.users
  where email is not null
  on conflict (user_id) do update
    -- On an upgrade, rows that predate the email column have a null email; fill
    -- them from the account (do NOT overwrite a real, already-recorded email).
    set email = excluded.email
    where public.email_verifications.email is null;

-- Grants: mirror shared_lists.sql (RLS still applies on top of the table grant).
grant select on public.email_verifications to authenticated;
revoke execute on function public.confirm_email_control() from public, anon;
revoke execute on function public.is_email_verified()     from public, anon;
revoke execute on function public.my_pending_invites()    from public, anon;
grant execute on function public.confirm_email_control() to authenticated;
grant execute on function public.is_email_verified()     to authenticated;
grant execute on function public.my_pending_invites()    to authenticated;
