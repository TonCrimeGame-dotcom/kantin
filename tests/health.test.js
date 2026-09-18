'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const healthHandler = require('../api/health');

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

test('health endpoint eksik Supabase ayarinda 503 doner', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldSecret = process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  try {
    const res = mockResponse();
    await healthHandler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { ok: false, error: 'service_not_configured' });
  } finally {
    restoreEnv('SUPABASE_URL', oldUrl);
    restoreEnv('SUPABASE_SECRET_KEY', oldSecret);
  }
});

test('health endpoint Supabase RPC basarisini raporlar ve anahtari sizdirmaz', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldSecret = process.env.SUPABASE_SECRET_KEY;
  const oldFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co/';
  process.env.SUPABASE_SECRET_KEY = 'server-secret';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/kantin_health');
    assert.equal(options.headers.apikey, 'server-secret');
    return { ok: true, json: async () => ({ ok: true, database_time: '2026-08-31T00:00:00' }) };
  };

  try {
    const res = mockResponse();
    await healthHandler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.database.ok, true);
    assert.equal(JSON.stringify(res.body).includes('server-secret'), false);
  } finally {
    global.fetch = oldFetch;
    restoreEnv('SUPABASE_URL', oldUrl);
    restoreEnv('SUPABASE_SECRET_KEY', oldSecret);
  }
});

test('health endpoint yalnizca GET kabul eder', async () => {
  const res = mockResponse();
  await healthHandler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
});
