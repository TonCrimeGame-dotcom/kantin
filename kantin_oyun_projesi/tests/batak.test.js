'use strict';
const assert=require('node:assert/strict');
const{BatakGame,MODE_KOZ_MACA,MODE_GOMMELI,createDeck}=require('../src/batak.js');
const players=['P1','P2','P3','P4'].map(id=>({id,username:id}));
function card(rank,suit){return{id:`${rank}_${suit}`,rank,suit}}
function test(name,fn){try{fn();console.log(`✓ ${name}`)}catch(error){console.error(`✗ ${name}\n${error.stack}`);process.exitCode=1}}

test('Koz Maça 13 kart dağıtır, kozu maçaya sabitler ve tahmin aşamasıyla başlar',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players,deck:createDeck()});assert.equal(game.state.phase,'bidding');assert.equal(game.state.trump,'spades');assert.deepEqual(Object.values(game.getHandCounts()),[13,13,13,13]);assert.equal(game.state.deck.length,0)});

test('Eldeki kartlar renklere ayrılmış ve büyükten küçüğe sabit dizilir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players,deck:createDeck()}),hand=game.getHand('P1'),suits={spades:0,hearts:1,clubs:2,diamonds:3},ranks={A:14,K:13,Q:12,J:11,'10':10,'9':9,'8':8,'7':7,'6':6,'5':5,'4':4,'3':3,'2':2};for(let index=1;index<hand.length;index++){const before=hand[index-1],after=hand[index];assert.ok(suits[before.suit]<suits[after.suit]||suits[before.suit]===suits[after.suit]&&ranks[before.rank]>=ranks[after.rank])}});

test('Koz Maça dört oyuncunun bağımsız tahmini bitince kart oyununa geçer',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.bid('P1',0);game.bid('P2',2);game.bid('P3',4);game.bid('P4',3);assert.equal(game.state.phase,'playing');assert.equal(game.getCurrentPlayer().id,'P1');assert.throws(()=>game.pass('P1'),/tahmin/)});

test('Tamamlanan dört kartlık el, sonraki kart oynanana kadar masada tutulur',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.phase='playing';game.state.currentPlayerIndex=0;game.state.hands={P1:[card('2','clubs')],P2:[card('3','clubs')],P3:[card('A','clubs')],P4:[card('4','clubs')]};game.playCard('P1','2_clubs');game.playCard('P2','3_clubs');game.playCard('P3','A_clubs');game.playCard('P4','4_clubs');const state=game.getPublicState();assert.equal(state.currentTrick.length,0);assert.equal(state.lastTrick.length,4);assert.equal(state.lastTrickWinnerId,'P3');assert.equal(state.tricksWon.P3,1);assert.equal(state.moveNumber,4)});

test('Gömmeli Batak 16 kart ve kapalı dört kartlık gömü dağıtır',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players:players.slice(0,3),deck:createDeck()});assert.equal(game.state.phase,'auction');assert.deepEqual(Object.values(game.getHandCounts()),[16,16,16]);assert.equal(game.state.kitty.length,4);const view=game.getStateForPlayer('P1');assert.equal(view.kittyCount,4);assert.equal('kitty' in view,false)});

test('Gömmeli ihale yükselir; kazanan önce koz seçer, gömüyü alır ve dört kart gömer',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players:players.slice(0,3)});game.bid('P1',5);game.pass('P2');game.pass('P3');assert.equal(game.state.phase,'trump');assert.equal(game.getHand('P1').length,16);game.selectTrump('P1','hearts');assert.equal(game.state.phase,'bury');assert.equal(game.state.bidder,'P1');assert.equal(game.getHand('P1').length,16);const buried=game.getHand('P1').slice(0,4).map(item=>item.id);game.buryCards('P1',buried);assert.equal(game.getHand('P1').length,16);assert.equal(game.state.phase,'playing');assert.equal(game.state.trump,'hearts')});

test('Herkes pas derse mecburcuya ihale 4 kalır',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players:players.slice(0,3)});players.slice(0,3).forEach(player=>game.pass(player.id));assert.equal(game.state.bidder,'P1');assert.equal(game.state.bidAmount,4);assert.equal(game.state.phase,'trump')});

test('Renge uyan oyuncu mümkünse yükseltmek zorundadır',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.phase='playing';game.state.currentPlayerIndex=0;game.state.leadSuit='hearts';game.state.currentTrick=[{playerId:'P4',card:card('9','hearts')}];game.state.hands.P1=[card('7','hearts'),card('J','hearts'),card('A','clubs')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['J_hearts']);assert.throws(()=>game.playCard('P1','7_hearts'),/aykırı/)});

test('Renk yoksa koz atılır ve mümkünse yerdeki koz yükseltilir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.phase='playing';game.state.currentPlayerIndex=0;game.state.leadSuit='hearts';game.state.currentTrick=[{playerId:'P3',card:card('A','hearts')},{playerId:'P4',card:card('10','spades')}];game.state.hands.P1=[card('5','spades'),card('K','spades'),card('A','clubs')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['K_spades'])});

test('Koz kırılmadan kozla çıkılamaz; elde yalnız koz varsa çıkılabilir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.phase='playing';game.state.currentPlayerIndex=0;game.state.hands.P1=[card('A','spades'),card('2','clubs')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['2_clubs']);game.state.hands.P1=[card('A','spades')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['A_spades'])});

test('Koz Maça puanlaması eksik, üç fazla ve El Almaz durumlarını uygular',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.bids={P1:3,P2:3,P3:2,P4:0};game.state.tricksWon={P1:3,P2:6,P3:1,P4:0};const result=game.finishGame();assert.deepEqual(result.scores,{P1:3,P2:-3,P3:-2,P4:10})});

test('Gömmeli puanlaması ihaleci ve sıfır el alan rakibi batırır',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players:players.slice(0,3)});game.state.bidder='P1';game.state.bidAmount=6;game.state.bids.P1=6;game.state.tricksWon={P1:5,P2:11,P3:0};const result=game.finishGame();assert.deepEqual(result.scores,{P1:-6,P2:11,P3:-6})});

