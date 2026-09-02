(() => {
  'use strict';

  const auth = window.KANTIN_AUTH;
  const elements = Object.fromEntries(Array.from(document.querySelectorAll('[id]')).map(element => [element.id, element]));
  const state = { access: null, currentView: 'dashboard', dashboard: null, players: null, player: null, playerOffset: 0, playerQuery: '' };
  const previewMode = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
  const previewPlayer = {
    profile: { id: '77b76a35-8a64-4cdf-b540-02f549f40ee8', username: 'Kantin Oyuncusu', playerCode: 'KNT-184521', level: 12, coins: 8450, isGuest: false, preferredLocale: 'tr', createdAt: new Date().toISOString() },
    transactions: [
      { createdAt: new Date().toISOString(), type: 'rewarded_ad', amount: 150, balanceBefore: 8300, balanceAfter: 8450 },
      { createdAt: new Date(Date.now() - 86400000).toISOString(), type: 'daily_reward', amount: 100, balanceBefore: 8200, balanceAfter: 8300 }
    ]
  };
  const previewData = {
    me: { role: 'owner', capabilities: ['dashboard', 'players', 'economy', 'settings', 'audit'], profile: { id: 'preview', email: 'owner@kantin.local', username: 'Kantin Yöneticisi' } },
    dashboard: { players: { total: 12847, guests: 3912, newToday: 184 }, economy: { coinsInCirculation: 18472500, transactionsToday: 2351 }, rewardedAds: { startedToday: 942, rewardedToday: 817, coinsToday: 122550, settings: { enabled: true, rewardAmount: 150, dailyLimit: 4, cooldownSeconds: 600, sessionTtlSeconds: 900 } }, generatedAt: new Date().toISOString() },
    players: { total: 2, limit: 25, offset: 0, items: [
      { id: previewPlayer.profile.id, username: previewPlayer.profile.username, player_code: previewPlayer.profile.playerCode, level: 12, is_guest: false, preferred_locale: 'tr', coins: 8450, created_at: previewPlayer.profile.createdAt },
      { id: 'de1d7601-a52d-4211-8424-eaaf40531678', username: 'Misafir 84A2F1', player_code: 'KNT-492810', level: 1, is_guest: true, preferred_locale: 'de', coins: 2500, created_at: new Date(Date.now() - 3600000).toISOString() }
    ] },
    player: previewPlayer,
    audit: { items: [
      { createdAt: new Date().toISOString(), actorName: 'Kantin Yöneticisi', action: 'economy.rewarded_ads_updated', targetId: 'rewarded_ads', context: {} },
      { createdAt: new Date(Date.now() - 7200000).toISOString(), actorName: 'Kantin Yöneticisi', action: 'economy.coins_adjusted', targetId: 'KNT-184521', after: { amount: 500 }, context: { reason: 'Destek düzeltmesi' } }
    ] }
  };
  let toastTimer = null;

  const text = value => String(value ?? '');
  const escapeHtml = value => text(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
  const formatNumber = value => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
  const formatDate = value => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
  const roleLabel = role => ({ owner: 'Kurucu yönetici', admin: 'Yönetici', support: 'Destek', analyst: 'Analist' })[role] || role;
  const actionLabel = action => ({
    'admin.owner_bootstrapped': 'İlk yönetici oluşturuldu',
    'economy.coins_adjusted': 'Coin bakiyesi düzeltildi',
    'economy.rewarded_ads_updated': 'Reklam ayarları güncellendi'
  })[action] || action;

  function showOnly(id) {
    ['adminLoading', 'adminLogin', 'adminDenied', 'adminConsole'].forEach(key => { elements[key].hidden = key !== id; });
  }

  function toast(message, error = false) {
    clearTimeout(toastTimer);
    elements.adminToast.textContent = message;
    elements.adminToast.classList.toggle('error', error);
    elements.adminToast.classList.add('show');
    toastTimer = setTimeout(() => elements.adminToast.classList.remove('show'), 3800);
  }

  async function request(action, options = {}) {
    if (previewMode) {
      if (options.method === 'POST') throw new Error('Yerel önizleme salt okunurdur.');
      return structuredClone(previewData[action] || previewData.dashboard);
    }
    const token = auth.getAccessToken();
    if (!token) throw new Error('Yönetici oturumu bulunamadı.');
    const query = new URLSearchParams({ action, ...(options.query || {}) });
    const response = await fetch(`/api/admin?${query}`, {
      method: options.method || 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const labels = {
        admin_permission_denied: 'Bu hesabın yönetim yetkisi bulunmuyor.',
        permanent_confirmed_account_required: 'Yönetim için e-postası doğrulanmış kalıcı hesap gerekir.',
        admin_service_not_configured: 'Yönetim servisi henüz yapılandırılmadı.',
        insufficient_coins: 'Oyuncunun bakiyesi bu miktarı geri almak için yeterli değil.',
        invalid_admin_coin_adjustment: 'Miktar veya açıklama geçerli değil.',
        invalid_rewarded_ad_settings: 'Reklam ayarlarından biri izin verilen aralığın dışında.',
        player_not_found: 'Oyuncu bulunamadı.',
        origin_not_allowed: 'Güvenlik kontrolü isteği reddetti.'
      };
      const error = new Error(labels[payload.error] || 'Yönetim isteği tamamlanamadı.');
      error.code = payload.error;
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  function can(capability) {
    return state.access?.capabilities?.includes(capability);
  }

  async function confirmAction(title, message, danger = false) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmAccept.classList.toggle('danger', danger);
    elements.confirmDialog.showModal();
    return new Promise(resolve => {
      elements.confirmDialog.addEventListener('close', () => resolve(elements.confirmDialog.returnValue === 'confirm'), { once: true });
    });
  }

  function setBusy(button, busy, label = 'İşleniyor…') {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function renderDashboard(data) {
    state.dashboard = data;
    const metrics = [
      ['TOPLAM OYUNCU', formatNumber(data.players.total), `${formatNumber(data.players.newToday)} yeni kayıt`],
      ['DOLAŞIMDAKİ COIN', formatNumber(data.economy.coinsInCirculation), 'Sunucu cüzdanlarının toplamı'],
      ['BUGÜNKÜ İŞLEMLER', formatNumber(data.economy.transactionsToday), 'Coin defteri hareketi'],
      ['ÖDÜLLÜ REKLAMLAR', formatNumber(data.rewardedAds.rewardedToday), `${formatNumber(data.rewardedAds.coinsToday)} coin ödendi`]
    ];
    elements.dashboardMetrics.innerHTML = metrics.map(item => `<article class="metric-card"><small>${item[0]}</small><strong>${item[1]}</strong><span>${item[2]}</span></article>`).join('');
    elements.playerSummary.innerHTML = [
      ['Toplam kayıt', data.players.total],
      ['Misafir hesap', data.players.guests],
      ['Bugünkü yeni oyuncu', data.players.newToday]
    ].map(item => `<div><span>${item[0]}</span><b>${formatNumber(item[1])}</b></div>`).join('');
    const settings = data.rewardedAds.settings || {};
    elements.adSummary.innerHTML = [
      ['Durum', settings.enabled ? 'Açık' : 'Kapalı'],
      ['Reklam başına', `${formatNumber(settings.rewardAmount)} coin`],
      ['Günlük sınır', `${formatNumber(settings.dailyLimit)} reklam`],
      ['Bugün başlatılan', formatNumber(data.rewardedAds.startedToday)]
    ].map(item => `<div><span>${item[0]}</span><b>${escapeHtml(item[1])}</b></div>`).join('');
    elements.dashboardGenerated.textContent = `Son kontrol: ${formatDate(data.generatedAt)}`;
    fillRewardedSettings(settings);
  }

  async function loadDashboard() {
    renderDashboard(await request('dashboard'));
  }

  function renderPlayers(data) {
    state.players = data;
    const items = data.items || [];
    elements.playersTable.innerHTML = items.length ? items.map(player => `<tr>
      <td><span class="player-cell"><i>${escapeHtml(player.username?.charAt(0).toUpperCase())}</i><b>${escapeHtml(player.username)}</b></span></td>
      <td>${escapeHtml(player.player_code)}</td><td><span class="chip ${player.is_guest ? 'guest' : ''}">${player.is_guest ? 'Misafir' : 'Kalıcı'}</span></td>
      <td>${formatNumber(player.level)}</td><td class="coin-value">${formatNumber(player.coins)}</td><td>${formatDate(player.created_at)}</td>
      <td><button type="button" class="button tiny" data-player-id="${escapeHtml(player.id)}">İncele</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty-cell">Aramaya uygun oyuncu bulunamadı.</td></tr>';
    const first = items.length ? data.offset + 1 : 0;
    elements.playersCount.textContent = `${formatNumber(data.total)} oyuncudan ${formatNumber(first)}–${formatNumber(Math.min(data.offset + items.length, data.total))}`;
    elements.playersPrev.disabled = data.offset <= 0;
    elements.playersNext.disabled = data.offset + data.limit >= data.total;
  }

  async function loadPlayers() {
    const data = await request('players', { query: { q: state.playerQuery, limit: 25, offset: state.playerOffset } });
    renderPlayers(data);
  }

  function renderPlayer(data) {
    state.player = data;
    const profile = data.profile;
    elements.playerDetailName.textContent = profile.username;
    elements.playerDetailMeta.innerHTML = [
      ['Oyuncu kodu', profile.playerCode], ['Bakiye', `${formatNumber(profile.coins)} coin`], ['Seviye', profile.level],
      ['Hesap türü', profile.isGuest ? 'Misafir' : 'Kalıcı'], ['Dil', (profile.preferredLocale || '—').toUpperCase()]
    ].map(item => `<div><small>${item[0]}</small><b>${escapeHtml(item[1])}</b></div>`).join('');
    const transactions = data.transactions || [];
    elements.transactionsTable.innerHTML = transactions.length ? transactions.map(entry => `<tr><td>${formatDate(entry.createdAt)}</td><td>${escapeHtml(entry.type)}</td><td class="${entry.amount > 0 ? 'positive' : 'negative'}">${entry.amount > 0 ? '+' : ''}${formatNumber(entry.amount)}</td><td>${formatNumber(entry.balanceBefore)}</td><td>${formatNumber(entry.balanceAfter)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">Coin hareketi bulunmuyor.</td></tr>';
    elements.coinAdjustmentForm.hidden = !can('economy');
    elements.playerDetailPanel.hidden = false;
    elements.playerDetailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadPlayer(id) {
    renderPlayer(await request('player', { query: { id } }));
  }

  function fillRewardedSettings(settings) {
    const form = elements.rewardedSettingsForm;
    form.elements.enabled.checked = settings.enabled === true;
    form.elements.rewardAmount.value = Number(settings.rewardAmount) || 150;
    form.elements.dailyLimit.value = Number.isFinite(Number(settings.dailyLimit)) ? Number(settings.dailyLimit) : 4;
    form.elements.cooldownMinutes.value = Math.round((Number(settings.cooldownSeconds) || 0) / 60);
    form.elements.sessionTtlMinutes.value = Math.round((Number(settings.sessionTtlSeconds) || 900) / 60);
  }

  function renderAudit(data) {
    const items = data.items || [];
    elements.auditTable.innerHTML = items.length ? items.map(entry => {
      const delta = Number(entry.after?.amount);
      const detail = Number.isFinite(delta) ? `${delta > 0 ? '+' : ''}${formatNumber(delta)} coin` : entry.context?.reason || '—';
      return `<tr><td>${formatDate(entry.createdAt)}</td><td>${escapeHtml(entry.actorName || entry.actorId || 'Sistem')}</td><td>${escapeHtml(actionLabel(entry.action))}</td><td>${escapeHtml(entry.targetId || entry.targetType)}</td><td>${escapeHtml(detail)}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-cell">Henüz yönetici işlemi bulunmuyor.</td></tr>';
  }

  async function loadAudit() {
    renderAudit(await request('audit', { query: { limit: 50, offset: 0 } }));
  }

  async function switchView(view) {
    state.currentView = view;
    const labels = { dashboard: ['CANLI DURUM', 'Genel bakış'], players: ['HESAP YÖNETİMİ', 'Oyuncular'], ads: ['EKONOMİ AYARLARI', 'Reklam ekonomisi'], audit: ['GÜVENLİK KAYDI', 'İşlem kayıtları'] };
    document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== view; panel.classList.toggle('active', panel.dataset.viewPanel === view); });
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    elements.viewEyebrow.textContent = labels[view][0];
    elements.viewTitle.textContent = labels[view][1];
    try {
      if (view === 'dashboard') await loadDashboard();
      if (view === 'players') await loadPlayers();
      if (view === 'ads' && !state.dashboard) await loadDashboard();
      if (view === 'audit') await loadAudit();
    } catch (error) { toast(error.message, true); }
  }

  async function enterConsole() {
    state.access = await request('me');
    elements.adminName.textContent = state.access.profile.username;
    elements.adminInitial.textContent = state.access.profile.username.charAt(0).toUpperCase();
    elements.adminRole.textContent = roleLabel(state.access.role);
    document.querySelectorAll('[data-capability]').forEach(element => { element.hidden = !can(element.dataset.capability); });
    showOnly('adminConsole');
    await switchView('dashboard');
  }

  async function initialize() {
    showOnly('adminLoading');
    if (previewMode) { await enterConsole(); return; }
    await auth.ready;
    if (!auth.isAuthenticated()) { showOnly('adminLogin'); return; }
    if (auth.localGuest || auth.isAnonymous) {
      elements.adminDeniedMessage.textContent = 'Misafir hesaplar yönetici olamaz. Önce oyun profilinden hesabınızı e-posta, Google, Facebook veya Apple ile kalıcı hâle getirin.';
      showOnly('adminDenied');
      return;
    }
    try {
      await enterConsole();
    } catch (error) {
      elements.adminDeniedMessage.textContent = error.message;
      showOnly('adminDenied');
    }
  }

  elements.adminLoginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setBusy(button, true);
    elements.adminLoginError.textContent = '';
    try {
      const form = new FormData(event.currentTarget);
      await auth.signIn({ email: form.get('email'), password: form.get('password') });
      await enterConsole();
    } catch (error) {
      elements.adminLoginError.textContent = error.message;
    } finally { setBusy(button, false); }
  });

  elements.adminSetupForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    setBusy(button, true, 'Hesap oluşturuluyor…');
    elements.adminLoginError.textContent = '';
    elements.adminSetupMessage.textContent = '';
    try {
      const form = new FormData(event.currentTarget);
      const result = await auth.signUp({
        username: form.get('username'),
        email: form.get('email'),
        password: form.get('password')
      });
      if (result.authenticated) {
        await enterConsole();
        return;
      }
      elements.adminSetupMessage.textContent = 'Doğrulama bağlantısı e-posta adresinize gönderildi. Bağlantıyı açtıktan sonra bu ekrandan giriş yapın.';
      event.currentTarget.reset();
    } catch (error) {
      elements.adminLoginError.textContent = error.message;
    } finally { setBusy(button, false); }
  });

  elements.adminGoogleLogin.addEventListener('click', () => auth.signInWithOAuth('google').catch(error => { elements.adminLoginError.textContent = error.message; }));
  elements.adminLogout.addEventListener('click', async () => { await auth.signOut(); showOnly('adminLogin'); });
  elements.adminDeniedLogout.addEventListener('click', async () => { await auth.signOut(); showOnly('adminLogin'); });
  elements.adminRefresh.addEventListener('click', async event => { setBusy(event.currentTarget, true, '…'); await switchView(state.currentView); setBusy(event.currentTarget, false); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));

  elements.playerSearchForm.addEventListener('submit', async event => { event.preventDefault(); state.playerQuery = elements.playerSearch.value.trim(); state.playerOffset = 0; await loadPlayers().catch(error => toast(error.message, true)); });
  elements.playersPrev.addEventListener('click', async () => { state.playerOffset = Math.max(0, state.playerOffset - 25); await loadPlayers(); });
  elements.playersNext.addEventListener('click', async () => { state.playerOffset += 25; await loadPlayers(); });
  elements.playersTable.addEventListener('click', event => { const button = event.target.closest('[data-player-id]'); if (button) loadPlayer(button.dataset.playerId).catch(error => toast(error.message, true)); });
  elements.playerDetailClose.addEventListener('click', () => { elements.playerDetailPanel.hidden = true; state.player = null; });

  elements.coinAdjustmentForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.player?.profile) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    const reason = text(form.get('reason')).trim();
    const accepted = await confirmAction('Coin işlemini onaylayın', `${state.player.profile.username} hesabına ${amount > 0 ? '+' : ''}${formatNumber(amount)} coin uygulanacak. Bu işlem geri alınmaz; ters işlem açılması gerekir.`, amount < 0);
    if (!accepted) return;
    const button = event.submitter;
    setBusy(button, true);
    try {
      await request('adjust-coins', { method: 'POST', body: { userId: state.player.profile.id, amount, reason, requestId: crypto.randomUUID() } });
      event.currentTarget.reset();
      await Promise.all([loadPlayer(state.player.profile.id), loadDashboard()]);
      toast('Coin işlemi uygulandı ve kayıt altına alındı.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

  elements.rewardedSettingsForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      enabled: event.currentTarget.elements.enabled.checked,
      rewardAmount: Number(form.get('rewardAmount')),
      dailyLimit: Number(form.get('dailyLimit')),
      cooldownSeconds: Number(form.get('cooldownMinutes')) * 60,
      sessionTtlSeconds: Number(form.get('sessionTtlMinutes')) * 60,
      requestId: crypto.randomUUID()
    };
    const accepted = await confirmAction('Canlı reklam ayarları değişsin mi?', `Yeni politika: reklam başına ${formatNumber(values.rewardAmount)} coin, günde ${formatNumber(values.dailyLimit)} izleme ve ${formatNumber(values.cooldownSeconds / 60)} dakika bekleme.`, false);
    if (!accepted) return;
    const button = event.submitter;
    setBusy(button, true);
    try {
      const saved = await request('update-rewarded-ads', { method: 'POST', body: values });
      fillRewardedSettings(saved);
      await loadDashboard();
      toast('Reklam politikası güncellendi.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

  initialize().catch(error => { elements.adminLoginError.textContent = error.message; showOnly('adminLogin'); });
})();
