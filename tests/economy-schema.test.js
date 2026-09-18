'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260831183000_economy_core.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('ekonomi semasi mevcut profil bakiyelerini kaybetmeden cuzdanlara tasir', () => {
  assert.match(migration, /insert into public\.coin_wallets \(user_id, balance\)[\s\S]*select id, coins[\s\S]*from public\.profiles/i);
  assert.match(migration, /migration:profile-coins:v1/);
  assert.match(migration, /initialize_kantin_wallet_after_profile/);
});

test('coin islemleri degistirilemez ve idempotenttir', () => {
  assert.match(migration, /unique \(user_id, idempotency_key\)/i);
  assert.match(migration, /coin_transactions_are_immutable/i);
  assert.match(migration, /before update or delete on public\.coin_transactions/i);
  assert.match(migration, /idempotency_key_conflict/i);
});

test('istemci cuzdan bakiyesine dogrudan yazamaz', () => {
  assert.match(migration, /revoke all on table public\.coin_wallets from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.coin_wallets to authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*public\.coin_wallets to authenticated/i);
  assert.match(migration, /grant execute on function public\._kantin_apply_coin_transaction\([^;]+\) to service_role;/i);
  assert.doesNotMatch(migration, /grant execute on function public\._kantin_apply_coin_transaction\([^;]+\) to authenticated;/i);
});

test('gunluk odul Istanbul gununde bir kez verilir', () => {
  assert.match(migration, /primary key \(user_id, claimed_on\)/i);
  assert.match(migration, /timezone\('Europe\/Istanbul', now\(\)\)/i);
  assert.match(migration, /'daily:' \|\| claim_day::text/i);
  assert.match(migration, /grant execute on function public\.kantin_claim_daily_reward\(\) to authenticated/i);
});
