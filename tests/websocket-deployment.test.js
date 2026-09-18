'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'src', 'match-client.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
const endpoint = fs.readFileSync(path.join(root, 'api', 'ws.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

test('canlı istemci Vercel WebSocket fonksiyonuna bağlanır', () => {
  assert.match(client, /new WebSocket\(`\$\{protocol\}:\/\/\$\{location\.host\}\/api\/ws`\)/);
  assert.match(endpoint, /require\('\.\.\/server\/server'\)\.server/);
  assert.equal(vercel.functions['api/ws.js'].maxDuration, 300);
});

test('aynı sunucu local ve Vercel yollarındaki upgrade isteğini kabul eder', () => {
  assert.match(server, /pathname\s*!==\s*'\/ws'\s*&&\s*pathname\s*!==\s*'\/api\/ws'/);
  assert.match(server, /new WebSocketServer\(\{noServer:true,maxPayload:16\*1024\}\)/);
  assert.match(server, /wss\.handleUpgrade\(request,socket,head/);
  assert.match(server, /origin===`https:\/\/\$\{host\}`/);
});

test('Vercel çalışma alanında SQLite yalnız yazılabilir geçici dizini kullanır', () => {
  assert.match(server, /isVercel\?path\.join\('\/tmp','kantin\.sqlite'\)/);
  assert.match(server, /if\(require\.main===module\)/);
  assert.match(server, /module\.exports=\{server,wss,websocketRequestAllowed\}/);
});
