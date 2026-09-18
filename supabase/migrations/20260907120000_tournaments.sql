create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(), title text not null, mode text not null check (mode = 'spvp'),
  status text not null default 'open' check (status in ('open','active','finished','cancelled')),
  capacity integer not null check (capacity in (4,8,16,32,64)), entry_fee bigint not null default 0 check (entry_fee >= 0),
  prize_pool bigint not null default 0 check (prize_pool >= 0), starts_at timestamptz, champion_id text,
  created_at timestamptz not null default now(), finished_at timestamptz
);
create table if not exists public.tournament_entries (
  tournament_id uuid not null references public.tournaments(id) on delete cascade, player_id text not null,
  username text not null, seed integer, status text not null default 'registered' check (status in ('registered','active','eliminated','champion')),
  joined_at timestamptz not null default now(), primary key(tournament_id,player_id)
);
create table if not exists public.tournament_games (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round integer not null check(round > 0), slot integer not null check(slot >= 0),
  status text not null default 'playing' check(status in ('waiting','playing','finished')),
  player1_id text, player2_id text, winner_id text, match_id uuid unique references public.online_matches(id),
  created_at timestamptz not null default now(), finished_at timestamptz, unique(tournament_id,round,slot)
);
create index if not exists tournament_entries_player_idx on public.tournament_entries(player_id,status);
create index if not exists tournament_games_match_idx on public.tournament_games(match_id);

insert into public.tournaments(id,title,mode,status,capacity,entry_fee,prize_pool)
values('10000000-0000-4000-8000-000000000001','Kantin Tavla Kupası','spvp','open',4,250,5000)
on conflict(id) do nothing;

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_games enable row level security;
revoke all on table public.tournaments,public.tournament_entries,public.tournament_games from anon,authenticated;
grant select,insert,update,delete on table public.tournaments,public.tournament_entries,public.tournament_games to service_role;

