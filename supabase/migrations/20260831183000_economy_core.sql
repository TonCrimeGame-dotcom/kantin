create table if not exists public.economy_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint economy_settings_key_format check (key ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint economy_settings_value_object check (jsonb_typeof(value) = 'object')
);

create table if not exists public.economy_stakes (
  id text primary key,
  label text not null,
  tone text not null default 'blue' check (tone in ('blue', 'violet', 'gold')),
  entry_fee bigint not null check (entry_fee > 0),
  minimum_balance bigint not null check (minimum_balance >= entry_fee),
  sort_order smallint not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint economy_stakes_id_format check (id ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint economy_stakes_label_length check (char_length(btrim(label)) between 2 and 32)
);

create table if not exists public.economy_daily_rewards (
  day smallint primary key check (day between 1 and 7),
  coins bigint not null check (coins > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.economy_products (
  id text primary key,
  kind text not null check (kind in ('coin_pack', 'cosmetic')),
  title text not null,
  description text not null default '',
  coin_amount bigint check (coin_amount is null or coin_amount > 0),
  coin_price bigint check (coin_price is null or coin_price > 0),
  active boolean not null default false,
  sort_order smallint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint economy_products_id_format check (id ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint economy_products_title_length check (char_length(btrim(title)) between 2 and 64),
  constraint economy_products_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint economy_products_value check (
    (kind = 'coin_pack' and coin_amount is not null and coin_price is null)
    or (kind = 'cosmetic' and coin_price is not null and coin_amount is null)
  )
);

insert into public.economy_settings (key, value, is_public)
values (
  'core',
  '{"version":1,"currency":"KANTIN_COIN","symbol":"🪙","startingBalance":2500,"dailyResetTimezone":"Europe/Istanbul"}'::jsonb,
  true
)
on conflict (key) do nothing;

insert into public.economy_stakes (id, label, tone, entry_fee, minimum_balance, sort_order)
values
  ('beginner', 'Başlangıç', 'blue', 500, 500, 1),
  ('experienced', 'Tecrübeli', 'violet', 1500, 1500, 2),
  ('master', 'Usta', 'gold', 5000, 5000, 3)
on conflict (id) do nothing;

insert into public.economy_daily_rewards (day, coins)
values
  (1, 100),
  (2, 150),
  (3, 200),
  (4, 250),
  (5, 350),
  (6, 500),
  (7, 1000)
on conflict (day) do nothing;

insert into public.economy_products (id, kind, title, description, coin_amount, active, sort_order, metadata)
values (
  'starter_coin_pack',
  'coin_pack',
  'Başlangıç Paketi',
  '2.500 Kantin Coin',
  2500,
  false,
  1,
  '{"requiresPlatformSku":true}'::jsonb
)
on conflict (id) do nothing;

insert into public.economy_products (id, kind, title, description, coin_price, active, sort_order)
values
  ('gold_dice', 'cosmetic', 'Altın Zar', 'Özel zar görünümü', 1200, true, 10),
  ('walnut_table', 'cosmetic', 'Ceviz Masa', 'Tavla masa kaplaması', 2000, true, 20)
on conflict (id) do nothing;

create table if not exists public.coin_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  balance_before bigint not null check (balance_before >= 0),
  balance_after bigint not null check (balance_after >= 0),
  transaction_type text not null,
  source text not null,
  idempotency_key text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint coin_transactions_balance_math check (balance_after = balance_before + amount),
  constraint coin_transactions_type_format check (transaction_type ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint coin_transactions_source_format check (source ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint coin_transactions_idempotency_length check (char_length(idempotency_key) between 8 and 160),
  constraint coin_transactions_reference_length check (reference_id is null or char_length(reference_id) between 1 and 160),
  constraint coin_transactions_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (user_id, idempotency_key)
);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions (user_id, created_at desc);

create table if not exists public.daily_reward_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  claimed_on date not null,
  streak_day smallint not null check (streak_day between 1 and 7),
  amount bigint not null check (amount > 0),
  transaction_id uuid not null unique references public.coin_transactions(id),
  created_at timestamptz not null default now(),
  primary key (user_id, claimed_on)
);

insert into public.coin_wallets (user_id, balance)
select id, coins
from public.profiles
on conflict (user_id) do nothing;

insert into public.coin_transactions (
  user_id,
  amount,
  balance_before,
  balance_after,
  transaction_type,
  source,
  idempotency_key,
  reference_id,
  metadata
)
select
  user_id,
  balance,
  0,
  balance,
  'opening_balance',
  'migration',
  'migration:profile-coins:v1',
  'profiles.coins',
  '{"migration":"20260831183000_economy_core"}'::jsonb
from public.coin_wallets
where balance > 0
on conflict (user_id, idempotency_key) do nothing;

create or replace function public.set_economy_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_economy_settings_updated_at on public.economy_settings;
create trigger set_economy_settings_updated_at
  before update on public.economy_settings
  for each row execute procedure public.set_economy_updated_at();

drop trigger if exists set_economy_stakes_updated_at on public.economy_stakes;
create trigger set_economy_stakes_updated_at
  before update on public.economy_stakes
  for each row execute procedure public.set_economy_updated_at();

drop trigger if exists set_economy_daily_rewards_updated_at on public.economy_daily_rewards;
create trigger set_economy_daily_rewards_updated_at
  before update on public.economy_daily_rewards
  for each row execute procedure public.set_economy_updated_at();

drop trigger if exists set_economy_products_updated_at on public.economy_products;
create trigger set_economy_products_updated_at
  before update on public.economy_products
  for each row execute procedure public.set_economy_updated_at();

drop trigger if exists set_coin_wallet_updated_at on public.coin_wallets;
create trigger set_coin_wallet_updated_at
  before update on public.coin_wallets
  for each row execute procedure public.set_economy_updated_at();

create or replace function public.prevent_coin_transaction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'coin transactions are immutable' using errcode = '55000';
end;
$$;

drop trigger if exists coin_transactions_are_immutable on public.coin_transactions;
create trigger coin_transactions_are_immutable
  before update or delete on public.coin_transactions
  for each row execute procedure public.prevent_coin_transaction_mutation();

create or replace function public.sync_profile_coins_from_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set coins = new.balance
  where id = new.user_id and coins is distinct from new.balance;
  return new;
end;
$$;

drop trigger if exists sync_profile_coins_after_wallet_change on public.coin_wallets;
create trigger sync_profile_coins_after_wallet_change
  after insert or update of balance on public.coin_wallets
  for each row execute procedure public.sync_profile_coins_from_wallet();

create or replace function public.initialize_kantin_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  starting_balance bigint;
begin
  select coalesce((value ->> 'startingBalance')::bigint, new.coins)
  into starting_balance
  from public.economy_settings
  where key = 'core';

  starting_balance := coalesce(starting_balance, new.coins, 0);

  insert into public.coin_wallets (user_id, balance)
  values (new.id, starting_balance)
  on conflict (user_id) do nothing;

  if starting_balance > 0 then
    insert into public.coin_transactions (
      user_id,
      amount,
      balance_before,
      balance_after,
      transaction_type,
      source,
      idempotency_key,
      reference_id
    ) values (
      new.id,
      starting_balance,
      0,
      starting_balance,
      'opening_balance',
      'registration',
      'registration:opening-balance:v1',
      new.id::text
    )
    on conflict (user_id, idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists initialize_kantin_wallet_after_profile on public.profiles;
create trigger initialize_kantin_wallet_after_profile
  after insert on public.profiles
  for each row execute procedure public.initialize_kantin_wallet();

create or replace function public._kantin_apply_coin_transaction(
  p_user_id uuid,
  p_amount bigint,
  p_transaction_type text,
  p_source text,
  p_idempotency_key text,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.coin_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_wallet public.coin_wallets%rowtype;
  existing_transaction public.coin_transactions%rowtype;
  created_transaction public.coin_transactions%rowtype;
  next_balance bigint;
begin
  if p_user_id is null or p_amount = 0 then
    raise exception 'invalid coin transaction' using errcode = '22023';
  end if;

  if p_transaction_type !~ '^[a-z][a-z0-9_]{2,39}$'
    or p_source !~ '^[a-z][a-z0-9_]{2,39}$'
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid coin transaction metadata' using errcode = '22023';
  end if;

  insert into public.coin_wallets (user_id, balance)
  select id, coins from public.profiles where id = p_user_id
  on conflict (user_id) do nothing;

  select * into current_wallet
  from public.coin_wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'wallet_not_found' using errcode = 'P0002';
  end if;

  select * into existing_transaction
  from public.coin_transactions
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    if existing_transaction.amount <> p_amount
      or existing_transaction.transaction_type <> p_transaction_type
      or existing_transaction.source <> p_source then
      raise exception 'idempotency_key_conflict' using errcode = '23505';
    end if;
    return existing_transaction;
  end if;

  next_balance := current_wallet.balance + p_amount;
  if next_balance < 0 then
    raise exception 'insufficient_coins' using errcode = 'P0001';
  end if;

  update public.coin_wallets
  set balance = next_balance,
      version = version + 1
  where user_id = p_user_id;

  insert into public.coin_transactions (
    user_id,
    amount,
    balance_before,
    balance_after,
    transaction_type,
    source,
    idempotency_key,
    reference_id,
    metadata
  ) values (
    p_user_id,
    p_amount,
    current_wallet.balance,
    next_balance,
    p_transaction_type,
    p_source,
    p_idempotency_key,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into created_transaction;

  return created_transaction;
end;
$$;

create or replace function public.kantin_my_economy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
  claim_day date := (timezone('Europe/Istanbul', now()))::date;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'wallet', jsonb_build_object(
      'balance', wallet.balance,
      'version', wallet.version,
      'updatedAt', wallet.updated_at
    ),
    'core', coalesce((
      select value from public.economy_settings where key = 'core' and is_public
    ), '{}'::jsonb),
    'stakes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'label', label,
        'tone', tone,
        'entryFee', entry_fee,
        'minimumBalance', minimum_balance
      ) order by sort_order, entry_fee)
      from public.economy_stakes
      where active
    ), '[]'::jsonb),
    'dailyRewards', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'coins', coins) order by day)
      from public.economy_daily_rewards
      where active
    ), '[]'::jsonb),
    'dailyClaim', jsonb_build_object(
      'claimedToday', exists(
        select 1 from public.daily_reward_claims
        where user_id = current_user_id and claimed_on = claim_day
      ),
      'claimedOn', (
        select claimed_on from public.daily_reward_claims
        where user_id = current_user_id
        order by claimed_on desc limit 1
      ),
      'streakDay', coalesce((
        select case
          when claimed_on in (claim_day, claim_day - 1) then streak_day
          else 0
        end
        from public.daily_reward_claims
        where user_id = current_user_id
        order by claimed_on desc limit 1
      ), 0)
    )
  ) into result
  from public.coin_wallets wallet
  where wallet.user_id = current_user_id;

  if result is null then
    raise exception 'wallet_not_found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.kantin_claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  claim_day date := (timezone('Europe/Istanbul', now()))::date;
  current_claim public.daily_reward_claims%rowtype;
  previous_claim public.daily_reward_claims%rowtype;
  selected_streak_day smallint;
  reward_amount bigint;
  reward_transaction public.coin_transactions%rowtype;
  wallet_balance bigint;
  was_already_claimed boolean := false;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into current_claim
  from public.daily_reward_claims
  where user_id = current_user_id and claimed_on = claim_day;

  if found then
    was_already_claimed := true;
  else
    select * into previous_claim
    from public.daily_reward_claims
    where user_id = current_user_id and claimed_on < claim_day
    order by claimed_on desc
    limit 1;

    if found and previous_claim.claimed_on = claim_day - 1 then
      selected_streak_day := (previous_claim.streak_day % 7) + 1;
    else
      selected_streak_day := 1;
    end if;

    select coins into reward_amount
    from public.economy_daily_rewards
    where day = selected_streak_day and active;

    if reward_amount is null then
      raise exception 'daily_reward_not_configured' using errcode = 'P0002';
    end if;

    reward_transaction := public._kantin_apply_coin_transaction(
      current_user_id,
      reward_amount,
      'daily_reward',
      'daily_reward',
      'daily:' || claim_day::text,
      claim_day::text,
      jsonb_build_object('streakDay', selected_streak_day)
    );

    insert into public.daily_reward_claims (
      user_id,
      claimed_on,
      streak_day,
      amount,
      transaction_id
    ) values (
      current_user_id,
      claim_day,
      selected_streak_day,
      reward_amount,
      reward_transaction.id
    )
    on conflict (user_id, claimed_on) do nothing;

    select * into current_claim
    from public.daily_reward_claims
    where user_id = current_user_id and claimed_on = claim_day;
  end if;

  select balance into wallet_balance
  from public.coin_wallets
  where user_id = current_user_id;

  return jsonb_build_object(
    'balance', wallet_balance,
    'amount', current_claim.amount,
    'streakDay', current_claim.streak_day,
    'claimedOn', current_claim.claimed_on,
    'alreadyClaimed', was_already_claimed
  );
