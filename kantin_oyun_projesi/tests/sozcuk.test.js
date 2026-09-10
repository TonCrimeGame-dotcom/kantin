'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
global.KANTIN_TURKISH_WORDS=require('../assets/data/turkish-words.json');
require('../src/sozcuk.js');

test('Sözcük Kapışması 15x15 tahta ve yedişer taşla başlar',()=>{
  const g=new SOZCUK.WordClashGame();
  assert.equal(g.state.board.length,15);
  assert.deepEqual(g.players.map(player=>player.id),['P1','P2','P3','P4']);
  assert.equal(g.state.racks.P1.length,7);
  assert.equal(g.state.racks.P2.length,7);
  assert.equal(g.state.racks.P3.length,7);
  assert.equal(g.state.racks.P4.length,7);
  assert.ok(g.state.bag.length>70);
  assert.equal(Object.values(SOZCUK.LETTERS).reduce((n,[count])=>n+count,0)+2,100);
});

test('yedi harfin tamamı oynanınca 50 puan bonus gelir',()=>{
  const g=new SOZCUK.WordClashGame(),rack=[...g.state.racks.P1];
  [...'MERHABA'].forEach((letter,index)=>Object.assign(rack[index],{letter,value:SOZCUK.LETTERS[letter][1],blank:false}));
  rack.forEach((tile,index)=>g.stage('P1',tile.id,7,4+index));
  const raw=g.validate().reduce((n,w)=>n+g.scoreWord(w),0),result=g.submit('P1');
  assert.equal(result.score,raw+50);
});

test('harf değiştirmek puan getirmez ve sırayı geçirir',()=>{
  const g=new SOZCUK.WordClashGame(),old=g.state.racks.P1[0].id;
  g.exchange('P1',[old]);
  assert.equal(g.current().id,'P2');
  assert.equal(g.state.scores.P1,0);
  assert.equal(g.state.racks.P1.length,7);
});

test('sekiz ardışık pas dört kişilik oyunu bitirip elde kalan puanları düşürür',()=>{
  const g=new SOZCUK.WordClashGame(),before=g.state.racks.P1.reduce((n,t)=>n+t.value,0);
  ['P1','P2','P3','P4','P1','P2','P3','P4'].forEach(id=>g.pass(id));
  assert.equal(g.state.status,'finished');
  assert.equal(g.state.scores.P1,-before);
});

test('ilk sözcük merkezden geçer ve puanlanır',()=>{
  const g=new SOZCUK.WordClashGame(),first=g.state.racks.P1[0],second=g.state.racks.P1[1];
  Object.assign(first,{letter:'E',value:1,blank:false});Object.assign(second,{letter:'L',value:1,blank:false});
  g.stage('P1',first.id,7,7);g.stage('P1',second.id,7,8);
  const result=g.submit('P1');
  assert.ok(result.score>0);
  assert.equal(g.state.board[7][7].letter,first.letter);
  assert.equal(g.current().id,'P2');
});

test('ana veya çapraz sözcük sözlükte yoksa hamle reddedilir',()=>{
  const g=new SOZCUK.WordClashGame(),rack=g.state.racks.P1;
  Object.assign(rack[0],{letter:'J',value:10,blank:false});Object.assign(rack[1],{letter:'J',value:10,blank:false});
  g.stage('P1',rack[0].id,7,7);g.stage('P1',rack[1].id,7,8);
  assert.throws(()=>g.submit('P1'),/geçerli sözcük oluşturmalı/);
});

test('aynı hamlede çapraz konuma taş bırakılamaz',()=>{
  const g=new SOZCUK.WordClashGame(),rack=g.state.racks.P1;
  g.stage('P1',rack[0].id,7,7,rack[0].blank?'A':null);
  assert.throws(()=>g.stage('P1',rack[1].id,8,8,rack[1].blank?'A':null),/Çapraz oynanmaz/);
  assert.equal(g.state.pending.length,1);
});

test('ana kelimeden boşlukla ayrılan taş hamleye sızamaz',()=>{
  const g=new SOZCUK.WordClashGame(),rack=g.state.racks.P1;
  Object.assign(rack[0],{letter:'E',value:1,blank:false});
  Object.assign(rack[1],{letter:'L',value:1,blank:false});
  Object.assign(rack[2],{letter:'A',value:1,blank:false});
  g.stage('P1',rack[0].id,7,7);g.stage('P1',rack[1].id,7,8);g.stage('P1',rack[2].id,7,10);
  assert.throws(()=>g.submit('P1'),/boşluk bırakılamaz/);
});

