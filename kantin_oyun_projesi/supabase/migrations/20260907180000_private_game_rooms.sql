create table if not exists public.private_game_rooms(
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check(mode in('spvp','upvp','pistiSolo','pistiTeam','okeySolo','okeyTeam','batakKozMaca','batakGommeli','sozcukDuel')),
  word_locale text, status text not null default 'open' check(status in('open','started','cancelled','expired')),
  match_id uuid references public.online_matches(id), created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '15 minutes')
);
create table if not exists public.private_game_room_members(room_id uuid not null references public.private_game_rooms(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,joined_at timestamptz not null default now(),primary key(room_id,user_id));
create table if not exists public.private_game_room_invites(room_id uuid not null references public.private_game_rooms(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,status text not null default 'pending' check(status in('pending','accepted','declined')),created_at timestamptz not null default now(),responded_at timestamptz,primary key(room_id,user_id));
create index if not exists private_room_member_user_idx on public.private_game_room_members(user_id);
create index if not exists private_room_invite_user_idx on public.private_game_room_invites(user_id,status);
alter table public.private_game_rooms enable row level security;alter table public.private_game_room_members enable row level security;alter table public.private_game_room_invites enable row level security;
revoke all on table public.private_game_rooms,public.private_game_room_members,public.private_game_room_invites from anon,authenticated;
grant select,insert,update,delete on table public.private_game_rooms,public.private_game_room_members,public.private_game_room_invites to service_role;

create or replace function public.kantin_private_room_state(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501';end if;
  update public.private_game_rooms set status='expired' where status='open' and expires_at<=now();
  select jsonb_build_object(
    'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'ownerId',r.owner_id,'mode',r.mode,'wordLocale',r.word_locale,'status',r.status,'matchId',r.match_id,'capacity',case when r.mode in('spvp','pistiSolo') then 2 else 4 end,'expiresAt',r.expires_at,'isOwner',r.owner_id=p_user_id,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(p.player_code,p.id::text),'userId',p.id,'username',p.username,'avatarUrl',p.avatar_url) order by m.joined_at),'[]'::jsonb) from public.private_game_room_members m join public.profiles p on p.id=m.user_id where m.room_id=r.id),'invited',(select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(p.player_code,p.id::text),'userId',p.id,'username',p.username,'status',i.status) order by i.created_at),'[]'::jsonb) from public.private_game_room_invites i join public.profiles p on p.id=i.user_id where i.room_id=r.id)) order by r.created_at desc) from public.private_game_rooms r join public.private_game_room_members me on me.room_id=r.id and me.user_id=p_user_id where r.status in('open','started') and (r.status='open' or r.created_at>now()-interval '1 hour')),'[]'::jsonb),
    'invites',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'ownerId',r.owner_id,'ownerName',p.username,'mode',r.mode,'wordLocale',r.word_locale,'status',r.status,'capacity',case when r.mode in('spvp','pistiSolo') then 2 else 4 end,'expiresAt',r.expires_at) order by i.created_at desc) from public.private_game_room_invites i join public.private_game_rooms r on r.id=i.room_id join public.profiles p on p.id=r.owner_id where i.user_id=p_user_id and i.status='pending' and r.status='open' and r.expires_at>now()),'[]'::jsonb)
  ) into payload;return payload;
end $$;