end;
$$;

alter table public.economy_settings enable row level security;
alter table public.economy_stakes enable row level security;
alter table public.economy_daily_rewards enable row level security;
alter table public.economy_products enable row level security;
alter table public.coin_wallets enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.daily_reward_claims enable row level security;

revoke all on table public.economy_settings from anon, authenticated;
revoke all on table public.economy_stakes from anon, authenticated;
revoke all on table public.economy_daily_rewards from anon, authenticated;
revoke all on table public.economy_products from anon, authenticated;
revoke all on table public.coin_wallets from anon, authenticated;
revoke all on table public.coin_transactions from anon, authenticated;
revoke all on table public.daily_reward_claims from anon, authenticated;

grant select on table public.economy_settings to anon, authenticated;
grant select on table public.economy_stakes to anon, authenticated;
grant select on table public.economy_daily_rewards to anon, authenticated;
grant select on table public.economy_products to anon, authenticated;
grant select on table public.coin_wallets to authenticated;
grant select on table public.coin_transactions to authenticated;
grant select on table public.daily_reward_claims to authenticated;

drop policy if exists "Public economy settings are readable" on public.economy_settings;
create policy "Public economy settings are readable"
  on public.economy_settings for select to anon, authenticated
  using (is_public);

drop policy if exists "Active economy stakes are readable" on public.economy_stakes;
create policy "Active economy stakes are readable"
  on public.economy_stakes for select to anon, authenticated
  using (active);

