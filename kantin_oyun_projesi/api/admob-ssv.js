'use strict';

const { verifyCallback } = require('./lib/admob-ssv');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function configuredAdUnits() {
  return new Set([
    ...(process.env.ADMOB_REWARDED_AD_UNIT_IDS || '').split(','),
    process.env.ADMOB_REWARDED_AD_UNIT_ID_ANDROID,
    process.env.ADMOB_REWARDED_AD_UNIT_ID_IOS
  ].map(value => String(value || '').trim()).filter(Boolean));
}

async function grantReward(sessionId, transactionId, metadata) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('reward_service_not_configured');
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/kantin_verify_rewarded_ad`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      p_session_id: sessionId,
      p_provider_transaction_id: transactionId,
      p_verification_metadata: metadata
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || 'reward_grant_failed');
  return payload;
}

module.exports = async function admobSsvHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const adUnits = configuredAdUnits();
    if (!adUnits.size) throw new Error('admob_not_configured');
    const params = await verifyCallback(req.url);
    const sessionId = String(params.get('custom_data') || '');
    const transactionId = String(params.get('transaction_id') || '');
    const adUnit = String(params.get('ad_unit') || '');
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('invalid_reward_session');
    if (transactionId.length < 8 || transactionId.length > 200) throw new Error('invalid_transaction_id');
    if (!adUnits.has(adUnit)) throw new Error('unknown_ad_unit');

    const reward = await grantReward(sessionId, transactionId, {
      provider: 'admob',
      adNetwork: params.get('ad_network'),
      adUnit,
      rewardAmountReported: params.get('reward_amount'),
      rewardItem: params.get('reward_item'),
      callbackTimestamp: params.get('timestamp')
    });
    sendJson(res, 200, { ok: true, status: reward?.status || 'rewarded' });
  } catch (error) {
    const unavailable = /not_configured|unavailable|keys_missing/.test(error.message);
    sendJson(res, unavailable ? 503 : 400, { ok: false, error: error.message });
  }
};