create or replace function public.kantin_create_private_room(p_user_id uuid,p_mode text,p_word_locale text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare room_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501';end if;
  if p_mode not in('spvp','upvp','pistiSolo','pistiTeam','okeySolo','okeyTeam','batakKozMaca','batakGommeli','sozcukDuel') then raise exception 'invalid_game_mode';end if;
  if p_mode='sozcukDuel' and lower(split_part(replace(coalesce(p_word_locale,'tr'),'_','-'),'-',1)) not in('tr','en','de','ru','es','hi','ar') then raise exception 'unsupported_word_locale';end if;
  if exists(select 1 from public.private_game_room_members m join public.private_game_rooms r on r.id=m.room_id where m.user_id=p_user_id and r.status='open' and r.expires_at>now()) then raise exception 'private_room_already_open';end if;
  if exists(select 1 from public.matchmaking_tickets where player_id=p_user_id::text and status in('waiting','matched')) then raise exception 'active_match_or_queue';end if;
  insert into public.private_game_rooms(owner_id,mode,word_locale) values(p_user_id,p_mode,case when p_mode='sozcukDuel' then lower(split_part(replace(coalesce(p_word_locale,'tr'),'_','-'),'-',1)) else null end) returning id into room_id;
  insert into public.private_game_room_members(room_id,user_id) values(room_id,p_user_id);
  return public.kantin_private_room_state(p_user_id);
end $$;

create or replace function public.kantin_invite_private_room(p_user_id uuid,p_room_id uuid,p_other_identifier text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare room public.private_game_rooms%rowtype;other_id uuid;capacity integer;occupied integer;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501';end if;
  select * into room from public.private_game_rooms where id=p_room_id and owner_id=p_user_id and status='open' and expires_at>now() for update;if not found then raise exception 'private_room_not_found';end if;
  other_id:=public._kantin_friend_id(p_other_identifier);if other_id is null then raise exception 'profile_not_found';end if;
  if not exists(select 1 from public.player_friendships where status='accepted' and ((requester_id=p_user_id and addressee_id=other_id) or(requester_id=other_id and addressee_id=p_user_id))) then raise exception 'friend_required';end if;
  capacity:=case when room.mode in('spvp','pistiSolo') then 2 else 4 end;select count(*)+(select count(*) from public.private_game_room_invites where room_id=room.id and status='pending') into occupied from public.private_game_room_members where room_id=room.id;if occupied>=capacity then raise exception 'private_room_full';end if;
  insert into public.private_game_room_invites(room_id,user_id) values(room.id,other_id) on conflict(room_id,user_id) do update set status='pending',created_at=now(),responded_at=null;
  return public.kantin_private_room_state(p_user_id);
end $$;

create or replace function public.kantin_respond_private_room(p_user_id uuid,p_room_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare room public.private_game_rooms%rowtype;capacity integer;member_count integer;players jsonb;new_match uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501';end if;
  select r.* into room from public.private_game_rooms r join public.private_game_room_invites i on i.room_id=r.id and i.user_id=p_user_id and i.status='pending' where r.id=p_room_id and r.status='open' and r.expires_at>now() for update;if not found then raise exception 'private_room_invite_expired';end if;
  if not p_accept then update public.private_game_room_invites set status='declined',responded_at=now() where room_id=room.id and user_id=p_user_id;return public.kantin_private_room_state(p_user_id);end if;
  if exists(select 1 from public.matchmaking_tickets where player_id=p_user_id::text and status in('waiting','matched')) then raise exception 'active_match_or_queue';end if;
  if exists(select 1 from public.private_game_room_members m join public.private_game_rooms r on r.id=m.room_id where m.user_id=p_user_id and r.id<>room.id and r.status='open' and r.expires_at>now()) then raise exception 'private_room_already_open';end if;
  update public.private_game_room_invites set status='accepted',responded_at=now() where room_id=room.id and user_id=p_user_id;insert into public.private_game_room_members(room_id,user_id) values(room.id,p_user_id) on conflict do nothing;
  capacity:=case when room.mode in('spvp','pistiSolo') then 2 else 4 end;select count(*) into member_count from public.private_game_room_members where room_id=room.id;
  if member_count=capacity then
    with ranked as(select m.user_id,m.joined_at,p.username,p.avatar_url,p.level,row_number() over(order by m.joined_at) n from public.private_game_room_members m join public.profiles p on p.id=m.user_id where m.room_id=room.id),seated as(select ranked.*,(case when room.mode='spvp' then array['white','black'] when room.mode='pistiSolo' then array['P1','P2'] when room.mode in('upvp','pistiTeam','okeyTeam','batakKozMaca','batakGommeli') then array['A1','B1','A2','B2'] else array['P1','P2','P3','P4'] end)[n::integer] seat from ranked) select jsonb_agg(jsonb_build_object('id',user_id::text,'username',username,'avatarUrl',avatar_url,'seat',seat,'team',case when left(seat,1)='A' then 'teamA' when left(seat,1)='B' then 'teamB' else null end,'isBot',false,'level',level) order by joined_at) into players from seated;
    insert into public.online_matches(mode,word_locale,players) values(room.mode,room.word_locale,players) returning id into new_match;
    insert into public.matchmaking_tickets(player_id,username,mode,word_locale,status,match_id) select m.user_id::text,p.username,room.mode,room.word_locale,'matched',new_match from public.private_game_room_members m join public.profiles p on p.id=m.user_id where m.room_id=room.id on conflict(player_id) do update set username=excluded.username,mode=excluded.mode,word_locale=excluded.word_locale,status='matched',match_id=excluded.match_id,updated_at=now();
    update public.private_game_rooms set status='started',match_id=new_match where id=room.id;
  end if;return public.kantin_private_room_state(p_user_id);
end $$;

create or replace function public.kantin_cancel_private_room(p_user_id uuid,p_room_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501';end if;update public.private_game_rooms set status='cancelled' where id=p_room_id and owner_id=p_user_id and status='open';if not found then raise exception 'private_room_not_found';end if;return public.kantin_private_room_state(p_user_id);end $$;

create or replace function public.kantin_leave_private_room(p_user_id uuid,p_room_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501';end if;
  if exists(select 1 from public.private_game_rooms where id=p_room_id and owner_id=p_user_id and status='open') then update public.private_game_rooms set status='cancelled' where id=p_room_id;return public.kantin_private_room_state(p_user_id);end if;
  delete from public.private_game_room_members where room_id=p_room_id and user_id=p_user_id;if not found then raise exception 'private_room_membership_not_found';end if;
  update public.private_game_room_invites set status='declined',responded_at=now() where room_id=p_room_id and user_id=p_user_id;return public.kantin_private_room_state(p_user_id);
end $$;

revoke all on function public.kantin_private_room_state(uuid),public.kantin_create_private_room(uuid,text,text),public.kantin_invite_private_room(uuid,uuid,text),public.kantin_respond_private_room(uuid,uuid,boolean),public.kantin_cancel_private_room(uuid,uuid),public.kantin_leave_private_room(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kantin_private_room_state(uuid),public.kantin_create_private_room(uuid,text,text),public.kantin_invite_private_room(uuid,uuid,text),public.kantin_respond_private_room(uuid,uuid,boolean),public.kantin_cancel_private_room(uuid,uuid),public.kantin_leave_private_room(uuid,uuid) to service_role;
