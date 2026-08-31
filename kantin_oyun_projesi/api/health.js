'use strict';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function healthHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!baseUrl || !secretKey) {
    sendJson(res, 503, { ok: false, error: 'service_not_configured' });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/kantin_health`, {
      method: 'POST',
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/json'
      },
      body: '{}',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) throw new Error(`Supabase health request failed: ${response.status}`);
    const database = await response.json();
    sendJson(res, 200, { ok: true, service: 'kantin-api', database });
  } catch (error) {
    console.error('Kantin health check failed', { message: error.message });
    sendJson(res, 503, { ok: false, error: 'service_unavailable' });
  }
};
