'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'auth-client.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function boot(storage) {
  const window = {
    KANTIN_I18N: {
      locale: 'tr',
      normalize(value) { return ['tr', 'en', 'de', 'ru', 'es', 'hi', 'ar'].includes(value) ? value : null; }
    }
  };
  const context = {
    window,
    localStorage: storage,
    Event,
    EventTarget,
    CustomEvent: TestCustomEvent,
    URLSearchParams,
    location: { hash: '', pathname: '/', search: '', origin: 'http://127.0.0.1:4173' },
    history: { replaceState() {} },
    crypto: { randomUUID: () => '12345678-abcd-4000-8000-123456789abc' },
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ error: 'service_not_configured' }) }),
    setTimeout,
    clearTimeout,
    console
  };
  vm.runInNewContext(source, context, { filename: 'auth-client.js' });
  return window.KANTIN_AUTH;
}

test('Supabase yokken misafir girisi cihaza kaydolur ve acilis ekranini gecer', async () => {
  const storage = memoryStorage();
  const auth = boot(storage);
  await auth.ready;
  assert.equal(auth.isAuthenticated(), false);

  await auth.signInAsGuest();
  assert.equal(auth.isAuthenticated(), true);
  assert.equal(auth.localGuest, true);
  assert.equal(auth.profile.is_guest, true);
  assert.equal(auth.profile.username, 'Misafir 123456');
  assert.match(auth.profile.player_code, /^KNT-\d{6}$/);
  assert.ok(storage.getItem('kantin:device-guest:v1'));
});

test('ayni cihaz sayfa yenilenince ayni misafir profiline otomatik girer', async () => {
  const storage = memoryStorage();
  const first = boot(storage);
  await first.ready;
  await first.signInAsGuest();
  const firstId = first.user.id;
  const firstCode = first.profile.player_code;

  const second = boot(storage);
  await second.ready;
  assert.equal(second.isAuthenticated(), true);
  assert.equal(second.user.id, firstId);
  assert.equal(second.profile.player_code, firstCode);
});

test('ana tiklama isleyicisi ceviri fonksiyonunu yerel tas degiskeniyle golgelemez', () => {
  assert.doesNotMatch(appSource, /const t=e\.target\.closest\('\[data-tile\]'\)/);
  assert.match(appSource, /const tileNode=e\.target\.closest\('\[data-tile\]'\)/);
});
