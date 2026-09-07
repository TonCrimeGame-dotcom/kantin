create table if not exists public.player_friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key(requester_id,addressee_id), check(requester_id<>addressee_id)
);
create index if not exists player_friendships_addressee_idx on public.player_friendships(addressee_id,status);
create unique index if not exists player_friendships_pair_idx on public.player_friendships(least(requester_id,addressee_id),greatest(requester_id,addressee_id));

create table if not exists public.mission_definitions (
  id text primary key, title text not null, metric text not null check(metric in ('completed_matches','tavla_matches','accepted_friends','rewarded_ads')),
  target integer not null check(target>0), reward bigint not null check(reward>=0), sort_order integer not null default 0,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.mission_claims (
  mission_id text not null references public.mission_definitions(id), user_id uuid not null references public.profiles(id) on delete cascade,
  coin_transaction_id uuid unique references public.coin_transactions(id), claimed_at timestamptz not null default now(),
  primary key(mission_id,user_id)
);

insert into public.mission_definitions(id,title,metric,target,reward,sort_order) values
('first_table','İlk masanı tamamla','completed_matches',1,100,10),
('tavla_three','3 Tavla maçı oyna','tavla_matches',3,150,20),
('friend_invite','Bir arkadaş davet et','accepted_friends',1,250,30),
('rewarded_ad','Reklam izle, Coin kazan','rewarded_ads',1,100,40)
on conflict(id) do update set title=excluded.title,metric=excluded.metric,target=excluded.target,reward=excluded.reward,sort_order=excluded.sort_order,active=true;

alter table public.player_friendships enable row level security;
alter table public.mission_definitions enable row level security;
alter table public.mission_claims enable row level security;
revoke all on table public.player_friendships,public.mission_definitions,public.mission_claims from anon,authenticated;
grant select,insert,update,delete on table public.player_friendships,public.mission_definitions,public.mission_claims to service_role;

create or replace function public._kantin_mission_progress(p_player_id text,p_metric text)
returns integer language plpgsql stable security definer set search_path='' as $$
declare total integer:=0;
begin
  if p_metric='accepted_friends' then
    select count(*)::integer into total from public.player_friendships where status='accepted' and requester_id::text=p_player_id;
  elsif p_metric='rewarded_ads' then
    if p_player_id~*'^[0-9a-f-]{36}$' then select count(*)::integer into total from public.rewarded_ad_sessions where user_id=p_player_id::uuid and status='rewarded'; end if;
  else
    select count(*)::integer into total from public.online_matches m
    where m.status='finished' and m.players@>jsonb_build_array(jsonb_build_object('id',p_player_id))
      and (p_metric='completed_matches' or (p_metric='tavla_matches' and m.mode in('spvp','upvp')));
  end if;
  return coalesce(total,0);
end $$;

create or replace function public.kantin_mission_state(p_player_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'metric',d.metric,'target',d.target,'reward',d.reward,'progress',least(d.target,public._kantin_mission_progress(p_player_id,d.metric)),'completed',public._kantin_mission_progress(p_player_id,d.metric)>=d.target,'claimed',c.user_id is not null) order by d.sort_order,d.id),'[]'::jsonb)
  into payload from public.mission_definitions d left join public.mission_claims c on c.mission_id=d.id and c.user_id::text=p_player_id where d.active;
  return payload;
end $$;

