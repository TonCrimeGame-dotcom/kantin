-- Add Normal Okey as an independent four-player mode without creating a new API function.
alter table public.matchmaking_tickets drop constraint if exists matchmaking_tickets_mode_check;
alter table public.matchmaking_tickets add constraint matchmaking_tickets_mode_check check(mode in('spvp','upvp','pistiSolo','pistiTeam','okeyClassic','okeySolo','okeyTeam','batakKozMaca','batakGommeli','sozcukDuel'));
alter table public.online_matches drop constraint if exists online_matches_mode_check;
alter table public.online_matches add constraint online_matches_mode_check check(mode in('spvp','upvp','pistiSolo','pistiTeam','okeyClassic','okeySolo','okeyTeam','batakKozMaca','batakGommeli','sozcukDuel'));
alter table public.private_game_rooms drop constraint if exists private_game_rooms_mode_check;
alter table public.private_game_rooms add constraint private_game_rooms_mode_check check(mode in('spvp','upvp','pistiSolo','pistiTeam','okeyClassic','okeySolo','okeyTeam','batakKozMaca','batakGommeli','sozcukDuel'));

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
    when 'okeyClassic' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    when 'batakKozMaca' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    when 'batakGommeli' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
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
    when 'okeyClassic' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    when 'batakKozMaca' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    when 'batakGommeli' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
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

create or replace function public.kantin_create_private_room(p_user_id uuid,p_mode text,p_word_locale text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare room_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501';end if;
  if p_mode not in('spvp','upvp','pistiSolo','pistiTeam','okeyClassic','okeySolo','okeyTeam','batakKozMaca','batakGommeli','sozcukDuel') then raise exception 'invalid_game_mode';end if;
  if p_mode='sozcukDuel' and lower(split_part(replace(coalesce(p_word_locale,'tr'),'_','-'),'-',1)) not in('tr','en','de','ru','es','hi','ar') then raise exception 'unsupported_word_locale';end if;
  if exists(select 1 from public.private_game_room_members m join public.private_game_rooms r on r.id=m.room_id where m.user_id=p_user_id and r.status='open' and r.expires_at>now()) then raise exception 'private_room_already_open';end if;
  if exists(select 1 from public.matchmaking_tickets where player_id=p_user_id::text and status in('waiting','matched')) then raise exception 'active_match_or_queue';end if;
  insert into public.private_game_rooms(owner_id,mode,word_locale) values(p_user_id,p_mode,case when p_mode='sozcukDuel' then lower(split_part(replace(coalesce(p_word_locale,'tr'),'_','-'),'-',1)) else null end) returning id into room_id;
  insert into public.private_game_room_members(room_id,user_id) values(room_id,p_user_id);
  return public.kantin_private_room_state(p_user_id);
end $$;

revoke all on function public.kantin_join_matchmaking(text,text,text,text) from public,anon,authenticated;
grant execute on function public.kantin_join_matchmaking(text,text,text,text) to service_role;
revoke all on function public.kantin_backfill_matchmaking(text) from public,anon,authenticated;
grant execute on function public.kantin_backfill_matchmaking(text) to service_role;
