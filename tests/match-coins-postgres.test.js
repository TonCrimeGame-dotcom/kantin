'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Isolated PostgreSQL integration suite; no external database is used.
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create function auth.role() returns text language sql as $$select 'service_role'::text$$;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table public.profiles(id uuid primary key,coins bigint default 2500,username text,avatar_url text,level int default 1);
 create table public.private_game_rooms(id uuid primary key,mode text);
 `);
 for(const file of ['20260831183000_economy_core.sql','20260901193000_distributed_matchmaking.sql','20260906120000_bot_matchmaking.sql','20260915100000_match_coin_settlement.sql'])
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 let seq=0;const uid=()=>`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
 async function user(){const id=uid();await db.query('insert into profiles(id,username) values($1,$2)',[id,'test']);return id}
 async function balance(id){return Number((await db.query('select balance from coin_wallets where user_id=$1',[id])).rows[0].balance)}
 async function match(players,stake=500){const id=uid();await db.query("insert into online_matches(id,mode,players,stake) values($1,'pistiSolo',$2,$3)",[id,JSON.stringify(players),stake]);return id}
 async function finish(id,result){return (await db.query("update online_matches set status='finished',result=$2 where id=$1 returning coin_changes",[id,JSON.stringify(result)])).rows[0].coin_changes}
 const a=await user(),b=await user();const id=await match([{id:a,seat:'P1'},{id:b,seat:'P2'}]);
 assert.equal(await balance(a),2000);assert.equal(await balance(b),2000);
 let coins=await finish(id,{winner:'P1'});assert.equal(await balance(a),3000);assert.equal(await balance(b),2000);assert.equal(coins[a].net,500);assert.equal(coins[b].net,-500);
 await finish(id,{winner:'P1'});assert.equal(await balance(a),3000);
 await assert.rejects(finish(id,{winner:'P2'}),/match_result_immutable/);
 console.log('✓ Win/loss, atomic entry, duplicate result and result immutability');
 const c=await user(),d=await user(),draw=await match([{id:c,seat:'P1'},{id:d,seat:'P2'}]);coins=await finish(draw,{});assert.equal(await balance(c),2500);assert.equal(coins[c].type,'refund');
 const botMatch=await match([{id:c,seat:'P1'},{id:'BOT-TEST',seat:'P2',isBot:true}]);coins=await finish(botMatch,{winner:'P2'});assert.equal(await balance(c),2000);assert.equal(coins[c].net,-500);
 console.log('✓ Draw refunds and losing to a bot');
 const teamPlayers=[];for(let n=0;n<4;n++)teamPlayers.push({id:await user(),seat:['A1','B1','A2','B2'][n],team:n%2?'teamB':'teamA'});
 const team=await match(teamPlayers);coins=await finish(team,{winnerTeam:'teamA'});for(let n=0;n<4;n++)assert.equal(await balance(teamPlayers[n].id),n%2?2000:3000);
 const tie=await match(teamPlayers);coins=await finish(tie,{winners:['A1','B1']});assert.equal(coins[teamPlayers[0].id].net,500);assert.equal(coins[teamPlayers[2].id].net,-500);
 console.log('✓ Team payouts and multiple winners split the pot');
 const poor=await user();await db.query('update coin_wallets set balance=100 where user_id=$1',[poor]);const before=await balance(d);
 await assert.rejects(match([{id:d,seat:'P1'},{id:poor,seat:'P2'}]),/insufficient_coins/);assert.equal(await balance(d),before);
 console.log('✓ Insufficient funds roll back all entry fees');
 const q1=await user(),q2=await user();await db.query("select kantin_join_matchmaking($1,'One','pistiSolo',null,500::bigint)",[q1]);await db.query("select kantin_join_matchmaking($1,'Two','pistiSolo',null,1500::bigint)",[q2]);
 assert.equal((await db.query('select count(*)::int n from matchmaking_tickets where status=\'waiting\'')).rows[0].n,2);
 const q3=await user();await db.query("select kantin_join_matchmaking($1,'Three','pistiSolo',null,500::bigint)",[q3]);assert.equal(await balance(q1),2000);assert.equal(await balance(q2),2500);
 await db.exec("update matchmaking_tickets set next_bot_at=now()-interval '1 second' where status='waiting'");await db.query('select kantin_backfill_matchmaking($1)',[q2]);assert.equal(await balance(q2),1000);
 console.log('✓ Separate stake queues and bot backfill charge the correct fee');
 const abandoned=await match([{id:d,seat:'P1'},{id:'BOT-TEST',seat:'P2',isBot:true}]);
 const reserved=await balance(d);
 await db.query("update online_matches set status='abandoned' where id=$1",[abandoned]);
 assert.equal(await balance(d),reserved+500);
 const free=await match([{id:d,seat:'P1'},{id:c,seat:'P2'}],0),freeBefore=await balance(d);
 await finish(free,{winner:'P1'});assert.equal(await balance(d),freeBefore);
 const active=(await db.query('select match_id from matchmaking_tickets where player_id=$1',[q1])).rows[0].match_id;
 await finish(active,{winner:'P1'});
 await db.query("select kantin_join_matchmaking($1,'One','pistiSolo',null,500::bigint)",[q1]);
 assert.equal((await db.query('select status from matchmaking_tickets where player_id=$1',[q1])).rows[0].status,'waiting');
 const rights=(await db.query("select has_function_privilege('authenticated','public.kantin_join_matchmaking(text,text,text,text,bigint)','EXECUTE') allowed")).rows[0];
 assert.equal(rights.allowed,false);
 console.log('✓ Abandon refunds, free tables, next match and service-only permissions');
 await db.close();
})().catch(error=>{console.error(error.message);process.exitCode=1});
