'use strict';

const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'assets', 'games', 'pisti', 'final', 'result-frame-walnut-v1.png');
const output = path.join(root, 'assets', 'games', 'pisti', 'final', 'result-frame-walnut-v2.png');

async function run() {
  const image = sharp(input);
  const meta = await image.metadata();
  const width = meta.width;
  const height = meta.height;
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="40" width="1488" height="940" rx="34" fill="white"/></svg>`);
  await image.ensureAlpha().composite([{ input:mask, blend:'dest-in' }]).png().toFile(output);
}

run().catch(error=>{console.error(error);process.exitCode=1});
