'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const configHandler = require('../api/config');

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = value ? JSON.parse(value) : null; }
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('public config sadece tarayiciya uygun Supabase ayarlarini dondurur', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const oldSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co/';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_public';
  process.env.SUPABASE_SECRET_KEY = 'must-never-leak';

  try {
    const res = mockResponse();
    await configHandler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.supabaseUrl, 'https://example.supabase.co');
    assert.equal(res.body.supabasePublishableKey, 'sb_publishable_public');
    assert.equal(JSON.stringify(res.body).includes('must-never-leak'), false);
  } finally {
    restoreEnv('SUPABASE_URL', oldUrl);
    restoreEnv('SUPABASE_PUBLISHABLE_KEY', oldKey);
    restoreEnv('SUPABASE_SECRET_KEY', oldSecret);
  }
});

test('public config eksik ayarda 503 dondurur', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    const res = mockResponse();
    await configHandler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { ok: false, error: 'service_not_configured' });
  } finally {
    restoreEnv('SUPABASE_URL', oldUrl);
    restoreEnv('SUPABASE_PUBLISHABLE_KEY', oldKey);
  }
});

test('public config sadece GET kabul eder', async () => {
  const res = mockResponse();
  await configHandler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
});

test('Vercel Hobby dagitimi en fazla 12 API fonksiyonu olusturur', () => {
  const apiDirectory = path.join(__dirname, '..', 'api');
  const functions = fs.readdirSync(apiDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'));
  assert.ok(functions.length <= 12, `${functions.length} API fonksiyonu Vercel Hobby sinirini asiyor`);
  assert.equal(fs.existsSync(path.join(apiDirectory, 'lib')), false, 'Yardimci moduller api/ altinda endpoint sayilir');
});
