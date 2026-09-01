'use strict';

const crypto = require('node:crypto');

class MatchApiError extends Error {
  constructor(code, status = 400, details = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function environment() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '');
  const sessionSecret = String(process.env.MATCH_SESSION_SECRET || serviceKey);
  if (!url || !publishableKey || !serviceKey || !sessionSecret) throw new MatchApiError('match_service_not_configured', 503);
  return { url, publishableKey, serviceKey, sessionSecret };
}

function serviceHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    accept: 'application/json',
    'content-type': 'application/json',
    ...(serviceKey.startsWith('eyJ') ? { authorization: `Bearer ${serviceKey}` } : {})
  };
}

async function readPayload(response) {
  if (response.status === 204) return null;
  return response.json().catch(() => ({}));
}

async function serviceRequest(path, options = {}, env = environment()) {
  const response = await fetch(`${env.url}${path}`, {
    method: options.method || 'GET',
    headers: { ...serviceHeaders(env.serviceKey), ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeout || 9000)
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    const message = payload?.message || payload?.hint || payload?.details || payload?.code || `supabase_${response.status}`;
    throw new MatchApiError('match_storage_failed', response.status >= 500 ? 503 : 400, message);
  }
  return payload;
}

async function rpc(name, body, env = environment()) {
  return serviceRequest(`/rest/v1/rpc/${encodeURIComponent(name)}`, { method: 'POST', body }, env);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signGuest(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyGuest(token, secret) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra) throw new MatchApiError('invalid_match_session', 401);
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { throw new MatchApiError('invalid_match_session', 401); }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new MatchApiError('invalid_match_session', 401);
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw new MatchApiError('invalid_match_session', 401); }
  if (!payload?.playerId || !payload?.username || Number(payload.expiresAt) < Date.now()) throw new MatchApiError('expired_match_session', 401);
  return payload;
}

function cleanUsername(value) {
  const username = String(value || 'Oyuncu').trim().replace(/\s+/g, ' ').slice(0, 30);
  return username || 'Oyuncu';
}

function guestIdentity(installationId, username, env = environment()) {
  const installation = String(installationId || '').trim();
  if (!/^[a-zA-Z0-9-]{16,160}$/.test(installation)) throw new MatchApiError('invalid_installation_id', 400);
  const playerId = `GUEST-${crypto.createHmac('sha256', env.sessionSecret).update(installation).digest('hex').slice(0, 24).toUpperCase()}`;
  const identity = {
    playerId,
    username: cleanUsername(username),
    installationId: installation,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
  return { ...identity, matchSessionToken: signGuest(identity, env.sessionSecret), guest: true };
}

function bearerToken(req) {
  return String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

async function authenticatedIdentity(req, env = environment()) {
  const bearer = bearerToken(req);
  if (!bearer) return null;
  const response = await fetch(`${env.url}/auth/v1/user`, {
    headers: { apikey: env.publishableKey, authorization: `Bearer ${bearer}`, accept: 'application/json' },
    signal: AbortSignal.timeout(7000)
  });
  const user = await readPayload(response);
  if (!response.ok || !user?.id) throw new MatchApiError('invalid_session', 401);
  const rows = await serviceRequest(`/rest/v1/profiles?select=id,username,player_code,avatar_url,level,coins,is_guest,preferred_locale&id=eq.${encodeURIComponent(user.id)}&limit=1`, {}, env);
  const profile = Array.isArray(rows) ? rows[0] : null;
  return {
    playerId: user.id,
    username: cleanUsername(profile?.username || user.user_metadata?.username),
    guest: Boolean(profile?.is_guest || user.is_anonymous),
    profile
  };
}

async function identityForSession(req, body, env = environment()) {
  const authenticated = await authenticatedIdentity(req, env);
  if (authenticated) return authenticated;
  return guestIdentity(body.installationId, body.username, env);
}

async function identityForRequest(req, env = environment()) {
  const authenticated = await authenticatedIdentity(req, env);
  if (authenticated) return authenticated;
  return verifyGuest(req.headers['x-kantin-match-session'], env.sessionSecret);
}

function assertSameOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const protocol = String(req.headers['x-forwarded-proto'] || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'));
  if (!host || origin !== `${protocol}://${host}`) throw new MatchApiError('origin_not_allowed', 403);
}

module.exports = {
  MatchApiError,
  assertSameOrigin,
  authenticatedIdentity,
  environment,
  guestIdentity,
  identityForRequest,
  identityForSession,
  rpc,
  serviceRequest,
  signGuest,
  verifyGuest
};
