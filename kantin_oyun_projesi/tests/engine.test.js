'use strict';
const assert = require('node:assert/strict');
require('../src/spvp.js');
require('../src/upvp.js');
require('../src/pisti.js');
require('../src/okey101.js');

function test(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`); }
  catch (error) { process.stderr.write(`✗ ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

let okeyTestTileSerial = 1000;
function okeyTile(color, number, copy = 1) {
  return {
    id: `TEST-${okeyTestTileSerial++}`,
    color,
    number,
    copy,
    isFalseJoker: false
  };
}

function setTestOkey(game, color = 'red', indicatorNumber = 4) {
  game.state.indicator = okeyTile(color, indicatorNumber);
  game.state.okey = {
    color,
    number: indicatorNumber === 13 ? 1 : indicatorNumber + 1
  };
}

function falseJoker(copy = 1) {
  return {
    id: `TEST-${okeyTestTileSerial++}`,
    color: null,
    number: null,
    copy,
    isFalseJoker: true
  };
}

function makePairs(count, color = 'yellow') {
  const tiles = [];
  const groups = [];
  for (let index = 0; index < count; index++) {
    const number = (index % 13) + 1;
    const pair = [okeyTile(color, number, 1), okeyTile(color, number, 2)];
    tiles.push(...pair);
    groups.push(pair.map(tile => tile.id));
  }
  return { tiles, groups };
}

test('Standart tavla 24 hane ve 15’er pul ile başlar', () => {
  const game = new SPVP.StandardBackgammonPvP();
  const state = game.getState();
  assert.equal(state.points.length, 24);
  assert.equal(game.countCheckers(SPVP.WHITE).total, 15);
  assert.equal(game.countCheckers(SPVP.BLACK).total, 15);
});

test('Başlangıçta büyük tek zarı atan oyuncu başlar', () => {
  const game = new SPVP.StandardBackgammonPvP();
  game.submitOpeningRoll(SPVP.WHITE, 2);
  game.submitOpeningRoll(SPVP.BLACK, 5);
  const state = game.getState();
  assert.equal(state.openingComplete, true);
  assert.equal(state.turn, SPVP.BLACK);
  assert.deepEqual(state.dice, [2, 5]);
});

test('Katlama hakkı başlangıç kazananından kabul eden rakibe geçer', () => {
  const game = new SPVP.StandardBackgammonPvP();
  game.submitOpeningRoll(SPVP.WHITE, 6);
  game.submitOpeningRoll(SPVP.BLACK, 2);
  assert.equal(game.canOfferDouble(SPVP.WHITE), true);
  assert.equal(game.canOfferDouble(SPVP.BLACK), false);
  game.offerDouble(SPVP.WHITE);
  assert.deepEqual(game.getState().pendingDouble, { from: SPVP.WHITE, to: SPVP.BLACK, proposedValue: 2 });
  game.acceptDouble(SPVP.BLACK);
  assert.equal(game.getState().cubeValue, 2);
  assert.equal(game.getState().cubeOwner, SPVP.BLACK);
  game.endTurn({ reason: 'double-test' });
  assert.equal(game.canOfferDouble(SPVP.BLACK), true);
});

test('Katlamayı reddeden oyuncu mevcut bahis değeriyle hükmen kaybeder', () => {
  const game = new SPVP.StandardBackgammonPvP();
  game.submitOpeningRoll(SPVP.WHITE, 6);
  game.submitOpeningRoll(SPVP.BLACK, 2);
  game.offerDouble(SPVP.WHITE);
  game.declineDouble(SPVP.BLACK);
  const result = game.getGameResult();
  assert.equal(game.getState().status, 'finished');
  assert.equal(result.winner, SPVP.WHITE);
  assert.equal(result.reason, 'double-declined');
  assert.equal(result.points, 1);
});

test('İkinci 20 saniye ihlali hükmen mağlubiyet durumuna çevrilebilir', () => {
  const game = new SPVP.StandardBackgammonPvP();
  assert.equal(game.registerTimeout(SPVP.WHITE), 1);
  assert.equal(game.registerTimeout(SPVP.WHITE), 2);
  game.finishForfeit(SPVP.BLACK, SPVP.WHITE, 'timeout-forfeit');
  const result = game.getGameResult();
  assert.equal(result.winner, SPVP.BLACK);
  assert.equal(result.reason, 'timeout-forfeit');
});

test('Farklı zarlar oynanabildiğinde oyuncu istediği sıradan başlayabilir', () => {
  const game = new SPVP.StandardBackgammonPvP();
  game.setDice(1, 2);
  assert.deepEqual(new Set(game.getLegalMoves().map(move => move.die)), new Set([1, 2]));
});

test('İki zar ara hane açıksa tek toplam hamlede kullanılabilir', () => {
  const game = new SPVP.StandardBackgammonPvP();
  game.setDice(1, 2);
  const combined = game.getCombinedMoves()[0];
  assert.ok(combined, 'Toplam zarla yapılabilen bir hamle bulunmalı');
  game.moveCombined(combined.from, combined.to);
  assert.deepEqual(game.getState().remainingDice, []);
});

test('Tüm pullar evdeyken pul yan cebe toplanabilir', () => {
  const game = new SPVP.StandardBackgammonPvP();
  const state = game.getState();
  state.points = Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));
  state.points[0] = { owner: SPVP.WHITE, count: 1 };
  state.off = { white: 14, black: 15 };
  state.bar = { white: 0, black: 0 };
  state.turn = SPVP.WHITE;
  state.dice = [1, 2];
  state.remainingDice = [1, 2];
  state.openingComplete = true;
  game.loadState(state);
  assert.ok(game.getLegalMoves().some(move => move.from === 0 && move.to === 'off'));
  game.move(0, 'off');
  assert.equal(game.getState().off.white, 15);
});

