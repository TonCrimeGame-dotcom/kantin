'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'assets', 'games', 'pisti', 'cards');
const courtSource = path.join(outDir, 'court-source-v1.png');
const suits = {
  clubs: { mark: '♣', color: '#17140f' },
  diamonds: { mark: '♦', color: '#a71916' },
  hearts: { mark: '♥', color: '#a71916' },
  spades: { mark: '♠', color: '#17140f' }
};
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const pipLayouts = {
  A:[[256,385,92]],2:[[256,220,58],[256,550,58]],3:[[256,190,52],[256,385,52],[256,580,52]],
  4:[[165,220,48],[347,220,48],[165,550,48],[347,550,48]],5:[[165,210,46],[347,210,46],[256,385,50],[165,560,46],[347,560,46]],
  6:[[165,190,43],[347,190,43],[165,385,43],[347,385,43],[165,580,43],[347,580,43]],
  7:[[165,180,41],[347,180,41],[256,285,41],[165,385,41],[347,385,41],[165,590,41],[347,590,41]],
  8:[[165,175,39],[347,175,39],[256,275,39],[165,375,39],[347,375,39],[256,475,39],[165,585,39],[347,585,39]],
  9:[[165,170,37],[347,170,37],[165,300,37],[347,300,37],[256,385,40],[165,470,37],[347,470,37],[165,600,37],[347,600,37]],
  10:[[165,160,35],[347,160,35],[256,250,35],[165,320,35],[347,320,35],[165,450,35],[347,450,35],[256,520,35],[165,610,35],[347,610,35]]
};

function corner(rank, mark, color) {
  const rankSize = rank === '10' ? 72 : 100;
  return `<g fill="${color}" text-anchor="middle" font-family="Georgia,serif" font-weight="700"><text x="82" y="112" font-size="${rankSize}">${rank}</text><text x="82" y="202" font-size="92">${mark}</text><g transform="rotate(180 256 384)"><text x="82" y="112" font-size="${rankSize}">${rank}</text><text x="82" y="202" font-size="92">${mark}</text></g></g>`;
}

function overlay(rank, suit) {
  const { mark, color } = suits[suit];
  const pips = rank === 'A' ? pipLayouts.A : pipLayouts[rank] || [];
  const pipSvg = pips.map(([x,y,size],i)=>`<text x="${x}" y="${y}" font-size="${Math.round(size*1.55)}" ${i>=Math.ceil(pips.length/2)?`transform="rotate(180 ${x} ${y-10})"`:''}>${mark}</text>`).join('');
  return Buffer.from(`<svg width="512" height="768" xmlns="http://www.w3.org/2000/svg">${corner(rank,mark,color)}<g fill="${color}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif">${pipSvg}</g></svg>`);
}

async function courtArt(rank) {
  const index = { J:0, Q:1, K:2 }[rank];
  return sharp(courtSource).extract({ left:index*591, top:0, width:590, height:887 }).resize(350,525,{fit:'cover',position:'top'}).png().toBuffer();
}

async function build() {
  fs.mkdirSync(outDir, { recursive:true });
  const paper = await sharp(courtSource).extract({ left:610, top:0, width:300, height:48 }).resize(512,768,{fit:'fill'}).png().toBuffer();
  for (const rank of ranks) for (const suit of Object.keys(suits)) {
    const layers = [];
    if (['J','Q','K'].includes(rank)) layers.push({ input:await courtArt(rank), left:81, top:122, blend:'multiply' });
    layers.push({ input:overlay(rank,suit), left:0, top:0 });
    await sharp(paper).resize(512,768).composite(layers).png().toFile(path.join(outDir, `${rank.toLowerCase()}_${suit}.png`));
  }
}

build().catch(error=>{ console.error(error); process.exitCode=1; });
