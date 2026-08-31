alter table public.profiles
  add column if not exists installation_id text,
  add column if not exists is_guest boolean not null default false;

alter table public.profiles
  add constraint profiles_installation_id_length
    check (installation_id is null or char_length(installation_id) between 16 and 64),
  add constraint profiles_guest_has_installation
    check (not is_guest or installation_id is not null);

create unique index if not exists profiles_installation_id_unique
  on public.profiles (installation_id)
  where installation_id is not null;

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

create or replace function public.handle_new_kantin_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  installation text;
  guest_user boolean;
begin
  requested_username := btrim(coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  ));
  requested_username := regexp_replace(requested_username, '[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_. -]+', '', 'g');
  requested_username := left(btrim(requested_username), 24);

  if char_length(requested_username) < 3 then
    requested_username := 'Oyuncu ' || right(replace(new.id::text, '-', ''), 6);
  end if;

  if exists (select 1 from public.profiles where lower(username) = lower(requested_username)) then
    requested_username := left(requested_username, 17) || ' ' || right(replace(new.id::text, '-', ''), 6);
  end if;

  installation := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'installation_id', '')), '');
  if installation is not null and char_length(installation) not between 16 and 64 then
    installation := null;
  end if;

  guest_user := coalesce(new.is_anonymous, false);
  if guest_user and installation is null then
    raise exception 'anonymous account requires installation id' using errcode = '23514';
  end if;

  insert into public.profiles (id, username, installation_id, is_guest)
  values (new.id, requested_username, installation, guest_user);

  return new;
end;
$$;

comment on column public.profiles.installation_id is 'Persistent client installation identifier for guest continuity; not a hardware identifier.';
comment on column public.profiles.is_guest is 'True for Supabase anonymous users created through the guest entry flow.';