test('Çift zar dört hamle üretir ve zar yüzleri 1–6 ile sınırlıdır', () => {
  const game = new SPVP.StandardBackgammonPvP();
  game.setDice(3, 3);
  assert.deepEqual(game.getState().remainingDice, [3, 3, 3, 3]);
  assert.throws(() => new SPVP.StandardBackgammonPvP().setDice(7, 2), /1-6/);
});

test('Standart tavlada zarlar tamamlanınca sıra rakibe geçer', () => {
  const game = new SPVP.StandardBackgammonPvP();
  game.setDice(1, 2);
  let guard = 8;
  while (game.getState().turn === SPVP.WHITE && guard-- > 0) {
    const move = game.getLegalTurnSequences()[0]?.[0];
    assert.ok(move, 'Beyaz için legal hamle bulunmalı');
    game.move(move.from, move.to, move.die);
  }
  assert.equal(game.getState().turn, SPVP.BLACK);
  assert.deepEqual(game.getState().remainingDice, []);
});

test('Kırılan tavla pulu bara gider ve bardan yeniden oyuna girer', () => {
  const game = new SPVP.StandardBackgammonPvP();
  const state = game.getState();
  state.points = Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));
  state.points[6] = { owner: SPVP.WHITE, count: 1 };
  state.points[23] = { owner: SPVP.WHITE, count: 14 };
  state.points[5] = { owner: SPVP.BLACK, count: 1 };
  state.points[0] = { owner: SPVP.BLACK, count: 14 };
  state.bar = { white: 0, black: 0 };
  state.off = { white: 0, black: 0 };
  state.turn = SPVP.WHITE;
  state.dice = [];
  state.remainingDice = [];
  game.loadState(state);

  game.setDice(1, 2);
  game.move(6, 5, 1);
  assert.equal(game.getState().bar.black, 1);
  assert.deepEqual(game.getState().points[5], { owner: SPVP.WHITE, count: 1 });

  game.endTurn({ reason: 'capture-test' });
  game.setDice(1, 2);
  assert.ok(game.getLegalMoves().every(move => move.from === 'bar'));
  game.move('bar', 0, 1);
  assert.equal(game.getState().bar.black, 0);
  assert.deepEqual(game.getState().points[0], { owner: SPVP.BLACK, count: 15 });
});

