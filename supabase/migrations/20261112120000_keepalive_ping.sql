-- Life Hub · 0009 · keep-alive: free Supabase pauses a project after 7 days without activity (e.g. during
-- Kazakhstan, 21.12–08.01). A daily GitHub Action calls ping() with the publishable key, without signing in.
-- The one deliberate exception to «anon has no privileges»: ping() reads no table and returns 1.
create or replace function public.ping()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 1 $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
