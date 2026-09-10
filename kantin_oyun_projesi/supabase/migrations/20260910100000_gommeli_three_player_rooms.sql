-- Keep remote matchmaking and private-room capacities aligned with the three-player engine.
do $$
declare fn record; definition text;
begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('kantin_join_matchmaking','kantin_backfill_matchmaking','kantin_private_room_state','kantin_invite_private_room','kantin_respond_private_room') loop
  definition:=pg_get_functiondef(fn.oid);
  definition:=replace(definition, 'when ''batakGommeli'' then required_players := 4; seats := array[''P1'', ''P2'', ''P3'', ''P4''];', 'when ''batakGommeli'' then required_players := 3; seats := array[''P1'', ''P2'', ''P3''];');
  definition:=replace(definition, 'case when r.mode in(''spvp'',''pistiSolo'') then 2 else 4 end', 'case when r.mode in(''spvp'',''pistiSolo'') then 2 when r.mode=''batakGommeli'' then 3 else 4 end');
  definition:=replace(definition, 'case when room.mode in(''spvp'',''pistiSolo'') then 2 else 4 end', 'case when room.mode in(''spvp'',''pistiSolo'') then 2 when room.mode=''batakGommeli'' then 3 else 4 end');
  execute definition;
 end loop;
end;
$$;
