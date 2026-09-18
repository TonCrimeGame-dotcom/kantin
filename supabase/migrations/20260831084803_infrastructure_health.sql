create or replace function public.kantin_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'database_time', timezone('utc', statement_timestamp())
  );
$$;

revoke all on function public.kantin_health() from public;
revoke all on function public.kantin_health() from anon;
revoke all on function public.kantin_health() from authenticated;
grant execute on function public.kantin_health() to service_role;

comment on function public.kantin_health() is
  'Server-only health probe used to verify the Vercel to Supabase connection.';
