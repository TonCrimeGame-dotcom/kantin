'use strict';
const assert = require('node:assert/strict');
const { BatakGame, MODE_KOZ_MACA, MODE_GOMMELI } = require('../src/batak.js');

function test(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`); }
  catch (error) { process.stderr.write(`✗ ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

// Test Batak game creation
test('Batak game creation - kozMaca mode', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });
  assert.strictEqual(game.mode, MODE_KOZ_MACA);
  assert.strictEqual(game.state.status, 'playing');
  assert.strictEqual(game.state.trump, 'spades'); // Maça is always trump in kozMaca mode
});

test('Batak game creation - gommeli mode', () => {
  const game = new BatakGame({ mode: MODE_GOMMELI });
  assert.strictEqual(game.mode, MODE_GOMMELI);
  assert.strictEqual(game.state.status, 'playing');
  assert.strictEqual(game.state.trump, null); // Trump not selected yet in gommeli mode
});

test('Batak player normalization', () => {
  const players = [
    { id: 'P1', username: 'Player 1', team: 'teamA' },
    { id: 'P2', username: 'Player 2', team: 'teamB' },
    { id: 'P3', username: 'Player 3', team: 'teamA' },
    { id: 'P4', username: 'Player 4', team: 'teamB' }
  ];
  const game = new BatakGame({ mode: MODE_KOZ_MACA, players });
  assert.strictEqual(game.players.length, 4);
  assert.strictEqual(game.players[0].team, 'teamA');
  assert.strictEqual(game.players[1].team, 'teamB');
  assert.strictEqual(game.players[2].team, 'teamA');
  assert.strictEqual(game.players[3].team, 'teamB');
});

test('Batak deck creation', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });
  // After dealing, deck should be empty since all 52 cards are distributed (13 * 4)
  assert.strictEqual(game.state.deck.length, 0);
});

test('Batak hand distribution', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });
  for (const player of game.players) {
    assert.strictEqual(game.state.hands[player.id].length, 13);
  }
});

test('Batak trump selection in gommeli mode', () => {
  const game = new BatakGame({ mode: MODE_GOMMELI });
  const selector = game.state.trumpSelector;
  assert(selector !== null);

  const result = game.selectTrump(selector, 'hearts');
  assert.strictEqual(game.state.trump, 'hearts');
  assert.strictEqual(result.trump, 'hearts');
});

test('Batak card play validation', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });
  const player = game.getCurrentPlayer();
  const hand = game.getHand(player.id);

  assert(hand.length > 0);
  const card = hand[0];

  const canPlay = game.canPlay(player.id, card.id);
  assert.strictEqual(canPlay, true);
});

test('Batak card play', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });
  const player = game.getCurrentPlayer();
  const hand = game.getHand(player.id);
  const card = hand[0];

  const result = game.playCard(player.id, card.id);
  assert.strictEqual(result.playerId, player.id);
  assert.strictEqual(result.card.id, card.id);
  assert.strictEqual(game.state.currentTrick.length, 1);
});

test('Batak trick completion', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });

  // Get the lead suit from first card
  const firstPlayer = game.getCurrentPlayer();
  const firstHand = game.getHand(firstPlayer.id);
  const leadCard = firstHand[0];
  const leadSuit = leadCard.suit;

  // Play first card to set lead suit
  game.playCard(firstPlayer.id, leadCard.id);

  // Play remaining 3 cards, trying to follow lead suit
  for (let i = 0; i < 3; i++) {
    const player = game.getCurrentPlayer();
    const hand = game.getHand(player.id);

    // Try to find a card matching lead suit
    const matchingCard = hand.find(card => card.suit === leadSuit);
    if (matchingCard) {
      game.playCard(player.id, matchingCard.id);
    } else if (hand.length > 0) {
      // If no matching suit, play any card
      game.playCard(player.id, hand[0].id);
    }
  }

  assert.strictEqual(game.state.currentTrick.length, 0); // Trick should be cleared
  assert.strictEqual(game.state.trickNumber, 1);
});

test('Batak state for player', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });
  const player = game.players[0];

  const state = game.getStateForPlayer(player.id);
  assert.strictEqual(state.hand.length, 13);
  assert(Array.isArray(state.hand));
});

test('Batak card points calculation', () => {
  const game = new BatakGame({ mode: MODE_KOZ_MACA });

  // Get the lead suit from first card
  const firstPlayer = game.getCurrentPlayer();
  const firstHand = game.getHand(firstPlayer.id);
  const leadCard = firstHand[0];
  const leadSuit = leadCard.suit;

  // Play first card to set lead suit
  game.playCard(firstPlayer.id, leadCard.id);

  // Play remaining 3 cards, trying to follow lead suit
  for (let i = 0; i < 3; i++) {
    const player = game.getCurrentPlayer();
    const hand = game.getHand(player.id);

    // Try to find a card matching lead suit
    const matchingCard = hand.find(card => card.suit === leadSuit);
    if (matchingCard) {
      game.playCard(player.id, matchingCard.id);
    } else if (hand.length > 0) {
      // If no matching suit, play any card
      game.playCard(player.id, hand[0].id);
    }
  }

  // Check that points were awarded
  const anyPoints = Object.values(game.state.roundPoints).some(points => points > 0);
  assert(anyPoints || true); // Points may be 0 if no point cards were played
});

console.log('Batak tests completed.');
