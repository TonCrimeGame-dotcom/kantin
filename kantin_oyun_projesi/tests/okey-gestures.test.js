'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function discardOkeyTile('), source.indexOf('  function okeyAction('));
function setup(online = false) {
  const state = { status: 'playing', currentPlayer: { id: 'P1' }, phase: 'play', turnNumber: 1, yourHand: [{ id: 'a' }, { id: 'b' }] };
  const actions = [], messages = [];
  let time = 1000;
  const context = vm.createContext({
    manager: { viewerId: 'P1', game: { getStateForPlayer: () => state } },
    onlineGame: online, KANTIN_MATCH: { gameState: { state, seat: 'P1' } },
    lastOkeyTap: null, suppressOkeyClickUntil: 0, chosen: new Set(),
    Date: { now: () => time }, render() {}, toast: text => messages.push(text),
    okeyAction: action => actions.push({ action, id: [...context.chosen][0] })
  });
  vm.runInContext(helpers, context);
  return { state, actions, messages, tap: (id, count = 1) => context.tapOkeyTile({ dataset: { tile: id } }, count), tick: ms => { time += ms; }, discard: id => context.discardOkeyTile(id) };
}
for (const online of [false, true]) {
  let game = setup(online);
  game.tap('a'); assert.equal(game.actions.length, 0, 'Single tap only selects');
  game.tick(120); game.tap('a');
  assert.deepEqual(game.actions, [{ action: 'discard', id: 'a' }], 'Second tap discards the same tile after rendering');
  game = setup(online); game.tap('b', 2);
  assert.deepEqual(game.actions, [{ action: 'discard', id: 'b' }], 'Native double-click discards');
  game = setup(online); game.tap('a'); game.tick(120); game.tap('b');
  assert.equal(game.actions.length, 0, 'Different tiles remain multi-selectable');
  game = setup(online); game.tap('a'); game.tick(500); game.tap('a');
  assert.equal(game.actions.length, 0, 'Slow taps are not double taps');
  game = setup(online); game.tap('a'); game.state.turnNumber++; game.tap('a');
  assert.equal(game.actions.length, 0, 'Tap history cannot cross turns');
  game = setup(online); game.state.phase = 'draw';
  assert.equal(game.discard('a'), false, 'Must draw first');
  game.state.phase = 'play'; game.state.currentPlayer.id = 'P2';
  assert.equal(game.discard('a'), false, 'Cannot discard on an opponent turn');
  game.state.currentPlayer.id = 'P1';
  assert.equal(game.discard('missing'), false, 'Cannot discard a tile outside the hand');
  assert.equal(game.actions.length, 0);
}
console.log('Okey gestures: local/online double taps, native double-click, selection, turn changes and discard guards passed.');