test('Üniversite Tavlası aynı zarı iki bağımsız tahtaya yollar', () => {
  const game = new UPVP.UniversityBackgammonPvP();
  game.setSharedDice(5, 3, 'A1', 'test-roll');
  assert.deepEqual(game.boards.board1.state.dice, [5, 3]);
  assert.deepEqual(game.boards.board2.state.dice, [5, 3]);
  assert.equal(game.match.sharedRollId, 'test-roll');
});

test('Üniversite overlay görünümü ana ve eş tahtasını 24 hane döndürür', () => {
  const view = new UPVP.UniversityBackgammonPvP().getOverlayView('A1');
  assert.equal(view.mainBoard.points.length, 24);
  assert.equal(view.partnerBoard.points.length, 24);
  assert.equal(view.partner.id, 'A2');
});

test('Pişti 52 benzersiz kart kullanır ve oyuncuya yalnız kendi elini açar', () => {
  const game = new PISTI.TeamPisti();
  const full = game.getFullState();
  const cards = [...full.deck, ...full.table, ...Object.values(full.hands).flat()];
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map(c => c.id)).size, 52);
  const client = game.getStateForPlayer('A1');
  assert.equal(client.yourHand.length, 4);
  assert.equal('hands' in client, false);
});

test('Pişti eşli oturma sırası A-B-A-B şeklindedir', () => {
  const teams = new PISTI.TeamPisti().players.map(p => p.team);
  assert.deepEqual(teams, ['teamA', 'teamB', 'teamA', 'teamB']);
});

test('Pişti sıra dışı ve art arda kart atışını reddeder', () => {
  const game = new PISTI.SoloPisti();
  const wrongPlayer = game.players[1].id;
  const wrongCard = game.state.hands[wrongPlayer][0];
  const before = game.state.hands[wrongPlayer].length;
  assert.equal(game.canPlay(wrongPlayer, wrongCard.id), false);
  assert.throws(() => game.playCard(wrongPlayer, wrongCard.id), /Sıra/);
  assert.equal(game.state.hands[wrongPlayer].length, before);
});

test('Pişti blöf kararı beklerken yeni kart oynatmaz', () => {
  const game = new PISTI.SoloPisti();
  const base = { id: '7_hearts', rank: '7', suit: 'hearts' };
  const claim = game.state.hands.P2[0];
  game.state.table = [base];
  game.state.playedCards = [{ playerId: 'P1', card: base, moveNumber: 1 }];
  game.state.currentPlayerIndex = 1;
  game.declareBluff('P2', claim.id);
  const responderCard = game.state.hands.P1[0];
  game.state.currentPlayerIndex = 0;
  assert.equal(game.canPlay('P1', responderCard.id), false);
  assert.throws(() => game.playCard('P1', responderCard.id), /blöf kararı/);
});

test('Vale yalnız tek Valeyi alınca 20 puanlık Vale piştisi yapar', () => {
  const ordinary = new PISTI.SoloPisti();
  ordinary.state.table = [{ id: 'Q_hearts', rank: 'Q', suit: 'hearts' }];
  ordinary.state.hands.P1 = [{ id: 'J_spades', rank: 'J', suit: 'spades' }];
  const ordinaryEvent = ordinary.playCard('P1', 'J_spades');
  assert.equal(ordinaryEvent.captured, true);
  assert.equal(ordinaryEvent.pisti, false);

  const double = new PISTI.SoloPisti();
  double.state.table = [{ id: 'J_hearts', rank: 'J', suit: 'hearts' }];
  double.state.hands.P1 = [{ id: 'J_spades', rank: 'J', suit: 'spades' }];
  const doubleEvent = double.playCard('P1', 'J_spades');
  assert.equal(doubleEvent.pisti, true);
  assert.equal(doubleEvent.pistiType, 'jack');
  assert.equal(double.scorePistis(double.state.pistis.P1), 20);
});

