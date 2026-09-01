(() => {
  'use strict';

  const auth = window.KANTIN_AUTH;
  const events = new EventTarget();
  const DEFAULT_STAKES = [
    { id: 'beginner', label: 'Başlangıç', tone: 'blue', entryFee: 500, minimumBalance: 500 },
    { id: 'experienced', label: 'Tecrübeli', tone: 'violet', entryFee: 1500, minimumBalance: 1500 },
    { id: 'master', label: 'Usta', tone: 'gold', entryFee: 5000, minimumBalance: 5000 }
  ];
  const DEFAULT_DAILY_REWARDS = [100, 150, 200, 250, 350, 500, 1000].map((coins, index) => ({
    day: index + 1,
    coins
  }));
  const state = {
    status: 'loading',
    balance: null,
    walletVersion: 0,
    core: {
      version: 1,
      currency: 'KANTIN_COIN',
      symbol: '🪙',
      startingBalance: 2500,
      dailyResetTimezone: 'Europe/Istanbul'
    },
    stakes: DEFAULT_STAKES,
    dailyRewards: DEFAULT_DAILY_REWARDS,
    dailyClaim: { claimedToday: false, claimedOn: null, streakDay: 0 },
    rewardedAds: {
      enabled: false,
      rewardAmount: 150,
      dailyLimit: 4,
      watchedToday: 0,
      remainingToday: 4,
      cooldownSeconds: 600,
      cooldownUntil: null,
      canStart: false
    },
    error: null
  };
  let publicConfig = null;
  let refreshPromise = null;

  function emit() {
    events.dispatchEvent(new CustomEvent('change', { detail: snapshot() }));
  }

  function snapshot() {
    return {
      status: state.status,
      balance: state.balance,
      walletVersion: state.walletVersion,
      core: { ...state.core },
      stakes: state.stakes.map(stake => ({ ...stake })),
      dailyRewards: state.dailyRewards.map(reward => ({ ...reward })),
      dailyClaim: { ...state.dailyClaim },
      rewardedAds: { ...state.rewardedAds },
      error: state.error
    };
  }

  function economyError(message, status = 0) {
    const original = String(message || 'Ekonomi işlemi tamamlanamadı.');
    const known = [
      [/insufficient_coins/i, 'Bu işlem için yeterli Kantin Coin yok.'],
      [/wallet_not_found/i, 'Cüzdanın henüz hazırlanmadı. Lütfen tekrar giriş yap.'],
      [/daily_reward_not_configured/i, 'Günlük ödül şu anda kullanılamıyor.'],
      [/rewarded_ads_not_configured|rewarded_ads_disabled/i, 'Ödüllü reklam şu anda kullanılamıyor.'],
      [/rewarded_ad_daily_limit/i, 'Bugünkü reklam ödülü sınırına ulaştın.'],
      [/rewarded_ad_cooldown/i, 'Yeni reklam ödülü için biraz beklemelisin.'],
      [/rewarded_ad_session_expired/i, 'Reklam oturumunun süresi doldu. Yeniden dene.'],
      [/rewarded_ad_session_not_found/i, 'Reklam oturumu bulunamadı.'],
      [/authentication_required|jwt expired|invalid jwt/i, 'Bu işlem için yeniden giriş yapmalısın.'],
      [/failed to fetch/i, 'Coin sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.']
    ];
    const error = new Error(known.find(([pattern]) => pattern.test(original))?.[1] || original);
    error.status = status;
    return error;
  }

  async function loadPublicConfig() {
    if (publicConfig) return publicConfig;
    const response = await fetch('/api/config', { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.supabaseUrl || !payload.supabasePublishableKey) {
      throw economyError('Coin servisi henüz yapılandırılmamış.', response.status);
    }
    publicConfig = {
      url: String(payload.supabaseUrl).replace(/\/+$/, ''),
      key: String(payload.supabasePublishableKey)
    };
    return publicConfig;
  }

  async function rpc(name, body = {}) {
    const token = auth?.getAccessToken?.();
    if (!token) throw economyError('Bu işlem için giriş yapmalısın.', 401);
    const config = await loadPublicConfig();
    const response = await fetch(`${config.url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw economyError(payload?.message || payload?.details || payload?.hint || `Ekonomi isteği başarısız (${response.status}).`, response.status);
    }
    return payload;
  }

  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
  }

  function applyEconomy(payload) {
    const wallet = payload?.wallet || {};
    state.balance = positiveInteger(wallet.balance, positiveInteger(auth?.profile?.coins, 0));
    state.walletVersion = positiveInteger(wallet.version, state.walletVersion);
    state.core = { ...state.core, ...(payload?.core || {}) };
    state.stakes = Array.isArray(payload?.stakes) && payload.stakes.length
      ? payload.stakes.map(stake => ({
          id: String(stake.id),
          label: String(stake.label),
          tone: ['blue', 'violet', 'gold'].includes(stake.tone) ? stake.tone : 'blue',
          entryFee: positiveInteger(stake.entryFee, 0),
          minimumBalance: positiveInteger(stake.minimumBalance, positiveInteger(stake.entryFee, 0))
        }))
      : DEFAULT_STAKES;
    state.dailyRewards = Array.isArray(payload?.dailyRewards) && payload.dailyRewards.length
      ? payload.dailyRewards.map(reward => ({
          day: positiveInteger(reward.day, 1),
          coins: positiveInteger(reward.coins, 0)
        }))
      : DEFAULT_DAILY_REWARDS;
    state.dailyClaim = {
      claimedToday: Boolean(payload?.dailyClaim?.claimedToday),
      claimedOn: payload?.dailyClaim?.claimedOn || null,
      streakDay: positiveInteger(payload?.dailyClaim?.streakDay, 0)
    };
    state.status = 'ready';
    state.error = null;
  }

  function applyRewardedAds(payload) {
    state.rewardedAds = {
      enabled: Boolean(payload?.enabled),
      rewardAmount: positiveInteger(payload?.rewardAmount, 150),
      dailyLimit: positiveInteger(payload?.dailyLimit, 4),
      watchedToday: positiveInteger(payload?.watchedToday, 0),
      remainingToday: positiveInteger(payload?.remainingToday, 0),
      cooldownSeconds: positiveInteger(payload?.cooldownSeconds, 600),
      cooldownUntil: payload?.cooldownUntil || null,
      canStart: Boolean(payload?.canStart)
    };
  }

  function reset() {
    state.status = 'anonymous';
    state.balance = null;
    state.walletVersion = 0;
    state.stakes = DEFAULT_STAKES;
    state.dailyRewards = DEFAULT_DAILY_REWARDS;
    state.dailyClaim = { claimedToday: false, claimedOn: null, streakDay: 0 };
    state.rewardedAds = { ...state.rewardedAds, enabled: false, watchedToday: 0, remainingToday: 0, cooldownUntil: null, canStart: false };
    state.error = null;
    emit();
  }

  async function refresh() {
    if (!auth?.isAuthenticated?.()) {
      reset();
      return snapshot();
    }
    if (refreshPromise) return refreshPromise;
    state.status = 'loading';
    state.error = null;
    emit();
    refreshPromise = Promise.all([rpc('kantin_my_economy'), rpc('kantin_rewarded_ad_state')])
      .then(([payload, rewardedAds]) => {
        applyEconomy(payload);
        applyRewardedAds(rewardedAds);
        emit();
        return snapshot();
      })
      .catch(error => {
        state.status = 'error';
        state.balance = positiveInteger(auth?.profile?.coins, 0);
        state.error = error.message;
        emit();
        return snapshot();
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  async function claimDailyReward() {
    if (!auth?.isAuthenticated?.()) throw economyError('Günlük ödül için giriş yapmalısın.', 401);
    const result = await rpc('kantin_claim_daily_reward');
    state.balance = positiveInteger(result?.balance, state.balance || 0);
    state.walletVersion += result?.alreadyClaimed ? 0 : 1;
    state.dailyClaim = {
      claimedToday: true,
      claimedOn: result?.claimedOn || state.dailyClaim.claimedOn,
      streakDay: positiveInteger(result?.streakDay, state.dailyClaim.streakDay)
    };
    state.status = 'ready';
    state.error = null;
    emit();
    auth?.refreshProfile?.().catch(() => null);
    return {
      balance: state.balance,
      amount: positiveInteger(result?.amount, 0),
      streakDay: state.dailyClaim.streakDay,
      alreadyClaimed: Boolean(result?.alreadyClaimed)
    };
  }

  async function refreshRewardedAds() {
    if (!auth?.isAuthenticated?.()) throw economyError('Ödüllü reklam için giriş yapmalısın.', 401);
    const payload = await rpc('kantin_rewarded_ad_state');
    applyRewardedAds(payload);
    emit();
    return { ...state.rewardedAds };
  }

  async function beginRewardedAd({ provider, platform, placement = 'lobby', metadata = {} } = {}) {
    if (!auth?.isAuthenticated?.()) throw economyError('Ödüllü reklam için giriş yapmalısın.', 401);
    const session = await rpc('kantin_begin_rewarded_ad', {
      p_provider: String(provider || ''),
      p_platform: String(platform || ''),
      p_placement: String(placement || 'lobby'),
      p_client_metadata: metadata && typeof metadata === 'object' ? metadata : {}
    });
    return session;
  }

  async function rewardedAdStatus(sessionId) {
    if (!auth?.isAuthenticated?.()) throw economyError('Ödüllü reklam için giriş yapmalısın.', 401);
    const payload = await rpc('kantin_rewarded_ad_status', { p_session_id: sessionId });
    if (payload?.status === 'rewarded') {
      state.balance = positiveInteger(payload.balance, state.balance || 0);
      await refreshRewardedAds();
      auth?.refreshProfile?.().catch(() => null);
    }
    return payload;
  }

  const api = {
    ready: null,
    get status() { return state.status; },
    get balance() { return state.balance; },
    get walletVersion() { return state.walletVersion; },
    get core() { return { ...state.core }; },
    get stakes() { return state.stakes.map(stake => ({ ...stake })); },
    get dailyRewards() { return state.dailyRewards.map(reward => ({ ...reward })); },
    get dailyClaim() { return { ...state.dailyClaim }; },
    get rewardedAds() { return { ...state.rewardedAds }; },
    get error() { return state.error; },
    snapshot,
    refresh,
    claimDailyReward,
    refreshRewardedAds,
    beginRewardedAd,
    rewardedAdStatus,
    addEventListener(...args) { return events.addEventListener(...args); },
    removeEventListener(...args) { return events.removeEventListener(...args); }
  };

  window.KANTIN_ECONOMY = api;
  auth?.addEventListener?.('change', () => {
    if (auth.isAuthenticated()) refresh();
    else reset();
  });
  api.ready = Promise.resolve(auth?.ready).then(refresh);
})();
