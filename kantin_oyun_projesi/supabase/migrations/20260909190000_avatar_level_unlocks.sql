-- New avatars unlock at levels 2, 4, ... 24. Enforce selection at the data boundary.
create or replace function public.enforce_avatar_unlock_level()
returns trigger language plpgsql set search_path = public as $$
declare required_level integer;
begin
  if new.avatar_url is distinct from old.avatar_url
     and new.avatar_url like './assets/avatars/avatars2/%' then
    if new.avatar_url !~ '^\./assets/avatars/avatars2/level-(02|04|06|08|10|12|14|16|18|20|22|24)\.webp$' then
      raise exception 'Geçersiz avatar seçimi.';
    end if;
    required_level := substring(new.avatar_url from 'level-([0-9]+)')::integer;
    if coalesce(old.level, 1) < required_level then
      raise exception 'Bu avatar % seviyede açılır.', required_level;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_avatar_unlock_level on public.profiles;
create trigger enforce_avatar_unlock_level before update of avatar_url on public.profiles
for each row execute function public.enforce_avatar_unlock_level();
