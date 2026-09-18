-- Rewarded advertising is tracked separately from the immutable coin ledger.
-- A client may open a session, but only a service-role callback can verify it
-- and grant the configured reward.

insert into public.economy_settings (key, value, is_public)
values (
  'rewarded_ads',
  '{"enabled":true,"rewardAmount":150,"dailyLimit":4,"cooldownSeconds":600,"sessionTtlSeconds":900}'::jsonb,
  true
)
on conflict (key) do nothing;

create table if not exists public.rewarded_ad_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  platform text not null,
  placement text not null,
  status text not null default 'created',
  reward_amount bigint not null check (reward_amount > 0),
  provider_transaction_id text,
  coin_transaction_id uuid unique references public.coin_transactions(id),
  client_metadata jsonb not null default '{}'::jsonb,
  verification_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  rewarded_at timestamptz,
  constraint rewarded_ad_provider_format check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint rewarded_ad_platform_format check (platform ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint rewarded_ad_placement_format check (placement ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint rewarded_ad_status check (status in ('created', 'rewarded', 'expired', 'rejected')),
  constraint rewarded_ad_provider_transaction_length check (
    provider_transaction_id is null or char_length(provider_transaction_id) between 8 and 200
  ),
  constraint rewarded_ad_metadata_objects check (
    jsonb_typeof(client_metadata) = 'object' and jsonb_typeof(verification_metadata) = 'object'
  ),
  constraint rewarded_ad_expiry_after_creation check (expires_at > created_at),
  unique (provider, provider_transaction_id)
);

create index if not exists rewarded_ad_sessions_user_created_idx
  on public.rewarded_ad_sessions (user_id, created_at desc);

create index if not exists rewarded_ad_sessions_user_rewarded_idx
  on public.rewarded_ad_sessions (user_id, rewarded_at desc)
  where status = 'rewarded';

alter table public.rewarded_ad_sessions enable row level security;
revoke all on table public.rewarded_ad_sessions from anon, authenticated;
grant select on table public.rewarded_ad_sessions to authenticated;

drop policy if exists "Players can read their rewarded ad sessions" on public.rewarded_ad_sessions;
create policy "Players can read their rewarded ad sessions"
  on public.rewarded_ad_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.kantin_rewarded_ad_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  settings jsonb;
  reward_amount bigint;
  daily_limit integer;
  cooldown_seconds integer;
  rewarded_today integer;
  last_rewarded_at timestamptz;
  cooldown_until timestamptz;
  current_day date := (timezone('Europe/Istanbul', now()))::date;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select value into settings
  from public.economy_settings
  where key = 'rewarded_ads' and is_public;

  if settings is null then
    raise exception 'rewarded_ads_not_configured' using errcode = 'P0002';
  end if;

  reward_amount := greatest(1, coalesce((settings ->> 'rewardAmount')::bigint, 150));
  daily_limit := greatest(1, coalesce((settings ->> 'dailyLimit')::integer, 4));
  cooldown_seconds := greatest(0, coalesce((settings ->> 'cooldownSeconds')::integer, 600));

  select count(*)::integer, max(rewarded_at)
  into rewarded_today, last_rewarded_at
  from public.rewarded_ad_sessions
  where user_id = current_user_id
    and status = 'rewarded'
    and (timezone('Europe/Istanbul', rewarded_at))::date = current_day;

  cooldown_until := case
    when last_rewarded_at is null then null
    else last_rewarded_at + make_interval(secs => cooldown_seconds)
  end;

  return jsonb_build_object(
    'enabled', coalesce((settings ->> 'enabled')::boolean, false),
    'rewardAmount', reward_amount,
    'dailyLimit', daily_limit,
    'watchedToday', rewarded_today,
    'remainingToday', greatest(0, daily_limit - rewarded_today),
    'cooldownSeconds', cooldown_seconds,
    'cooldownUntil', cooldown_until,
    'canStart',
      coalesce((settings ->> 'enabled')::boolean, false)
      and rewarded_today < daily_limit
      and (cooldown_until is null or cooldown_until <= now())
  );
end;
$$;

create or replace function public.kantin_begin_rewarded_ad(
  p_provider text,
  p_platform text,
  p_placement text default 'lobby',
  p_client_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  settings jsonb;
  reward_state jsonb;
  reward_amount bigint;
  ttl_seconds integer;
  existing_session public.rewarded_ad_sessions%rowtype;
  created_session public.rewarded_ad_sessions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_provider not in ('admob', 'web', 'telegram', 'test')
    or p_platform not in ('android', 'ios', 'web', 'telegram', 'test')
    or p_placement !~ '^[a-z][a-z0-9_]{1,39}$'
    or jsonb_typeof(coalesce(p_client_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_rewarded_ad_request' using errcode = '22023';
  end if;

  select value into settings
  from public.economy_settings
  where key = 'rewarded_ads' and is_public;

  reward_state := public.kantin_rewarded_ad_state();
  if not coalesce((reward_state ->> 'enabled')::boolean, false) then
    raise exception 'rewarded_ads_disabled' using errcode = 'P0001';
  end if;
  if coalesce((reward_state ->> 'remainingToday')::integer, 0) <= 0 then
    raise exception 'rewarded_ad_daily_limit' using errcode = 'P0001';
  end if;
  if not coalesce((reward_state ->> 'canStart')::boolean, false) then
    raise exception 'rewarded_ad_cooldown' using errcode = 'P0001';
  end if;

  update public.rewarded_ad_sessions
  set status = 'expired'
  where user_id = current_user_id and status = 'created' and expires_at <= now();

  select * into existing_session
  from public.rewarded_ad_sessions
  where user_id = current_user_id
    and provider = p_provider
    and platform = p_platform
    and placement = p_placement
    and status = 'created'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id', existing_session.id,
      'userId', existing_session.user_id,
      'provider', existing_session.provider,
      'platform', existing_session.platform,
      'placement', existing_session.placement,
      'rewardAmount', existing_session.reward_amount,
      'expiresAt', existing_session.expires_at
    );
  end if;

  reward_amount := greatest(1, coalesce((settings ->> 'rewardAmount')::bigint, 150));
  ttl_seconds := greatest(60, least(3600, coalesce((settings ->> 'sessionTtlSeconds')::integer, 900)));

  insert into public.rewarded_ad_sessions (
    user_id, provider, platform, placement, reward_amount, client_metadata, expires_at
  ) values (
    current_user_id,
    p_provider,
    p_platform,
    p_placement,
    reward_amount,
    coalesce(p_client_metadata, '{}'::jsonb),
    now() + make_interval(secs => ttl_seconds)
  )
  returning * into created_session;

  return jsonb_build_object(
    'id', created_session.id,
    'userId', created_session.user_id,
    'provider', created_session.provider,
    'platform', created_session.platform,
    'placement', created_session.placement,
    'rewardAmount', created_session.reward_amount,
    'expiresAt', created_session.expires_at
  );
end;
$$;

create or replace function public.kantin_rewarded_ad_status(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_session public.rewarded_ad_sessions%rowtype;
  wallet_balance bigint;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into selected_session
  from public.rewarded_ad_sessions
  where id = p_session_id and user_id = current_user_id;

  if not found then
    raise exception 'rewarded_ad_session_not_found' using errcode = 'P0002';
  end if;

  select balance into wallet_balance
  from public.coin_wallets
  where user_id = current_user_id;

  return jsonb_build_object(
    'id', selected_session.id,
    'status', selected_session.status,
    'rewardAmount', selected_session.reward_amount,
    'balance', wallet_balance,
    'expiresAt', selected_session.expires_at,
    'rewardedAt', selected_session.rewarded_at
  );
end;
$$;

create or replace function public.kantin_verify_rewarded_ad(
  p_session_id uuid,
  p_provider_transaction_id text,
  p_verification_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_session public.rewarded_ad_sessions%rowtype;
  reward_transaction public.coin_transactions%rowtype;
  wallet_balance bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if char_length(coalesce(p_provider_transaction_id, '')) not between 8 and 200
    or jsonb_typeof(coalesce(p_verification_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_reward_verification' using errcode = '22023';
  end if;

  select * into selected_session
  from public.rewarded_ad_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'rewarded_ad_session_not_found' using errcode = 'P0002';
  end if;

  if selected_session.status = 'rewarded' then
    select balance into wallet_balance from public.coin_wallets where user_id = selected_session.user_id;
    return jsonb_build_object(
      'id', selected_session.id,
      'status', selected_session.status,
      'amount', selected_session.reward_amount,
      'balance', wallet_balance,
      'alreadyRewarded', true
    );
  end if;

  if selected_session.status <> 'created' or selected_session.expires_at <= now() then
    update public.rewarded_ad_sessions set status = 'expired'
    where id = selected_session.id and status = 'created';
    raise exception 'rewarded_ad_session_expired' using errcode = 'P0001';
  end if;

  reward_transaction := public._kantin_apply_coin_transaction(
    selected_session.user_id,
    selected_session.reward_amount,
    'rewarded_ad',
    selected_session.provider,
    'rewarded-ad:' || selected_session.id::text,
    p_provider_transaction_id,
    jsonb_build_object(
      'sessionId', selected_session.id,
      'provider', selected_session.provider,
      'platform', selected_session.platform,
      'placement', selected_session.placement
    ) || coalesce(p_verification_metadata, '{}'::jsonb)
  );

  update public.rewarded_ad_sessions
  set status = 'rewarded',
      provider_transaction_id = p_provider_transaction_id,
      coin_transaction_id = reward_transaction.id,
      verification_metadata = coalesce(p_verification_metadata, '{}'::jsonb),
      verified_at = now(),
      rewarded_at = now()
  where id = selected_session.id;

  return jsonb_build_object(
    'id', selected_session.id,
    'status', 'rewarded',
    'amount', selected_session.reward_amount,
    'balance', reward_transaction.balance_after,
    'alreadyRewarded', false
  );
end;
$$;

revoke all on function public.kantin_rewarded_ad_state() from public;
revoke all on function public.kantin_begin_rewarded_ad(text, text, text, jsonb) from public;
revoke all on function public.kantin_rewarded_ad_status(uuid) from public;
revoke all on function public.kantin_verify_rewarded_ad(uuid, text, jsonb) from public;

grant execute on function public.kantin_rewarded_ad_state() to authenticated;
grant execute on function public.kantin_begin_rewarded_ad(text, text, text, jsonb) to authenticated;
grant execute on function public.kantin_rewarded_ad_status(uuid) to authenticated;
grant execute on function public.kantin_verify_rewarded_ad(uuid, text, jsonb) to service_role;

comment on table public.rewarded_ad_sessions is
  'Server-verified rewarded ad attempts; clients can create and inspect only their own sessions.';
comment on function public.kantin_verify_rewarded_ad(uuid, text, jsonb) is
  'Service-only idempotent bridge from a verified ad-network callback into the Kantin Coin ledger.';
