'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
global.KANTIN_TURKISH_WORDS=require('../assets/data/turkish-words.json');
require('../src/sozcuk.js');

test('Sözcük Kapışması 15x15 tahta ve yedişer taşla başlar',()=>{
  const g=new SOZCUK.WordClashGame();
  assert.equal(g.state.board.length,15);
  assert.equal(g.state.racks.P1.length,7);
  assert.equal(g.state.racks.P2.length,7);
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

test('dört ardışık pas oyunu bitirip elde kalan puanları düşürür',()=>{
  const g=new SOZCUK.WordClashGame(),before=g.state.racks.P1.reduce((n,t)=>n+t.value,0);
  g.pass('P1');g.pass('P2');g.pass('P1');g.pass('P2');
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
  assert.throws(()=>g.submit('P1'),/Sözlükte bulunmayan sözcük/);
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
  g.unstage('P1',7,7);
  assert.equal(g.getStateForPlayer('P1').yourRack.some(item=>item.id===tile.id),true);
});
