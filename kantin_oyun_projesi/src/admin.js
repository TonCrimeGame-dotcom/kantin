(() => {
  'use strict';

  const auth = window.KANTIN_AUTH;
  const elements = Object.fromEntries(Array.from(document.querySelectorAll('[id]')).map(element => [element.id, element]));
  const state = {
    access: null, currentView: 'dashboard', dashboard: null, operations: null, players: null,
    player: null, playerOffset: 0, playerQuery: '', moderation: null, economy: null,
    content: null, admins: null
  };
  const previewMode = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
  const previewPlayer = {
    profile: { id: '77b76a35-8a64-4cdf-b540-02f549f40ee8', username: 'Kantin Oyuncusu', playerCode: 'KNT-184521', level: 12, coins: 8450, isGuest: false, preferredLocale: 'tr', createdAt: new Date().toISOString() },
    transactions: [
      { createdAt: new Date().toISOString(), type: 'rewarded_ad', amount: 150, balanceBefore: 8300, balanceAfter: 8450 },
      { createdAt: new Date(Date.now() - 86400000).toISOString(), type: 'daily_reward', amount: 100, balanceBefore: 8200, balanceAfter: 8300 }
    ]
  };
  const previewData = {
    me: { role: 'owner', capabilities: ['dashboard', 'players', 'economy', 'settings', 'audit', 'operations', 'moderation', 'content', 'admins'], profile: { id: 'preview', email: 'owner@kantin.local', username: 'Kantin Yöneticisi' } },
    dashboard: { players: { total: 12847, guests: 3912, newToday: 184 }, economy: { coinsInCirculation: 18472500, transactionsToday: 2351 }, rewardedAds: { startedToday: 942, rewardedToday: 817, coinsToday: 122550, settings: { enabled: true, rewardAmount: 150, dailyLimit: 4, cooldownSeconds: 600, sessionTtlSeconds: 900 } }, generatedAt: new Date().toISOString() },
    players: { total: 2, limit: 25, offset: 0, items: [
      { id: previewPlayer.profile.id, username: previewPlayer.profile.username, player_code: previewPlayer.profile.playerCode, level: 12, is_guest: false, preferred_locale: 'tr', coins: 8450, created_at: previewPlayer.profile.createdAt },
      { id: 'de1d7601-a52d-4211-8424-eaaf40531678', username: 'Misafir 84A2F1', player_code: 'KNT-492810', level: 1, is_guest: true, preferred_locale: 'de', coins: 2500, created_at: new Date(Date.now() - 3600000).toISOString() }
    ] },
    player: previewPlayer,
    operations: {
      health: { database: true, serverTime: new Date().toISOString(), waitingPlayers: 7, activeMatches: 3, staleTickets: 0 },
      queues: [{ mode: 'spvp', wordLocale: null, waiting: 3, oldestJoinedAt: new Date(Date.now() - 45000).toISOString() }, { mode: 'sozcukDuel', wordLocale: 'tr', waiting: 4, oldestJoinedAt: new Date(Date.now() - 70000).toISOString() }],
      tickets: [{ playerId: 'GUEST-PREVIEW-1', username: 'Misafir 52A1', mode: 'spvp', wordLocale: null, joinedAt: new Date(Date.now() - 45000).toISOString(), updatedAt: new Date().toISOString() }],
      matches: [{ id: '13cb4ed2-aa76-4cad-b560-b501c572a659', mode: 'pistiSolo', wordLocale: null, players: [{ username: 'Ada' }, { username: 'Mert' }], status: 'playing', updatedAt: new Date().toISOString() }]
    },
    moderation: { restrictions: [{ userId: previewPlayer.profile.id, username: previewPlayer.profile.username, playerCode: previewPlayer.profile.playerCode, blockedUntil: new Date(Date.now() + 86400000).toISOString(), reason: 'Tekrarlanan oyun terki', updatedAt: new Date().toISOString() }], reports: [] },
    economy: { summary: { transactionsToday: 2351, coinsAddedToday: 184500, coinsRemovedToday: 92000, paidOrdersToday: 12 }, transactions: previewPlayer.transactions.map((entry, index) => ({ ...entry, id: `tx-${index}`, username: previewPlayer.profile.username, playerCode: previewPlayer.profile.playerCode, source: entry.type })), orders: [] },
    content: { announcements: [], events: [] },
    admins: { items: [{ userId: 'preview', email: 'owner@kantin.local', username: 'Kantin Yöneticisi', role: 'owner', active: true, createdAt: new Date().toISOString() }] },
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
  const formatMoney = (minor, currency) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY' }).format((Number(minor) || 0) / 100);
  const localInputValue = value => {
    if (!value) return '';
    const date = new Date(value), offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const roleLabel = role => ({ owner: 'Kurucu yönetici', admin: 'Yönetici', support: 'Destek', analyst: 'Analist' })[role] || role;
  const modeLabel = mode => ({ spvp: 'Klasik Tavla', upvp: 'Üniversite Tavlası', pistiSolo: 'Pişti', pistiTeam: 'Eşli Pişti', okeySolo: '101 Okey', okeyTeam: 'Eşli 101', sozcukDuel: 'Sözcük Kapışması' })[mode] || mode;
  const statusLabel = status => ({ waiting: 'Bekliyor', playing: 'Aktif', finished: 'Bitti', abandoned: 'İptal', open: 'Açık', reviewed: 'İncelendi', resolved: 'Çözüldü', dismissed: 'Kapatıldı', paid: 'Ödendi', refunded: 'İade', pending: 'Bekliyor', failed: 'Başarısız' })[status] || status;
  const actionLabel = action => ({
    'admin.owner_bootstrapped': 'İlk yönetici oluşturuldu',
    'admin.membership_updated': 'Yönetici yetkisi güncellendi',
    'economy.coins_adjusted': 'Coin bakiyesi düzeltildi',
    'economy.rewarded_ads_updated': 'Reklam ayarları güncellendi',
    'economy.order_refunded': 'Sipariş iadesi kaydedildi',
    'operations.ticket_cancelled': 'Eşleşme bileti iptal edildi',
    'operations.match_abandoned': 'Maç sonlandırıldı',
    'moderation.restriction_set': 'Oyuncu eşleşmeye kapatıldı',
    'moderation.restriction_cleared': 'Oyuncu engeli kaldırıldı',
    'moderation.report_updated': 'Şikâyet güncellendi',
    'content.announcement_saved': 'Duyuru kaydedildi',
    'content.event_saved': 'Etkinlik kaydedildi'
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
        invalid_admin_operation: 'Operasyon gerekçesi geçerli değil.',
        match_ticket_not_found: 'Eşleşme bileti artık bulunmuyor.',
        active_match_not_found: 'Aktif maç artık bulunmuyor.',
        invalid_player_restriction: 'Engel süresi veya gerekçesi geçerli değil.',
        invalid_report_resolution: 'Şikâyet çözüm bilgileri geçerli değil.',
        report_not_found: 'Şikâyet kaydı bulunamadı.',
        order_not_found: 'Sipariş bulunamadı.',
        order_not_refundable: 'Bu sipariş iade kaydına uygun değil.',
        invalid_order_refund: 'İade gerekçesi geçerli değil.',
        invalid_announcement: 'Duyuru alanlarını ve tarihlerini kontrol edin.',
        invalid_game_event: 'Etkinlik alanlarını, JSON ayarını ve tarihlerini kontrol edin.',
        confirmed_account_not_found: 'Bu e-postayla doğrulanmış kalıcı hesap bulunamadı.',
        admin_self_demote_forbidden: 'Kurucu kendi yetkisini düşüremez.',
        last_owner_required: 'Sistemde en az bir etkin kurucu kalmalıdır.',
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
    elements.confirmReasonField.hidden = true;
    elements.confirmReason.value = '';
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmAccept.classList.toggle('danger', danger);
    elements.confirmDialog.showModal();
    return new Promise(resolve => {
      elements.confirmDialog.addEventListener('close', () => resolve(elements.confirmDialog.returnValue === 'confirm'), { once: true });
    });
  }

  async function confirmWithReason(title, message, danger = false) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmAccept.classList.toggle('danger', danger);
    elements.confirmReasonField.hidden = false;
    elements.confirmReason.value = '';
    elements.confirmDialog.showModal();
    elements.confirmReason.focus();
    return new Promise(resolve => {
      elements.confirmDialog.addEventListener('close', () => {
        const reason = elements.confirmReason.value.trim();
        elements.confirmReasonField.hidden = true;
        resolve(elements.confirmDialog.returnValue === 'confirm' && reason.length >= 8 ? reason : null);
      }, { once: true });
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

  function renderOperations(data) {
    state.operations = data;
    const health = data.health || {};
    const metrics = [
      ['KUYRUKTA', health.waitingPlayers, 'Oyuncu bekliyor'],
      ['AKTİF MAÇ', health.activeMatches, 'Devam eden masa'],
      ['BAYAT BİLET', health.staleTickets, 'İki dakikadır yenilenmedi'],
      ['VERİTABANI', health.database ? 'Aktif' : 'Sorun', 'Canlı bağlantı']
    ];
    elements.operationsMetrics.innerHTML = metrics.map(item => `<article class="metric-card"><small>${item[0]}</small><strong>${escapeHtml(item[1])}</strong><span>${item[2]}</span></article>`).join('');
    const queues = data.queues || [];
    elements.queueGroups.innerHTML = queues.length ? queues.map(queue => `<div><span>${escapeHtml(modeLabel(queue.mode))}${queue.wordLocale ? ` · ${escapeHtml(queue.wordLocale.toUpperCase())}` : ''}</span><b>${formatNumber(queue.waiting)} oyuncu</b></div>`).join('') : '<div><span>Bekleyen kuyruk</span><b>Yok</b></div>';
    elements.operationsHealth.innerHTML = [
      ['Veritabanı', health.database ? 'Bağlı' : 'Ulaşılamıyor'],
      ['Sunucu saati', formatDate(health.serverTime)],
      ['Bayat bilet', formatNumber(health.staleTickets)]
    ].map(item => `<div><span>${item[0]}</span><b>${escapeHtml(item[1])}</b></div>`).join('');
    const tickets = data.tickets || [];
    const canCancelTickets = ['owner', 'admin', 'support'].includes(state.access?.role);
    const canAbandonMatches = ['owner', 'admin'].includes(state.access?.role);
    elements.operationsTickets.innerHTML = tickets.length ? tickets.map(ticket => `<tr><td><b>${escapeHtml(ticket.username)}</b><small class="cell-subtitle">${escapeHtml(ticket.playerId)}</small></td><td>${escapeHtml(modeLabel(ticket.mode))}</td><td>${escapeHtml((ticket.wordLocale || '—').toUpperCase())}</td><td>${formatDate(ticket.joinedAt)}</td><td>${formatDate(ticket.updatedAt)}</td><td>${canCancelTickets ? `<button class="button tiny" type="button" data-cancel-ticket="${escapeHtml(ticket.playerId)}">Kuyruktan çıkar</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Bekleyen oyuncu yok.</td></tr>';
    const matches = data.matches || [];
    elements.operationsMatches.innerHTML = matches.length ? matches.map(match => `<tr><td><code>${escapeHtml(match.id.slice(0, 8))}</code></td><td>${escapeHtml(modeLabel(match.mode))}</td><td>${escapeHtml((match.players || []).map(player => player.username).join(', ') || '—')}</td><td><span class="chip status-${escapeHtml(match.status)}">${escapeHtml(statusLabel(match.status))}</span></td><td>${formatDate(match.updatedAt)}</td><td>${match.status === 'playing' && canAbandonMatches ? `<button class="button tiny danger-button" type="button" data-abandon-match="${escapeHtml(match.id)}">Sonlandır</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Henüz maç kaydı yok.</td></tr>';
  }

  async function loadOperations() {
    renderOperations(await request('operations'));
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

  function renderModeration(data) {
    state.moderation = data;
    const restrictions = data.restrictions || [];
    elements.restrictionsTable.innerHTML = restrictions.length ? restrictions.map(item => `<tr><td><b>${escapeHtml(item.username)}</b></td><td>${escapeHtml(item.playerCode)}</td><td>${formatDate(item.blockedUntil)}</td><td class="wrap-cell">${escapeHtml(item.reason)}</td><td>${formatDate(item.updatedAt)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">Aktif eşleşme engeli bulunmuyor.</td></tr>';
    const reports = data.reports || [];
    elements.reportsTable.innerHTML = reports.length ? reports.map(report => `<tr><td>${formatDate(report.createdAt)}</td><td><b>${escapeHtml(report.targetName)}</b></td><td>${escapeHtml(report.category)}</td><td>${escapeHtml(report.reporterName || 'Sistem')}</td><td><span class="chip">${escapeHtml(statusLabel(report.status))}</span></td><td>${report.status === 'open' ? `<button class="button tiny" type="button" data-resolve-report="${escapeHtml(report.id)}">Sonuçlandır</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Şikâyet kuyruğu boş.</td></tr>';
  }

  async function loadModeration() {
    renderModeration(await request('moderation'));
  }

  function renderEconomy(data) {
    state.economy = data;
    const summary = data.summary || {};
    const metrics = [
      ['BUGÜNKÜ HAREKET', summary.transactionsToday, 'Coin işlemi'],
      ['EKLENEN COIN', summary.coinsAddedToday, 'Bugün'],
      ['ÇIKAN COIN', summary.coinsRemovedToday, 'Bugün'],
      ['ÖDENEN SİPARİŞ', summary.paidOrdersToday, 'Bugün']
    ];
    elements.economyMetrics.innerHTML = metrics.map(item => `<article class="metric-card"><small>${item[0]}</small><strong>${formatNumber(item[1])}</strong><span>${item[2]}</span></article>`).join('');
    const transactions = data.transactions || [];
    elements.economyTransactions.innerHTML = transactions.length ? transactions.map(entry => `<tr><td>${formatDate(entry.createdAt)}</td><td><b>${escapeHtml(entry.username)}</b><small class="cell-subtitle">${escapeHtml(entry.playerCode)}</small></td><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.source)}</td><td class="${Number(entry.amount) > 0 ? 'positive' : 'negative'}">${Number(entry.amount) > 0 ? '+' : ''}${formatNumber(entry.amount)}</td><td>${formatNumber(entry.balanceAfter)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Coin hareketi bulunmuyor.</td></tr>';
    const orders = data.orders || [];
    elements.ordersTable.innerHTML = orders.length ? orders.map(order => `<tr><td>${formatDate(order.createdAt)}</td><td><b>${escapeHtml(order.username)}</b><small class="cell-subtitle">${escapeHtml(order.playerCode)}</small></td><td>${escapeHtml(order.provider)}</td><td>${escapeHtml(formatMoney(order.amountMinor, order.currency))}</td><td>${formatNumber(order.coins)}</td><td><span class="chip">${escapeHtml(statusLabel(order.status))}</span></td><td>${order.status === 'paid' ? `<button class="button tiny" type="button" data-refund-order="${escapeHtml(order.id)}">İadeyi kaydet</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="7" class="empty-cell">Henüz mağaza siparişi yok.</td></tr>';
  }

  async function loadEconomy() {
    renderEconomy(await request('economy', { query: { limit: 100 } }));
  }

  function fillRewardedSettings(settings) {
    const form = elements.rewardedSettingsForm;
    form.elements.enabled.checked = settings.enabled === true;
    form.elements.rewardAmount.value = Number(settings.rewardAmount) || 150;
    form.elements.dailyLimit.value = Number.isFinite(Number(settings.dailyLimit)) ? Number(settings.dailyLimit) : 4;
    form.elements.cooldownMinutes.value = Math.round((Number(settings.cooldownSeconds) || 0) / 60);
    form.elements.sessionTtlMinutes.value = Math.round((Number(settings.sessionTtlSeconds) || 900) / 60);
  }

  function recordCard(kind, item) {
    const windowText = `${formatDate(item.startsAt)} → ${formatDate(item.endsAt)}`;
    const subtitle = kind === 'announcement' ? `${item.locale ? item.locale.toUpperCase() : 'TÜM DİLLER'} · ${windowText}` : `${escapeHtml(item.key)} · ${windowText}`;
    const description = kind === 'announcement' ? item.body : item.description;
    return `<article class="record-card ${item.active ? 'active' : ''}"><div><span class="chip">${item.active ? 'Etkin' : 'Kapalı'}</span><h3>${escapeHtml(item.title)}</h3><small>${subtitle}</small><p>${escapeHtml(description || 'Açıklama yok')}</p></div><button type="button" class="button tiny" data-edit-${kind}="${escapeHtml(item.id)}">Düzenle</button></article>`;
  }

  function renderContent(data) {
    state.content = data;
    elements.announcementsList.innerHTML = (data.announcements || []).length ? data.announcements.map(item => recordCard('announcement', item)).join('') : '<p class="empty-record">Henüz duyuru oluşturulmadı.</p>';
    elements.eventsList.innerHTML = (data.events || []).length ? data.events.map(item => recordCard('event', item)).join('') : '<p class="empty-record">Henüz etkinlik oluşturulmadı.</p>';
  }

  async function loadContent() {
    renderContent(await request('content'));
  }

  function fillAnnouncementForm(item) {
    const form = elements.announcementForm;
    form.elements.recordId.value = item?.id || '';
    form.elements.title.value = item?.title || '';
    form.elements.locale.value = item?.locale || '';
    form.elements.body.value = item?.body || '';
    form.elements.startsAt.value = localInputValue(item?.startsAt || new Date());
    form.elements.endsAt.value = localInputValue(item?.endsAt);
    form.elements.active.checked = item ? item.active === true : true;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function fillEventForm(item) {
    const form = elements.eventForm;
    form.elements.recordId.value = item?.id || '';
    form.elements.key.value = item?.key || '';
    form.elements.title.value = item?.title || '';
    form.elements.description.value = item?.description || '';
    form.elements.startsAt.value = localInputValue(item?.startsAt || new Date());
    form.elements.endsAt.value = localInputValue(item?.endsAt || new Date(Date.now() + 86400000));
    form.elements.configuration.value = JSON.stringify(item?.configuration || {}, null, 2);
    form.elements.active.checked = item?.active === true;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderAdmins(data) {
    state.admins = data;
    const items = data.items || [];
    elements.adminsTable.innerHTML = items.length ? items.map(member => `<tr><td><b>${escapeHtml(member.username || member.email.split('@')[0])}</b></td><td>${escapeHtml(member.email)}</td><td><select data-admin-role="${escapeHtml(member.email)}"><option value="owner" ${member.role === 'owner' ? 'selected' : ''}>Kurucu</option><option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Yönetici</option><option value="support" ${member.role === 'support' ? 'selected' : ''}>Destek</option><option value="analyst" ${member.role === 'analyst' ? 'selected' : ''}>Analist</option></select></td><td><span class="chip ${member.active ? 'status-playing' : ''}">${member.active ? 'Etkin' : 'Kapalı'}</span></td><td>${formatDate(member.createdAt)}</td><td><div class="inline-actions"><button class="button tiny" type="button" data-save-admin="${escapeHtml(member.email)}">Kaydet</button>${member.active ? `<button class="button tiny danger-button" type="button" data-disable-admin="${escapeHtml(member.email)}">Kapat</button>` : `<button class="button tiny" type="button" data-enable-admin="${escapeHtml(member.email)}">Aç</button>`}</div></td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Yönetici hesabı bulunmuyor.</td></tr>';
  }

  async function loadAdmins() {
    renderAdmins(await request('admins'));
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
    const labels = {
      dashboard: ['CANLI DURUM', 'Genel bakış'],
      operations: ['CANLI OPERASYON', 'Eşleşme ve masalar'],
      players: ['HESAP YÖNETİMİ', 'Oyuncular'],
      moderation: ['OYUNCU GÜVENLİĞİ', 'Moderasyon'],
      economy: ['EKONOMİ DEFTERİ', 'Coin ve siparişler'],
      ads: ['EKONOMİ AYARLARI', 'Reklam ekonomisi'],
      content: ['CANLI İÇERİK', 'Duyuru ve etkinlikler'],
      admins: ['ERİŞİM KONTROLÜ', 'Yöneticiler'],
      audit: ['GÜVENLİK KAYDI', 'İşlem kayıtları']
    };
    document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== view; panel.classList.toggle('active', panel.dataset.viewPanel === view); });
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    elements.viewEyebrow.textContent = labels[view][0];
    elements.viewTitle.textContent = labels[view][1];
    try {
      if (view === 'dashboard') await loadDashboard();
      if (view === 'operations') await loadOperations();
      if (view === 'players') await loadPlayers();
      if (view === 'moderation') await loadModeration();
      if (view === 'economy') await loadEconomy();
      if (view === 'ads' && !state.dashboard) await loadDashboard();
      if (view === 'content') await loadContent();
      if (view === 'admins') await loadAdmins();
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

  elements.operationsTickets.addEventListener('click', async event => {
    const button = event.target.closest('[data-cancel-ticket]');
    if (!button) return;
    const reason = await confirmWithReason('Oyuncu kuyruktan çıkarılsın mı?', 'Oyuncunun bekleyen eşleşme bileti iptal edilecek.', true);
    if (!reason) return toast('İşlem için en az 8 karakterlik gerekçe gerekir.', true);
    setBusy(button, true);
    try {
      await request('cancel-ticket', { method: 'POST', body: { playerId: button.dataset.cancelTicket, reason, requestId: crypto.randomUUID() } });
      await Promise.all([loadOperations(), loadAudit()]);
      toast('Eşleşme bileti iptal edildi.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

  elements.operationsMatches.addEventListener('click', async event => {
    const button = event.target.closest('[data-abandon-match]');
    if (!button) return;
    const reason = await confirmWithReason('Aktif maç sonlandırılsın mı?', 'Masa iptal edilecek ve oyuncuların eşleşme biletleri temizlenecek.', true);
    if (!reason) return toast('İşlem için en az 8 karakterlik gerekçe gerekir.', true);
    setBusy(button, true);
    try {
      await request('abandon-match', { method: 'POST', body: { matchId: button.dataset.abandonMatch, reason, requestId: crypto.randomUUID() } });
      await Promise.all([loadOperations(), loadAudit()]);
      toast('Maç yönetici tarafından sonlandırıldı.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

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

  elements.restrictionForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.player?.profile) return;
    const form = new FormData(event.currentTarget), hours = Number(form.get('hours')), reason = text(form.get('reason')).trim();
    const blockedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    const accepted = await confirmAction('Eşleşme engeli uygulansın mı?', `${state.player.profile.username} ${formatNumber(hours)} saat boyunca çevrimiçi eşleşmeye giremeyecek.`, true);
    if (!accepted) return;
    const button = event.submitter;
    setBusy(button, true);
    try {
      await request('set-restriction', { method: 'POST', body: { userId: state.player.profile.id, blockedUntil, reason, requestId: crypto.randomUUID() } });
      await Promise.all([loadModeration(), loadAudit()]);
      toast('Oyuncunun eşleşme engeli sunucuda etkinleştirildi.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

  elements.restrictionClear.addEventListener('click', async event => {
    if (!state.player?.profile) return;
    const reason = await confirmWithReason('Eşleşme engeli kaldırılsın mı?', `${state.player.profile.username} yeniden çevrimiçi eşleşmelere katılabilecek.`);
    if (!reason) return toast('İşlem için en az 8 karakterlik gerekçe gerekir.', true);
    setBusy(event.currentTarget, true);
    try {
      await request('set-restriction', { method: 'POST', body: { userId: state.player.profile.id, blockedUntil: null, reason, requestId: crypto.randomUUID() } });
      await Promise.all([loadModeration(), loadAudit()]);
      toast('Oyuncunun eşleşme engeli kaldırıldı.');
    } catch (error) { toast(error.message, true); } finally { setBusy(event.currentTarget, false); }
  });

  elements.reportsTable.addEventListener('click', async event => {
    const button = event.target.closest('[data-resolve-report]');
    if (!button) return;
    const note = await confirmWithReason('Şikâyet çözüldü olarak işaretlensin mi?', 'İnceleme sonucu ve gerekçesi değiştirilemez denetim kaydına yazılacak.');
    if (!note) return toast('Sonuç için en az 8 karakterlik not gerekir.', true);
    setBusy(button, true);
    try {
      await request('update-report', { method: 'POST', body: { reportId: button.dataset.resolveReport, status: 'resolved', note, requestId: crypto.randomUUID() } });
      await Promise.all([loadModeration(), loadAudit()]);
      toast('Şikâyet sonuçlandırıldı.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

  elements.ordersTable.addEventListener('click', async event => {
    const button = event.target.closest('[data-refund-order]');
    if (!button) return;
    const reason = await confirmWithReason('Sağlayıcı iadesi kaydedilsin mi?', 'Bu işlem yalnız ödeme sağlayıcısında para iadesi tamamlandıktan sonra kullanılmalıdır. Sipariş coinleri oyuncudan geri alınacak.', true);
    if (!reason) return toast('İade için en az 8 karakterlik gerekçe gerekir.', true);
    setBusy(button, true);
    try {
      await request('refund-order', { method: 'POST', body: { orderId: button.dataset.refundOrder, reason, requestId: crypto.randomUUID() } });
      await Promise.all([loadEconomy(), loadAudit()]);
      toast('Sipariş iadesi coin defterine kaydedildi.');
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

  elements.announcementForm.addEventListener('reset', () => setTimeout(() => fillAnnouncementForm(null), 0));
  elements.announcementForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), button = event.submitter;
    const values = {
      id: form.get('recordId') || null,
      title: text(form.get('title')).trim(),
      locale: form.get('locale') || null,
      body: text(form.get('body')).trim(),
      startsAt: new Date(form.get('startsAt')).toISOString(),
      endsAt: form.get('endsAt') ? new Date(form.get('endsAt')).toISOString() : null,
      active: event.currentTarget.elements.active.checked,
      requestId: crypto.randomUUID()
    };
    setBusy(button, true);
    try {
      await request('save-announcement', { method: 'POST', body: values });
      await Promise.all([loadContent(), loadAudit()]);
      fillAnnouncementForm(null);
      toast('Duyuru yayın planına kaydedildi.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

  elements.announcementsList.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-announcement]');
    if (!button) return;
    fillAnnouncementForm(state.content?.announcements?.find(item => item.id === button.dataset.editAnnouncement));
  });

  elements.eventForm.addEventListener('reset', () => setTimeout(() => fillEventForm(null), 0));
  elements.eventForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), button = event.submitter;
    let configuration;
    try { configuration = JSON.parse(text(form.get('configuration')) || '{}'); }
    catch { return toast('Etkinlik yapılandırması geçerli JSON olmalıdır.', true); }
    if (!configuration || Array.isArray(configuration) || typeof configuration !== 'object') return toast('Etkinlik yapılandırması JSON nesnesi olmalıdır.', true);
    const values = {
      id: form.get('recordId') || null,
      key: text(form.get('key')).trim().toLowerCase(),
      title: text(form.get('title')).trim(),
      description: text(form.get('description')).trim(),
      startsAt: new Date(form.get('startsAt')).toISOString(),
      endsAt: new Date(form.get('endsAt')).toISOString(),
      active: event.currentTarget.elements.active.checked,
      configuration,
      requestId: crypto.randomUUID()
    };
    setBusy(button, true);
    try {
      await request('save-event', { method: 'POST', body: values });
      await Promise.all([loadContent(), loadAudit()]);
      fillEventForm(null);
      toast('Etkinlik takvime kaydedildi.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  });

  elements.eventsList.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-event]');
    if (!button) return;
    fillEventForm(state.content?.events?.find(item => item.id === button.dataset.editEvent));
  });

  async function saveAdminMember(email, role, active, button) {
    setBusy(button, true);
    try {
      await request('set-admin-member', { method: 'POST', body: { email, role, active, requestId: crypto.randomUUID() } });
      await Promise.all([loadAdmins(), loadAudit()]);
      toast('Yönetici yetkisi güncellendi.');
    } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
  }

  elements.adminMemberForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveAdminMember(text(form.get('email')).trim().toLowerCase(), form.get('role'), true, event.submitter);
    event.currentTarget.reset();
  });

  elements.adminsTable.addEventListener('click', async event => {
    const button = event.target.closest('[data-save-admin],[data-disable-admin],[data-enable-admin]');
    if (!button) return;
    const email = button.dataset.saveAdmin || button.dataset.disableAdmin || button.dataset.enableAdmin;
    const select = elements.adminsTable.querySelector(`[data-admin-role="${CSS.escape(email)}"]`);
    const active = !button.matches('[data-disable-admin]');
    if (!active) {
      const accepted = await confirmAction('Yönetici erişimi kapatılsın mı?', `${email} yönetim paneline artık erişemeyecek.`, true);
      if (!accepted) return;
    }
    await saveAdminMember(email, select.value, active, button);
  });

  fillAnnouncementForm(null);
  fillEventForm(null);

  initialize().catch(error => { elements.adminLoginError.textContent = error.message; showOnly('adminLogin'); });
})();
