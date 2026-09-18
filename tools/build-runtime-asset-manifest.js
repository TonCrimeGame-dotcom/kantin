const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');
const included = [];
const replacedTableAssets = new Set([
  'assets/games/batak/walnut-felt-table-v1.webp',
  'assets/games/cards/kantin-gingham-table-v1.jpg',
  'assets/games/okey101/felt-emerald-v1.webp',
  'assets/games/okey101/table-realistic-v1.webp',
  'assets/games/pisti/final/tablecloth-green.webp',
  'assets/games/pisti/final/walnut-burgundy-table-v1.webp',
  'assets/games/tavla/tabletop-dark-walnut.webp'
]);

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['candidates', 'mockups', 'rejected', 'review'].includes(entry.name)) walk(target);
      continue;
    }
    if (/\.(?:webp|svg|jpg)$/i.test(entry.name) && !replacedTableAssets.has(path.relative(root, target).replace(/\\/g, '/'))) included.push(target);
  }
}

walk(assets);
const manifest = included
  .map(file => ({
    url: `./${path.relative(root, file).replace(/\\/g, '/')}`,
    bytes: fs.statSync(file).size
  }))
  .sort((a, b) => a.url.localeCompare(b.url));

const output = `(() => {\n  'use strict';\n  window.KANTIN_ASSET_MANIFEST = Object.freeze(${JSON.stringify({ version: '20260917-green-table-5', assets: manifest }, null, 2)});\n})();\n`;
fs.writeFileSync(path.join(root, 'src', 'asset-manifest.js'), output);
process.stdout.write(`Manifest: ${manifest.length} assets, ${manifest.reduce((sum, asset) => sum + asset.bytes, 0)} bytes.\n`);
