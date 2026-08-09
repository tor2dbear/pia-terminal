-- PIA public publishing: ~user handles + published pages.
--
-- The web-native way to "publish to the world" (see roadmap/publish-garden.md):
-- files under ~/public_html are served at pia.tor2dbear.com/~<handle>/…, the
-- classic Unix mod_userdir / tilde-URL idiom. Two cloud objects back it:
--
--   handles       — the ~user namespace. One unique, reserved, URL-safe handle
--                   per account, claimed LAZILY the first time you publish
--                   (never a signup gate). Account metadata can't be unique;
--                   this table's constraints are what make the namespace real.
--   public_pages  — a MATERIALISED public projection: publishing COPIES the
--                   rendered pages here, out of the private `filesystems` blob.
--                   Defense-in-depth — this table only ever holds public data,
--                   so a policy slip can't leak a private file that was never
--                   copied in. The Cloudflare Pages Function reads it as anon.
--
-- Run this in the Supabase SQL editor once (after schema.sql). Idempotent and
-- safe to re-run.

-- ---- tables ----------------------------------------------------------------

create table if not exists public.handles (
  handle     text primary key,
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

-- Charset/length enforced in the database too, not just the client: lowercase
-- alnum groups joined by single hyphens, 2–39 chars. Mirrors validateHandle()
-- in src/share/handle.ts. (The reserved-word denylist is enforced in the claim
-- RPC below and in the client — a format-legal name like 'api' must still be
-- refused server-side.)
alter table public.handles drop constraint if exists handles_format_check;
alter table public.handles
  add constraint handles_format_check
  check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(handle) between 2 and 39);

create table if not exists public.public_pages (
  owner      uuid not null references auth.users (id) on delete cascade,
  handle     text not null references public.handles (handle) on delete cascade,
  path       text not null,
  content    text not null,
  html       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (handle, path)
);

create index if not exists public_pages_handle_idx on public.public_pages (handle);

alter table public.handles      enable row level security;
alter table public.public_pages enable row level security;

-- Bump updated_at on every republish of a page (created_at stays put).
create or replace function public.touch_public_page()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists public_pages_touch on public.public_pages;
create trigger public_pages_touch
  before update on public.public_pages
  for each row execute function public.touch_public_page();

-- ---- policies --------------------------------------------------------------
-- Handles: the namespace is PUBLIC — anon reads it so the route can resolve
-- ~<handle> → owner. There is deliberately no direct insert/update/delete
-- policy: claiming goes through claim_handle() (atomic + reserved-word guard),
-- and renaming/releasing is a later step.
drop policy if exists "handles - public read" on public.handles;
create policy "handles - public read"
  on public.handles for select
  using (true);

-- Published pages: anyone may READ (that's the point — the world sees them);
-- only the owner may write. The owner must also own the handle they publish
-- under, so you can't scribble pages into someone else's namespace.
drop policy if exists "public_pages - public read" on public.public_pages;
create policy "public_pages - public read"
  on public.public_pages for select
  using (true);

drop policy if exists "public_pages - owner insert" on public.public_pages;
create policy "public_pages - owner insert"
  on public.public_pages for insert
  with check (
    owner = auth.uid()
    and exists (
      select 1 from public.handles h
      where h.handle = public_pages.handle and h.user_id = auth.uid()
    )
  );

drop policy if exists "public_pages - owner update" on public.public_pages;
create policy "public_pages - owner update"
  on public.public_pages for update
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "public_pages - owner delete" on public.public_pages;
create policy "public_pages - owner delete"
  on public.public_pages for delete
  using (owner = auth.uid());

-- ---- claim RPC (the only write path for handles) ---------------------------
-- Atomic lazy claim. Enforces, server-side: the caller is logged in; the name
-- is well-formed (the CHECK) and not reserved (the denylist here); the caller
-- doesn't already hold a different handle (one identity); and the name is free
-- (the primary key wins any race — exactly one concurrent claimer succeeds).
create or replace function public.claim_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_h    text := lower(p_handle);
  v_have text;
begin
  if v_uid is null then
    raise exception 'not logged in';
  end if;

  -- Reserved words: route collisions + impersonation. Keep in step with
  -- RESERVED_HANDLES in src/share/handle.ts.
  if v_h = any (array[
    'api','www','app','assets','static','public','incoming','shared','feed',
    'rss','sitemap','robots','favicon','well-known','admin','administrator',
    'root','sudo','system','support','help','user','guest','pia','official',
    'security','abuse','postmaster','webmaster','mod','moderator','staff','team',
    'login','logout','signup','register','verify','settings','account'
  ]) then
    raise exception '"%" is reserved', v_h;
  end if;

  -- Already have one? Idempotent for the same name; refuse a different one.
  select handle into v_have from public.handles where user_id = v_uid;
  if v_have is not null then
    if v_have = v_h then
      return v_have;
    end if;
    raise exception 'you already publish as ~%', v_have;
  end if;

  -- Insert; the format CHECK validates charset/length, the PK catches races.
  insert into public.handles (handle, user_id) values (v_h, v_uid);
  return v_h;
exception
  when unique_violation then
    raise exception '~% is taken', v_h;
  when check_violation then
    raise exception 'invalid handle: %', v_h;
end;
$$;

-- ---- grants ----------------------------------------------------------------
grant execute on function public.claim_handle(text) to authenticated;
revoke execute on function public.claim_handle(text) from public, anon;