create or replace function public.kantin_join_tournament(p_tournament_id uuid,p_player_id text,p_username text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tournaments%rowtype; n integer; ids text[]; i integer; a text; b text; au text; bu text; match_id uuid; players jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into t from public.tournaments where id=p_tournament_id for update;
  if not found or t.status<>'open' then raise exception 'tournament_registration_closed'; end if;
  if exists(select 1 from public.tournament_entries where player_id=p_player_id and status in('registered','active')) then raise exception 'active_tournament_registration'; end if;
  if exists(select 1 from public.matchmaking_tickets mt left join public.online_matches m on m.id=mt.match_id where mt.player_id=p_player_id and (mt.status='waiting' or m.status='playing')) then raise exception 'active_match_or_queue'; end if;
  select count(*) into n from public.tournament_entries where tournament_id=t.id;
  if n>=t.capacity then raise exception 'tournament_full'; end if;
  if t.entry_fee>0 then
    if p_player_id !~* '^[0-9a-f-]{36}$' then raise exception 'registered_account_required'; end if;
    perform public._kantin_apply_coin_transaction(p_player_id::uuid,-t.entry_fee,'tournament_entry','tournament','tournament:'||t.id||':entry',t.id::text,jsonb_build_object('tournamentId',t.id));
  end if;
  insert into public.tournament_entries(tournament_id,player_id,username) values(t.id,p_player_id,left(btrim(p_username),30));
  select count(*) into n from public.tournament_entries where tournament_id=t.id;
  if n=t.capacity then
    update public.tournaments set status='active' where id=t.id;
    with ranked as(select player_id,row_number() over(order by joined_at,player_id) seed from public.tournament_entries where tournament_id=t.id)
    update public.tournament_entries e set seed=r.seed,status='active' from ranked r where e.tournament_id=t.id and e.player_id=r.player_id;
    select array_agg(player_id order by seed) into ids from public.tournament_entries where tournament_id=t.id;
    for i in 1..t.capacity/2 loop
      a:=ids[(i-1)*2+1]; b:=ids[(i-1)*2+2];
      select username into au from public.tournament_entries where tournament_id=t.id and player_id=a;
      select username into bu from public.tournament_entries where tournament_id=t.id and player_id=b;
      players:=jsonb_build_array(jsonb_build_object('id',a,'username',au,'seat','white','team',null),jsonb_build_object('id',b,'username',bu,'seat','black','team',null));
      insert into public.online_matches(mode,players) values(t.mode,players) returning id into match_id;
      insert into public.tournament_games(tournament_id,round,slot,status,player1_id,player2_id,match_id) values(t.id,1,i-1,'playing',a,b,match_id);
      insert into public.matchmaking_tickets(player_id,username,mode,status,match_id) values(a,au,t.mode,'matched',match_id),(b,bu,t.mode,'matched',match_id)
      on conflict(player_id) do update set username=excluded.username,mode=excluded.mode,status='matched',match_id=excluded.match_id,updated_at=now();
    end loop;
  end if;
  return jsonb_build_object('status',case when n=t.capacity then 'active' else 'open' end,'registered',n,'capacity',t.capacity);
end $$;

create or replace function public.kantin_leave_tournament(p_tournament_id uuid,p_player_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare t public.tournaments%rowtype; removed integer;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into t from public.tournaments where id=p_tournament_id for update;
  if not found or t.status<>'open' then raise exception 'tournament_already_started'; end if;
  delete from public.tournament_entries where tournament_id=t.id and player_id=p_player_id; get diagnostics removed=row_count;
  if removed=0 then return false; end if;
  if t.entry_fee>0 and p_player_id~*'^[0-9a-f-]{36}$' then perform public._kantin_apply_coin_transaction(p_player_id::uuid,t.entry_fee,'tournament_refund','tournament','tournament:'||t.id||':refund',t.id::text,jsonb_build_object('tournamentId',t.id)); end if;
  return true;
end $$;

create or replace function public.kantin_advance_tournament(p_match_id uuid,p_winner_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.tournament_games%rowtype; sibling public.tournament_games%rowtype; t public.tournaments%rowtype; next_round integer; next_slot integer; a text; b text; au text; bu text; new_match uuid; players jsonb; rounds integer;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into g from public.tournament_games where match_id=p_match_id for update;
  if not found then return jsonb_build_object('advanced',false); end if;
  if g.status='finished' then return jsonb_build_object('advanced',false,'duplicate',true); end if;
  if p_winner_id not in(g.player1_id,g.player2_id) then raise exception 'invalid_tournament_winner'; end if;
  update public.tournament_games set status='finished',winner_id=p_winner_id,finished_at=now() where id=g.id;
  update public.tournament_entries set status='eliminated' where tournament_id=g.tournament_id and player_id=case when g.player1_id=p_winner_id then g.player2_id else g.player1_id end;
  select * into t from public.tournaments where id=g.tournament_id for update; rounds:=log(2,t.capacity)::integer;
  if g.round>=rounds then
    update public.tournaments set status='finished',champion_id=p_winner_id,finished_at=now() where id=t.id;
    update public.tournament_entries set status=case when player_id=p_winner_id then 'champion' else 'eliminated' end where tournament_id=t.id;
    if t.prize_pool>0 and p_winner_id~*'^[0-9a-f-]{36}$' then perform public._kantin_apply_coin_transaction(p_winner_id::uuid,t.prize_pool,'tournament_prize','tournament','tournament:'||t.id||':prize',t.id::text,jsonb_build_object('tournamentId',t.id)); end if;
    insert into public.tournaments(title,mode,status,capacity,entry_fee,prize_pool) values(t.title,t.mode,'open',t.capacity,t.entry_fee,t.prize_pool);
    return jsonb_build_object('advanced',true,'finished',true,'championId',p_winner_id);
  end if;
  select * into sibling from public.tournament_games where tournament_id=t.id and round=g.round and slot=case when mod(g.slot,2)=0 then g.slot+1 else g.slot-1 end and status='finished';
  if not found then return jsonb_build_object('advanced',true,'waiting',true); end if;
  next_round:=g.round+1; next_slot:=floor(g.slot/2); if exists(select 1 from public.tournament_games where tournament_id=t.id and round=next_round and slot=next_slot) then return jsonb_build_object('advanced',false,'duplicate',true); end if;
  if g.slot<sibling.slot then a:=p_winner_id;b:=sibling.winner_id;else a:=sibling.winner_id;b:=p_winner_id;end if;
  select username into au from public.tournament_entries where tournament_id=t.id and player_id=a; select username into bu from public.tournament_entries where tournament_id=t.id and player_id=b;
  players:=jsonb_build_array(jsonb_build_object('id',a,'username',au,'seat','white','team',null),jsonb_build_object('id',b,'username',bu,'seat','black','team',null));
  insert into public.online_matches(mode,players) values(t.mode,players) returning id into new_match;
  insert into public.tournament_games(tournament_id,round,slot,status,player1_id,player2_id,match_id) values(t.id,next_round,next_slot,'playing',a,b,new_match);
  insert into public.matchmaking_tickets(player_id,username,mode,status,match_id) values(a,au,t.mode,'matched',new_match),(b,bu,t.mode,'matched',new_match)
  on conflict(player_id) do update set username=excluded.username,mode=excluded.mode,status='matched',match_id=excluded.match_id,updated_at=now();
  return jsonb_build_object('advanced',true,'matchId',new_match,'round',next_round);
end $$;

revoke all on function public.kantin_join_tournament(uuid,text,text),public.kantin_leave_tournament(uuid,text),public.kantin_advance_tournament(uuid,text) from public,anon,authenticated;
grant execute on function public.kantin_join_tournament(uuid,text,text),public.kantin_leave_tournament(uuid,text),public.kantin_advance_tournament(uuid,text) to service_role;
