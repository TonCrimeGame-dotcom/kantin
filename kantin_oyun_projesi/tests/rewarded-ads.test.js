'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, sign } = require('node:crypto');
const { parseCallback, verifyCallback, resetKeyCache } = require('../api/lib/admob-ssv');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260901143000_rewarded_ads_foundation.sql'), 'utf8');
const economyClient = fs.readFileSync(path.join(__dirname, '..', 'src', 'economy-client.js'), 'utf8');
const rewardedClient = fs.readFileSync(path.join(__dirname, '..', 'src', 'rewarded-ads.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const admobApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'admob-ssv.js'), 'utf8');
const rewardedTestApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'rewarded-ad-test.js'), 'utf8');
const mobileAdmob = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mobile', 'admob.config.json'), 'utf8'));

test('reklam oturumlari kullanicidan gizli yazma yetkisi ve tekil saglayici islemi kullanir', () => {
  assert.match(migration, /create table if not exists public\.rewarded_ad_sessions/i);
  assert.match(migration, /unique \(provider, provider_transaction_id\)/i);
  assert.match(migration, /revoke all on table public\.rewarded_ad_sessions from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*rewarded_ad_sessions to authenticated/i);
});
test('coin sadece service role reklam dogrulamasindan idempotent deftere gider', () => {
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.match(migration, /public\._kantin_apply_coin_transaction\(/i);
  assert.match(migration, /'rewarded-ad:' \|\| selected_session\.id::text/i);
  assert.match(migration, /grant execute on function public\.kantin_verify_rewarded_ad\([^;]+\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.kantin_verify_rewarded_ad\([^;]+\) to authenticated/i);
});

test('gunluk limit ve bekleme suresi sunucuda uygulanir', () => {
  assert.match(migration, /rewarded_ad_daily_limit/i);
  assert.match(migration, /rewarded_ad_cooldown/i);
  assert.match(migration, /timezone\('Europe\/Istanbul', rewarded_at\)/i);
  assert.match(migration, /"dailyLimit":4/i);
  assert.match(migration, /"cooldownSeconds":600/i);
});

test('istemci dogrudan coin yazmak yerine reklam oturumu ve durum RPClerini kullanir', () => {
  assert.match(economyClient, /kantin_begin_rewarded_ad/);
  assert.match(economyClient, /kantin_rewarded_ad_status/);
  assert.match(rewardedClient, /waitForReward/);
  assert.match(appSource, /data-action="watch-ad"/);
  assert.doesNotMatch(rewardedClient, /coin_transactions|coin_wallets/);
});

test('AdMob callback imzasi ham sorgu sirasi bozulmadan ECDSA ile dogrulanir', async () => {
  resetKeyCache();
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const timestamp = Date.now();
  const signedContent = `ad_network=5450213213286189855&ad_unit=test-unit&custom_data=11111111-1111-4111-8111-111111111111&reward_amount=150&reward_item=coins&timestamp=${timestamp}&transaction_id=transaction-123&user_id=user-123`;
  const signature = sign('sha256', Buffer.from(signedContent), privateKey).toString('base64url');
  const callback = `/api/admob-ssv?${signedContent}&signature=${signature}&key_id=42`;
  const parsed = parseCallback(callback);
  assert.equal(parsed.signedContent, signedContent);

  const params = await verifyCallback(callback, async () => ({
    ok: true,
    json: async () => ({ keys: [{ keyId: 42, pem: publicKey.export({ type: 'spki', format: 'pem' }) }] })
  }));
  assert.equal(params.get('transaction_id'), 'transaction-123');
});

test('AdMob imza ve anahtar parametreleri sonda ve dogru sirada olmalidir', () => {
  assert.throws(
    () => parseCallback('/api/admob-ssv?ad_unit=x&key_id=42&signature=abc'),
    /invalid_signature_order|missing_signature/
  );
});

test('AdMob sunucusu yeni Supabase secret anahtarini ve Android kimliklerini destekler', () => {
  assert.match(admobApi, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/);
  assert.match(rewardedTestApi, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/);
  assert.match(mobileAdmob.android.appId, /^ca-app-pub-\d+~\d+$/);
  assert.match(mobileAdmob.android.rewardedAdUnitId, /^ca-app-pub-\d+\/\d+$/);
  assert.equal(mobileAdmob.android.testRewardedAdUnitId, 'ca-app-pub-3940256099942544/5224354917');
});

test('AdMob SSV kurulum testi coin vermeden dogrulanir ve sayisal reklam birimini kabul eder', () => {
  assert.match(admobApi, /ADMOB_VERIFICATION_CUSTOM_DATA = 'kantin-admob-verification'/);
  assert.match(admobApi, /value\.split\('\/'\)\.pop\(\)/);
  assert.match(admobApi, /status: 'verified'/);
  assert.ok(admobApi.indexOf("status: 'verified'") < admobApi.indexOf('const reward = await grantReward(sessionId'));
});
