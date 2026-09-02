-- Operational management modules for the Kantin admin console.
-- Every privileged write remains service-only, role-checked and audit logged.

create table if not exists public.player_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  matchmaking_blocked_until timestamptz,
  reason text not null,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_restrictions_reason_length check (char_length(btrim(reason)) between 8 and 240)
);

create table if not exists public.player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('abuse', 'cheating', 'spam', 'identity', 'other')),
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved', 'dismissed')),
  resolution_note text,
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_reports_details_length check (char_length(details) <= 1000),
  constraint player_reports_resolution_length check (resolution_note is null or char_length(resolution_note) between 8 and 500)
);

create table if not exists public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  locale text check (locale is null or locale in ('tr', 'en', 'de', 'ru', 'es', 'hi', 'ar')),
  title text not null,
  body text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_announcements_title_length check (char_length(btrim(title)) between 3 and 100),
  constraint admin_announcements_body_length check (char_length(btrim(body)) between 3 and 1000),
  constraint admin_announcements_window check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.admin_game_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_game_events_key_format check (event_key ~ '^[a-z][a-z0-9_-]{2,39}$'),
  constraint admin_game_events_title_length check (char_length(btrim(title)) between 3 and 100),
  constraint admin_game_events_description_length check (char_length(description) <= 1000),
  constraint admin_game_events_window check (ends_at > starts_at),
  constraint admin_game_events_configuration_object check (jsonb_typeof(configuration) = 'object')
);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null,
  provider_order_id text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  coins bigint not null check (coins > 0),
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_orders_provider_format check (provider ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint store_orders_provider_order_length check (char_length(provider_order_id) between 3 and 160),
  constraint store_orders_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (provider, provider_order_id)
);

create index if not exists player_restrictions_blocked_idx
  on public.player_restrictions (matchmaking_blocked_until desc)
  where matchmaking_blocked_until is not null;
create index if not exists player_reports_status_created_idx
  on public.player_reports (status, created_at desc);
create index if not exists admin_announcements_window_idx
  on public.admin_announcements (active, starts_at, ends_at);
create index if not exists admin_game_events_window_idx
  on public.admin_game_events (active, starts_at, ends_at);
create index if not exists store_orders_created_idx
  on public.store_orders (created_at desc);
create index if not exists store_orders_user_created_idx
  on public.store_orders (user_id, created_at desc);

drop trigger if exists set_player_restrictions_updated_at on public.player_restrictions;
create trigger set_player_restrictions_updated_at
  before update on public.player_restrictions
  for each row execute procedure public.set_admin_membership_updated_at();
drop trigger if exists set_player_reports_updated_at on public.player_reports;
create trigger set_player_reports_updated_at
  before update on public.player_reports
  for each row execute procedure public.set_admin_membership_updated_at();
drop trigger if exists set_admin_announcements_updated_at on public.admin_announcements;
create trigger set_admin_announcements_updated_at
  before update on public.admin_announcements
  for each row execute procedure public.set_admin_membership_updated_at();
drop trigger if exists set_admin_game_events_updated_at on public.admin_game_events;
create trigger set_admin_game_events_updated_at
  before update on public.admin_game_events
  for each row execute procedure public.set_admin_membership_updated_at();
drop trigger if exists set_store_orders_updated_at on public.store_orders;
create trigger set_store_orders_updated_at
  before update on public.store_orders
  for each row execute procedure public.set_admin_membership_updated_at();

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
      when 'owner' then jsonb_build_array('dashboard', 'players', 'economy', 'settings', 'audit', 'operations', 'moderation', 'content', 'admins')
      when 'admin' then jsonb_build_array('dashboard', 'players', 'economy', 'settings', 'audit', 'operations', 'moderation', 'content')
      when 'support' then jsonb_build_array('dashboard', 'players', 'audit', 'moderation')
      else jsonb_build_array('dashboard', 'audit', 'operations', 'economy')
    end
  );
end;
$$;

