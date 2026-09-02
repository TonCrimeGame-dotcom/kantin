(function (global) {
  'use strict';

  const SESSION_STORAGE_KEY = 'kantin:match-session:v2';

  class MatchClient extends EventTarget {
    constructor() {
      super();
      this.socket = null;
      this.playerId = null;
      this.profile = null;
      this.stats = {};
      this.match = null;
      this.gameState = null;
      this.messages = { lobby: [], match: [] };
      this.connecting = null;
      this.username = 'Oyuncu';
      this.retry = null;
      this.matchSessionToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || null;
      this.pollTimer = null;
      this.pollBusy = false;
      this.polling = false;
      this.queued = false;
      this.lastQueueKey = '';
      this.lastStateKey = '';
      this.finishedMatchId = null;
      this.socialPlayerId = null;
    }

    emit(type, payload = {}) {
      this.dispatchEvent(new CustomEvent(type, { detail: payload }));
    }

    emitError(error) {
      const messages = {
        match_service_not_configured: 'Eşleşme servisi henüz yapılandırılmamış.',
        match_storage_failed: 'Eşleşme veritabanına ulaşılamadı.',
        invalid_match_session: 'Eşleşme oturumu geçersiz. Lütfen yeniden dene.',
        expired_match_session: 'Eşleşme oturumunun süresi doldu. Lütfen yeniden dene.',
        game_action_rejected: 'Bu hamle oyun kurallarına uygun değil.',
        matchmaking_blocked: 'Hesabınız geçici olarak çevrimiçi eşleşmelere kapatılmış.'
      };
      const code = error?.code || error?.error || 'match_error';
      const message = error?.details || messages[code] || error?.message || 'Eşleşme işlemi tamamlanamadı.';
      this.emit('error', { message, code });
    }

    async request(body) {
      const auth = global.KANTIN_AUTH;
      const headers = { accept: 'application/json', 'content-type': 'application/json' };
      const accessToken = auth?.getAccessToken?.();
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;
      else if (this.matchSessionToken) headers['x-kantin-match-session'] = this.matchSessionToken;
      const response = await fetch('/api/match', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || payload.error || `Eşleşme isteği başarısız (${response.status}).`);
        error.code = payload.error;
        error.details = payload.message;
        error.status = response.status;
        throw error;
      }
      return payload;
    }

    connect(username = 'Oyuncu') {
      this.username = username;
      if (this.playerId) return Promise.resolve(this.profile);
      if (this.connecting) return this.connecting;
      this.connecting = (async () => {
        const auth = global.KANTIN_AUTH;
        await auth?.ready;
        const installationId = auth?.user?.user_metadata?.installation_id || auth?.user?.user_metadata?.installationId || null;
        const payload = await this.request({ action: 'session', username: this.username, installationId });
        const identity = payload.identity;
        this.playerId = identity.id;
        this.matchSessionToken = identity.authToken || null;
        if (this.matchSessionToken) sessionStorage.setItem(SESSION_STORAGE_KEY, this.matchSessionToken);
        else sessionStorage.removeItem(SESSION_STORAGE_KEY);
        this.profile = { ...identity, ...(identity.profile || {}) };
        this.stats = identity.stats || {};
        this.emit('identity', this.profile);
        this.connectSocial();
        return this.profile;
      })().finally(() => { this.connecting = null; });
      return this.connecting;
    }

    connectSocial() {
      if (typeof WebSocket !== 'function' || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = this.socket = new WebSocket(`${protocol}://${location.host}/api/ws`);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'hello', payload: { username: this.username, token: localStorage.getItem('kantinAuthToken') } }));
      });
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        let payload = message.payload || {};
        if (message.type === 'identity') {
          this.socialPlayerId = payload.id;
          if (payload.authToken) localStorage.setItem('kantinAuthToken', payload.authToken);
          this.profile = { ...this.profile, friends: payload.friends || [], incoming: payload.incoming || [], outgoing: payload.outgoing || [] };
          this.emit('friends:state', this.profile);
          return;
        }
        if (message.type === 'friends:state') this.profile = { ...this.profile, ...payload };
        if (message.type === 'lobby:stats') this.stats = payload;
        if (message.type === 'chat:history') this.messages[payload.room] = payload.messages;
        if (message.type === 'chat:message') {
          if (payload.userId === this.socialPlayerId) payload = { ...payload, userId: this.playerId };
          this.messages[payload.room] ||= [];
          this.messages[payload.room].push(payload);
          if (this.messages[payload.room].length > 50) this.messages[payload.room].shift();
        }
        if (!['match:found', 'match:resumed', 'queue:update', 'game:state', 'game:finished', 'game:ack', 'game:kicked'].includes(message.type)) this.emit(message.type, payload);
      });
      socket.addEventListener('close', () => {
        this.socket = null;
        clearTimeout(this.retry);
        if (this.playerId) this.retry = setTimeout(() => this.connectSocial(), 2500);
      });
    }

    consume(payload, options = {}) {
      if (payload.queue) {
        this.queued = true;
        const queueKey = JSON.stringify(payload.queue);
        if (queueKey !== this.lastQueueKey) {
          this.lastQueueKey = queueKey;
          this.emit('queue:update', payload.queue);
        }
      }
      if (payload.match && payload.gameState) {
        const previousMatchId = this.match?.matchId;
        this.queued = false;
        this.match = payload.match;
        this.gameState = payload.gameState;
        if (previousMatchId !== payload.match.matchId) this.emit(options.resumed ? 'match:resumed' : 'match:found', payload.match);
        const stateKey = `${payload.gameState.matchId}:${payload.gameState.turnId}:${payload.gameState.status}`;
        if (stateKey !== this.lastStateKey || options.forceState) {
          this.lastStateKey = stateKey;
          this.emit('game:state', payload.gameState);
        }
        if (payload.result && this.finishedMatchId !== payload.match.matchId) {
          this.finishedMatchId = payload.match.matchId;
          this.emit('game:finished', { matchId: payload.match.matchId, result: payload.result });
        }
      }
      if (payload.ack) this.emit('game:ack', payload.ack);
      if (payload.rejected) this.emit('error', { message: payload.rejected.message, code: 'game_action_rejected' });
      if (payload.conflict) this.emit('error', { message: 'Oyun durumu yenilendi; hamleni tekrar kontrol et.', code: 'state_conflict' });
      return payload;
    }

    schedulePoll(delay = 850) {
      clearTimeout(this.pollTimer);
      if (!this.polling) return;
      this.pollTimer = setTimeout(() => this.poll(), delay);
    }

    async poll() {
      if (!this.polling || this.pollBusy) return this.schedulePoll();
      this.pollBusy = true;
      try {
        const payload = await this.request({ action: 'status' });
        this.consume(payload, { resumed: Boolean(this.match) });
      } catch (error) {
        this.emitError(error);
      } finally {
        this.pollBusy = false;
        this.schedulePoll();
      }
    }

    join(mode, options = {}) {
      this.polling = true;
      this.lastQueueKey = '';
      this.request({ action: 'join', mode, wordLocale: mode === 'sozcukDuel' ? options.wordLocale : undefined })
        .then(payload => this.consume(payload))
        .catch(error => { this.polling = false; this.emitError(error); });
      this.schedulePoll(1000);
    }

    leave() {
      const wasSearching = this.queued || this.polling;
      clearTimeout(this.pollTimer);
      this.polling = false;
      if (!wasSearching) return;
      this.request({ action: 'cancel' })
        .then(() => {
          this.queued = false;
          this.lastQueueKey = '';
        })
        .catch(error => this.emitError(error));
    }

    act(action, payload = {}) {
      if (!this.match || !this.gameState) {
        this.emitError(new Error('Oyun durumu henüz hazır değil.'));
        return;
      }
      this.request({
        action: 'gameAction',
        matchId: this.match.matchId,
        turnId: this.gameState.turnId,
        actionId: crypto.randomUUID(),
        gameAction: action,
        payload
      }).then(result => this.consume(result, { forceState: true })).catch(error => this.emitError(error));
    }

    sync() {
      if (!this.playerId) return;
      this.polling = true;
      this.request({ action: 'sync' })
        .then(payload => this.consume(payload, { resumed: true, forceState: true }))
        .catch(error => this.emitError(error));
      this.schedulePoll();
    }

    send(type, payload = {}) {
      if (this.socket?.readyState !== WebSocket.OPEN) {
        this.emit('error', { message: 'Sosyal bağlantı hazırlanıyor. Birkaç saniye sonra tekrar dene.', code: 'social_connecting' });
        return false;
      }
      this.socket.send(JSON.stringify({ type, payload }));
      return true;
    }

    getProfile(userId) {
      if (userId === this.playerId || userId === 'self') this.emit('profile:data', this.profile || {});
      else this.send('profile:get', { userId });
    }
    addFriend(userId) { this.send('friend:add', { userId }); }
    acceptFriend(userId) { this.send('friend:accept', { userId }); }
    removeFriend(userId) { this.send('friend:remove', { userId }); }
    sendChat(text, room = 'lobby') { this.send('chat:send', { text, room }); }
  }

  global.KANTIN_MATCH = new MatchClient();
})(window);