drop policy if exists "Active daily rewards are readable" on public.economy_daily_rewards;
create policy "Active daily rewards are readable"
  on public.economy_daily_rewards for select to anon, authenticated
  using (active);

drop policy if exists "Active economy products are readable" on public.economy_products;
create policy "Active economy products are readable"
  on public.economy_products for select to anon, authenticated
  using (active);

drop policy if exists "Players can read their wallet" on public.coin_wallets;
create policy "Players can read their wallet"
  on public.coin_wallets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can read their coin transactions" on public.coin_transactions;
create policy "Players can read their coin transactions"
  on public.coin_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can read their daily claims" on public.daily_reward_claims;
create policy "Players can read their daily claims"
  on public.daily_reward_claims for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on function public._kantin_apply_coin_transaction(uuid, bigint, text, text, text, text, jsonb) from public;
grant execute on function public._kantin_apply_coin_transaction(uuid, bigint, text, text, text, text, jsonb) to service_role;

revoke all on function public.kantin_my_economy() from public;
grant execute on function public.kantin_my_economy() to authenticated;

revoke all on function public.kantin_claim_daily_reward() from public;
grant execute on function public.kantin_claim_daily_reward() to authenticated;

comment on table public.coin_wallets is 'Authoritative Kantin Coin balance. Clients have read-only access to their own wallet.';
comment on table public.coin_transactions is 'Immutable, idempotent Kantin Coin ledger.';
comment on table public.economy_settings is 'Server-managed economy configuration that can change without an app release.';
comment on function public._kantin_apply_coin_transaction(uuid, bigint, text, text, text, text, jsonb) is 'Service-only atomic coin mutation with idempotency and insufficient-funds protection.';
comment on function public.kantin_claim_daily_reward() is 'Authenticated, one-claim-per-Istanbul-day daily reward operation.';
comment on column public.profiles.coins is 'Compatibility mirror of coin_wallets.balance; never mutate from a client.';
