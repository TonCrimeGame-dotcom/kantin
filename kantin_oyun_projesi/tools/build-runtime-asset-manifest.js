const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');
const included = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['candidates', 'mockups', 'rejected', 'review'].includes(entry.name)) walk(target);
      continue;
    }
    if (entry.name.endsWith('.webp') || entry.name.endsWith('.svg')) included.push(target);
  }
}

walk(assets);
const manifest = included
  .map(file => ({
    url: `./${path.relative(root, file).replace(/\\/g, '/')}`,
    bytes: fs.statSync(file).size
  }))
  .sort((a, b) => a.url.localeCompare(b.url));

const output = `(() => {\n  'use strict';\n  window.KANTIN_ASSET_MANIFEST = Object.freeze(${JSON.stringify({ version: '20260902-1', assets: manifest }, null, 2)});\n})();\n`;
fs.writeFileSync(path.join(root, 'src', 'asset-manifest.js'), output);
process.stdout.write(`Manifest: ${manifest.length} assets, ${manifest.reduce((sum, asset) => sum + asset.bytes, 0)} bytes.\n`);
