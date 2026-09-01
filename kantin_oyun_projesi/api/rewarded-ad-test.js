'use strict';

const { randomUUID } = require('node:crypto');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('payload_too_large');
  }
  return JSON.parse(raw || '{}');
}

module.exports = async function rewardedAdTestHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  if (process.env.REWARDED_AD_TEST_MODE !== 'true' || process.env.VERCEL_ENV === 'production') {
    sendJson(res, 404, { ok: false, error: 'test_provider_disabled' });
    return;
  }

  try {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) throw new Error('reward_service_not_configured');
    if (!token) throw new Error('authentication_required');

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${token}` }
    });
    if (!userResponse.ok) throw new Error('authentication_required');

    const body = await readBody(req);
    const sessionId = String(body.sessionId || '');
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('invalid_reward_session');

    const statusResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/kantin_rewarded_ad_status`, {
      method: 'POST',
      headers: { apikey: publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_session_id: sessionId })
    });
    if (!statusResponse.ok) throw new Error('rewarded_ad_session_not_found');

    const verifyResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/kantin_verify_rewarded_ad`, {
      method: 'POST',
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        p_session_id: sessionId,
        p_provider_transaction_id: `test:${randomUUID()}`,
        p_verification_metadata: { provider: 'test', verifiedBy: 'vercel-preview' }
      })
    });
    const payload = await verifyResponse.json().catch(() => ({}));
    if (!verifyResponse.ok) throw new Error(payload?.message || 'reward_grant_failed');
    sendJson(res, 200, { ok: true, ...payload });
  } catch (error) {
    sendJson(res, /authentication/.test(error.message) ? 401 : 400, { ok: false, error: error.message });
  }
};
