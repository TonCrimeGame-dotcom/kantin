'use strict';
const assert=require('node:assert/strict');
const{UserRegistry}=require('../server/user-registry');
const{TournamentManager}=require('../server/tournament-manager');

function user(registry,name){return registry.authenticate(null,name)}
function room(match){return{id:match.matchId,players:match.players}}

{
  const registry=new UserRegistry(),matches=[],events=[];
  const manager=new TournamentManager({repository:registry,createMatch:match=>matches.push(match),notify:(id,type,payload)=>events.push({id,type,payload})});
  const players=['Ada','Bora','Cem','Duru'].map(name=>user(registry,name));
  const tournamentId=manager.list(players[0].id)[0].id;
  for(const player of players)manager.join(tournamentId,player.id);
  assert.equal(matches.length,2,'Dört kayıt iki yarı final başlatmalı');
  assert.equal(manager.view(tournamentId,players[0].id).status,'active');
  assert.equal(registry.get(players[0].id).coins,2250,'Kayıt ücreti authoritative bakiyeden düşmeli');
  manager.advance(room(matches[0]),{winner:'white'});
  manager.advance(room(matches[1]),{winner:'black'});
  assert.equal(matches.length,3,'İki yarı final tamamlanınca final oluşmalı');
  manager.advance(room(matches[2]),{winner:'white'});
  const result=manager.view(tournamentId,matches[2].players[0].id);
  assert.equal(result.status,'finished');
  assert.equal(result.championId,matches[2].players[0].id);
  assert.equal(registry.get(result.championId).coins,7250,'Şampiyon ödülü yalnız bir kez eklenmeli');
  assert.equal(manager.list(players[0].id).filter(item=>item.status==='open').length,1,'Biten kupadan sonra yeni turnuva açılmalı');
  assert(events.some(event=>event.type==='tournament:update'),'Bracket güncellemeleri yayınlanmalı');
  registry.close();
  console.log('✓ Turnuva kaydı, yarı final, final ve şampiyon ödülü tamamlanır');
}

{
  const registry=new UserRegistry(),manager=new TournamentManager({repository:registry}),player=user(registry,'Ece');
  const tournamentId=manager.list(player.id)[0].id;
  manager.join(tournamentId,player.id);manager.leave(tournamentId,player.id);
  assert.equal(registry.get(player.id).coins,2500,'Başlamadan iptal edilen kayıt ücreti iade edilmeli');
  assert.equal(manager.view(tournamentId,player.id).mine,null);
  registry.close();
  console.log('✓ Başlamamış turnuva kaydı iptal edilince ücret iade edilir');
}

const fs=require('node:fs'),migration=fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20260907120000_tournaments.sql'),'utf8');
assert.match(migration,/kantin_join_tournament/);assert.match(migration,/kantin_advance_tournament/);assert.match(migration,/tournament_prize/);
console.log('✓ Supabase turnuva şeması kayıt, ilerleme ve ödül RPC’lerini içerir');
