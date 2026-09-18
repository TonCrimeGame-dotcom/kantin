-- Kantin management console foundation.
-- Browser clients never receive service credentials; every mutation is authorized
-- again in the database and recorded in an immutable audit log.

create table if not exists public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_memberships_role check (role in ('owner', 'admin', 'support', 'analyst'))
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  request_id uuid not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_action_format check (action ~ '^[a-z][a-z0-9_.]{2,79}$'),
  constraint admin_audit_target_format check (target_type ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint admin_audit_state_objects check (
    jsonb_typeof(before_state) = 'object'
    and jsonb_typeof(after_state) = 'object'
    and jsonb_typeof(context) = 'object'
  ),
  unique (actor_user_id, action, request_id)
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_user_id, created_at desc);

create or replace function public.set_admin_membership_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_admin_membership_updated_at on public.admin_memberships;
create trigger set_admin_membership_updated_at
  before update on public.admin_memberships
  for each row execute procedure public.set_admin_membership_updated_at();

create or replace function public.prevent_admin_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin audit log is immutable' using errcode = '55000';
end;
$$;

drop trigger if exists admin_audit_log_is_immutable on public.admin_audit_log;
create trigger admin_audit_log_is_immutable
  before update or delete on public.admin_audit_log
  for each row execute procedure public.prevent_admin_audit_mutation();

create or replace function public._kantin_assert_admin(
  p_user_id uuid,
  p_allowed_roles text[] default array['owner', 'admin', 'support', 'analyst']::text[]
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_role text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select role into selected_role
  from public.admin_memberships
  where user_id = p_user_id and active;

  if selected_role is null or not (selected_role = any(p_allowed_roles)) then
    raise exception 'admin_permission_denied' using errcode = '42501';
  end if;

  return selected_role;
end;
$$;

create or replace function public.kantin_admin_bootstrap_owner(
  p_user_id uuid,
  p_email_hash text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_user auth.users%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_user_id is null or p_request_id is null
    or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_bootstrap_request' using errcode = '22023';
  end if;

  select * into selected_user from auth.users where id = p_user_id;
  if not found or selected_user.email is null or selected_user.email_confirmed_at is null
    or coalesce(selected_user.is_anonymous, false) then
    raise exception 'permanent_confirmed_account_required' using errcode = '42501';
  end if;

  lock table public.admin_memberships in share row exclusive mode;
  if exists (select 1 from public.admin_memberships where active) then
    raise exception 'admin_owner_already_exists' using errcode = '23505';
  end if;

  insert into public.admin_memberships (user_id, role, active, granted_by)
  values (p_user_id, 'owner', true, p_user_id);

  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, request_id, after_state, context
  ) values (
    p_user_id,
    'admin.owner_bootstrapped',
    'admin_membership',
    p_user_id::text,
    p_request_id,
    jsonb_build_object('role', 'owner', 'active', true),
    jsonb_build_object('emailHash', p_email_hash)
  );

  return jsonb_build_object('userId', p_user_id, 'role', 'owner', 'active', true);
end;
$$;

create or replace function public.kantin_admin_access(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_role text;
begin
  selected_role := public._kantin_assert_admin(p_user_id);
  return jsonb_build_object(
    'userId', p_user_id,
    'role', selected_role,
    'capabilities', case selected_role
      when 'owner' then jsonb_build_array('dashboard', 'players', 'economy', 'settings', 'audit')
      when 'admin' then jsonb_build_array('dashboard', 'players', 'economy', 'settings', 'audit')
      when 'support' then jsonb_build_array('dashboard', 'players', 'audit')
      else jsonb_build_array('dashboard', 'audit')
    end
  );
end;
$$;

create or replace function public.kantin_admin_dashboard(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  day_start timestamptz := timezone('Europe/Istanbul', date_trunc('day', timezone('Europe/Istanbul', now())));
  ad_settings jsonb;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id);

  select value into ad_settings
  from public.economy_settings
  where key = 'rewarded_ads';

  return jsonb_build_object(
    'players', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'guests', (select count(*) from public.profiles where is_guest),
      'newToday', (select count(*) from public.profiles where created_at >= day_start)
    ),
    'economy', jsonb_build_object(
      'coinsInCirculation', (select coalesce(sum(balance), 0) from public.coin_wallets),
      'transactionsToday', (select count(*) from public.coin_transactions where created_at >= day_start)
    ),
    'rewardedAds', jsonb_build_object(
      'startedToday', (select count(*) from public.rewarded_ad_sessions where created_at >= day_start),
      'rewardedToday', (select count(*) from public.rewarded_ad_sessions where status = 'rewarded' and rewarded_at >= day_start),
      'coinsToday', (select coalesce(sum(configured_reward_amount), 0) from public.rewarded_ad_sessions where status = 'rewarded' and rewarded_at >= day_start),
      'settings', coalesce(ad_settings, '{}'::jsonb)
    ),
    'generatedAt', now()
  );
end;
$$;

create or replace function public.kantin_admin_players(
  p_admin_id uuid,
  p_query text default '',
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  clean_query text := left(btrim(coalesce(p_query, '')), 80);
  clean_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  clean_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin', 'support']::text[]);

  return jsonb_build_object(
    'total', (
      select count(*)
      from public.profiles profile
      where clean_query = ''
        or profile.username ilike '%' || clean_query || '%'
        or profile.player_code ilike '%' || clean_query || '%'
    ),
    'items', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
      from (
        select
          profile.id,
          profile.username,
          profile.player_code,
          profile.level,
          profile.is_guest,
          profile.preferred_locale,
          profile.created_at,
          wallet.balance as coins
        from public.profiles profile
        left join public.coin_wallets wallet on wallet.user_id = profile.id
        where clean_query = ''
          or profile.username ilike '%' || clean_query || '%'
          or profile.player_code ilike '%' || clean_query || '%'
        order by profile.created_at desc
        limit clean_limit offset clean_offset
      ) rows
    ), '[]'::jsonb),
    'limit', clean_limit,
    'offset', clean_offset
  );