create or replace function public.kantin_admin_operations(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id);
  return jsonb_build_object(
    'health', jsonb_build_object(
      'database', true,
      'serverTime', now(),
      'waitingPlayers', (select count(*) from public.matchmaking_tickets where status = 'waiting'),
      'activeMatches', (select count(*) from public.online_matches where status = 'playing'),
      'staleTickets', (select count(*) from public.matchmaking_tickets where status = 'waiting' and updated_at < now() - interval '2 minutes')
    ),
    'queues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mode', grouped.mode,
        'wordLocale', grouped.word_locale,
        'waiting', grouped.waiting,
        'oldestJoinedAt', grouped.oldest_joined_at
      ) order by grouped.waiting desc, grouped.mode)
      from (
        select mode, word_locale, count(*) waiting, min(joined_at) oldest_joined_at
        from public.matchmaking_tickets
        where status = 'waiting'
        group by mode, word_locale
      ) grouped
    ), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', ticket.player_id,
        'username', ticket.username,
        'mode', ticket.mode,
        'wordLocale', ticket.word_locale,
        'joinedAt', ticket.joined_at,
        'updatedAt', ticket.updated_at
      ) order by ticket.joined_at)
      from (
        select * from public.matchmaking_tickets
        where status = 'waiting'
        order by joined_at
        limit 100
      ) ticket
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', match.id,
        'mode', match.mode,
        'wordLocale', match.word_locale,
        'players', match.players,
        'turnVersion', match.turn_version,
        'status', match.status,
        'createdAt', match.created_at,
        'updatedAt', match.updated_at,
        'finishedAt', match.finished_at
      ) order by match.updated_at desc)
      from (
        select * from public.online_matches
        where status = 'playing' or updated_at >= now() - interval '24 hours'
        order by (status = 'playing') desc, updated_at desc
        limit 100
      ) match
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.kantin_admin_cancel_ticket(
  p_admin_id uuid,
  p_player_id text,
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
  ignored_role text;
  selected_ticket public.matchmaking_tickets%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin', 'support']::text[]);
  if char_length(clean_reason) not between 8 and 240 or p_request_id is null then
    raise exception 'invalid_admin_operation' using errcode = '22023';
  end if;
  select * into selected_ticket from public.matchmaking_tickets
  where player_id = btrim(coalesce(p_player_id, '')) and status = 'waiting' for update;
  if not found then raise exception 'match_ticket_not_found' using errcode = 'P0002'; end if;
  delete from public.matchmaking_tickets where player_id = selected_ticket.player_id;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, 'operations.ticket_cancelled', 'matchmaking_ticket', selected_ticket.player_id, p_request_id,
    to_jsonb(selected_ticket), '{}'::jsonb, coalesce(p_context, '{}'::jsonb) || jsonb_build_object('reason', clean_reason));
  return jsonb_build_object('cancelled', true, 'playerId', selected_ticket.player_id);
end;
$$;

create or replace function public.kantin_admin_abandon_match(
  p_admin_id uuid,
  p_match_id uuid,
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
  ignored_role text;
  selected_match public.online_matches%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin']::text[]);
  if char_length(clean_reason) not between 8 and 240 or p_request_id is null then
    raise exception 'invalid_admin_operation' using errcode = '22023';
  end if;
  select * into selected_match from public.online_matches where id = p_match_id and status = 'playing' for update;
  if not found then raise exception 'active_match_not_found' using errcode = 'P0002'; end if;
  update public.online_matches set status = 'abandoned', finished_at = now(), updated_at = now(),
    result = jsonb_build_object('reason', 'admin_abandoned', 'message', clean_reason)
  where id = p_match_id;
  delete from public.matchmaking_tickets where match_id = p_match_id;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, 'operations.match_abandoned', 'online_match', p_match_id::text, p_request_id,
    jsonb_build_object('status', selected_match.status, 'turnVersion', selected_match.turn_version),
    jsonb_build_object('status', 'abandoned'), coalesce(p_context, '{}'::jsonb) || jsonb_build_object('reason', clean_reason));
  return jsonb_build_object('abandoned', true, 'matchId', p_match_id);
end;
$$;

