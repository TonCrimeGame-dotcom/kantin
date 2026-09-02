'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const logoPath = path.join(root, 'assets', 'brand', 'kantin-logo.png');
const uiLogoPath = path.join(root, 'assets', 'brand', 'kantin-logo-ui.webp');
const faviconPath = path.join(root, 'assets', 'brand', 'kantin-mark.svg');

test('yeni Kantin logosu saydam PNG olarak tum marka alanlarina baglidir', () => {
  const png = fs.readFileSync(logoPath);
  const webp = fs.readFileSync(uiLogoPath);
  const favicon = fs.readFileSync(faviconPath, 'utf8');
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png[25], 6, 'PNG RGBA renk turunu kullanmali');
  assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.match(indexHtml, /rel="icon" href="\.\/assets\/brand\/kantin-mark\.svg\?v=20260902-2" type="image\/svg\+xml"/);
  assert.match(adminHtml, /rel="icon" href="\.\/assets\/brand\/kantin-mark\.svg\?v=20260902-2" type="image\/svg\+xml"/);
  assert.match(indexHtml, /kantin-logo-ui\.webp\?v=/);
  assert.match(adminHtml, /kantin-logo-ui\.webp\?v=/);
  assert.ok(webp.length < png.length / 10, 'arayuz logosu yuksek cozunurluklu kaynaktan cok daha hafif olmali');
  assert.match(favicon, /<path d="M43 35v58M44 66l36-31M44 65l38 29"/);
  assert.doesNotMatch(indexHtml + adminHtml, /kantin-logo\.svg/);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'brand', 'kantin-logo.svg')), false);
  assert.equal(fs.existsSync(faviconPath), true);
});
