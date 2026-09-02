'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260901183000_admin_console_foundation.sql'), 'utf8');
const dashboardFix = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260901184500_fix_admin_dashboard_reward_column.sql'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api', 'admin.js'), 'utf8');
const authHelper = fs.readFileSync(path.join(root, 'api', 'lib', 'admin-auth.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src', 'admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('admin tabloları istemciye kapalı ve audit kaydı değiştirilemezdir', () => {
  assert.match(migration, /alter table public\.admin_memberships enable row level security/i);
  assert.match(migration, /alter table public\.admin_audit_log enable row level security/i);
  assert.match(migration, /revoke all on table public\.admin_memberships from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.admin_audit_log from public, anon, authenticated/i);
  assert.match(migration, /before update or delete on public\.admin_audit_log/i);
  assert.match(migration, /raise exception 'admin audit log is immutable'/i);
});

test('ilk yönetici yalnız doğrulanmış kalıcı hesap ve service role ile oluşturulur', () => {
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.match(migration, /email_confirmed_at is null/i);
  assert.match(migration, /coalesce\(selected_user\.is_anonymous, false\)/i);
  assert.match(migration, /lock table public\.admin_memberships/i);
  assert.match(authHelper, /ADMIN_EMAILS/);
  assert.match(authHelper, /createHash\('sha256'\)/);
  assert.doesNotMatch(client, /ADMIN_EMAILS|SERVICE_ROLE|SUPABASE_SECRET_KEY/);
});

test('manuel coin işlemi rol kontrolü, idempotency ve açıklamalı audit kullanır', () => {
  assert.match(migration, /_kantin_assert_admin\(p_admin_id, array\['owner', 'admin'\]/i);
  assert.match(migration, /public\._kantin_apply_coin_transaction\(/i);
  assert.match(migration, /'admin:' \|\| p_request_id::text/i);
  assert.match(migration, /'economy\.coins_adjusted'/i);
  assert.match(migration, /char_length\(clean_reason\) not between 8 and 240/i);
});

test('reklam politikası güvenli sunucu fonksiyonundan ve sınırlarla güncellenir', () => {
  assert.match(migration, /p_reward_amount not between 1 and 10000/i);
  assert.match(migration, /p_daily_limit not between 0 and 20/i);
  assert.match(migration, /p_cooldown_seconds not between 0 and 86400/i);
  assert.match(migration, /'economy\.rewarded_ads_updated'/i);
  assert.match(api, /kantin_admin_update_rewarded_ads/);
});

test('admin özeti ödüllü reklam tablosunun gerçek coin alanını kullanır', () => {
  assert.match(dashboardFix, /sum\(reward_amount\)/i);
  assert.doesNotMatch(dashboardFix, /configured_reward_amount/i);
  assert.match(dashboardFix, /perform public\._kantin_assert_admin\(p_admin_id\)/i);
});

test('admin API bearer oturumu, same-origin yazma ve yetenek kontrolü uygular', () => {
  assert.match(authHelper, /authorization:\s*`Bearer \$\{bearerToken\(req\)\}`/i);
  assert.match(api, /assertSameOrigin\(req\)/);
  assert.match(api, /hasCapability\(auth\.access, 'economy'\)/);
  assert.match(api, /hasCapability\(auth\.access, 'settings'\)/);
  assert.match(api, /cache-control', 'no-store/i);
});

test('admin sayfası indekslenmez, frame içine alınmaz ve gizli anahtar içermez', () => {
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/i);
  assert.match(html, /<html lang="tr" dir="ltr">/i);
  assert.match(html, /frame-ancestors 'none'/i);
  assert.match(html, /src="\.\/src\/admin\.js\?v=/i);
  assert.match(html, /id="adminSetupForm"/i);
  assert.match(client, /auth\.signUp\(/i);
  assert.doesNotMatch(html + client, /sb_secret_|service_role_key|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(client, /\['localhost', '127\.0\.0\.1'\]\.includes\(location\.hostname\)[\s\S]*preview.*=== '1'/i);
});

test('admin API desteklenmeyen yöntemi Supabase çağrısı yapmadan reddeder', async () => {
  const handler = require('../api/admin');
  const req = { method: 'DELETE', headers: {}, url: '/api/admin' };
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); }
  };
  await handler(req, response);
  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.body, { ok: false, error: 'method_not_allowed' });
});
