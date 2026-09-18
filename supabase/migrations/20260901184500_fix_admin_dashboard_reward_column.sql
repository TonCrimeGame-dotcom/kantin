create or replace function public.kantin_admin_dashboard(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  day_start timestamptz := timezone('Europe/Istanbul', date_trunc('day', timezone('Europe/Istanbul', now())));
  ad_settings jsonb;
begin
  perform public._kantin_assert_admin(p_admin_id);

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
      'coinsToday', (select coalesce(sum(reward_amount), 0) from public.rewarded_ad_sessions where status = 'rewarded' and rewarded_at >= day_start),
      'settings', coalesce(ad_settings, '{}'::jsonb)
    ),
    'generatedAt', now()
  );
end;
$$;

revoke all on function public.kantin_admin_dashboard(uuid) from public;
grant execute on function public.kantin_admin_dashboard(uuid) to service_role;
