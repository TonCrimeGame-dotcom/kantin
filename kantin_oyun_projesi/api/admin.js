'use strict';

const crypto = require('node:crypto');
const {
  AdminApiError,
  auditContext,
  assertSameOrigin,
  authorizeAdmin,
  rpc
} = require('./lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.end(JSON.stringify(payload));
}

function uuid(value, field) {
  const normalized = String(value || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new AdminApiError(`invalid_${field}`, 400);
  }
  return normalized;
}

function integer(value, field, min, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new AdminApiError(`invalid_${field}`, 400);
  return parsed;
}

async function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new AdminApiError('payload_too_large', 413);
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new AdminApiError('invalid_json', 400);
  }
}

function hasCapability(access, capability) {
  if (!Array.isArray(access?.capabilities) || !access.capabilities.includes(capability)) {
    throw new AdminApiError('admin_permission_denied', 403);
  }
}

async function handleGet(req, auth, action) {
  const params = new URL(req.url, 'https://kantin.invalid').searchParams;
  if (action === 'me') {
    return {
      role: auth.access.role,
      capabilities: auth.access.capabilities,
      profile: {
        id: auth.user.id,
        email: auth.user.email,
        username: auth.user.user_metadata?.username || auth.user.email.split('@')[0]
      }
    };
  }
  if (action === 'dashboard') {
    hasCapability(auth.access, 'dashboard');
    return rpc(auth.env, 'kantin_admin_dashboard', { p_admin_id: auth.user.id });
  }
  if (action === 'players') {
    hasCapability(auth.access, 'players');
    return rpc(auth.env, 'kantin_admin_players', {
      p_admin_id: auth.user.id,
      p_query: String(params.get('q') || '').slice(0, 80),
      p_limit: integer(params.get('limit') || 25, 'limit', 1, 100),
      p_offset: integer(params.get('offset') || 0, 'offset', 0, 1000000)
    });
  }
  if (action === 'player') {
    hasCapability(auth.access, 'players');
    return rpc(auth.env, 'kantin_admin_player', {
      p_admin_id: auth.user.id,
      p_user_id: uuid(params.get('id'), 'user_id')
    });
  }
  if (action === 'audit') {
    hasCapability(auth.access, 'audit');
    return rpc(auth.env, 'kantin_admin_audit', {
      p_admin_id: auth.user.id,
      p_limit: integer(params.get('limit') || 50, 'limit', 1, 100),
      p_offset: integer(params.get('offset') || 0, 'offset', 0, 1000000)
    });
  }
  throw new AdminApiError('unknown_admin_action', 404);
}

async function handlePost(req, auth, action) {
  assertSameOrigin(req);
  const body = await jsonBody(req);
  const requestId = body.requestId ? uuid(body.requestId, 'request_id') : crypto.randomUUID();
  if (action === 'adjust-coins') {
    hasCapability(auth.access, 'economy');
    return rpc(auth.env, 'kantin_admin_adjust_coins', {
      p_admin_id: auth.user.id,
      p_user_id: uuid(body.userId, 'user_id'),
      p_amount: integer(body.amount, 'amount', -1000000, 1000000),
      p_reason: String(body.reason || '').trim().slice(0, 240),
      p_request_id: requestId,
      p_context: auditContext(req)
    });
  }
  if (action === 'update-rewarded-ads') {
    hasCapability(auth.access, 'settings');
    return rpc(auth.env, 'kantin_admin_update_rewarded_ads', {
      p_admin_id: auth.user.id,
      p_enabled: body.enabled === true,
      p_reward_amount: integer(body.rewardAmount, 'reward_amount', 1, 10000),
      p_daily_limit: integer(body.dailyLimit, 'daily_limit', 0, 20),
      p_cooldown_seconds: integer(body.cooldownSeconds, 'cooldown_seconds', 0, 86400),
      p_session_ttl_seconds: integer(body.sessionTtlSeconds, 'session_ttl_seconds', 60, 3600),
      p_request_id: requestId,
      p_context: auditContext(req)
    });
  }
  throw new AdminApiError('unknown_admin_action', 404);
}

module.exports = async function adminHandler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('allow', 'GET, POST');
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const action = String(new URL(req.url, 'https://kantin.invalid').searchParams.get('action') || 'me');
    const auth = await authorizeAdmin(req);
    const data = req.method === 'GET'
      ? await handleGet(req, auth, action)
      : await handlePost(req, auth, action);
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    const known = error instanceof AdminApiError;
    if (!known || error.status >= 500) {
      console.error('Kantin admin API error', { code: error.code, message: error.message });
    }
    sendJson(res, known ? error.status : 500, {
      ok: false,
      error: known ? error.code : 'admin_service_unavailable'
    });
  }
};
