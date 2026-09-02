const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const sourceFiles = fs.readdirSync(path.join(root, 'src'))
  .filter(name => /\.(?:css|js)$/.test(name))
  .map(name => path.join(root, 'src', name));

const referenced = new Set();
for (const sourceFile of sourceFiles) {
  const source = fs.readFileSync(sourceFile, 'utf8');
  for (const match of source.matchAll(/(?:\.\.\/|\.\/)?(assets\/[^'"`()\s]+\.png)/g)) {
    if (!match[1].includes('${')) referenced.add(match[1].replace(/\\/g, '/'));
  }
}

for (const name of fs.readdirSync(path.join(root, 'assets', 'games', 'pisti', 'cards'))) {
  if (name.endsWith('.png') && name !== 'court-source-v1.png') {
    referenced.add(`assets/games/pisti/cards/${name}`);
  }
}

referenced.add('assets/backgrounds/kantin-home-hero.png');
referenced.add('assets/backgrounds/kantin-loading-master-v1.png');
referenced.add('assets/brand/kantin-logo.png');

function outputPath(relativePath) {
  if (relativePath === 'assets/brand/kantin-logo.png') return 'assets/brand/kantin-logo-ui.webp';
  if (relativePath === 'assets/backgrounds/kantin-loading-master-v1.png') return 'assets/backgrounds/kantin-loading-v1.webp';
  return relativePath.replace(/\.png$/i, '.webp');
}

async function optimize(relativePath) {
  const input = path.join(root, relativePath);
  if (!fs.existsSync(input)) throw new Error(`Eksik görsel: ${relativePath}`);
  const outputRelative = outputPath(relativePath);
  const output = path.join(root, outputRelative);
  const pipeline = sharp(input, { failOn: 'error' }).rotate();
  if (relativePath.includes('/pisti/cards/')) pipeline.resize({ width: 360, withoutEnlargement: true });
  if (relativePath === 'assets/brand/kantin-logo.png') pipeline.resize({ width: 512, withoutEnlargement: true });
  if (relativePath === 'assets/backgrounds/kantin-loading-master-v1.png') pipeline.resize({ width: 1600, withoutEnlargement: true });
  await pipeline.webp({ quality: relativePath.includes('/pisti/cards/') ? 82 : 78, effort: 6, smartSubsample: true }).toFile(output);
  return { source: relativePath, output: outputRelative, bytes: fs.statSync(output).size };
}

(async () => {
  const results = [];
  for (const relativePath of [...referenced].sort()) results.push(await optimize(relativePath));
  const before = results.reduce((sum, item) => sum + fs.statSync(path.join(root, item.source)).size, 0);
  const after = results.reduce((sum, item) => sum + item.bytes, 0);
  process.stdout.write(`${JSON.stringify({ files: results.length, before, after, saved: before - after, results }, null, 2)}\n`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