create or replace function public.kantin_admin_moderation(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin', 'support']::text[]);
  return jsonb_build_object(
    'restrictions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', restriction.user_id,
        'username', profile.username,
        'playerCode', profile.player_code,
        'blockedUntil', restriction.matchmaking_blocked_until,
        'reason', restriction.reason,
        'updatedAt', restriction.updated_at
      ) order by restriction.matchmaking_blocked_until desc)
      from public.player_restrictions restriction
      join public.profiles profile on profile.id = restriction.user_id
      where restriction.matchmaking_blocked_until > now()
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', report.id,
        'category', report.category,
        'details', report.details,
        'status', report.status,
        'targetUserId', report.target_user_id,
        'targetName', target.username,
        'reporterName', reporter.username,
        'resolutionNote', report.resolution_note,
        'createdAt', report.created_at,
        'updatedAt', report.updated_at
      ) order by (report.status = 'open') desc, report.created_at desc)
      from (
        select * from public.player_reports order by created_at desc limit 100
      ) report
      join public.profiles target on target.id = report.target_user_id
      left join public.profiles reporter on reporter.id = report.reporter_user_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.kantin_admin_set_restriction(
  p_admin_id uuid,
  p_user_id uuid,
  p_blocked_until timestamptz,
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
  ignored_role text;
  clean_reason text := btrim(coalesce(p_reason, ''));
  old_state jsonb := '{}'::jsonb;
  new_state jsonb := '{}'::jsonb;
  selected_action text;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin', 'support']::text[]);
  if p_user_id is null or p_request_id is null or char_length(clean_reason) not between 8 and 240 then
    raise exception 'invalid_player_restriction' using errcode = '22023';
  end if;
  if not exists(select 1 from public.profiles where id = p_user_id) then
    raise exception 'player_not_found' using errcode = 'P0002';
  end if;
  select to_jsonb(restriction) into old_state from public.player_restrictions restriction where user_id = p_user_id;
  old_state := coalesce(old_state, '{}'::jsonb);
  if p_blocked_until is null then
    delete from public.player_restrictions where user_id = p_user_id;
    selected_action := 'moderation.restriction_cleared';
  else
    if p_blocked_until <= now() or p_blocked_until > now() + interval '365 days' then
      raise exception 'invalid_player_restriction' using errcode = '22023';
    end if;
    insert into public.player_restrictions(user_id, matchmaking_blocked_until, reason, updated_by)
    values (p_user_id, p_blocked_until, clean_reason, p_admin_id)
    on conflict (user_id) do update set matchmaking_blocked_until = excluded.matchmaking_blocked_until,
      reason = excluded.reason, updated_by = excluded.updated_by;
    select to_jsonb(restriction) into new_state from public.player_restrictions restriction where user_id = p_user_id;
    selected_action := 'moderation.restriction_set';
  end if;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, selected_action, 'player', p_user_id::text, p_request_id, old_state, new_state,
    coalesce(p_context, '{}'::jsonb) || jsonb_build_object('reason', clean_reason));
  return jsonb_build_object('userId', p_user_id, 'blockedUntil', p_blocked_until, 'active', p_blocked_until is not null);
end;
$$;

create or replace function public.kantin_admin_update_report(
  p_admin_id uuid,
  p_report_id uuid,
  p_status text,
  p_note text,
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
  selected_report public.player_reports%rowtype;
  clean_note text := btrim(coalesce(p_note, ''));
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin', 'support']::text[]);
  if p_status not in ('reviewed', 'resolved', 'dismissed') or char_length(clean_note) not between 8 and 500 or p_request_id is null then
    raise exception 'invalid_report_resolution' using errcode = '22023';
  end if;
  select * into selected_report from public.player_reports where id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  update public.player_reports set status = p_status, resolution_note = clean_note, handled_by = p_admin_id where id = p_report_id;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, 'moderation.report_updated', 'player_report', p_report_id::text, p_request_id,
    jsonb_build_object('status', selected_report.status, 'resolutionNote', selected_report.resolution_note),
    jsonb_build_object('status', p_status, 'resolutionNote', clean_note), coalesce(p_context, '{}'::jsonb));
  return jsonb_build_object('id', p_report_id, 'status', p_status);
end;
$$;

