'use strict';

const { createPublicKey, verify } = require('node:crypto');

const KEY_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const MAX_CALLBACK_AGE_MS = 24 * 60 * 60 * 1000;
let keyCache = { expiresAt: 0, keys: new Map() };

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function parseCallback(rawUrl) {
  const queryIndex = String(rawUrl || '').indexOf('?');
  if (queryIndex < 0) throw new Error('missing_query');
  const query = String(rawUrl).slice(queryIndex + 1);
  const signatureMarker = '&signature=';
  const signatureIndex = query.indexOf(signatureMarker);
  if (signatureIndex < 1) throw new Error('missing_signature');

  const signedContent = query.slice(0, signatureIndex);
  const signatureAndKey = query.slice(signatureIndex + 1);
  if (!/^signature=[^&]+&key_id=\d+$/.test(signatureAndKey)) throw new Error('invalid_signature_order');

  const params = new URLSearchParams(query);
  const keyId = params.get('key_id');
  const signature = params.get('signature');
  if (!keyId || !signature) throw new Error('missing_verification_fields');

  return {
    signedContent,
    signature: decodeBase64Url(signature),
    keyId,
    params
  };
}

async function publicKeys(fetchImpl = fetch) {
  if (keyCache.expiresAt > Date.now() && keyCache.keys.size) return keyCache.keys;
  const response = await fetchImpl(KEY_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('admob_key_server_unavailable');
  const payload = await response.json();
  const keys = new Map();
  for (const item of payload?.keys || []) {
    if (item?.keyId === undefined || !item?.pem) continue;
    keys.set(String(item.keyId), createPublicKey(item.pem));
  }
  if (!keys.size) throw new Error('admob_keys_missing');
  keyCache = { expiresAt: Date.now() + 23 * 60 * 60 * 1000, keys };
  return keys;
}

async function verifyCallback(rawUrl, fetchImpl = fetch) {
  const parsed = parseCallback(rawUrl);
  const keys = await publicKeys(fetchImpl);
  const publicKey = keys.get(parsed.keyId);
  if (!publicKey) throw new Error('admob_key_not_found');
  const valid = verify('sha256', Buffer.from(parsed.signedContent, 'utf8'), publicKey, parsed.signature);
  if (!valid) throw new Error('invalid_admob_signature');

  const timestamp = Number(parsed.params.get('timestamp'));
  if (!Number.isSafeInteger(timestamp) || timestamp > Date.now() + 5 * 60 * 1000 || Date.now() - timestamp > MAX_CALLBACK_AGE_MS) {
    throw new Error('invalid_admob_timestamp');
  }
  return parsed.params;
}

function resetKeyCache() {
  keyCache = { expiresAt: 0, keys: new Map() };
}

module.exports = { KEY_URL, parseCallback, verifyCallback, decodeBase64Url, resetKeyCache };
