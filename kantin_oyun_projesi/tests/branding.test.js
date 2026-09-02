'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const logoPath = path.join(root, 'assets', 'brand', 'kantin-logo.png');

test('yeni Kantin logosu saydam PNG olarak tum marka alanlarina baglidir', () => {
  const png = fs.readFileSync(logoPath);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png[25], 6, 'PNG RGBA renk turunu kullanmali');
  assert.match(indexHtml, /kantin-logo\.png\?v=/);
  assert.match(adminHtml, /kantin-logo\.png\?v=/);
  assert.doesNotMatch(indexHtml + adminHtml, /kantin-(?:logo|mark)\.svg/);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'brand', 'kantin-logo.svg')), false);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'brand', 'kantin-mark.svg')), false);
});