test('günlük kullanım sözlüğündeki TİREN kabul edilir',()=>{
  const g=new SOZCUK.WordClashGame(),rack=g.state.racks.P1,letters=[...'TİREN'];
  letters.forEach((letter,index)=>Object.assign(rack[index],{letter,value:SOZCUK.LETTERS[letter][1],blank:false}));
  letters.forEach((letter,index)=>g.stage('P1',rack[index].id,7,5+index));
  assert.doesNotThrow(()=>g.submit('P1'));
});

test('aynı sözcük tek hamlede iki kez puanlanmaz',()=>{
  const g=new SOZCUK.WordClashGame(),rack=g.state.racks.P1;
  Object.assign(rack[0],{letter:'E',value:1,blank:false});Object.assign(rack[1],{letter:'L',value:1,blank:false});
  g.stage('P1',rack[0].id,7,7);g.stage('P1',rack[1].id,7,8);
  const result=g.submit('P1');
  assert.deepEqual(result.words,['EL']);
});

test('sırası olmayan oyuncu taş koyamaz',()=>{
  const g=new SOZCUK.WordClashGame();
  assert.throws(()=>g.stage('P2',g.state.racks.P2[0].id,7,7),/Sıra sende değil/);
});

test('tahtaya geçici konan harf ıstakada ikinci kez görünmez',()=>{
  const g=new SOZCUK.WordClashGame(),tile=g.state.racks.P1[0];
  g.stage('P1',tile.id,7,7,tile.blank?'A':null);
  assert.equal(g.getStateForPlayer('P1').yourRack.some(item=>item.id===tile.id),false);
  assert.equal(g.getStateForPlayer('P1').yourRack.length,6);
  assert.equal(g.getStateForPlayer('P1').yourRackSlots.length,7);
  assert.equal(g.getStateForPlayer('P1').yourRackSlots[6],null);
  g.unstage('P1',7,7);
  assert.equal(g.getStateForPlayer('P1').yourRack.some(item=>item.id===tile.id),true);
  assert.equal(g.getStateForPlayer('P1').yourRackSlots[0].id,tile.id);
});

test('tek harf eklemesi yalnız yatay ve dikey kelimeleri tarar',()=>{
 const g=new SOZCUK.WordClashGame({dictionary:['EL','AL']});
 g.state.board[7][6]={id:'old-e',letter:'E',value:1};
 g.state.board[6][7]={id:'old-a',letter:'A',value:1};
 const tile=g.state.racks.P1[0];Object.assign(tile,{letter:'L',value:1,blank:false});
 g.stage('P1',tile.id,7,7);
 assert.deepEqual(g.submit('P1').words,['EL','AL']);
 assert.throws(()=>g.wordAt(7,7,1,1),/yatay veya dikey/);
});

test('Arapça yatay sağdan sola, dikey yukarıdan aşağı okunur',()=>{
 for(const vertical of [false,true]){
  const g=new SOZCUK.WordClashGame({language:'ar',dictionary:['باب']});
  const letters=['ب','ا','ب'];
  letters.forEach((letter,i)=>{const tile=g.state.racks.P1[i];Object.assign(tile,{letter,value:1,blank:false});g.stage('P1',tile.id,vertical?6+i:7,vertical?7:8-i)});
  const cells=g.validate()[0];
  assert.deepEqual(cells.map(c=>[c.row,c.col]),vertical?[[6,7],[7,7],[8,7]]:[[7,8],[7,7],[7,6]]);
  assert.deepEqual(g.submit('P1').words,['باب']);
 }
});

test('Arapça çapraz taş yerleşimi de reddedilir',()=>{
 const g=new SOZCUK.WordClashGame({language:'ar'});
 const [a,b]=g.state.racks.P1;Object.assign(a,{letter:'ب',blank:false});Object.assign(b,{letter:'ا',blank:false});
 g.stage('P1',a.id,7,7);assert.throws(()=>g.stage('P1',b.id,8,8),/Çapraz/);
});
