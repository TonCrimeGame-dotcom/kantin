-- Guest identities keep their public name locked until the Auth identity is
-- converted to a permanent account. Profile progress remains on the same UUID.

create or replace function public.prevent_guest_username_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_guest and new.username is distinct from old.username then
    raise exception 'guest username is locked until account linking is complete'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_guest_profile_username on public.profiles;
create trigger lock_guest_profile_username
  before update of username on public.profiles
  for each row execute procedure public.prevent_guest_username_change();

create or replace function public.promote_kantin_guest()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  promoted public.profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) then
    raise exception 'anonymous identity must be linked first' using errcode = '42501';
  end if;

  update public.profiles
  set is_guest = false
  where id = auth.uid()
  returning * into promoted;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  return promoted;
end;
$$;

revoke all on function public.promote_kantin_guest() from public;
grant execute on function public.promote_kantin_guest() to authenticated;

comment on function public.promote_kantin_guest() is
  'Marks the current guest profile permanent after Supabase Auth confirms a linked non-anonymous identity.';

