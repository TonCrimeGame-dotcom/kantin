create table if not exists public.supported_locales (
  locale text primary key,
  english_name text not null,
  native_name text not null,
  direction text not null default 'ltr' check (direction in ('ltr', 'rtl')),
  enabled boolean not null default true,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now(),
  constraint supported_locales_code_format check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint supported_locales_name_length check (
    char_length(btrim(english_name)) between 2 and 40
    and char_length(btrim(native_name)) between 2 and 40
  )
);

insert into public.supported_locales (locale, english_name, native_name, direction, sort_order)
values
  ('tr', 'Turkish', 'Türkçe', 'ltr', 1),
  ('en', 'English', 'English', 'ltr', 2),
  ('de', 'German', 'Deutsch', 'ltr', 3),
  ('ru', 'Russian', 'Русский', 'ltr', 4),
  ('es', 'Spanish', 'Español', 'ltr', 5),
  ('hi', 'Hindi', 'हिन्दी', 'ltr', 6),
  ('ar', 'Arabic', 'العربية', 'rtl', 7)
on conflict (locale) do update set
  english_name = excluded.english_name,
  native_name = excluded.native_name,
  direction = excluded.direction,
  sort_order = excluded.sort_order;

alter table public.profiles
  add column if not exists preferred_locale text references public.supported_locales(locale);

create table if not exists public.localized_content (
  content_key text not null,
  locale text not null references public.supported_locales(locale) on update cascade,
  payload jsonb not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (content_key, locale),
  constraint localized_content_key_format check (content_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  constraint localized_content_payload_object check (jsonb_typeof(payload) = 'object')
);

create or replace function public.set_localization_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_supported_locales_updated_at on public.supported_locales;
create trigger set_supported_locales_updated_at
  before update on public.supported_locales
  for each row execute procedure public.set_localization_updated_at();

drop trigger if exists set_localized_content_updated_at on public.localized_content;
create trigger set_localized_content_updated_at
  before update on public.localized_content
  for each row execute procedure public.set_localization_updated_at();

alter table public.supported_locales enable row level security;
alter table public.localized_content enable row level security;

revoke all on table public.supported_locales from anon, authenticated;
revoke all on table public.localized_content from anon, authenticated;
grant select on table public.supported_locales to anon, authenticated;
grant select on table public.localized_content to anon, authenticated;
grant update (preferred_locale) on table public.profiles to authenticated;

drop policy if exists "Enabled locales are public" on public.supported_locales;
create policy "Enabled locales are public"
  on public.supported_locales for select to anon, authenticated
  using (enabled);

drop policy if exists "Active localized content is public" on public.localized_content;
create policy "Active localized content is public"
  on public.localized_content for select to anon, authenticated
  using (
    active and exists (
      select 1 from public.supported_locales
      where supported_locales.locale = localized_content.locale
        and supported_locales.enabled
    )
  );

comment on column public.profiles.preferred_locale is 'Player-selected UI locale shared by native, Telegram and Facebook clients.';
comment on table public.supported_locales is 'Locales enabled across every Kantin client.';
comment on table public.localized_content is 'Server-managed translated event and seasonal content; UI bundle strings remain versioned with the client.';
