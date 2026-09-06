create table if not exists public.bot_profiles (
  id text primary key,
  username text not null unique,
  difficulty text not null check (difficulty in ('ORTA', 'İYİ')),
  level integer not null check (level between 1 and 99),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.bot_profiles add column if not exists avatar_url text;

alter table public.bot_profiles enable row level security;
revoke all on table public.bot_profiles from public, anon, authenticated;
grant select, insert, update on table public.bot_profiles to service_role;

insert into public.bot_profiles (id, username, difficulty, level, avatar_url)
select
  'BOT-' || case when n % 3 = 0 then 'IYI' else 'ORTA' end || '-' || code,
  'Misafir ' || code,
  case when n % 3 = 0 then 'İYİ' else 'ORTA' end,
  case when n % 3 = 0 then 18 + (n % 18) else 7 + (n % 11) end,
  './assets/avatars/' || (array['avatar-a1.png','avatar-a2.png','avatar-a3.png','avatar-k1.png','avatar-k2.png','avatar-k3.png','aslan.png','cane.png','kedi.png','panter.png','tavsan.png'])[1 + (n % 11)::integer]
from generate_series(1, 72) as seed(n)
cross join lateral (select upper(substr(md5('kantin-bot-' || n::text), 1, 6)) as code) generated
on conflict (id) do nothing;

alter table public.matchmaking_tickets
  add column if not exists is_bot boolean not null default false,
  add column if not exists bot_difficulty text check (bot_difficulty is null or bot_difficulty in ('ORTA', 'İYİ')),
  add column if not exists next_bot_at timestamptz;

create or replace function public.kantin_set_bot_fill_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_bot then
    new.next_bot_at := null;
  elsif tg_op = 'INSERT'
    or old.mode is distinct from new.mode
    or old.word_locale is distinct from new.word_locale
    or old.joined_at is distinct from new.joined_at
    or (old.status is distinct from new.status and new.status = 'waiting') then
    new.next_bot_at := clock_timestamp() + interval '3 seconds' + random() * interval '1 second';
  end if;
  return new;
end;
$$;

drop trigger if exists matchmaking_bot_fill_deadline on public.matchmaking_tickets;
create trigger matchmaking_bot_fill_deadline
before insert or update on public.matchmaking_tickets
for each row execute function public.kantin_set_bot_fill_deadline();

update public.matchmaking_tickets
set next_bot_at = clock_timestamp() + interval '3 seconds' + random() * interval '1 second'
where status = 'waiting' and not is_bot and next_bot_at is null;

create or replace function public.kantin_backfill_matchmaking(p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester public.matchmaking_tickets%rowtype;
  candidate public.matchmaking_tickets%rowtype;
  chosen_bot public.bot_profiles%rowtype;
  required_players integer;
  waiting_players integer;
  seats text[];
  selected_ids text[] := array[]::text[];
  selected_players jsonb := '[]'::jsonb;
  new_match_id uuid;
  seat_name text;
  team_name text;
  player_index integer := 0;
  queue_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into requester
  from public.matchmaking_tickets
  where player_id = btrim(coalesce(p_player_id, '')) and status = 'waiting' and not is_bot
  for update;

  if not found or requester.next_bot_at is null or requester.next_bot_at > clock_timestamp() then
    return jsonb_build_object('added', false);
  end if;

  case requester.mode
    when 'spvp' then required_players := 2; seats := array['white', 'black'];
    when 'upvp' then required_players := 4; seats := array['A1', 'B1', 'A2', 'B2'];
    when 'pistiSolo' then required_players := 2; seats := array['P1', 'P2'];
    when 'pistiTeam' then required_players := 4; seats := array['A1', 'B1', 'A2', 'B2'];
    when 'okeySolo' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    when 'okeyTeam' then required_players := 4; seats := array['A1', 'B1', 'A2', 'B2'];
    when 'sozcukDuel' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    else raise exception 'invalid_game_mode' using errcode = '22023';
  end case;

  queue_key := requester.mode || ':' || coalesce(requester.word_locale, '-');
  perform pg_advisory_xact_lock(hashtextextended(queue_key, 0));

  select count(*) into waiting_players
  from public.matchmaking_tickets
  where status = 'waiting' and mode = requester.mode
    and word_locale is not distinct from requester.word_locale;

  if waiting_players >= required_players then
    return jsonb_build_object('added', false);
  end if;

  select profile.* into chosen_bot
  from public.bot_profiles profile
  where not exists (
    select 1 from public.matchmaking_tickets ticket
    where ticket.player_id = profile.id and ticket.status in ('waiting', 'matched')
  )
  and not exists (
    select 1 from public.online_matches match
    where match.status = 'playing' and match.players @> jsonb_build_array(jsonb_build_object('id', profile.id))
  )
  order by case when random() < 0.38 then profile.difficulty = 'İYİ' else profile.difficulty = 'ORTA' end desc,
    random()
  limit 1;

  if not found then
    return jsonb_build_object('added', false, 'reason', 'bot_pool_busy');
  end if;

  insert into public.matchmaking_tickets (
    player_id, username, mode, word_locale, status, match_id, joined_at, updated_at,
    is_bot, bot_difficulty, next_bot_at
  ) values (
    chosen_bot.id, chosen_bot.username, requester.mode, requester.word_locale, 'waiting', null,
    clock_timestamp(), clock_timestamp(), true, chosen_bot.difficulty, null
  )
  on conflict (player_id) do update set
    username = excluded.username,
    mode = excluded.mode,
    word_locale = excluded.word_locale,
    status = 'waiting',
    match_id = null,
    joined_at = excluded.joined_at,
    updated_at = excluded.updated_at,
    is_bot = true,
    bot_difficulty = excluded.bot_difficulty,
    next_bot_at = null;

  update public.matchmaking_tickets
  set next_bot_at = clock_timestamp() + interval '1 second'
  where status = 'waiting' and not is_bot and mode = requester.mode
    and word_locale is not distinct from requester.word_locale;

  for candidate in
    select * from public.matchmaking_tickets
    where status = 'waiting' and mode = requester.mode
      and word_locale is not distinct from requester.word_locale
    order by joined_at, player_id
    limit required_players
    for update skip locked
  loop
    selected_ids := array_append(selected_ids, candidate.player_id);
  end loop;

  if cardinality(selected_ids) < required_players then
    return jsonb_build_object('added', true, 'matched', false);
  end if;

  foreach p_player_id in array selected_ids loop
    select * into candidate from public.matchmaking_tickets where player_id = p_player_id;
    player_index := player_index + 1;
    seat_name := seats[player_index];
    team_name := case when seat_name like 'A%' then 'teamA' when seat_name like 'B%' then 'teamB' else null end;
    selected_players := selected_players || jsonb_build_array(jsonb_build_object(
      'id', candidate.player_id,
      'username', candidate.username,
      'seat', seat_name,
      'team', team_name,
      'isBot', candidate.is_bot,
      'botDifficulty', candidate.bot_difficulty,
      'avatarUrl', coalesce(
        (select profile.avatar_url from public.bot_profiles profile where profile.id = candidate.player_id),
        (select profile.avatar_url from public.profiles profile where profile.id::text = candidate.player_id)
      ),
      'level', coalesce((select profile.level from public.bot_profiles profile where profile.id = candidate.player_id), 1)
    ));
  end loop;

  insert into public.online_matches (mode, word_locale, players)
  values (requester.mode, requester.word_locale, selected_players)
  returning id into new_match_id;

  update public.matchmaking_tickets
  set status = 'matched', match_id = new_match_id, updated_at = clock_timestamp()
  where player_id = any(selected_ids);

  delete from public.matchmaking_tickets
  where is_bot and match_id = new_match_id;

  return jsonb_build_object('added', true, 'matched', true, 'matchId', new_match_id);
end;
$$;

revoke all on function public.kantin_set_bot_fill_deadline() from public, anon, authenticated;
revoke all on function public.kantin_backfill_matchmaking(text) from public, anon, authenticated;
grant execute on function public.kantin_backfill_matchmaking(text) to service_role;

comment on table public.bot_profiles is
  'Persistent ORTA and İYİ matchmaking bot identities whose completed matches feed public profile statistics.';
