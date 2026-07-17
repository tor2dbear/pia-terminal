-- Heartbeat for the keep-alive workflow (.github/workflows/keepalive.yml).
--
-- Free-tier Supabase pauses a project after a week of inactivity. The workflow
-- calls this tiny function on a schedule so there's a genuine daily database
-- query and the project stays awake. It returns only the current time — no data
-- is exposed — and it's callable with the public anon key.
--
-- Run this once in the Supabase dashboard → SQL Editor (a good moment to also
-- apply supabase/shared_lists.sql's leave_list function).

create or replace function public.ping()
returns timestamptz
language sql
security definer
set search_path = ''
as $$ select now(); $$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
