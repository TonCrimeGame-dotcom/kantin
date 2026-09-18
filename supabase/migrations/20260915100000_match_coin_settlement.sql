-- Reserve entry fees and settle results in the same transaction as match state.
alter table public.matchmaking_tickets add column if not exists stake bigint not null default 0 check(stake>=0);
alter table public.online_matches add column if not exists stake bigint not null default 0 check(stake>=0);
alter table public.online_matches add column if not exists coin_changes jsonb not null default '{}'::jsonb;

create or replace function public.kantin_join_matchmaking(
  p_player_id text,
  p_username text,
  p_mode text,
  p_word_locale text,
  p_stake bigint
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
    when 'batakGommeli' then required_players := 3; seats := array['P1', 'P2', 'P3'];
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
  queue_key := p_mode || ':' || coalesce(queue_locale, '-') || ':' || p_stake::text;

  perform pg_advisory_xact_lock(hashtextextended(queue_key, 0));

  delete from public.matchmaking_tickets
  where status = 'waiting' and updated_at < now() - interval '90 seconds';

  select * into existing_ticket
  from public.matchmaking_tickets
  where player_id = p_player_id;

  if found and existing_ticket.status = 'matched' and existing_ticket.match_id is not null and exists(select 1 from public.online_matches where id=existing_ticket.match_id and status='playing') then
    return jsonb_build_object(
      'status', 'matched',
      'matchId', existing_ticket.match_id,
      'mode', existing_ticket.mode,
      'wordLocale', existing_ticket.word_locale
    );
  end if;

  if p_stake < 0 or p_stake is null or (p_stake > 0 and not exists(select 1 from public.economy_stakes where active and entry_fee=p_stake)) then
    raise exception 'invalid_stake';
  end if;
  if p_stake > 0 and not exists(select 1 from public.coin_wallets w join public.economy_stakes s on s.entry_fee=p_stake and s.active where w.user_id::text=p_player_id and w.balance>=s.minimum_balance) then
    raise exception 'insufficient_coins';
  end if;

  insert into public.matchmaking_tickets (
    player_id, username, mode, word_locale, stake, status, match_id, joined_at, updated_at
  ) values (
    p_player_id, p_username, p_mode, queue_locale, p_stake, 'waiting', null, now(), now()
  )
  on conflict (player_id) do update set
    username = excluded.username,
    mode = excluded.mode,
    stake = excluded.stake,
    word_locale = excluded.word_locale,
    status = 'waiting',
    match_id = null,
    joined_at = case
      when public.matchmaking_tickets.stake = excluded.stake
        and public.matchmaking_tickets.mode = excluded.mode
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
      and stake = p_stake
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

  insert into public.online_matches (mode, word_locale, players, stake)
  values (p_mode, queue_locale, selected_players, p_stake)
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
    when 'batakGommeli' then required_players := 3; seats := array['P1', 'P2', 'P3'];
    when 'okeySolo' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    when 'okeyTeam' then required_players := 4; seats := array['A1', 'B1', 'A2', 'B2'];
    when 'sozcukDuel' then required_players := 4; seats := array['P1', 'P2', 'P3', 'P4'];
    else raise exception 'invalid_game_mode' using errcode = '22023';
  end case;

  queue_key := requester.mode || ':' || coalesce(requester.word_locale, '-') || ':' || requester.stake::text;
  perform pg_advisory_xact_lock(hashtextextended(queue_key, 0));

  select count(*) into waiting_players
  from public.matchmaking_tickets
  where status = 'waiting' and mode = requester.mode
    and word_locale is not distinct from requester.word_locale and stake = requester.stake;

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
    insert into public.bot_profiles (id, username, difficulty, level, avatar_url)
    select 'BOT-ORTA-' || code, 'Misafir ' || substr(code, 1, 12), 'ORTA', 7 + floor(random()*11)::integer,
      './assets/avatars/' || (array['kedi.webp','panter.webp','tavsan.webp','aslan.webp'])[1+floor(random()*4)::integer]
    from (select upper(replace(gen_random_uuid()::text, '-', '')) as code) generated
    returning * into chosen_bot;
  end if;

  insert into public.matchmaking_tickets (
    player_id, username, mode, word_locale, stake, status, match_id, joined_at, updated_at,
    is_bot, bot_difficulty, next_bot_at
  ) values (
    chosen_bot.id, chosen_bot.username, requester.mode, requester.word_locale, requester.stake, 'waiting', null,
    clock_timestamp(), clock_timestamp(), true, chosen_bot.difficulty, null
  )
  on conflict (player_id) do update set
    username = excluded.username,
    mode = excluded.mode,
    stake = excluded.stake,
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
    and word_locale is not distinct from requester.word_locale and stake = requester.stake;

  for candidate in
    select * from public.matchmaking_tickets
    where status = 'waiting' and mode = requester.mode
      and word_locale is not distinct from requester.word_locale and stake = requester.stake
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

  insert into public.online_matches (mode, word_locale, players, stake)
  values (requester.mode, requester.word_locale, selected_players, requester.stake)
  returning id into new_match_id;

  update public.matchmaking_tickets
  set status = 'matched', match_id = new_match_id, updated_at = clock_timestamp()
  where player_id = any(selected_ids);

  delete from public.matchmaking_tickets
  where is_bot and match_id = new_match_id;

  return jsonb_build_object('added', true, 'matched', true, 'matchId', new_match_id);
end;
$$;

-- Keep the old signature for private callers and rolling deployments.
create or replace function public.kantin_join_matchmaking(p_player_id text,p_username text,p_mode text,p_word_locale text default null)
returns jsonb language sql security definer set search_path='' as $$
 select public.kantin_join_matchmaking(p_player_id,p_username,p_mode,p_word_locale,0::bigint);
$$;
revoke all on function public.kantin_join_matchmaking(text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.kantin_join_matchmaking(text,text,text,text,bigint) to service_role;

create or replace function public.kantin_match_coin_entry()
returns trigger language plpgsql security definer set search_path='' as $$
declare player jsonb; tx public.coin_transactions; changes jsonb:='{}'::jsonb;
begin
  if new.stake=0 then return new; end if;
  if not exists(select 1 from public.economy_stakes where active and entry_fee=new.stake) then raise exception 'invalid_stake'; end if;
  -- Stable wallet lock order avoids deadlocks between concurrent matches.
  for player in select value from jsonb_array_elements(new.players) order by value->>'id' loop
    if coalesce((player->>'isBot')::boolean,false) or player->>'id' like 'BOT-%' then continue; end if;
    tx:=public._kantin_apply_coin_transaction((player->>'id')::uuid,-new.stake,'match_entry','match',
      'match:'||new.id::text||':entry',new.id::text,jsonb_build_object('stake',new.stake));
    changes:=changes||jsonb_build_object(player->>'id',jsonb_build_object('type','entry','delta',-new.stake,'net',-new.stake,'stake',new.stake,'balance',tx.balance_after));
  end loop;
  new.coin_changes:=changes;
  return new;
end $$;

create or replace function public.kantin_match_coin_finish()
returns trigger language plpgsql security definer set search_path='' as $$
declare player jsonb; keys jsonb; winners integer; payout bigint; amount bigint; kind text; won boolean; tx public.coin_transactions; balance bigint;
begin
  if new.stake is distinct from old.stake then raise exception 'match_stake_immutable'; end if;
  if old.status in ('finished','abandoned') and (new.status is distinct from old.status or new.result is distinct from old.result) then raise exception 'match_result_immutable'; end if;
  new.coin_changes:=old.coin_changes;
  if old.status<>'playing' or new.status not in ('finished','abandoned') or new.stake=0 then return new; end if;
  keys:=jsonb_build_array(new.result->>'winner',new.result->>'winnerTeam',new.result->>'winnerPlayerId')||coalesce(new.result->'winners','[]'::jsonb);
  select count(*) into winners from jsonb_array_elements(new.players) p where
    keys ? (p->>'id') or keys ? (p->>'seat') or keys ? (p->>'team');
  if new.status='abandoned' then winners:=0; end if;
  payout:=case when winners=0 then new.stake else (new.stake*jsonb_array_length(new.players))/winners end;
  for player in select value from jsonb_array_elements(new.players) order by value->>'id' loop
    -- Only players who actually paid an entry fee have a wallet settlement.
    if not (old.coin_changes ? (player->>'id')) then continue; end if;
    won:=coalesce(keys ? (player->>'id') or keys ? (player->>'seat') or keys ? (player->>'team'),false)
      and not coalesce((player->>'isBot')::boolean,false);
    amount:=case when winners=0 or won then payout else 0 end;
    kind:=case when winners=0 then 'refund' when won then 'payout' else 'loss' end;
    if amount>0 then
      tx:=public._kantin_apply_coin_transaction((player->>'id')::uuid,amount,'match_'||kind,'match',
        'match:'||new.id::text||':settlement',new.id::text,jsonb_build_object('stake',new.stake));
      balance:=tx.balance_after;
    else
      select w.balance into balance from public.coin_wallets w where w.user_id=(player->>'id')::uuid;
    end if;
    new.coin_changes:=new.coin_changes||jsonb_build_object(player->>'id',jsonb_build_object('type',kind,'delta',amount,'net',amount-new.stake,'stake',new.stake,'balance',balance));
  end loop;
  return new;
end $$;
revoke all on function public.kantin_match_coin_entry() from public,anon,authenticated;
revoke all on function public.kantin_match_coin_finish() from public,anon,authenticated;
create trigger online_match_coin_entry before insert on public.online_matches for each row execute function public.kantin_match_coin_entry();
create trigger online_match_coin_finish before update on public.online_matches for each row execute function public.kantin_match_coin_finish();
