'use strict';

const crypto = require('node:crypto');

class AdminApiError extends Error {
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
  if (!url || !publishableKey || !serviceKey) throw new AdminApiError('admin_service_not_configured', 503);
  return { url, publishableKey, serviceKey };
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new AdminApiError('authentication_required', 401);
  return match[1];
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

async function getAuthenticatedUser(req, env = environment()) {
  const response = await fetch(`${env.url}/auth/v1/user`, {
    headers: {
      apikey: env.publishableKey,
      authorization: `Bearer ${bearerToken(req)}`,
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(7000)
  });
  const payload = await readPayload(response);
  if (!response.ok || !payload?.id) throw new AdminApiError('invalid_session', 401);
  if (!payload.email || !payload.email_confirmed_at || payload.is_anonymous) {
    throw new AdminApiError('permanent_confirmed_account_required', 403);
  }
  return payload;
}

async function serviceRequest(env, path, options = {}) {
  const response = await fetch(`${env.url}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...serviceHeaders(env.serviceKey),
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(10000)
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.code || `supabase_${response.status}`;
    const denied = response.status === 401 || response.status === 403 || /permission_denied|service_role_required/i.test(message);
    throw new AdminApiError(denied ? 'admin_permission_denied' : message, denied ? 403 : response.status, payload);
  }
  return payload;
}

function configuredAdminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function rpc(env, name, body) {
  return serviceRequest(env, `/rest/v1/rpc/${name}`, { method: 'POST', body });
}

async function membership(env, userId) {
  const rows = await serviceRequest(
    env,
    `/rest/v1/admin_memberships?select=user_id,role,active,created_at&user_id=eq.${encodeURIComponent(userId)}&active=is.true&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function bootstrapOwnerIfAllowed(env, user) {
  if (!configuredAdminEmails().has(String(user.email).toLowerCase())) return null;
  const requestId = crypto.randomUUID();
  const emailHash = crypto.createHash('sha256').update(String(user.email).trim().toLowerCase()).digest('hex');
  try {
    return await rpc(env, 'kantin_admin_bootstrap_owner', {
      p_user_id: user.id,
      p_email_hash: emailHash,
      p_request_id: requestId
    });
  } catch (error) {
    if (!/admin_owner_already_exists/i.test(error.code || error.message)) throw error;
    return null;
  }
}

async function authorizeAdmin(req) {
  const env = environment();
  const user = await getAuthenticatedUser(req, env);
  let member = await membership(env, user.id);
  if (!member) {
    await bootstrapOwnerIfAllowed(env, user);
    member = await membership(env, user.id);
  }
  if (!member) throw new AdminApiError('admin_permission_denied', 403);
  const access = await rpc(env, 'kantin_admin_access', { p_user_id: user.id });
  return { env, user, member, access };
}

function auditContext(req) {
  const salt = String(process.env.ADMIN_AUDIT_SALT || '');
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    ...(salt && forwarded ? { ipHash: crypto.createHmac('sha256', salt).update(forwarded).digest('hex') } : {}),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    deployment: String(process.env.VERCEL_ENV || 'local')
  };
}

function assertSameOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const protocol = String(req.headers['x-forwarded-proto'] || 'https');
  if (!host || origin !== `${protocol}://${host}`) throw new AdminApiError('origin_not_allowed', 403);
}

module.exports = {
  AdminApiError,
  auditContext,
  assertSameOrigin,
  authorizeAdmin,
  rpc
};
