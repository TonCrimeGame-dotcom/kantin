(() => {
  'use strict';

  const auth = window.KANTIN_AUTH;
  const economy = window.KANTIN_ECONOMY;
  const events = new EventTarget();
  const state = {
    status: 'loading',
    provider: null,
    platform: null,
    testMode: false,
    error: null,
    activeSession: null
  };
  let config = null;

  function snapshot() {
    return {
      ...state,
      canShow: canShow(),
      reward: economy?.rewardedAds?.rewardAmount || 150,
      remainingToday: economy?.rewardedAds?.remainingToday || 0
    };
  }

  function emit() {
    events.dispatchEvent(new CustomEvent('change', { detail: snapshot() }));
  }

  function adError(message) {
    const original = String(message || 'Reklam gösterilemedi.');
    const known = [
      [/test_provider_disabled/i, 'Test reklam sağlayıcısı kapalı.'],
      [/reward_service_not_configured/i, 'Reklam ödülü sunucusu henüz yapılandırılmamış.'],
      [/ad_unavailable|no_fill/i, 'Şu anda gösterilecek reklam bulunamadı. Biraz sonra tekrar dene.'],
      [/reward_verification_timeout/i, 'Reklam tamamlandı; ödül doğrulaması gecikiyor. Bakiye otomatik güncellenecek.'],
      [/failed to fetch/i, 'Reklam sunucusuna ulaşılamadı.']
    ];
    return new Error(known.find(([pattern]) => pattern.test(original))?.[1] || original);
  }

  async function loadConfig() {
    const response = await fetch('/api/config', { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw adError('Reklam yapılandırması alınamadı.');
    config = payload?.rewardedAds || {};
    return config;
  }

  function detectAdapter() {
    const nativeBridge = window.KANTIN_NATIVE_ADS;
    if (nativeBridge?.showRewarded) {
      return { provider: 'admob', platform: nativeBridge.platform === 'ios' ? 'ios' : 'android', bridge: nativeBridge };
    }
    const telegramBridge = window.KANTIN_TELEGRAM_ADS;
    if (telegramBridge?.showRewarded) return { provider: 'telegram', platform: 'telegram', bridge: telegramBridge };
    const webBridge = window.KANTIN_WEB_ADS;
    if (webBridge?.showRewarded) return { provider: 'web', platform: 'web', bridge: webBridge };
    if (config?.testMode) return { provider: 'test', platform: 'test', bridge: null };
    return null;
  }

  function canShow() {
    return state.status === 'ready'
      && Boolean(state.provider)
      && auth?.isAuthenticated?.()
      && !auth?.localGuest
      && economy?.rewardedAds?.enabled
      && economy?.rewardedAds?.canStart
      && economy?.rewardedAds?.remainingToday > 0;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function showTestCreative(session) {
    const overlay = document.createElement('div');
    overlay.className = 'rewarded-test-ad';
    overlay.innerHTML = `<div><small>TEST REKLAMI</small><strong>Reklam doğrulama denemesi</strong><p>Gerçek reklam kimliği bağlanınca bu alan reklam ağı tarafından doldurulacak.</p><b data-ad-countdown>3</b><span>Ödül: +${Number(session.rewardAmount || 0).toLocaleString('tr-TR')} 🪙</span></div>`;
    document.body.appendChild(overlay);
    const countdown = overlay.querySelector('[data-ad-countdown]');
    try {
      for (let second = 3; second > 0; second -= 1) {
        countdown.textContent = second;
        await wait(1000);
      }
      const response = await fetch('/api/rewarded-ad-test', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${auth.getAccessToken()}`,
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ sessionId: session.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw adError(payload?.error || 'test_reward_failed');
    } finally {
      overlay.remove();
    }
  }

  async function waitForReward(sessionId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await economy.rewardedAdStatus(sessionId);
      if (result?.status === 'rewarded') return result;
      if (result?.status === 'expired' || result?.status === 'rejected') throw adError('Reklam ödülü doğrulanamadı.');
      await wait(1500);
    }
    throw adError('reward_verification_timeout');
  }

  async function show(placement = 'lobby') {
    if (!canShow()) {
      if (!auth?.isAuthenticated?.()) throw adError('Reklam ödülü için giriş yapmalısın.');
      if (auth?.localGuest) throw adError('Reklam ödülü için çevrimiçi misafir oturumu gerekli.');
      if (!state.provider) throw adError('Reklam sağlayıcısı henüz bağlanmadı.');
      if (!economy?.rewardedAds?.remainingToday) throw adError('Bugünkü reklam ödülü sınırına ulaştın.');
      throw adError('Yeni reklam ödülü için biraz beklemelisin.');
    }

    const adapter = detectAdapter();
    state.status = 'opening';state.error = null;emit();
    try {
      const session = await economy.beginRewardedAd({
        provider: adapter.provider,
        platform: adapter.platform,
        placement,
        metadata: { locale: window.KANTIN_I18N?.locale || 'tr' }
      });
      state.activeSession = session;state.status = 'showing';emit();
      if (adapter.provider === 'test') await showTestCreative(session);
      else await adapter.bridge.showRewarded({
        sessionId: session.id,
        customData: session.id,
        userId: session.userId,
        rewardAmount: session.rewardAmount,
        placement
      });
      state.status = 'verifying';emit();
      const reward = await waitForReward(session.id);
      await economy.refresh();
      state.status = 'ready';state.activeSession = null;state.error = null;emit();
      return reward;
    } catch (error) {
      state.status = 'ready';state.activeSession = null;state.error = error.message;emit();
      throw adError(error.message);
    }
  }

  async function initialize() {
    try {
      await Promise.all([auth?.ready, economy?.ready, loadConfig()]);
      const adapter = detectAdapter();
      state.provider = adapter?.provider || null;
      state.platform = adapter?.platform || null;
      state.testMode = adapter?.provider === 'test';
      state.status = 'ready';state.error = null;emit();
    } catch (error) {
      state.status = 'error';state.error = error.message;emit();
    }
    return snapshot();
  }

  const api = {
    ready: null,
    get status() { return state.status; },
    get provider() { return state.provider; },
    get platform() { return state.platform; },
    get canShow() { return canShow(); },
    get reward() { return economy?.rewardedAds?.rewardAmount || 150; },
    get remainingToday() { return economy?.rewardedAds?.remainingToday || 0; },
    get error() { return state.error; },
    snapshot,
    show,
    addEventListener(...args) { return events.addEventListener(...args); },
    removeEventListener(...args) { return events.removeEventListener(...args); }
  };

  window.KANTIN_REWARDED_ADS = api;
  economy?.addEventListener?.('change', emit);
  auth?.addEventListener?.('change', emit);
  api.ready = initialize();
})();
