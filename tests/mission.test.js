'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const{randomUUID}=require('node:crypto');
const{UserRegistry}=require('../server/user-registry');const{MissionManager}=require('../server/mission-manager');

function finish(registry,id,mode,a,b,winner='white'){registry.recordMatch({matchId:id,mode,players:[{id:a.id,seat:'white'},{id:b.id,seat:'black'}]});registry.finishMatch(id,{winnerPlayerId:winner})}

{
  const registry=new UserRegistry(),events=[],manager=new MissionManager({repository:registry,notify:(id,type,payload)=>events.push({id,type,payload})}),a=registry.authenticate(null,'Ada'),b=registry.authenticate(null,'Bora');
  assert.throws(()=>manager.claim('first_table',a.id),/henüz tamamlanmadı/);
  finish(registry,'mission-1','spvp',a,b);finish(registry,'mission-2','spvp',a,b);finish(registry,'mission-3','upvp',a,b);
  registry.request(a.id,b.id);registry.accept(b.id,a.id);
  const current=registry.get(a.id),adBalance=current.coins+150;registry.db.prepare('UPDATE users SET coins=? WHERE id=?').run(adBalance,a.id);registry.db.prepare('INSERT INTO coin_transactions VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),a.id,150,adBalance,'rewarded_ad',null,'rewarded-ad:mission-test',Date.now());
  const state=manager.list(a.id);
  assert.equal(state.find(item=>item.id==='first_table').completed,true);
  assert.equal(state.find(item=>item.id==='tavla_three').progress,3);
  assert.equal(state.find(item=>item.id==='friend_invite').completed,true);
  assert.equal(state.find(item=>item.id==='rewarded_ad').completed,true);
  const before=registry.get(a.id).coins,result=manager.claim('first_table',a.id),duplicate=manager.claim('first_table',a.id);
  assert.equal(result.reward,100);assert.equal(registry.get(a.id).coins,before+100);assert.equal(duplicate.alreadyClaimed,true);assert.equal(registry.get(a.id).coins,before+100);
  assert(events.some(event=>event.type==='coins:updated'&&event.payload.type==='mission_reward'));
  registry.close();console.log('✓ Görev ilerlemesi maç, arkadaş ve reklam kayıtlarından authoritative hesaplanır');
}

const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260907150000_missions_and_friends.sql'),'utf8');
assert.match(migration,/create table if not exists public\.mission_definitions/i);assert.match(migration,/kantin_claim_mission/i);assert.match(migration,/public\._kantin_apply_coin_transaction/i);assert.match(migration,/rewarded_ad_sessions[\s\S]*status='rewarded'/i);assert.match(migration,/player_friendships[\s\S]*status='accepted'/i);assert.match(migration,/service_role/i);
console.log('✓ Supabase görev ödülleri ve arkadaş davetleri servis rolüyle doğrulanır');
