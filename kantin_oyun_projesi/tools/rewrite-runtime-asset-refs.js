const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'src');
const sourceFiles = fs.readdirSync(sourceDir)
  .filter(name => /\.(?:css|js)$/.test(name))
  .map(name => path.join(sourceDir, name));

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, files);
    else if (entry.name.endsWith('.webp')) files.push(target);
  }
  return files;
}

const replacements = walk(path.join(root, 'assets'))
  .map(output => {
    const outputRelative = path.relative(root, output).replace(/\\/g, '/');
    const sourceRelative = outputRelative.replace(/\.webp$/, '.png');
    return fs.existsSync(path.join(root, sourceRelative)) ? [sourceRelative, outputRelative] : null;
  })
  .filter(Boolean);

for (const sourceFile of sourceFiles) {
  const before = fs.readFileSync(sourceFile, 'utf8');
  let after = before;
  for (const [source, output] of replacements) after = after.split(source).join(output);
  after = after.split('${String(c.rank).toLowerCase()}_${c.suit}.png').join('${String(c.rank).toLowerCase()}_${c.suit}.webp');
  if (after !== before) fs.writeFileSync(sourceFile, after);
}

process.stdout.write(`Updated ${sourceFiles.length} runtime source files.\n`);