test('Blöflü Pişti kapalı kartı rakip state’ine sızdırmaz', () => {
  const game = new PISTI.SoloPisti();
  const base = { id: '7_hearts', rank: '7', suit: 'hearts' };
  const claim = { id: '7_spades', rank: '7', suit: 'spades' };
  game.state.table = [base];
  game.state.playedCards = [{ playerId: 'P1', card: base, moveNumber: 1 }];
  game.state.currentPlayerIndex = 1;
  game.state.hands.P2 = [claim];
  game.declareBluff('P2', claim.id);
  const responder = game.getStateForPlayer('P1');
  assert.equal(responder.pendingBluff.claimantId, 'P2');
  assert.equal(responder.topTableCard.id, base.id);
  assert.equal(responder.yourBluffCard, null);
  assert.equal(JSON.stringify(responder).includes(claim.id), false);
});

test('Blöf kabul edilirse 10, doğru açılırsa 20, yakalanırsa rakibe 10 puan yazar', () => {
  const setup = claim => {
    const game = new PISTI.SoloPisti();
    const base = { id: '7_hearts', rank: '7', suit: 'hearts' };
    game.state.table = [base];
    game.state.playedCards = [{ playerId: 'P1', card: base, moveNumber: 1 }];
    game.state.currentPlayerIndex = 1;
    game.state.hands.P2 = [claim];
    game.declareBluff('P2', claim.id);
    return game;
  };
  const trueClaim = setup({ id: '7_spades', rank: '7', suit: 'spades' });
  const proved = trueClaim.resolveBluff('P1', false);
  assert.equal(proved.awardedPoints, 20);
  assert.equal(trueClaim.state.pistis.P2[0].points, 20);
  const falseClaim = setup({ id: '9_spades', rank: '9', suit: 'spades' });
  const caught = falseClaim.resolveBluff('P1', false);
  assert.equal(caught.awardedPoints, 10);
  assert.equal(falseClaim.state.bluffBonus.P1, 10);
  assert.equal(falseClaim.state.table.length, 2);
  const believedClaim = setup({ id: '9_diamonds', rank: '9', suit: 'diamonds' });
  const believed = believedClaim.resolveBluff('P1', true);
  assert.equal(believed.awardedPoints, 10);
  assert.equal(believedClaim.state.pistis.P2[0].points, 10);
});

test('101 seti 106 benzersiz taş, 22/21 başlangıç dağılımı üretir', () => {
  const game = new OKEY101.Solo101Okey();
  const full = game.getFullState();
  const all = [...full.stock, ...full.discardPile, ...Object.values(full.hands).flat(), full.indicator];
  assert.equal(all.length, 106);
  assert.equal(new Set(all.map(t => t.id)).size, 106);
  assert.deepEqual(game.players.map(p => full.hands[p.id].length), [22, 21, 21, 21]);
});

test('101 istemci durumu rakip ellerini sızdırmaz', () => {
  const game = new OKEY101.Team101Okey();
  const state = game.getStateForPlayer('A1');
  assert.equal(state.yourHand.length, 22);
  assert.equal('hands' in state, false);
  assert.deepEqual(state.handCounts, { A1: 22, B1: 21, A2: 21, B2: 21 });
  assert.equal(state.rackTotal, game.handPenalty('A1'));
});

test('101 atılan taşları oyuncunun masa yönünde ayrı tutar', () => {
  const game = new OKEY101.Solo101Okey();
  const tile = game.getFullState().hands.P1[0];
  game.discard('P1', tile.id);
  assert.equal(game.getStateForPlayer('P2').discardsByPlayer.P1.at(-1).id, tile.id);
  game.takeDiscard('P2');
  assert.equal(game.getStateForPlayer('P2').discardsByPlayer.P1.length, 0);
});

test('101 katlamalı açılış hedefi masadaki en yüksek açılıştan bir fazladır', () => {
  const game = new OKEY101.Solo101Okey();
  assert.equal(game.openingTarget(), 101);
  game.state.openingScores.P2 = 101;
  assert.equal(game.openingTarget(), 102);
  game.state.openingScores.P3 = 118;
  assert.equal(game.getStateForPlayer('P1').openingTarget, 119);
});

test('101 ıstaka sayacı yalnız birbiriyle çakışmayan geçerli perleri toplar', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  game.state.hands.P1 = [
    okeyTile('blue', 3),
    okeyTile('blue', 4),
    okeyTile('blue', 5),
    okeyTile('red', 10),
    okeyTile('black', 10),
    okeyTile('yellow', 10),
    okeyTile('black', 1)
  ];
  const state = game.getStateForPlayer('P1');
  assert.equal(state.openingPotential, 42);
  assert.equal(state.pairPotential, 0);
});

