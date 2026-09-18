create sequence if not exists public.player_code_seq
  as bigint
  start with 100001
  increment by 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  player_code text not null unique default ('KNT-' || lpad(nextval('public.player_code_seq'::regclass)::text, 6, '0')),
  avatar_url text,
  level integer not null default 1 check (level between 1 and 999),
  coins bigint not null default 2500 check (coins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(btrim(username)) between 3 and 24),
  constraint profiles_username_trimmed check (username = btrim(username)),
  constraint profiles_username_characters check (username ~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_. -]+$'),
  constraint profiles_player_code_format check (player_code ~ '^KNT-[0-9]{6,}$')
);

create unique index if not exists profiles_username_unique_ci
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on sequence public.player_code_seq from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (username, avatar_url) on table public.profiles to authenticated;

drop policy if exists "Authenticated users can view player profiles" on public.profiles;
create policy "Authenticated users can view player profiles"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Players can update their own profile" on public.profiles;
create policy "Players can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.kantin_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    char_length(btrim(coalesce(p_username, ''))) between 3 and 24
    and btrim(p_username) ~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_. -]+$'
    and not exists (
      select 1
      from public.profiles
      where lower(username) = lower(btrim(p_username))
    );
$$;

revoke all on function public.kantin_username_available(text) from public;
grant execute on function public.kantin_username_available(text) to anon, authenticated;

create or replace function public.handle_new_kantin_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));

  if char_length(requested_username) < 3 or char_length(requested_username) > 24 then
    raise exception 'invalid username' using errcode = '23514';
  end if;

  insert into public.profiles (id, username)
  values (new.id, requested_username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_kantin_user();

create or replace function public.set_kantin_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_kantin_profile_updated_at on public.profiles;
create trigger set_kantin_profile_updated_at
  before update on public.profiles
  for each row execute procedure public.set_kantin_profile_updated_at();

comment on table public.profiles is 'Public game identity linked one-to-one with Supabase Auth users.';
comment on function public.kantin_username_available(text) is 'Checks username availability without exposing profile rows to anonymous clients.';
