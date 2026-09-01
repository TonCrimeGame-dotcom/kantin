create table if not exists public.online_matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('spvp', 'upvp', 'pistiSolo', 'pistiTeam', 'okeySolo', 'okeyTeam', 'sozcukDuel')),
  word_locale text check (word_locale is null or word_locale in ('tr', 'en', 'de', 'ru', 'es', 'hi', 'ar')),
  players jsonb not null,
  state jsonb,
  turn_version integer not null default 0 check (turn_version >= 0),
  status text not null default 'playing' check (status in ('playing', 'finished', 'abandoned')),
  result jsonb,
  action_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.matchmaking_tickets (
  player_id text primary key,
  username text not null,
  mode text not null check (mode in ('spvp', 'upvp', 'pistiSolo', 'pistiTeam', 'okeySolo', 'okeyTeam', 'sozcukDuel')),
  word_locale text check (word_locale is null or word_locale in ('tr', 'en', 'de', 'ru', 'es', 'hi', 'ar')),
  status text not null default 'waiting' check (status in ('waiting', 'matched')),
  match_id uuid references public.online_matches(id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matchmaking_waiting_queue_idx
  on public.matchmaking_tickets (mode, word_locale, joined_at)
  where status = 'waiting';

create index if not exists matchmaking_match_idx
  on public.matchmaking_tickets (match_id)
  where match_id is not null;

create index if not exists online_matches_status_updated_idx
  on public.online_matches (status, updated_at desc);

alter table public.online_matches enable row level security;
alter table public.matchmaking_tickets enable row level security;

revoke all on table public.online_matches from anon, authenticated;
revoke all on table public.matchmaking_tickets from anon, authenticated;
grant select, insert, update, delete on table public.online_matches to service_role;
grant select, insert, update, delete on table public.matchmaking_tickets to service_role;

create or replace function public.kantin_join_matchmaking(
  p_player_id text,
  p_username text,
  p_mode text,
  p_word_locale text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  queue_locale text;
  queue_key text;
  required_players integer;
  seats text[];
  selected_ids text[] := array[]::text[];
  selected_players jsonb := '[]'::jsonb;
  existing_ticket public.matchmaking_tickets%rowtype;
  candidate public.matchmaking_tickets%rowtype;
  new_match_id uuid;
  seat_name text;
  team_name text;
  player_index integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  p_player_id := btrim(coalesce(p_player_id, ''));
  p_username := left(btrim(coalesce(p_username, 'Oyuncu')), 30);
  p_mode := btrim(coalesce(p_mode, ''));
  p_word_locale := lower(split_part(replace(coalesce(p_word_locale, 'tr'), '_', '-'), '-', 1));

  if p_player_id = '' or char_length(p_player_id) > 96 then
    raise exception 'invalid_player_id' using errcode = '22023';
  end if;
  if char_length(p_username) < 1 then
    p_username := 'Oyuncu';
  end if;

  case p_mode
    when 'spvp' then required_players := 2; seats := array['white', 'black'];
    when 'upvp' then required_players := 4; seats := array['A1', 'B1', 'A2', 'B2'];
    when 'pistiSolo' then required_players := 2; seats := array['P1', 'P2'];
    when 'pistiTeam' then required_players := 4; seats := array['A1', 'B1', 'A2', 'B2'];
    when 'okeySolo' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    when 'okeyTeam' then required_players := 4; seats := array['A1', 'B1', 'A2', 'B2'];
    when 'sozcukDuel' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    else raise exception 'invalid_game_mode' using errcode = '22023';
  end case;

  if p_mode = 'sozcukDuel' then
    if p_word_locale not in ('tr', 'en', 'de', 'ru', 'es', 'hi', 'ar') then
      raise exception 'invalid_word_locale' using errcode = '22023';
    end if;
    queue_locale := p_word_locale;
  else
    queue_locale := null;
  end if;
  queue_key := p_mode || ':' || coalesce(queue_locale, '-');

  perform pg_advisory_xact_lock(hashtextextended(queue_key, 0));

  delete from public.matchmaking_tickets
  where status = 'waiting' and updated_at < now() - interval '90 seconds';

  select * into existing_ticket
  from public.matchmaking_tickets
  where player_id = p_player_id;

  if found and existing_ticket.status = 'matched' and existing_ticket.match_id is not null then
    return jsonb_build_object(
      'status', 'matched',
      'matchId', existing_ticket.match_id,
      'mode', existing_ticket.mode,
      'wordLocale', existing_ticket.word_locale
    );
  end if;

  insert into public.matchmaking_tickets (
    player_id, username, mode, word_locale, status, match_id, joined_at, updated_at
  ) values (
    p_player_id, p_username, p_mode, queue_locale, 'waiting', null, now(), now()
  )
  on conflict (player_id) do update set
    username = excluded.username,
    mode = excluded.mode,
    word_locale = excluded.word_locale,
    status = 'waiting',
    match_id = null,
    joined_at = case
      when public.matchmaking_tickets.mode = excluded.mode
        and public.matchmaking_tickets.word_locale is not distinct from excluded.word_locale
      then public.matchmaking_tickets.joined_at
      else now()
    end,
    updated_at = now();

  for candidate in
    select *
    from public.matchmaking_tickets
    where status = 'waiting'
      and mode = p_mode
      and word_locale is not distinct from queue_locale
    order by joined_at, player_id
    limit required_players
    for update skip locked
  loop
    selected_ids := array_append(selected_ids, candidate.player_id);
  end loop;

  if cardinality(selected_ids) < required_players then
    return jsonb_build_object(
      'status', 'waiting',
      'mode', p_mode,
      'wordLocale', queue_locale,
      'required', required_players
    );
  end if;

  foreach p_player_id in array selected_ids loop
    select * into candidate
    from public.matchmaking_tickets
    where player_id = p_player_id;
    player_index := player_index + 1;
    seat_name := seats[player_index];
    team_name := case
      when seat_name like 'A%' then 'teamA'
      when seat_name like 'B%' then 'teamB'
      else null
    end;
    selected_players := selected_players || jsonb_build_array(jsonb_build_object(
      'id', candidate.player_id,
      'username', candidate.username,
      'seat', seat_name,
      'team', team_name
    ));
  end loop;

  insert into public.online_matches (mode, word_locale, players)
  values (p_mode, queue_locale, selected_players)
  returning id into new_match_id;

  update public.matchmaking_tickets
  set status = 'matched', match_id = new_match_id, updated_at = now()
  where player_id = any(selected_ids);

  return jsonb_build_object(
    'status', 'matched',
    'matchId', new_match_id,
    'mode', p_mode,
    'wordLocale', queue_locale,
    'required', required_players
  );
end;
$$;

create or replace function public.kantin_cancel_matchmaking(p_player_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  delete from public.matchmaking_tickets
  where player_id = btrim(coalesce(p_player_id, '')) and status = 'waiting';
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.kantin_join_matchmaking(text, text, text, text) from public, anon, authenticated;
revoke all on function public.kantin_cancel_matchmaking(text) from public, anon, authenticated;
grant execute on function public.kantin_join_matchmaking(text, text, text, text) to service_role;
grant execute on function public.kantin_cancel_matchmaking(text) to service_role;

comment on table public.matchmaking_tickets is
  'Shared matchmaking queue used by every Vercel function instance.';
comment on table public.online_matches is
  'Authoritative active game state with optimistic turn-version locking.';
