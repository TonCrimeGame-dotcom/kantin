const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app.js', 'utf8');
const start = source.indexOf('  function syncBatakPlayAnimation(');
const end = source.indexOf('  function batakTargetPose', start);
async function check(playerId, cancel = false, cardRect = null) {
  let resolveImage, selectedSource, frames, played = false, paused = false;
  const ready = new Promise(resolve => { resolveImage = resolve; });
  const animation = { pause() { paused = true; }, play() { played = true; }, finished: new Promise(() => {}) };
  const flight = { style: {}, classList: { add() {} }, setAttribute() {}, querySelector() { return { decode: () => ready }; }, animate(value) { frames = value; return animation; }, remove() {} };
  const rect = { left: 240, top: 400, width: 300, height: 80 };
  const hand = { getBoundingClientRect() { selectedSource = 'hand'; return rect; } };
  const fan = { getBoundingClientRect() { selectedSource = 'fan'; return rect; } };
  const target = { style: {}, isConnected: true, getBoundingClientRect: () => ({ left: 350, top: 200, width: 52, height: 77 }) };
  const profile = { closest: () => ({ querySelector: () => fan }) };
  const state = { moveNumber: 1, currentTrick: [{ playerId, card: { id: 'played' } }] };
  const context = vm.createContext({
    handPositions: new Map(cardRect ? [['played', cardRect]] : []),
    manager: { game: { getStateForPlayer: () => state }, viewerId: 'P1' }, onlineGame: false,
    batakPlayAnimation: null, batakMoveAnimationKey: null, batakAnimating: false,
    document: { querySelector: selector => selector === '.batak-hand' ? hand : selector.includes('play-player') ? target : profile, createElement: () => ({ firstElementChild: flight }), body: { appendChild() {} } },
    window: { matchMedia: () => ({ matches: false }) }, Element: { prototype: { animate() {} } },
    CSS: { escape: value => value }, batakCard: () => '', clearBatakTurnClock() {}, playSound() {}, Promise
  });
  vm.runInContext(source.slice(start, end) + '\nsyncBatakPlayAnimation(handPositions);', context);
  const actualRect = playerId === 'P1' && cardRect ? cardRect : rect;
  assert.equal(selectedSource, playerId === 'P1' ? cardRect ? undefined : 'hand' : 'fan');
  assert.equal(flight.style.left, `${actualRect.left + actualRect.width / 2 - 26}px`);
  assert.equal(flight.style.top, `${actualRect.top + actualRect.height / 2 - 38.5}px`);
  assert.equal(frames[0].transform, `translate(0,0) rotate(0deg) scale(${actualRect.width/52},${actualRect.height/77})`);
  assert.equal(flight.style.visibility, 'hidden');
  assert.equal(paused, true);
  assert.equal(played, false);
  if (cancel) context.batakPlayAnimation = null;
  resolveImage();
  await Promise.resolve();
  assert.equal(played, !cancel);
  assert.equal(flight.style.visibility, cancel ? 'hidden' : 'visible');
}
(async () => {
  await check('P1');
  await check('P2');
  await check('P1', true);
  await check('P1', false, { left: 120, top: 380, width: 60, height: 90 });
  await check('P1', false, { left: 650, top: 360, width: 60, height: 90 });
  await check('P2', false, { left: 120, top: 380, width: 60, height: 90 });
  console.log('Batak animation: hand center, opponent fan, image readiness and cancellation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Render the actual scene update through each card of a trick.
const sceneStart = source.indexOf('  function batakCompletedTrickKey(');
const sceneEnd = source.indexOf('  function clearBatakDealAnimation(', sceneStart);
for (const online of [false, true]) {
  const state = { players: [], currentTrick: [], lastTrick: [], trickNumber: 0 };
  const center = { innerHTML: '', classList: { toggle() {} } };
  const context = vm.createContext({
    manager: { game: { getStateForPlayer: () => state }, viewerId: 'P1' },
    onlineGame: online, KANTIN_MATCH: { gameState: { state, seat: 'P1' }, match: { matchId: 'test' } },
    batakCollectedTrickKey: null,
    document: { querySelectorAll: () => [], querySelector: () => center },
    batakSeatPosition: () => 'mine', batakCard: card => `<div>${card.id}</div>`, esc: value => value
  });
  vm.runInContext(source.slice(sceneStart, sceneEnd), context);
  const renderScene = () => vm.runInContext('upgradeBatakScene()', context);
  const countCards = () => (center.innerHTML.match(/data-batak-play-player=/g) || []).length;
  renderScene();
  assert.equal(countCards(), 0);
  for (let count = 1; count <= 4; count++) {
    state.currentTrick.push({ playerId: `P${count}`, card: { id: `card${count}` } });
    if (count === 4) {
      state.lastTrick = state.currentTrick;
      state.currentTrick = [];
      state.lastTrickWinnerId = 'P1';
      state.trickNumber = 1;
    }
    renderScene();
    assert.equal(countCards(), count, `${online ? 'Online' : 'Local'} trick must show ${count} cards`);
  }
  context.batakCollectedTrickKey = vm.runInContext('batakCompletedTrickKey(manager.game.getStateForPlayer())', context);
  renderScene();
  assert.equal(countCards(), 0, 'Collected trick stays hidden');
  state.currentTrick = [{ playerId: 'P2', card: { id: 'next' } }];
  state.lastTrick = [];
  state.lastTrickWinnerId = null;
  renderScene();
  assert.equal(countCards(), 1, 'Next trick appears after collection');
}
console.log('Batak scene: each played card stays visible in local and online games.');

async function checkCollection() {
  const start = source.indexOf('  function syncBatakTrickCollection()');
  const end = source.indexOf('  function batakAutomaticAction(', start);
  let runDelay, destination, clocks = 0;
  const motions = [];
  const cards = Array.from({ length: 4 }, () => ({
    isConnected: true, style: {},
    getBoundingClientRect: () => ({ left: 300, top: 150, width: 50, height: 75 }),
    animate(frames) { motions.push(frames); return { finished: Promise.resolve() }; }
  }));
  const center = { innerHTML: 'four cards', querySelectorAll: () => cards };
  const hand = { getBoundingClientRect() { destination = 'hand'; return { left: 200, top: 400, width: 400, height: 80 }; } };
  const state = { lastTrickWinnerId: 'P1' };
  const context = vm.createContext({
    manager: { game: { getStateForPlayer: () => state }, viewerId: 'P1', config: () => ({ family: 'batak' }) },
    onlineGame: false, batakCompletedTrickKey: () => 'local:1:P1',
    batakCollectAnimation: null, batakCollectedTrickKey: null, batakPlayAnimation: {}, batakAnimating: false,
    document: { querySelector: selector => selector === '.batak-center' ? center : selector === '.batak-hand' ? hand : null },
    window: { matchMedia: () => ({ matches: false }) }, Element: { prototype: { animate() {} } },
    setTimeout: fn => { runDelay = fn; return 1; }, clearBatakTurnClock() {},
    syncBatakTurnClock() { clocks++; }, batakBots() {}, playSound() {}, getComputedStyle: () => ({ transform: 'none' }), Promise
  });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(vm.runInContext('syncBatakTrickCollection()', context), false, 'Wait for final card flight');
  context.batakPlayAnimation = null;
  assert.equal(vm.runInContext('syncBatakTrickCollection()', context), true);
  assert.equal(destination, 'hand');
  const entry = context.batakCollectAnimation;
  assert.equal(vm.runInContext('syncBatakTrickCollection()', context), true);
  assert.equal(context.batakCollectAnimation, entry, 'Do not restart active collection');
  runDelay();
  assert.equal(motions.length, 4);
  assert.ok(motions.every(frames => frames.at(-1).opacity === 0));
  assert.ok(motions.every(frames => frames.at(-1).transform.includes('translate(75px,252.5px)')));
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(context.batakCollectedTrickKey, 'local:1:P1');
  assert.equal(context.batakCollectAnimation, null);
  assert.ok(center.innerHTML.includes('EL BEKLENİYOR'));
  assert.equal(clocks, 1, 'Resume turn only after collection');
  assert.equal(vm.runInContext('syncBatakTrickCollection()', context), false);
  console.log('Batak collection: final-flight ordering, bottom-center destination, fade and cleanup passed.');
}
checkCollection().catch(error => { console.error(error); process.exitCode = 1; });