test('Oyuncu durumu yalnız kendi kartlarını içerir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players}),view=game.getStateForPlayer('P1');assert.equal(view.hand.length,13);assert.equal('hands' in view,false);assert.equal('buried' in view,false)});

test('Gömmeli üç oyuncuyla 16 eli bitirir; alınan kartlar açık, gömülenler gizlidir',()=>{
 const game=new BatakGame({mode:MODE_GOMMELI});
 assert.throws(()=>new BatakGame({mode:MODE_GOMMELI,players}),/3 oyuncu/);
 assert.deepEqual(game.getPublicState().revealedKitty,[]);
 game.bid('P1',16);
 assert.equal(game.state.phase,'trump');
 assert.throws(()=>game.buryCards('P1',game.getHand('P1').slice(0,4).map(c=>c.id)),/şu anda/);
 const kitty=structuredClone(game.state.kitty);
 game.selectTrump('P1','clubs');
 for(const p of game.players)assert.deepEqual(game.getStateForPlayer(p.id).revealedKitty,kitty);
 game.buryCards('P1',game.getHand('P1').slice(0,4).map(c=>c.id));
 assert.equal('buried' in game.getStateForPlayer('P2'),false);
 for(let n=0;n<48;n++){const id=game.getCurrentPlayer().id;game.playCard(id,game.legalCards(id)[0].id)}
 assert.equal(game.state.status,'finished');assert.equal(game.state.trickNumber,16);
 assert.equal(Object.values(game.state.tricksWon).reduce((a,b)=>a+b),16);
 assert.equal(game.state.lastTrick.length,3);
});

test('Gömmeli koz kırılmadan kozla çıkabilir; renge uyma zorunluluğu sürer',()=>{
 const game=new BatakGame({mode:MODE_GOMMELI});
 game.bid('P1',16);game.selectTrump('P1','hearts');
 game.buryCards('P1',game.getHand('P1').slice(0,4).map(c=>c.id));
 game.state.hands.P1=[card('A','hearts'),card('2','clubs')];
 assert.equal(game.state.trumpBroken,false);
 assert.deepEqual(game.getStateForPlayer('P1').legalCardIds,['A_hearts','2_clubs']);
 game.playCard('P1','A_hearts');
 assert.equal(game.state.currentTrick[0].card.id,'A_hearts');
 game.state.hands.P2=[card('2','hearts'),card('A','clubs')];
 assert.deepEqual(game.legalCards('P2').map(c=>c.id),['2_hearts']);
 assert.throws(()=>game.playCard('P2','A_clubs'),/aykırı/);
});

test('Koz Maça açarın iki fazlasına kadar kabul eder, üç ve üzeri fazlada batırır',()=>{
 for(let bid=1;bid<=13;bid++)for(let won=0;won<=13;won++){
  const game=new BatakGame({mode:MODE_KOZ_MACA,players});
  game.state.bids={P1:bid,P2:0,P3:0,P4:0};
  game.state.tricksWon={P1:won,P2:13-won,P3:0,P4:0};
  const expected=won<bid||won-bid>=3?-bid:won;
  assert.equal(game.finishGame().scores.P1,expected,`${bid} dedi, ${won} aldı`);
 }
});

test('Gömmeli açık dört kart yalnız gömme onayında seçilen dört kartla takas edilir',()=>{
 const game=new BatakGame({mode:MODE_GOMMELI,players:players.slice(0,3)});
 const original=game.getHand('P1'),kitty=game.state.kitty.map(c=>c.id);
 game.bid('P1',16);game.selectTrump('P1','spades');
 assert.deepEqual(game.getHand('P1'),original);
 const removed=original.slice(0,4).map(c=>c.id);
 game.buryCards('P1',removed);
 const ids=game.getHand('P1').map(c=>c.id);
 assert.equal(ids.length,16);
 for(const id of kitty)assert.ok(ids.includes(id));
 for(const id of removed)assert.ok(!ids.includes(id));
 assert.equal(new Set([...Object.values(game.state.hands).flat(),...game.state.buried].map(c=>c.id)).size,52);
 for(const player of game.players)assert.equal(game.getStateForPlayer(player.id).buried,undefined);
});
test('Bütün Batak elleri maça kupa sinek karo sırasındadır',()=>{
 for(const mode of [MODE_KOZ_MACA,MODE_GOMMELI]){
 const game=new BatakGame({mode});
 const order=['spades','hearts','clubs','diamonds'];
 for(const p of game.players){const hand=game.getHand(p.id);for(let i=1;i<hand.length;i++)assert.ok(order.indexOf(hand[i-1].suit)<=order.indexOf(hand[i].suit));}
 }
});