test('Sahte okey gerçek okeyin renk ve sayısıyla normal taş sayılır', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game, 'red', 4);
  const fake = falseJoker();
  game.state.hands.P1 = [
    okeyTile('red', 4),
    fake,
    okeyTile('red', 6),
    okeyTile('black', 1)
  ];
  assert.deepEqual(
    { color: game.resolveTile(fake).color, number: game.resolveTile(fake).number },
    { color: 'red', number: 5 }
  );
  assert.equal(game.openingPotential('P1').points, 15);
  assert.equal(game.tileHandValue(fake), 5);
  assert.equal(
    game.getStateForPlayer('P1').openingGroups.flat().includes(fake.id),
    true
  );
});

test('Sahte okey seri açıldıktan sonra yeni grupta kullanılabilir', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game, 'blue', 5);
  const fake = falseJoker();
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.phase = 'play';
  game.state.hands.P1 = [
    okeyTile('black', 6),
    fake,
    okeyTile('yellow', 6),
    okeyTile('red', 2)
  ];
  const result = game.autoOpenMelds('P1');
  assert.equal(result.type, 'melds-added');
  assert.equal(game.state.tableMelds.P1[0].tiles.some(tile => tile.id === fake.id), true);
  assert.equal(game.state.hands.P1.length, 1);
});

test('Gerçek okey istenen seri ve çifti joker olarak tamamlar', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game, 'red', 4);
  const joker = okeyTile('red', 5);
  assert.equal(
    game.validateRun([okeyTile('blue', 3), joker, okeyTile('blue', 5)]).valid,
    true
  );
  assert.equal(game.validatePair(joker, okeyTile('yellow', 8)), true);
});

test('101 masa sırası P1 → P2 ilerler', () => {
  const game = new OKEY101.Solo101Okey();
  const tile = game.state.hands.P1[0];
  game.discard('P1', tile.id);
  assert.equal(game.getCurrentPlayer().id, 'P2');
});

test('101 yeni elde başlama hakkını P2 oyuncusuna geçirir', () => {
  const game = new OKEY101.Solo101Okey();
  game.state.status = 'finished';
  const state = game.startNextRound();
  assert.equal(state.currentPlayer.id, 'P2');
  assert.deepEqual(game.players.map(p => game.state.hands[p.id].length), [21, 22, 21, 21]);
});

test('Katlamalı seri ve çift barajları birbirinden bağımsız ilerler', () => {
  const game = new OKEY101.Solo101Okey();
  game.state.openingScores.P2 = 116;
  game.state.pairOpeningCounts.P3 = 5;
  assert.equal(game.openingTarget(), 117);
  assert.equal(game.pairOpeningTarget(), 6);
});

test('Katlamalı çift açılışı önceki çiftten bir fazla ister', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const pairs = makePairs(6);
  game.state.pairOpeningCounts.P2 = 5;
  game.state.hands.P1 = [...pairs.tiles, okeyTile('black', 13)];
  game.state.phase = 'play';
  const result = game.openPairs('P1', pairs.groups);
  assert.equal(result.pairCount, 6);
  assert.equal(game.state.pairOpeningCounts.P1, 6);
  assert.equal(game.state.openingScores.P1, 0);
});

test('Eksik katlamalı çift açma girişimi 101 ceza yazar', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const pairs = makePairs(5);
  game.state.pairOpeningCounts.P2 = 5;
  game.state.hands.P1 = [...pairs.tiles, okeyTile('black', 13)];
  game.state.phase = 'play';
  assert.throws(() => game.openPairs('P1', pairs.groups), /en az 6 çift/);
  assert.equal(game.state.penalties.P1, 101);
});

test('Seri açmış oyuncu sonraki turda barajsız yeni per koyabilir', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const run = [okeyTile('blue', 1), okeyTile('blue', 2), okeyTile('blue', 3)];
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.hands.P1 = [...run, okeyTile('yellow', 9)];
  game.state.phase = 'play';
  const result = game.openMelds('P1', [run.map(tile => tile.id)]);
  assert.equal(result.type, 'melds-added');
  assert.equal(game.state.tableMelds.P1.length, 1);
});

