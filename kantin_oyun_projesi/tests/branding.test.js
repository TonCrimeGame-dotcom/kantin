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

test('yeni Kantin logosu saydam PNG olarak tum marka alanlarina baglidir', () => {
  const png = fs.readFileSync(logoPath);
  const webp = fs.readFileSync(uiLogoPath);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png[25], 6, 'PNG RGBA renk turunu kullanmali');
  assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.match(indexHtml, /rel="icon" href="\.\/assets\/brand\/kantin-logo\.png\?v=/);
  assert.match(indexHtml, /kantin-logo-ui\.webp\?v=/);
  assert.match(adminHtml, /kantin-logo-ui\.webp\?v=/);
  assert.ok(webp.length < png.length / 10, 'arayuz logosu yuksek cozunurluklu kaynaktan cok daha hafif olmali');
  assert.doesNotMatch(indexHtml + adminHtml, /kantin-(?:logo|mark)\.svg/);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'brand', 'kantin-logo.svg')), false);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'brand', 'kantin-mark.svg')), false);
});
