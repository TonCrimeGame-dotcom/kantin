'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const localeSource = fs.readFileSync(path.join(root, 'src', 'locales.js'), 'utf8');
const i18nSource = fs.readFileSync(path.join(root, 'src', 'i18n.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260831213000_localization_foundation.sql'), 'utf8');

function loadLocales() {
  const context = { window: {} };
  vm.runInNewContext(localeSource, context, { filename: 'locales.js' });
  return context.window.KANTIN_LOCALES;
}

test('ilk surumde yedi dil ve Almanca paketi bulunur', () => {
  const locales = loadLocales();
  assert.deepEqual(Object.keys(locales).sort(), ['ar', 'de', 'en', 'es', 'hi', 'ru', 'tr']);
  assert.equal(locales.de['language.label'], 'Sprache');
  assert.equal(locales.de['game.backgammon'], 'Backgammon');
});

test('Pisti adi Turkcede korunur ve yabanci dillerde Pishti olur', () => {
  const locales = loadLocales();
  const nameKeys = ['auth.subtitle', 'game.pisti', 'mode.pistiSolo', 'mode.pistiTeam'];
  assert.equal(locales.tr['game.pisti'], 'Pişti');
  assert.equal(locales.tr['mode.pistiSolo'], 'Klasik Pişti');
  for (const code of ['en', 'de', 'ru', 'es', 'hi', 'ar']) {
    for (const key of nameKeys) {
      assert.match(locales[code][key], /Pishti/, `${code}.${key} Pishti adini kullanmali`);
      assert.doesNotMatch(locales[code][key], /Pişti|Пишти/, `${code}.${key} yerel yazimi kullanmamali`);
    }
  }
});

test('her dil Ingilizce temel arayuz anahtarlarini kapsar', () => {
  const locales = loadLocales();
  const required = Object.keys(locales.en);
  for (const [code, dictionary] of Object.entries(locales)) {
    assert.deepEqual(Object.keys(dictionary).sort(), required.slice().sort(), `${code} anahtar listesi eksik`);
    for (const key of required) assert.equal(typeof dictionary[key], 'string', `${code}.${key} metin olmali`);
  }
});

test('istemci Ingilizce geri donusu, Telegram dili ve RTL uygular', () => {
  assert.match(i18nSource, /telegramLocale\(\)/);
  assert.match(i18nSource, /initDataUnsafe\?\.user\?\.language_code/);
  assert.match(i18nSource, /\|\| 'en'/);
  assert.match(i18nSource, /document\.documentElement\.dir = meta\.direction/);
  assert.match(i18nSource, /ar: \{ name: 'العربية', direction: 'rtl'/);
});

test('dil tercihi profile baglanir ve mevsimsel metinler sunucudan yonetilebilir', () => {
  assert.match(migration, /add column if not exists preferred_locale text/i);
  assert.match(migration, /references public\.supported_locales\(locale\)/i);
  assert.match(migration, /create table if not exists public\.localized_content/i);
  assert.match(migration, /grant update \(preferred_locale\) on table public\.profiles to authenticated/i);
  assert.match(migration, /alter table public\.localized_content enable row level security/i);
});