test('Seri açan oyuncu masadaki çift alanına yeni çift işleyebilir', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const existing = [okeyTile('yellow', 3, 1), okeyTile('yellow', 3, 2)];
  const added = [okeyTile('blue', 7, 1), okeyTile('blue', 7, 2)];
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.phase = 'play';
  game.state.hands.P1 = [...added, okeyTile('black', 13)];
  game.state.tableMelds.P2 = [{ id: 'PAIR-1', ownerPlayerId: 'P2', type: 'pair', tiles: existing }];
  game.addToMeld('P1', 'P2', 'PAIR-1', added.map(tile => tile.id));
  assert.equal(game.state.tableMelds.P2[0].tiles.length, 4);
});

test('Taş işle komutu masadaki çift alanına uygun çifti otomatik işler', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const existing = [okeyTile('yellow', 3, 1), okeyTile('yellow', 3, 2)];
  const added = [okeyTile('blue', 7, 1), okeyTile('blue', 7, 2)];
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.phase = 'play';
  game.state.hands.P1 = [...added, okeyTile('black', 13)];
  game.state.tableMelds.P2 = [{ id: 'PAIR-AUTO', ownerPlayerId: 'P2', type: 'pair', tiles: existing }];
  const result = game.autoLayoff('P1');
  assert.equal(result.count, 2);
  assert.equal(game.state.tableMelds.P2[0].tiles.length, 4);
});

test('Çift açan oyuncu serilere bir turda en fazla iki taş işler', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const run = [okeyTile('blue', 4), okeyTile('blue', 5), okeyTile('blue', 6)];
  const added = [okeyTile('blue', 7), okeyTile('blue', 8), okeyTile('blue', 9)];
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'pairs';
  game.state.phase = 'play';
  game.state.hands.P1 = [...added, okeyTile('yellow', 13)];
  game.state.tableMelds.P2 = [{ id: 'RUN-1', ownerPlayerId: 'P2', type: 'run', tiles: run }];
  game.addToMeld('P1', 'P2', 'RUN-1', added.slice(0, 2).map(tile => tile.id));
  assert.throws(
    () => game.addToMeld('P1', 'P2', 'RUN-1', [added[2].id]),
    /en fazla 2 taş/
  );
});

test('Açmış oyuncu gerçek karşılığını koyarak masadaki okeyi alır', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game, 'red', 4); // gerçek okey kırmızı 5
  const okey = okeyTile('red', 5);
  const replacement = okeyTile('blue', 7);
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.phase = 'play';
  game.state.hands.P1 = [replacement, okeyTile('yellow', 13)];
  game.state.tableMelds.P2 = [{
    id: 'OKEY-RUN',
    ownerPlayerId: 'P2',
    type: 'run',
    tiles: [okeyTile('blue', 6), okey, okeyTile('blue', 8)]
  }];
  const result = game.addToMeld('P1', 'P2', 'OKEY-RUN', [replacement.id]);
  assert.equal(result.okey.id, okey.id);
  assert.ok(game.state.hands.P1.some(tile => tile.id === okey.id));
  assert.ok(game.state.tableMelds.P2[0].tiles.some(tile => tile.id === replacement.id));
});

test('Normal 101 puanlaması açmayanı 202, çift açanı iki kat yazar', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  game.state.opened = { P1: true, P2: false, P3: true, P4: true };
  game.state.openType = { P1: 'melds', P2: null, P3: 'melds', P4: 'pairs' };
  game.state.hands.P1 = [];
  game.state.hands.P2 = [okeyTile('blue', 1)];
  game.state.hands.P3 = [okeyTile('blue', 5), okeyTile('black', 10)];
  game.state.hands.P4 = [okeyTile('yellow', 5), okeyTile('black', 10)];
  const scores = game.calculateScores('P1').individual;
  assert.equal(scores.P1.total, -101);
  assert.equal(scores.P2.total, 202);
  assert.equal(scores.P3.total, 15);
  assert.equal(scores.P4.total, 30);
});