end;
$$;

create or replace function public.kantin_admin_player(
  p_admin_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  result jsonb;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin', 'support']::text[]);

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', profile.id,
      'username', profile.username,
      'playerCode', profile.player_code,
      'level', profile.level,
      'coins', wallet.balance,
      'isGuest', profile.is_guest,
      'preferredLocale', profile.preferred_locale,
      'createdAt', profile.created_at,
      'updatedAt', profile.updated_at
    ),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', transaction.id,
        'amount', transaction.amount,
        'balanceBefore', transaction.balance_before,
        'balanceAfter', transaction.balance_after,
        'type', transaction.transaction_type,
        'source', transaction.source,
        'referenceId', transaction.reference_id,
        'createdAt', transaction.created_at
      ) order by transaction.created_at desc)
      from (
        select * from public.coin_transactions
        where user_id = p_user_id
        order by created_at desc
        limit 50
      ) transaction
    ), '[]'::jsonb)
  ) into result
  from public.profiles profile
  left join public.coin_wallets wallet on wallet.user_id = profile.id
  where profile.id = p_user_id;

  if result is null then
    raise exception 'player_not_found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.kantin_admin_adjust_coins(
  p_admin_id uuid,
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_request_id uuid,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role text;
  clean_reason text := btrim(coalesce(p_reason, ''));
  coin_transaction public.coin_transactions%rowtype;
begin
  selected_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin']::text[]);

  if p_user_id is null or p_request_id is null or p_amount = 0 or abs(p_amount) > 1000000
    or char_length(clean_reason) not between 8 and 240
    or jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_admin_coin_adjustment' using errcode = '22023';
  end if;

  coin_transaction := public._kantin_apply_coin_transaction(
    p_user_id,
    p_amount,
    'admin_adjustment',
    'admin_console',
    'admin:' || p_request_id::text,
    p_request_id::text,
    jsonb_build_object('reason', clean_reason, 'adminId', p_admin_id, 'adminRole', selected_role)
  );

  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, request_id,
    before_state, after_state, context
  ) values (
    p_admin_id,
    'economy.coins_adjusted',
    'player',
    p_user_id::text,
    p_request_id,
    jsonb_build_object('balance', coin_transaction.balance_before),
    jsonb_build_object('balance', coin_transaction.balance_after, 'amount', coin_transaction.amount),
    coalesce(p_context, '{}'::jsonb) || jsonb_build_object('reason', clean_reason, 'transactionId', coin_transaction.id)
  ) on conflict (actor_user_id, action, request_id) do nothing;

  return jsonb_build_object(
    'transactionId', coin_transaction.id,
    'userId', p_user_id,
    'amount', coin_transaction.amount,
    'balanceBefore', coin_transaction.balance_before,
    'balanceAfter', coin_transaction.balance_after,
    'createdAt', coin_transaction.created_at
  );
end;
$$;

