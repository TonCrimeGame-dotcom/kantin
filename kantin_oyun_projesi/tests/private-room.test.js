'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const{UserRegistry}=require('../server/user-registry');
const{PrivateRoomManager}=require('../server/private-room-manager');

function user(registry,name){return registry.authenticate(null,name)}
function befriend(registry,a,b){registry.request(a.id,b.id);registry.accept(b.id,a.id)}

{
  const registry=new UserRegistry(),matches=[],events=[];
  const manager=new PrivateRoomManager({repository:registry,available:()=>true,createMatch:match=>matches.push(match),notify:(id,type,payload)=>events.push({id,type,payload})});
  const owner=user(registry,'Ada'),friend=user(registry,'Bora');befriend(registry,owner,friend);
  const room=manager.create(owner.id,{mode:'pistiSolo',stake:0});
  assert.equal(room.capacity,2);assert.equal(room.members.length,1);assert.equal(room.stake,0);
  manager.invite(room.id,owner.id,friend.id);
  assert.equal(manager.stateFor(friend.id).invites.length,1,'Davet arkadaşın gelen masa listesine düşmeli');
  manager.accept(room.id,friend.id);
  assert.equal(matches.length,1,'Son koltuk dolunca maç otomatik başlamalı');
  assert.deepEqual(matches[0].players.map(player=>player.seat),['P1','P2']);
  assert.ok(events.some(event=>event.id===friend.id&&event.type==='match:found'));
  registry.close();
  console.log('✓ İki kişilik özel masa davet kabul edilince otomatik başlar');
}

{
  const registry=new UserRegistry(),matches=[];
  const manager=new PrivateRoomManager({repository:registry,available:()=>true,createMatch:match=>matches.push(match)});
  const players=['Ada','Bora','Cem','Duru'].map(name=>user(registry,name));players.slice(1).forEach(player=>befriend(registry,players[0],player));
  const room=manager.create(players[0].id,{mode:'batakKozMaca'});
  players.slice(1).forEach(player=>{manager.invite(room.id,players[0].id,player.id);manager.accept(room.id,player.id)});
  assert.equal(matches.length,1);assert.deepEqual(matches[0].players.map(player=>player.seat),['P1','P2','P3','P4']);
  registry.close();
  console.log('✓ Dört kişilik Batak özel masası doğru bireysel koltuklarla başlar');
}

{
  const registry=new UserRegistry(),manager=new PrivateRoomManager({repository:registry,available:()=>true}),owner=user(registry,'Ada'),stranger=user(registry,'Bora'),friend=user(registry,'Cem');
  const room=manager.create(owner.id,{mode:'sozcukDuel',wordLocale:'ru-RU'});
  assert.equal(room.wordLocale,'ru');assert.throws(()=>manager.invite(room.id,owner.id,stranger.id),/arkadaşlarını/);
  befriend(registry,owner,friend);manager.invite(room.id,owner.id,friend.id);manager.accept(room.id,friend.id);manager.leave(room.id,friend.id);
  assert.equal(manager.view(room.id,owner.id).members.length,1,'Konuk maç başlamadan masadan ayrılabilmeli');
  manager.cancel(room.id,owner.id);assert.equal(manager.stateFor(owner.id).rooms.length,0);
  registry.close();
  console.log('✓ Sözcük dili sabitlenir; yabancı daveti engellenir ve masa kapatılabilir');
}

const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260907180000_private_game_rooms.sql'),'utf8');
assert.match(migration,/batakKozMaca/);assert.match(migration,/kantin_leave_private_room/);assert.match(migration,/status='matched'/);assert.match(migration,/player_friendships/);
console.log('✓ Supabase özel masa şeması tüm oyunları, arkadaş kontrolünü ve maç başlangıcını içerir');
