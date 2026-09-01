-- Guest continuity is primarily carried by the persisted Supabase refresh token
-- and the installation record kept by every Kantin client. A unique profile
-- index must not abort a new anonymous Auth transaction when an older, expired
-- anonymous user already references the same installation.
drop index if exists public.profiles_installation_id_unique;

create index if not exists profiles_installation_id_lookup
  on public.profiles (installation_id)
  where installation_id is not null;

create or replace function public.handle_new_kantin_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  requested_locale text;
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

  guest_user := coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false)
    or coalesce((new.raw_user_meta_data ->> 'is_guest')::boolean, false);

  installation := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'installation_id', '')), '');
  if installation is not null and char_length(installation) not between 16 and 64 then
    installation := null;
  end if;
  if guest_user and installation is null then
    installation := 'anonymous:' || new.id::text;
  end if;

  requested_locale := lower(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'preferred_locale', '')), ''));
  if not exists (
    select 1 from public.supported_locales
    where locale = requested_locale and enabled
  ) then
    requested_locale := 'en';
  end if;

  insert into public.profiles (
    id,
    username,
    installation_id,
    is_guest,
    preferred_locale
  ) values (
    new.id,
    requested_username,
    installation,
    guest_user,
    requested_locale
  );

  return new;
end;
$$;

comment on index public.profiles_installation_id_lookup is
  'Lookup aid for guest recovery; duplicate historical anonymous identities must not abort Auth signup.';