test('Elde kalan gerçek okey taş başına 101 ceza değerindedir', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game, 'red', 4);
  game.state.opened.P2 = true;
  game.state.openType.P2 = 'melds';
  game.state.hands.P2 = [okeyTile('red', 5), okeyTile('blue', 6)];
  assert.equal(game.handPenalty('P2'), 107);
});

test('Elden okey bitişi cezaları dört katına çıkarır', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game, 'red', 4);
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.openedThisTurnPlayerId = 'P1';
  game.state.openedCountAtTurnStart = 0;
  const finishingOkey = okeyTile('red', 5);
  game.state.hands.P1 = [finishingOkey];
  game.state.phase = 'discard';
  game.discard('P1', finishingOkey.id);
  assert.equal(game.state.finishType, 'direct-okey');
  assert.equal(game.state.scores.individual.P1.total, -404);
  assert.equal(game.state.scores.individual.P2.total, 808);
});

test('Eşli 101’de bitiren oyuncunun eşinin el sonu cezası silinir', () => {
  const game = new OKEY101.Team101Okey();
  setTestOkey(game);
  game.state.opened.A1 = true;
  game.state.openType.A1 = 'melds';
  game.state.hands.A1 = [];
  game.state.hands.A2 = [okeyTile('yellow', 13)];
  const scores = game.calculateScores('A1');
  assert.equal(scores.individual.A2.roundPenalty, 0);
  assert.equal(scores.teams.teamA.total, -101);
});

test('Okeyi normal taş gibi atmak 101 ceza oluşturur', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game, 'red', 4);
  const okey = okeyTile('red', 5);
  game.state.hands.P1 = [okey, okeyTile('yellow', 13)];
  game.state.phase = 'discard';
  game.discard('P1', okey.id);
  assert.equal(game.state.penalties.P1, 101);
  assert.equal(game.state.penaltyEvents.at(-1).reason, 'okey-discard');
});

test('Masadaki pere işleyen taşı atmak 101 ceza oluşturur', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const playable = okeyTile('blue', 7);
  game.state.tableMelds.P2 = [{
    id: 'RUN-PLAYABLE',
    ownerPlayerId: 'P2',
    type: 'run',
    tiles: [okeyTile('blue', 4), okeyTile('blue', 5), okeyTile('blue', 6)]
  }];
  game.state.hands.P1 = [playable, okeyTile('yellow', 13)];
  game.state.phase = 'discard';
  game.discard('P1', playable.id);
  assert.equal(game.state.penalties.P1, 101);
  assert.equal(game.state.penaltyEvents.at(-1).reason, 'playable-discard');
});

test('İşlenebilen taş listesi yalnızca bu turda masadaki pere eklenebilen taşları verir', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const playable = okeyTile('blue', 7);
  const blocked = okeyTile('yellow', 13);
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.phase = 'play';
  game.state.hands.P1 = [playable, blocked];
  game.state.tableMelds.P2 = [{
    id: 'RUN-HINT',
    ownerPlayerId: 'P2',
    type: 'run',
    tiles: [okeyTile('blue', 4), okeyTile('blue', 5), okeyTile('blue', 6)]
  }];

  assert.deepEqual(game.getStateForPlayer('P1').layoffCandidateTileIds, [playable.id]);
  game.state.opened.P1 = false;
  assert.deepEqual(game.getStateForPlayer('P1').layoffCandidateTileIds, []);
});

test('Masaya bütün taşları işleyip bitmek yerine son atış taşı bırakılır', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const run = [okeyTile('blue', 1), okeyTile('blue', 2), okeyTile('blue', 3)];
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'melds';
  game.state.hands.P1 = run;
  game.state.phase = 'play';
  assert.throws(
    () => game.openMelds('P1', [run.map(tile => tile.id)]),
    /son bir taş kalmalı/
  );
});

test('Taşlar bitince açmamış oyuncuya sabit 202 yazılır', () => {
  const game = new OKEY101.Solo101Okey();
  game.finishNoWinner();
  assert.equal(game.state.winnerPlayerId, null);
  for (const score of Object.values(game.state.scores.individual)) {
    assert.equal(score.total, 202);
  }
});