create or replace function public.kantin_admin_economy(p_admin_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  clean_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  day_start timestamptz := timezone('Europe/Istanbul', date_trunc('day', timezone('Europe/Istanbul', now())));
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin', 'analyst']::text[]);
  return jsonb_build_object(
    'summary', jsonb_build_object(
      'transactionsToday', (select count(*) from public.coin_transactions where created_at >= day_start),
      'coinsAddedToday', (select coalesce(sum(amount), 0) from public.coin_transactions where created_at >= day_start and amount > 0),
      'coinsRemovedToday', (select coalesce(abs(sum(amount)), 0) from public.coin_transactions where created_at >= day_start and amount < 0),
      'paidOrdersToday', (select count(*) from public.store_orders where status = 'paid' and paid_at >= day_start)
    ),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', transaction.id,
        'userId', transaction.user_id,
        'username', profile.username,
        'playerCode', profile.player_code,
        'amount', transaction.amount,
        'balanceBefore', transaction.balance_before,
        'balanceAfter', transaction.balance_after,
        'type', transaction.transaction_type,
        'source', transaction.source,
        'referenceId', transaction.reference_id,
        'createdAt', transaction.created_at
      ) order by transaction.created_at desc)
      from (
        select * from public.coin_transactions order by created_at desc limit clean_limit
      ) transaction
      join public.profiles profile on profile.id = transaction.user_id
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', orders.id,
        'username', profile.username,
        'playerCode', profile.player_code,
        'provider', orders.provider,
        'providerOrderId', orders.provider_order_id,
        'status', orders.status,
        'amountMinor', orders.amount_minor,
        'currency', orders.currency,
        'coins', orders.coins,
        'paidAt', orders.paid_at,
        'refundedAt', orders.refunded_at,
        'createdAt', orders.created_at
      ) order by orders.created_at desc)
      from (
        select * from public.store_orders order by created_at desc limit 100
      ) orders
      join public.profiles profile on profile.id = orders.user_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.kantin_admin_mark_order_refunded(
  p_admin_id uuid,
  p_order_id uuid,
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
  ignored_role text;
  selected_order public.store_orders%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  coin_transaction public.coin_transactions%rowtype;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin']::text[]);
  if char_length(clean_reason) not between 8 and 240 or p_request_id is null then
    raise exception 'invalid_order_refund' using errcode = '22023';
  end if;
  select * into selected_order from public.store_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if selected_order.status <> 'paid' then raise exception 'order_not_refundable' using errcode = 'P0001'; end if;
  coin_transaction := public._kantin_apply_coin_transaction(selected_order.user_id, -selected_order.coins,
    'purchase_refund', 'admin_console', 'order-refund:' || selected_order.id::text,
    selected_order.provider_order_id, jsonb_build_object('reason', clean_reason, 'adminId', p_admin_id));
  update public.store_orders set status = 'refunded', refunded_at = now() where id = selected_order.id;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, 'economy.order_refunded', 'store_order', selected_order.id::text, p_request_id,
    jsonb_build_object('status', selected_order.status), jsonb_build_object('status', 'refunded', 'coinsRemoved', selected_order.coins),
    coalesce(p_context, '{}'::jsonb) || jsonb_build_object('reason', clean_reason, 'transactionId', coin_transaction.id));
  return jsonb_build_object('id', selected_order.id, 'status', 'refunded', 'coinsRemoved', selected_order.coins);
end;
$$;

create or replace function public.kantin_admin_content(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin']::text[]);
  return jsonb_build_object(
    'announcements', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'locale', item.locale, 'title', item.title, 'body', item.body,
      'startsAt', item.starts_at, 'endsAt', item.ends_at, 'active', item.active,
      'createdAt', item.created_at, 'updatedAt', item.updated_at
    ) order by item.starts_at desc) from public.admin_announcements item), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'key', item.event_key, 'title', item.title, 'description', item.description,
      'startsAt', item.starts_at, 'endsAt', item.ends_at, 'active', item.active,
      'configuration', item.configuration, 'createdAt', item.created_at, 'updatedAt', item.updated_at
    ) order by item.starts_at desc) from public.admin_game_events item), '[]'::jsonb)
  );
end;
$$;