create or replace function public.kantin_admin_update_rewarded_ads(
  p_admin_id uuid,
  p_enabled boolean,
  p_reward_amount integer,
  p_daily_limit integer,
  p_cooldown_seconds integer,
  p_session_ttl_seconds integer,
  p_request_id uuid,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  old_value jsonb;
  new_value jsonb;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin']::text[]);

  if p_request_id is null
    or p_reward_amount not between 1 and 10000
    or p_daily_limit not between 0 and 20
    or p_cooldown_seconds not between 0 and 86400
    or p_session_ttl_seconds not between 60 and 3600
    or jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_rewarded_ad_settings' using errcode = '22023';
  end if;

  select value into old_value
  from public.economy_settings
  where key = 'rewarded_ads'
  for update;

  new_value := jsonb_build_object(
    'enabled', p_enabled,
    'rewardAmount', p_reward_amount,
    'dailyLimit', p_daily_limit,
    'cooldownSeconds', p_cooldown_seconds,
    'sessionTtlSeconds', p_session_ttl_seconds
  );

  insert into public.economy_settings (key, value, is_public)
  values ('rewarded_ads', new_value, true)
  on conflict (key) do update set value = excluded.value, is_public = true;

  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, request_id,
    before_state, after_state, context
  ) values (
    p_admin_id,
    'economy.rewarded_ads_updated',
    'economy_setting',
    'rewarded_ads',
    p_request_id,
    coalesce(old_value, '{}'::jsonb),
    new_value,
    coalesce(p_context, '{}'::jsonb)
  ) on conflict (actor_user_id, action, request_id) do nothing;

  return new_value;
end;
$$;

create or replace function public.kantin_admin_audit(
  p_admin_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  clean_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  clean_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
  ignored_role := public._kantin_assert_admin(p_admin_id);

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', audit.id,
        'action', audit.action,
        'targetType', audit.target_type,
        'targetId', audit.target_id,
        'actorId', audit.actor_user_id,
        'actorName', profile.username,
        'before', audit.before_state,
        'after', audit.after_state,
        'context', audit.context,
        'createdAt', audit.created_at
      ) order by audit.created_at desc)
      from (
        select * from public.admin_audit_log
        order by created_at desc
        limit clean_limit offset clean_offset
      ) audit
      left join public.profiles profile on profile.id = audit.actor_user_id
    ), '[]'::jsonb),
    'limit', clean_limit,
    'offset', clean_offset
  );
end;
$$;

alter table public.admin_memberships enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on table public.admin_memberships from public, anon, authenticated;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert, update on table public.admin_memberships to service_role;
grant select, insert on table public.admin_audit_log to service_role;

revoke all on function public._kantin_assert_admin(uuid, text[]) from public;
revoke all on function public.kantin_admin_bootstrap_owner(uuid, text, uuid) from public;
revoke all on function public.kantin_admin_access(uuid) from public;
revoke all on function public.kantin_admin_dashboard(uuid) from public;
revoke all on function public.kantin_admin_players(uuid, text, integer, integer) from public;
revoke all on function public.kantin_admin_player(uuid, uuid) from public;
revoke all on function public.kantin_admin_adjust_coins(uuid, uuid, bigint, text, uuid, jsonb) from public;
revoke all on function public.kantin_admin_update_rewarded_ads(uuid, boolean, integer, integer, integer, integer, uuid, jsonb) from public;
revoke all on function public.kantin_admin_audit(uuid, integer, integer) from public;

grant execute on function public._kantin_assert_admin(uuid, text[]) to service_role;
grant execute on function public.kantin_admin_bootstrap_owner(uuid, text, uuid) to service_role;
grant execute on function public.kantin_admin_access(uuid) to service_role;
grant execute on function public.kantin_admin_dashboard(uuid) to service_role;
grant execute on function public.kantin_admin_players(uuid, text, integer, integer) to service_role;
grant execute on function public.kantin_admin_player(uuid, uuid) to service_role;
grant execute on function public.kantin_admin_adjust_coins(uuid, uuid, bigint, text, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_update_rewarded_ads(uuid, boolean, integer, integer, integer, integer, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_audit(uuid, integer, integer) to service_role;

comment on table public.admin_memberships is
  'Server-managed role assignments for the Kantin management console.';
comment on table public.admin_audit_log is
  'Immutable record of every privileged management action.';
comment on function public.kantin_admin_adjust_coins(uuid, uuid, bigint, text, uuid, jsonb) is
  'Service-only, role-checked and idempotent manual coin adjustment.';