test('Taşlar bitince açmış oyunculardan elde en az toplamı kalan kazanır', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  game.state.opened.P1 = true;
  game.state.opened.P2 = true;
  game.state.openType.P1 = 'melds';
  game.state.openType.P2 = 'melds';
  game.state.hands.P1 = [okeyTile('blue', 9)];
  game.state.hands.P2 = [okeyTile('red', 4)];
  const result = game.finishNoWinner();
  assert.equal(result.winnerPlayerId, 'P2');
  assert.equal(game.state.winnerPlayerId, 'P2');
  assert.equal(game.state.finishType, 'stock-empty');
  assert.equal(game.state.scores.individual.P2.total, 4);
});

test('101’de 12-13-1 dizilimi geçersizdir', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  const wrap = [okeyTile('blue', 12), okeyTile('blue', 13), okeyTile('blue', 1)];
  assert.equal(game.validateRun(wrap).valid, false);
});

test('Yandan alınan taş kullanılmadan başka taş atılamaz fakat aynı taş normal atılabilir', () => {
  const game = new OKEY101.Solo101Okey();
  const discarded = game.state.hands.P1[0];
  game.discard('P1', discarded.id);
  game.takeDiscard('P2');
  const other = game.state.hands.P2.find(tile => tile.id !== discarded.id);
  assert.throws(() => game.discard('P2', other.id), /kullanmalı veya aynı taşı geri atmalısın/);
  assert.equal(game.discard('P2', discarded.id).id, discarded.id);
  assert.equal(game.getCurrentPlayer().id, 'P3');
});

test('Yandan alınan taş kaynağına geri bırakılınca sıra oyuncuda kalır', () => {
  const game = new OKEY101.Solo101Okey();
  const discarded = game.state.hands.P1[0];
  game.discard('P1', discarded.id);
  const turnNumber = game.state.turnNumber;
  const handCount = game.state.hands.P2.length;

  game.takeDiscard('P2');
  assert.equal(game.state.hands.P2.length, handCount + 1);
  assert.equal(game.state.takenDiscardSourcePlayerId, 'P1');

  assert.equal(game.returnTakenDiscard('P2').id, discarded.id);
  assert.equal(game.getCurrentPlayer().id, 'P2');
  assert.equal(game.state.turnNumber, turnNumber);
  assert.equal(game.state.phase, 'draw');
  assert.equal(game.state.hands.P2.length, handCount);
  assert.equal(game.state.discardPile.at(-1).id, discarded.id);
  assert.equal(game.state.discardsByPlayer.P1.at(-1).id, discarded.id);
  assert.equal(game.state.forcedUseTileId, null);
});

test('Çiftten bitiş rakip cezalarını iki katına çıkarır', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  game.state.opened.P1 = true;
  game.state.openType.P1 = 'pairs';
  const last = okeyTile('blue', 2);
  game.state.hands.P1 = [last];
  game.state.phase = 'discard';
  game.discard('P1', last.id);
  assert.equal(game.state.finishType, 'pairs');
  assert.equal(game.state.scores.individual.P1.total, -202);
  assert.equal(game.state.scores.individual.P2.total, 404);
});

test('Dört oyuncu da çift açarsa el puansız iptal edilir', () => {
  const game = new OKEY101.Solo101Okey();
  setTestOkey(game);
  game.state.opened = { P1: true, P2: true, P3: true, P4: false };
  game.state.openType = { P1: 'pairs', P2: 'pairs', P3: 'pairs', P4: null };
  game.state.pairOpeningCounts = { P1: 5, P2: 6, P3: 7, P4: 0 };
  game.state.currentPlayerIndex = 3;
  game.state.phase = 'play';
  const pairs = makePairs(8, 'black');
  game.state.hands.P4 = [...pairs.tiles, okeyTile('yellow', 13)];
  game.openPairs('P4', pairs.groups);
  assert.equal(game.state.status, 'finished');
  assert.equal(game.state.finishType, 'all-players-opened-pairs');
  assert.ok(Object.values(game.state.scores.individual).every(score => score.total === 0));
});