create or replace function public.kantin_admin_save_announcement(
  p_admin_id uuid, p_id uuid, p_locale text, p_title text, p_body text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_active boolean,
  p_request_id uuid, p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  selected_id uuid := coalesce(p_id, gen_random_uuid());
  clean_locale text := nullif(lower(btrim(coalesce(p_locale, ''))), '');
  old_state jsonb := '{}'::jsonb;
  new_state jsonb;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin']::text[]);
  if p_request_id is null or char_length(btrim(coalesce(p_title, ''))) not between 3 and 100
    or char_length(btrim(coalesce(p_body, ''))) not between 3 and 1000
    or (clean_locale is not null and clean_locale not in ('tr', 'en', 'de', 'ru', 'es', 'hi', 'ar'))
    or p_starts_at is null or (p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception 'invalid_announcement' using errcode = '22023';
  end if;
  select to_jsonb(item) into old_state from public.admin_announcements item where id = selected_id;
  old_state := coalesce(old_state, '{}'::jsonb);
  insert into public.admin_announcements(id, locale, title, body, starts_at, ends_at, active, created_by, updated_by)
  values (selected_id, clean_locale, btrim(p_title), btrim(p_body), p_starts_at, p_ends_at, coalesce(p_active, false), p_admin_id, p_admin_id)
  on conflict (id) do update set locale = excluded.locale, title = excluded.title, body = excluded.body,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, active = excluded.active, updated_by = p_admin_id;
  select to_jsonb(item) into new_state from public.admin_announcements item where id = selected_id;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, 'content.announcement_saved', 'announcement', selected_id::text, p_request_id,
    old_state, new_state, coalesce(p_context, '{}'::jsonb));
  return new_state;
end;
$$;

create or replace function public.kantin_admin_save_event(
  p_admin_id uuid, p_id uuid, p_event_key text, p_title text, p_description text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_active boolean, p_configuration jsonb,
  p_request_id uuid, p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  selected_id uuid := coalesce(p_id, gen_random_uuid());
  clean_key text := lower(btrim(coalesce(p_event_key, '')));
  old_state jsonb := '{}'::jsonb;
  new_state jsonb;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner', 'admin']::text[]);
  if p_request_id is null or clean_key !~ '^[a-z][a-z0-9_-]{2,39}$'
    or char_length(btrim(coalesce(p_title, ''))) not between 3 and 100
    or char_length(coalesce(p_description, '')) > 1000
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or jsonb_typeof(coalesce(p_configuration, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_game_event' using errcode = '22023';
  end if;
  select to_jsonb(item) into old_state from public.admin_game_events item where id = selected_id;
  old_state := coalesce(old_state, '{}'::jsonb);
  insert into public.admin_game_events(id, event_key, title, description, starts_at, ends_at, active, configuration, created_by, updated_by)
  values (selected_id, clean_key, btrim(p_title), btrim(coalesce(p_description, '')), p_starts_at, p_ends_at,
    coalesce(p_active, false), coalesce(p_configuration, '{}'::jsonb), p_admin_id, p_admin_id)
  on conflict (id) do update set event_key = excluded.event_key, title = excluded.title,
    description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    active = excluded.active, configuration = excluded.configuration, updated_by = p_admin_id;
  select to_jsonb(item) into new_state from public.admin_game_events item where id = selected_id;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, 'content.event_saved', 'game_event', selected_id::text, p_request_id,
    old_state, new_state, coalesce(p_context, '{}'::jsonb));
  return new_state;
end;
$$;

create or replace function public.kantin_admin_members(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ignored_role text;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner']::text[]);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', member.user_id,
      'email', users.email,
      'username', profile.username,
      'role', member.role,
      'active', member.active,
      'createdAt', member.created_at,
      'updatedAt', member.updated_at
    ) order by member.active desc, member.created_at)
    from public.admin_memberships member
    join auth.users users on users.id = member.user_id
    left join public.profiles profile on profile.id = member.user_id
  ), '[]'::jsonb));
end;
$$;

create or replace function public.kantin_admin_set_member(
  p_admin_id uuid, p_target_email text, p_role text, p_active boolean,
  p_request_id uuid, p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored_role text;
  selected_user auth.users%rowtype;
  selected_member public.admin_memberships%rowtype;
  old_state jsonb := '{}'::jsonb;
  new_state jsonb;
begin
  ignored_role := public._kantin_assert_admin(p_admin_id, array['owner']::text[]);
  if p_request_id is null or p_role not in ('owner', 'admin', 'support', 'analyst') then
    raise exception 'invalid_admin_membership' using errcode = '22023';
  end if;
  select * into selected_user from auth.users where lower(email) = lower(btrim(coalesce(p_target_email, ''))) limit 1;
  if not found or selected_user.email_confirmed_at is null or coalesce(selected_user.is_anonymous, false) then
    raise exception 'confirmed_account_not_found' using errcode = 'P0002';
  end if;
  select * into selected_member from public.admin_memberships where user_id = selected_user.id for update;
  if found then old_state := to_jsonb(selected_member); end if;
  if selected_user.id = p_admin_id and (not coalesce(p_active, false) or p_role <> 'owner') then
    raise exception 'admin_self_demote_forbidden' using errcode = '42501';
  end if;
  if found and selected_member.active and selected_member.role = 'owner'
    and (not coalesce(p_active, false) or p_role <> 'owner')
    and (select count(*) from public.admin_memberships where active and role = 'owner') <= 1 then
    raise exception 'last_owner_required' using errcode = '42501';
  end if;
  insert into public.admin_memberships(user_id, role, active, granted_by)
  values (selected_user.id, p_role, coalesce(p_active, false), p_admin_id)
  on conflict (user_id) do update set role = excluded.role, active = excluded.active, granted_by = p_admin_id;
  select to_jsonb(member) into new_state from public.admin_memberships member where user_id = selected_user.id;
  insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, request_id, before_state, after_state, context)
  values (p_admin_id, 'admin.membership_updated', 'admin_membership', selected_user.id::text, p_request_id,
    old_state, new_state, coalesce(p_context, '{}'::jsonb));
  return jsonb_build_object('userId', selected_user.id, 'email', selected_user.email, 'role', p_role, 'active', coalesce(p_active, false));