create or replace function public.kantin_claim_mission(p_mission_id text,p_player_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare mission public.mission_definitions%rowtype; progress integer; inserted integer; reward_tx public.coin_transactions%rowtype; wallet_balance bigint;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_player_id!~*'^[0-9a-f-]{36}$' then raise exception 'registered_account_required'; end if;
  select * into mission from public.mission_definitions where id=p_mission_id and active for update;
  if not found then raise exception 'mission_not_found'; end if;
  progress:=public._kantin_mission_progress(p_player_id,mission.metric);
  if progress<mission.target then raise exception 'mission_incomplete'; end if;
  insert into public.mission_claims(mission_id,user_id) values(mission.id,p_player_id::uuid) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then
    select balance into wallet_balance from public.coin_wallets where user_id=p_player_id::uuid;
    return jsonb_build_object('alreadyClaimed',true,'reward',0,'balance',wallet_balance);
  end if;
  reward_tx:=public._kantin_apply_coin_transaction(p_player_id::uuid,mission.reward,'mission_reward','mission','mission:'||mission.id||':'||p_player_id,mission.id,jsonb_build_object('missionId',mission.id));
  update public.mission_claims set coin_transaction_id=reward_tx.id where mission_id=mission.id and user_id=p_player_id::uuid;
  return jsonb_build_object('alreadyClaimed',false,'reward',mission.reward,'balance',reward_tx.balance_after);
end $$;

create or replace function public.kantin_friend_state(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'friends',coalesce((select jsonb_agg(jsonb_build_object('id',coalesce(p.player_code,p.id::text),'userId',p.id,'username',p.username,'avatarUrl',p.avatar_url,'online',false)) from public.player_friendships f join public.profiles p on p.id=case when f.requester_id=p_user_id then f.addressee_id else f.requester_id end where f.status='accepted' and (f.requester_id=p_user_id or f.addressee_id=p_user_id)),'[]'::jsonb),
    'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',coalesce(p.player_code,p.id::text),'userId',p.id,'username',p.username,'avatarUrl',p.avatar_url,'online',false)) from public.player_friendships f join public.profiles p on p.id=f.requester_id where f.addressee_id=p_user_id and f.status='pending'),'[]'::jsonb),
    'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',coalesce(p.player_code,p.id::text),'userId',p.id,'username',p.username,'avatarUrl',p.avatar_url,'online',false)) from public.player_friendships f join public.profiles p on p.id=f.addressee_id where f.requester_id=p_user_id and f.status='pending'),'[]'::jsonb)
  );
end $$;

create or replace function public._kantin_friend_id(p_identifier text)
returns uuid language sql stable security definer set search_path='' as $$
  select id from public.profiles where id::text=btrim(p_identifier) or upper(player_code)=upper(btrim(p_identifier)) limit 1
$$;

create or replace function public.kantin_friend_request(p_user_id uuid,p_other_identifier text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare other_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  other_id:=public._kantin_friend_id(p_other_identifier); if other_id is null then raise exception 'profile_not_found'; end if; if other_id=p_user_id then raise exception 'cannot_friend_self'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(p_user_id::text,other_id::text)||':'||greatest(p_user_id::text,other_id::text),0));
  if exists(select 1 from public.player_friendships where status='accepted' and ((requester_id=p_user_id and addressee_id=other_id) or (requester_id=other_id and addressee_id=p_user_id))) then raise exception 'already_friends'; end if;
  if exists(select 1 from public.player_friendships where requester_id=other_id and addressee_id=p_user_id and status='pending') then update public.player_friendships set status='accepted' where requester_id=other_id and addressee_id=p_user_id; else insert into public.player_friendships(requester_id,addressee_id) values(p_user_id,other_id) on conflict do nothing; end if;
  return public.kantin_friend_state(p_user_id);
end $$;

create or replace function public.kantin_friend_accept(p_user_id uuid,p_other_identifier text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare other_id uuid; changed integer;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  other_id:=public._kantin_friend_id(p_other_identifier); update public.player_friendships set status='accepted' where requester_id=other_id and addressee_id=p_user_id and status='pending'; get diagnostics changed=row_count; if changed=0 then raise exception 'friend_request_not_found'; end if;
  return public.kantin_friend_state(p_user_id);
end $$;

create or replace function public.kantin_friend_remove(p_user_id uuid,p_other_identifier text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare other_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  other_id:=public._kantin_friend_id(p_other_identifier); delete from public.player_friendships where (requester_id=p_user_id and addressee_id=other_id) or (requester_id=other_id and addressee_id=p_user_id);
  return public.kantin_friend_state(p_user_id);
end $$;

revoke all on function public._kantin_mission_progress(text,text),public.kantin_mission_state(text),public.kantin_claim_mission(text,text),public._kantin_friend_id(text),public.kantin_friend_state(uuid),public.kantin_friend_request(uuid,text),public.kantin_friend_accept(uuid,text),public.kantin_friend_remove(uuid,text) from public,anon,authenticated;
grant execute on function public.kantin_mission_state(text),public.kantin_claim_mission(text,text),public.kantin_friend_state(uuid),public.kantin_friend_request(uuid,text),public.kantin_friend_accept(uuid,text),public.kantin_friend_remove(uuid,text) to service_role;
