(() => {
  'use strict';

  const SESSION_KEY = 'kantin:supabase-session:v1';
  const INSTALLATION_KEY = 'kantin:installation-id:v1';
  const LOCAL_GUEST_KEY = 'kantin:device-guest:v1';
  const i18n = window.KANTIN_I18N;
  const events = new EventTarget();
  const state = {
    status: 'loading',
    config: null,
    session: null,
    user: null,
    profile: null,
    error: null,
    providers: {},
    anonymousEnabled: false,
    localGuest: false
  };
  let refreshTimer = null;

  function emit() {
    events.dispatchEvent(new CustomEvent('change', { detail: snapshot() }));
  }

  function snapshot() {
    return {
      status: state.status,
      user: state.user,
      profile: state.profile,
      error: state.error,
      localGuest: state.localGuest
    };
  }

  function authError(message, status = 0) {
    const original = String(message || 'İşlem tamamlanamadı.');
    const known = [
      [/invalid login credentials/i, 'E-posta veya şifre hatalı.'],
      [/email not confirmed/i, 'Giriş yapmadan önce e-posta adresini doğrulamalısın.'],
      [/user already registered/i, 'Bu e-posta adresiyle daha önce hesap açılmış.'],
      [/password should be at least/i, 'Şifre en az 8 karakter olmalı.'],
      [/signup is disabled/i, 'Yeni hesap kaydı şu anda kapalı.'],
      [/anonymous sign-ins are disabled/i, 'Misafir girişi şu anda kullanılamıyor.'],
      [/provider .* not enabled|unsupported provider/i, 'Bu giriş yöntemi henüz yapılandırılmamış.'],
      [/email rate limit exceeded/i, 'Çok fazla e-posta isteği gönderildi. Biraz sonra tekrar dene.'],
      [/database error saving new user/i, 'Bu kullanıcı adı kullanılıyor olabilir. Başka bir ad dene.'],
      [/failed to fetch/i, 'Hesap sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.']
    ];
    const translated = known.find(([pattern]) => pattern.test(original))?.[1] || original;
    const error = new Error(translated);
    error.status = status;
    return error;
  }

  async function loadConfig() {
    if (state.config) return state.config;
    const response = await fetch('/api/config', { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.supabaseUrl || !payload.supabasePublishableKey) {
      throw authError('Hesap servisi henüz yapılandırılmamış.', response.status);
    }
    state.config = {
      url: String(payload.supabaseUrl).replace(/\/+$/, ''),
      key: String(payload.supabasePublishableKey)
    };
    return state.config;
  }

  function readStoredSession() {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!stored?.access_token || !stored?.refresh_token) return null;
      return stored;
    } catch {
      return null;
    }
  }

  function persistSession(session) {
    state.session = session;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
    scheduleRefresh();
  }

  function normalizedSession(payload) {
    const expiresIn = Number(payload.expires_in || 3600);
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_type: payload.token_type || 'bearer',
      expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + expiresIn
    };
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    if (!state.session?.expires_at) return;
    const delay = Math.max(5000, state.session.expires_at * 1000 - Date.now() - 60000);
    refreshTimer = setTimeout(() => refresh().catch(() => clearSession()), Math.min(delay, 2147483647));
  }

  async function request(path, options = {}) {
    const config = await loadConfig();
    const headers = {
      apikey: config.key,
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.headers || {})
    };
    if (options.auth) {
      if (!state.session?.access_token) throw authError('Bu işlem için giriş yapmalısın.', 401);
      headers.authorization = `Bearer ${state.session.access_token}`;
    }
    const response = await fetch(`${config.url}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      throw authError(payload?.msg || payload?.message || payload?.error_description || payload?.error || `İstek başarısız (${response.status}).`, response.status);
    }
    return payload;
  }

  async function loadSettings() {
    const payload = await request('/auth/v1/settings');
    state.providers = payload?.external || {};
    state.anonymousEnabled = Boolean(payload?.anonymous_users ?? payload?.external?.anonymous ?? payload?.external?.anonymous_users);
    return payload;
  }

  function oauthPayloadFromUrl() {
    if (!location.hash || location.hash.length < 2) return null;
    const params = new URLSearchParams(location.hash.slice(1));
    const errorMessage = params.get('error_description') || params.get('error');
    if (errorMessage) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      throw authError(errorMessage);
    }
    if (!params.get('access_token') || !params.get('refresh_token')) return null;
    const payload = {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      token_type: params.get('token_type') || 'bearer',
      expires_in: Number(params.get('expires_in') || 3600)
    };
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    return payload;
  }

  async function fetchUser() {
    return request('/auth/v1/user', { auth: true });
  }

  async function fetchProfile(userId = state.user?.id) {
    if (!userId) return null;
    const rows = await request(`/rest/v1/profiles?select=id,username,player_code,avatar_url,level,coins,is_guest,preferred_locale,created_at,updated_at&id=eq.${encodeURIComponent(userId)}&limit=1`, { auth: true });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  function isAnonymousUser() {
    if (state.localGuest) return true;
    if (typeof state.user?.is_anonymous === 'boolean') return state.user.is_anonymous;
    try {
      const payload = JSON.parse(atob(String(state.session?.access_token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof payload?.is_anonymous === 'boolean') return payload.is_anonymous;
    } catch {}
    return Boolean(state.profile?.is_guest);
  }

  function hasLinkedOAuthIdentity() {
    return Array.isArray(state.user?.identities) && state.user.identities.some(identity => ['google', 'facebook', 'apple'].includes(identity?.provider));
  }

  async function promoteProfileIfPermanent(force = false) {
    if (state.localGuest || !state.profile?.is_guest || isAnonymousUser()) return state.profile;
    if (!force && !hasLinkedOAuthIdentity()) return state.profile;
    await request('/rest/v1/rpc/promote_kantin_guest', { method: 'POST', auth: true, body: {} });
    state.profile = await fetchProfile(state.user.id);
    return state.profile;
  }

  async function establishSession(payload) {
    persistSession(normalizedSession(payload));
    state.localGuest = false;
    state.user = payload.user || await fetchUser();
    state.profile = await fetchProfile(state.user.id);
    await promoteProfileIfPermanent();
    state.status = 'authenticated';
    state.error = null;
    emit();
    return snapshot();
  }

  function clearSession(error = null) {
    persistSession(null);
    state.localGuest = false;
    state.user = null;
    state.profile = null;
    state.status = 'anonymous';
    state.error = error;
    emit();
  }

  async function refresh() {
    if (!state.session?.refresh_token) {
      clearSession();
      return snapshot();
    }
    const payload = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: state.session.refresh_token }
    });
    return establishSession(payload);
  }

  async function initialize() {
    try {
      await loadConfig();
      await loadSettings().catch(() => null);
      const callbackSession = oauthPayloadFromUrl();
      if (callbackSession) return establishSession(callbackSession);
      state.session = readStoredSession();
      if (!state.session) {
        const localGuest = readLocalGuest();
        if (localGuest) return signInAsGuest();
        clearSession();
        return snapshot();
      }
      if (state.session.expires_at * 1000 <= Date.now() + 30000) return refresh();
      state.user = await fetchUser();
      state.profile = await fetchProfile(state.user.id);
      await promoteProfileIfPermanent();
      state.status = 'authenticated';
      state.error = null;
      scheduleRefresh();
      emit();
    } catch (error) {
      if (!readStoredSession()) {
        const localGuest = readLocalGuest();
        if (localGuest) return establishLocalGuest(localGuest);
      }
      clearSession(error.message);
    }
    return snapshot();
  }

  function validateUsername(value) {
    const username = String(value || '').trim().replace(/\s+/g, ' ');
    if (username.length < 3 || username.length > 24) throw authError('Kullanıcı adı 3–24 karakter olmalı.');
    if (!/^[\p{L}\p{N}_. -]+$/u.test(username)) throw authError('Kullanıcı adında yalnızca harf, rakam, boşluk, nokta, tire ve alt çizgi kullanabilirsin.');
    return username;
  }

  function validatePassword(value) {
    const password = String(value || '');
    if (password.length < 8) throw authError('Şifre en az 8 karakter olmalı.');
    return password;
  }

  async function usernameAvailable(username) {
    const value = validateUsername(username);
    const result = await request('/rest/v1/rpc/kantin_username_available', {
      method: 'POST',
      body: { p_username: value }
    });
    return result === true;
  }

  async function signUp({ username, email, password }) {
    const cleanUsername = validateUsername(username);
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = validatePassword(password);
    if (!cleanEmail) throw authError('E-posta adresini yazmalısın.');
    if (!await usernameAvailable(cleanUsername)) throw authError('Bu kullanıcı adı kullanılıyor. Başka bir ad dene.');
    const payload = await request('/auth/v1/signup', {
      method: 'POST',
      body: { email: cleanEmail, password: cleanPassword, data: { username: cleanUsername } }
    });
    if (payload?.access_token && payload?.refresh_token) {
      await establishSession(payload);
      return { authenticated: true, needsEmailConfirmation: false };
    }
    return { authenticated: false, needsEmailConfirmation: true, user: payload?.user || null };
  }

  async function signIn({ email, password }) {
    const payload = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: {
        email: String(email || '').trim().toLowerCase(),
        password: String(password || '')
      }
    });
    return establishSession(payload);
  }

  function installationId() {
    let value = localStorage.getItem(INSTALLATION_KEY);
    if (value) return value;
    value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(INSTALLATION_KEY, value);
    return value;
  }

  function guestCode(deviceId) {
    let hash = 2166136261;
    for (const character of deviceId) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `KNT-${String(hash >>> 0).padStart(10, '0').slice(-6)}`;
  }

  function readLocalGuest() {
    try {
      const guest = JSON.parse(localStorage.getItem(LOCAL_GUEST_KEY) || 'null');
      if (!guest?.installationId || guest.installationId !== installationId()) return null;
      return guest;
    } catch {
      return null;
    }
  }

  function writeLocalGuest(guest) {
    localStorage.setItem(LOCAL_GUEST_KEY, JSON.stringify(guest));
    return guest;
  }

  function localGuestRecord() {
    const existing = readLocalGuest();
    if (existing) return existing;
    const deviceId = installationId();
    return writeLocalGuest({
      installationId: deviceId,
      username: `Misafir ${deviceId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`,
      playerCode: guestCode(deviceId),
      preferredLocale: i18n?.locale || 'tr',
      createdAt: new Date().toISOString()
    });
  }

  function establishLocalGuest(record = localGuestRecord()) {
    const guest = writeLocalGuest({
      ...record,
      preferredLocale: i18n?.normalize(record.preferredLocale) || i18n?.locale || 'tr'
    });
    persistSession(null);
    state.localGuest = true;
    state.user = {
      id: `local-guest-${guest.installationId}`,
      email: null,
      is_anonymous: true,
      user_metadata: {
        username: guest.username,
        installation_id: guest.installationId,
        is_guest: true,
        preferred_locale: guest.preferredLocale
      }
    };
    state.profile = {
      id: state.user.id,
      username: guest.username,
      player_code: guest.playerCode,
      avatar_url: null,
      level: 1,
      coins: 2500,
      is_guest: true,
      preferred_locale: guest.preferredLocale,
      created_at: guest.createdAt,
      updated_at: guest.updatedAt || guest.createdAt
    };
    state.status = 'authenticated';
    state.error = null;
    emit();
    return snapshot();
  }

  async function signInAsGuest() {
    if (state.status === 'authenticated') return snapshot();
    const guest = localGuestRecord();
    try {
      const payload = await request('/auth/v1/signup', {
        method: 'POST',
        body: {
          data: {
            username: guest.username,
            installation_id: guest.installationId,
            is_guest: true,
            preferred_locale: guest.preferredLocale
          }
        }
      });
      return await establishSession(payload);
    } catch {
      return establishLocalGuest(guest);
    }
  }

  async function signInWithOAuth(provider) {
    const allowed = ['google', 'facebook', 'apple'];
    if (!allowed.includes(provider)) throw authError('Geçersiz giriş yöntemi.');
    if (!state.providers[provider]) {
      await loadSettings().catch(() => null);
      if (!state.providers[provider]) throw authError('Bu giriş yöntemi henüz yapılandırılmamış.');
    }
    const config = await loadConfig();
    const redirectTo = `${location.origin}${location.pathname}`;
    location.assign(`${config.url}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`);
  }

  async function requestEmailUpgrade(email) {
    if (!state.user || state.localGuest || !state.session?.access_token) throw authError('Hesap sunucusuna bağlanmadan misafir hesabı yükseltilemez.');
    if (!state.profile?.is_guest) throw authError('Bu hesap zaten kalıcı bir hesaba bağlı.');
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw authError('Geçerli bir e-posta adresi yazmalısın.');
    const payload = await request('/auth/v1/user', { method: 'PUT', auth: true, body: { email: cleanEmail } });
    state.user = payload?.user || payload || state.user;
    emit();
    return state.user;
  }

  async function setAccountPassword(password) {
    if (!state.user || state.localGuest || !state.session?.access_token) throw authError('Hesap sunucusuna bağlanmadan parola belirlenemez.');
    if (isAnonymousUser()) throw authError('Önce e-posta adresine gönderilen doğrulama bağlantısını açmalısın.');
    const payload = await request('/auth/v1/user', { method: 'PUT', auth: true, body: { password: validatePassword(password) } });
    state.user = payload?.user || payload || state.user;
    await promoteProfileIfPermanent(true);
    emit();
    return snapshot();
  }

  async function linkIdentity(provider) {
    const allowed = ['google', 'facebook', 'apple'];
    if (!allowed.includes(provider)) throw authError('Geçersiz bağlantı yöntemi.');
    if (!state.user || state.localGuest || !state.session?.access_token) throw authError('Hesap sunucusuna bağlanmadan hesap bağlantısı yapılamaz.');
    if (!state.profile?.is_guest) throw authError('Bu hesap zaten kalıcı bir hesaba bağlı.');
    if (!state.providers[provider]) {
      await loadSettings().catch(() => null);
      if (!state.providers[provider]) throw authError('Bu bağlantı yöntemi henüz yapılandırılmamış.');
    }
    const redirectTo = `${location.origin}${location.pathname}`;
    const payload = await request(`/auth/v1/user/identities/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}&skip_http_redirect=true`, { auth: true });
    if (!payload?.url) throw authError('Bağlantı sayfası açılamadı.');
    location.assign(payload.url);
  }

  async function signOut() {
    try {
      if (state.session?.access_token) await request('/auth/v1/logout', { method: 'POST', auth: true });
    } finally {
      clearSession();
    }
  }

  async function updateProfile(changes) {
    if (!state.user) throw authError('Profilini düzenlemek için giriş yapmalısın.');
    if (changes.username !== undefined && state.profile?.is_guest) {
      throw authError('Misafir hesabında kullanıcı adı değiştirilemez. Önce hesabını bağlamalısın.');
    }
    if (state.localGuest) {
      const guest = localGuestRecord();
      if (changes.preferred_locale !== undefined) {
        const locale = i18n?.normalize(changes.preferred_locale);
        if (!locale) throw authError('Desteklenmeyen dil seçimi.');
        guest.preferredLocale = locale;
      }
      guest.updatedAt = new Date().toISOString();
      writeLocalGuest(guest);
      state.user.user_metadata.username = guest.username;
      state.user.user_metadata.preferred_locale = guest.preferredLocale;
      state.profile = {
        ...state.profile,
        username: guest.username,
        preferred_locale: guest.preferredLocale,
        updated_at: guest.updatedAt
      };
      emit();
      return state.profile;
    }
    const body = {};
    if (changes.username !== undefined) {
      const username = validateUsername(changes.username);
      if (username.toLocaleLowerCase('tr-TR') !== String(state.profile?.username || '').toLocaleLowerCase('tr-TR') && !await usernameAvailable(username)) {
        throw authError('Bu kullanıcı adı kullanılıyor. Başka bir ad dene.');
      }
      body.username = username;
    }
    if (changes.preferred_locale !== undefined) {
      const locale = i18n?.normalize(changes.preferred_locale);
      if (!locale) throw authError('Desteklenmeyen dil seçimi.');
      body.preferred_locale = locale;
    }
    if (!Object.keys(body).length) return state.profile;
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(state.user.id)}&select=id,username,player_code,avatar_url,level,coins,is_guest,preferred_locale,created_at,updated_at`, {
      method: 'PATCH',
      auth: true,
      headers: { prefer: 'return=representation' },
      body
    });
    state.profile = Array.isArray(rows) ? rows[0] || state.profile : state.profile;
    emit();
    return state.profile;
  }

  const api = {
    ready: null,
    get status() { return state.status; },
    get user() { return state.user; },
    get profile() { return state.profile; },
    get providers() { return { ...state.providers }; },
    get isAnonymous() { return isAnonymousUser(); },
    get anonymousEnabled() { return state.anonymousEnabled; },
    get localGuest() { return state.localGuest; },
    getAccessToken() { return state.session?.access_token || null; },
    isAuthenticated() { return state.status === 'authenticated' && Boolean(state.user); },
    addEventListener(...args) { return events.addEventListener(...args); },
    removeEventListener(...args) { return events.removeEventListener(...args); },
    signUp,
    signIn,
    signInAsGuest,
    signInWithOAuth,
    requestEmailUpgrade,
    setAccountPassword,
    linkIdentity,
    signOut,
    updateProfile,
    refreshProfile: async () => {
      if (state.localGuest) return state.profile;
      state.profile = await fetchProfile();
      emit();
      return state.profile;
    }
  };

  window.KANTIN_AUTH = api;
  api.ready = initialize();
})();
