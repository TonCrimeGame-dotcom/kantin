'use strict';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', statusCode >= 400 ? 'no-store' : 'public, max-age=300, s-maxage=300');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(payload));
}

module.exports = async function configHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');

  if (!supabaseUrl || !supabasePublishableKey) {
    sendJson(res, 503, { ok: false, error: 'service_not_configured' });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    supabaseUrl,
    supabasePublishableKey,
    rewardedAds: {
      enabled: Boolean(process.env.REWARDED_AD_PROVIDER) || (process.env.REWARDED_AD_TEST_MODE === 'true' && process.env.VERCEL_ENV !== 'production'),
      provider: process.env.REWARDED_AD_TEST_MODE === 'true' && process.env.VERCEL_ENV !== 'production'
        ? 'test'
        : String(process.env.REWARDED_AD_PROVIDER || ''),
      testMode: process.env.REWARDED_AD_TEST_MODE === 'true' && process.env.VERCEL_ENV !== 'production'
    }
  });
};
