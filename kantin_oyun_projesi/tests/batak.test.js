'use strict';
const assert=require('node:assert/strict');
const{BatakGame,MODE_KOZ_MACA,MODE_GOMMELI,createDeck}=require('../src/batak.js');
const players=['P1','P2','P3','P4'].map(id=>({id,username:id}));
function card(rank,suit){return{id:`${rank}_${suit}`,rank,suit}}
function test(name,fn){try{fn();console.log(`✓ ${name}`)}catch(error){console.error(`✗ ${name}\n${error.stack}`);process.exitCode=1}}

test('Koz Maça 13 kart dağıtır, kozu maçaya sabitler ve tahmin aşamasıyla başlar',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players,deck:createDeck()});assert.equal(game.state.phase,'bidding');assert.equal(game.state.trump,'spades');assert.deepEqual(Object.values(game.getHandCounts()),[13,13,13,13]);assert.equal(game.state.deck.length,0)});

test('Eldeki kartlar renklere ayrılmış ve büyükten küçüğe sabit dizilir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players,deck:createDeck()}),hand=game.getHand('P1'),suits={spades:0,hearts:1,diamonds:2,clubs:3},ranks={A:14,K:13,Q:12,J:11,'10':10,'9':9,'8':8,'7':7,'6':6,'5':5,'4':4,'3':3,'2':2};for(let index=1;index<hand.length;index++){const before=hand[index-1],after=hand[index];assert.ok(suits[before.suit]<suits[after.suit]||suits[before.suit]===suits[after.suit]&&ranks[before.rank]>=ranks[after.rank])}});

test('Koz Maça dört oyuncunun bağımsız tahmini bitince kart oyununa geçer',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.bid('P1',0);game.bid('P2',2);game.bid('P3',4);game.bid('P4',3);assert.equal(game.state.phase,'playing');assert.equal(game.getCurrentPlayer().id,'P1');assert.throws(()=>game.pass('P1'),/tahmin/)});

test('Gömmeli Batak 12 kart ve kapalı dört kartlık gömü dağıtır',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players,deck:createDeck()});assert.equal(game.state.phase,'auction');assert.deepEqual(Object.values(game.getHandCounts()),[12,12,12,12]);assert.equal(game.state.kitty.length,4);const view=game.getStateForPlayer('P1');assert.equal(view.kittyCount,4);assert.equal('kitty' in view,false)});

test('Gömmeli ihale yükselir; kazanan gömüyü alıp dört kart gömer ve koz seçer',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players});game.bid('P1',5);game.pass('P2');game.pass('P3');game.pass('P4');assert.equal(game.state.phase,'bury');assert.equal(game.state.bidder,'P1');assert.equal(game.getHand('P1').length,16);const buried=game.getHand('P1').slice(0,4).map(item=>item.id);game.buryCards('P1',buried);assert.equal(game.getHand('P1').length,12);assert.equal(game.state.phase,'trump');game.selectTrump('P1','hearts');assert.equal(game.state.phase,'playing');assert.equal(game.state.trump,'hearts')});

test('Herkes pas derse mecburcuya ihale 4 kalır',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players});players.forEach(player=>game.pass(player.id));assert.equal(game.state.bidder,'P1');assert.equal(game.state.bidAmount,4);assert.equal(game.state.phase,'bury')});

test('Renge uyan oyuncu mümkünse yükseltmek zorundadır',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.phase='playing';game.state.currentPlayerIndex=0;game.state.leadSuit='hearts';game.state.currentTrick=[{playerId:'P4',card:card('9','hearts')}];game.state.hands.P1=[card('7','hearts'),card('J','hearts'),card('A','clubs')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['J_hearts']);assert.throws(()=>game.playCard('P1','7_hearts'),/aykırı/)});

test('Renk yoksa koz atılır ve mümkünse yerdeki koz yükseltilir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.phase='playing';game.state.currentPlayerIndex=0;game.state.leadSuit='hearts';game.state.currentTrick=[{playerId:'P3',card:card('A','hearts')},{playerId:'P4',card:card('10','spades')}];game.state.hands.P1=[card('5','spades'),card('K','spades'),card('A','clubs')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['K_spades'])});

test('Koz kırılmadan kozla çıkılamaz; elde yalnız koz varsa çıkılabilir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.phase='playing';game.state.currentPlayerIndex=0;game.state.hands.P1=[card('A','spades'),card('2','clubs')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['2_clubs']);game.state.hands.P1=[card('A','spades')];assert.deepEqual(game.legalCards('P1').map(item=>item.id),['A_spades'])});

test('Koz Maça puanlaması eksik, üç fazla ve El Almaz durumlarını uygular',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players});game.state.bids={P1:3,P2:3,P3:2,P4:0};game.state.tricksWon={P1:3,P2:6,P3:1,P4:0};const result=game.finishGame();assert.deepEqual(result.scores,{P1:3,P2:-3,P3:-2,P4:10})});

test('Gömmeli puanlaması ihaleci ve sıfır el alan rakibi batırır',()=>{const game=new BatakGame({mode:MODE_GOMMELI,players});game.state.bidder='P1';game.state.bidAmount=6;game.state.bids.P1=6;game.state.tricksWon={P1:5,P2:4,P3:0,P4:4};const result=game.finishGame();assert.deepEqual(result.scores,{P1:-6,P2:4,P3:-6,P4:4})});

test('Oyuncu durumu yalnız kendi kartlarını içerir',()=>{const game=new BatakGame({mode:MODE_KOZ_MACA,players}),view=game.getStateForPlayer('P1');assert.equal(view.hand.length,13);assert.equal('hands' in view,false);assert.equal('buried' in view,false)});
