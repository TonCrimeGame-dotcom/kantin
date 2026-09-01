'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const matchHandler = require('../api/match');
const { verifyGuest } = require('../api/lib/match-service');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}\n${error.stack}`);
    process.exitCode = 1;
  }
}

const testEnvironment = {
  url: 'https://example.supabase.co',
  publishableKey: 'publishable-test-key',
  serviceKey: 'service-test-key',
  sessionSecret: 'a-long-test-only-match-session-secret'
};

test('Yerel misafir için imzalı ve kararlı eşleşme kimliği üretir', () => {
  const first = matchHandler._test.guestIdentity('12345678-1234-4321-9999-123456789012', 'Misafir Ada', testEnvironment);
  const second = matchHandler._test.guestIdentity('12345678-1234-4321-9999-123456789012', 'Misafir Ada', testEnvironment);
  assert.equal(first.playerId, second.playerId);
  assert.match(first.playerId, /^GUEST-[A-F0-9]{24}$/);
  assert.equal(verifyGuest(first.matchSessionToken, testEnvironment.sessionSecret).playerId, first.playerId);
});

test('Maç paketi yalnız ilgili oyuncunun özel durumunu döndürür', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    mode: 'pistiSolo',
    word_locale: null,
    players: [
      { id: 'A', username: 'Ada', seat: 'P1', team: null },
      { id: 'B', username: 'Bora', seat: 'P2', team: null }
    ],
    state: null,
    turn_version: 0,
    status: 'playing',
    result: null,
    action_log: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const room = matchHandler._test.roomFor(row);
  row.state = room.fullState();
  const packet = matchHandler._test.packetFor(row, 'A');
  assert.equal(packet.match.assignment.seat, 'P1');
  assert.equal(packet.gameState.seat, 'P1');
  assert.equal('hands' in packet.gameState.state, false);
  assert.equal(packet.gameState.state.yourHand.length, 4);
});

test('Sunucusuz geri yükleme süre ihlali ve bot devrini korur', () => {
  const row = {
    id: '22222222-2222-4222-8222-222222222222',
    mode: 'pistiSolo',
    word_locale: null,
    players: [
      { id: 'A', username: 'Ada', seat: 'P1', team: null },
      { id: 'B', username: 'Bora', seat: 'P2', team: null }
    ],
    state: null,
    turn_version: 3,
    status: 'playing',
    result: null,
    action_log: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const first = matchHandler._test.roomFor(row);
  row.state = { ...first.fullState(), timeoutCounts: { P1: 1, P2: 0 }, botPlayers: ['A'] };
  const restored = matchHandler._test.roomFor(row);
  assert.equal(restored.timeoutCounts.get('A'), 1);
  assert.equal(restored.botPlayers.has('A'), true);
  assert.equal(restored.turnTimer, null);
});

test('Migration ortak kuyruk ve iyimser maç kilidini içerir', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260901193000_distributed_matchmaking.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.matchmaking_tickets/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /create table if not exists public\.online_matches/i);
  assert.match(sql, /turn_version integer not null/i);
  assert.match(sql, /service_role_required/i);
});
