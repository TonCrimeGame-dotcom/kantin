'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loaderSource = fs.readFileSync(path.join(root, 'src', 'asset-loader.js'), 'utf8');
const manifestSource = fs.readFileSync(path.join(root, 'src', 'asset-manifest.js'), 'utf8');
const runtimeSource = ['app.js', 'home.css', 'tavla.css', 'okey.css', 'pisti.css', 'sozcuk.css']
  .map(name => fs.readFileSync(path.join(root, 'src', name), 'utf8'))
  .join('\n');

function readManifest() {
  const context = { window: {} };
  vm.runInNewContext(manifestSource, context);
  return context.window.KANTIN_ASSET_MANIFEST;
}

test('acilis indirme ekrani tum kullanilan web gorsellerini onbellege alir', () => {
  const manifest = readManifest();
  const total = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  assert.match(indexHtml, /id="assetLoader"[^>]+role="progressbar"/);
  assert.ok(indexHtml.indexOf('asset-manifest.js') < indexHtml.indexOf('asset-loader.js'));
  assert.ok(indexHtml.indexOf('asset-loader.js') < indexHtml.indexOf('app.js'));
  assert.match(loaderSource, /response\.body\.getReader\(\)/, 'ilerleme gercek indirilen baytlardan hesaplanmali');
  assert.match(loaderSource, /previousVersion === manifest\.version \? 'force-cache' : 'reload'/);
  assert.match(loaderSource, /localStorage\.setItem\(versionKey, manifest\.version\)/);
  assert.ok(manifest.assets.length >= 100);
  assert.ok(total > 1_000_000 && total < 10_000_000, `optimize paket 1-10 MB araliginda olmali: ${total}`);
  assert.ok(manifest.assets.every(asset => fs.existsSync(path.join(root, asset.url.replace(/^\.\//, '')))));
  assert.doesNotMatch(runtimeSource.replace(/\/\*[\s\S]*?\*\//g, ''), /assets\/[^'"`()\s]+\.png/);
  assert.match(runtimeSource, /assets\/games\/pisti\/cards\/\$\{String\(c\.rank\).*?\.webp/);
});