end;
$$;

alter table public.player_restrictions enable row level security;
alter table public.player_reports enable row level security;
alter table public.admin_announcements enable row level security;
alter table public.admin_game_events enable row level security;
alter table public.store_orders enable row level security;

revoke all on table public.player_restrictions from public, anon, authenticated;
revoke all on table public.player_reports from public, anon, authenticated;
revoke all on table public.admin_announcements from public, anon, authenticated;
revoke all on table public.admin_game_events from public, anon, authenticated;
revoke all on table public.store_orders from public, anon, authenticated;
grant select, insert, update, delete on table public.player_restrictions to service_role;
grant select, insert, update, delete on table public.player_reports to service_role;
grant select, insert, update, delete on table public.admin_announcements to service_role;
grant select, insert, update, delete on table public.admin_game_events to service_role;
grant select, insert, update on table public.store_orders to service_role;

revoke all on function public.kantin_admin_operations(uuid) from public;
revoke all on function public.kantin_admin_cancel_ticket(uuid, text, text, uuid, jsonb) from public;
revoke all on function public.kantin_admin_abandon_match(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.kantin_admin_moderation(uuid) from public;
revoke all on function public.kantin_admin_set_restriction(uuid, uuid, timestamptz, text, uuid, jsonb) from public;
revoke all on function public.kantin_admin_update_report(uuid, uuid, text, text, uuid, jsonb) from public;
revoke all on function public.kantin_admin_economy(uuid, integer) from public;
revoke all on function public.kantin_admin_mark_order_refunded(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.kantin_admin_content(uuid) from public;
revoke all on function public.kantin_admin_save_announcement(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, uuid, jsonb) from public;
revoke all on function public.kantin_admin_save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, jsonb, uuid, jsonb) from public;
revoke all on function public.kantin_admin_members(uuid) from public;
revoke all on function public.kantin_admin_set_member(uuid, text, text, boolean, uuid, jsonb) from public;

grant execute on function public.kantin_admin_operations(uuid) to service_role;
grant execute on function public.kantin_admin_cancel_ticket(uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_abandon_match(uuid, uuid, text, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_moderation(uuid) to service_role;
grant execute on function public.kantin_admin_set_restriction(uuid, uuid, timestamptz, text, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_update_report(uuid, uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_economy(uuid, integer) to service_role;
grant execute on function public.kantin_admin_mark_order_refunded(uuid, uuid, text, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_content(uuid) to service_role;
grant execute on function public.kantin_admin_save_announcement(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_save_event(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, jsonb, uuid, jsonb) to service_role;
grant execute on function public.kantin_admin_members(uuid) to service_role;
grant execute on function public.kantin_admin_set_member(uuid, text, text, boolean, uuid, jsonb) to service_role;

comment on table public.player_restrictions is 'Server-enforced player matchmaking restrictions managed from the admin console.';
comment on table public.player_reports is 'Player safety reports and their admin resolution state.';
comment on table public.admin_announcements is 'Scheduled multilingual announcements managed without an app release.';
comment on table public.admin_game_events is 'Scheduled game events with server-owned configuration.';
comment on table public.store_orders is 'Provider purchase ledger; refunds are recorded only after provider-side confirmation.';
