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
      this.useWebSocketMatch = false;
      this.tournaments = [];
      this.missions = [];
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
        let payload;
        try { payload = await this.request({ action: 'session', username: this.username, installationId }); }
        catch (error) {
          if (!['localhost','127.0.0.1'].includes(location.hostname)) throw error;
          this.useWebSocketMatch = true;
          this.connectSocial();
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Yerel eşleşme sunucusuna bağlanılamadı.')), 5000);
            this.addEventListener('socket:identity', event => { clearTimeout(timer); resolve(event.detail); }, { once: true });
          });
        }
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
        socket.send(JSON.stringify({ type: 'hello', payload: { username: this.username, token: localStorage.getItem('kantinAuthToken'), avatarUrl: localStorage.getItem('kantin:profile-avatar:v1') } }));
      });
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        let payload = message.payload || {};
        if (message.type === 'identity') {
          this.socialPlayerId = payload.id;
          if (payload.authToken) localStorage.setItem('kantinAuthToken', payload.authToken);
          this.profile = { ...this.profile, friends: payload.friends || [], incoming: payload.incoming || [], outgoing: payload.outgoing || [] };
          if (this.useWebSocketMatch) { this.playerId = payload.id; this.profile = { ...this.profile, ...payload }; this.emit('identity', this.profile); }
          this.emit('friends:state', this.profile);
          this.emit('socket:identity', this.profile);
          return;
        }
        if (this.useWebSocketMatch && message.type === 'queue:update') { this.queued = true; this.emit('queue:update', payload); return; }
        if (this.useWebSocketMatch && (message.type === 'match:found' || message.type === 'match:resumed')) { this.queued = false; this.match = payload; this.emit(message.type, payload); return; }
        if (this.useWebSocketMatch && message.type === 'game:state') { this.gameState = payload; this.emit('game:state', payload); return; }
        if (this.useWebSocketMatch && message.type === 'game:finished') {
          if (payload.coin) { this.profile = { ...this.profile, coins: payload.coin.balance }; this.emit('coins:updated', { ...payload.coin, matchId: payload.matchId }); }
          this.emit('game:finished', payload); return;
        }
        if (this.useWebSocketMatch && (message.type === 'game:ack' || message.type === 'game:kicked')) { this.emit(message.type, payload); return; }
        if (message.type === 'friends:state') this.profile = { ...this.profile, ...payload };
        if (message.type === 'profile:updated') {
          if (payload.id === this.playerId || payload.id === this.socialPlayerId) this.profile = { ...this.profile, avatarUrl: payload.avatarUrl };
          const player = this.match?.players?.find(item => item.id === payload.id);
          if (player) player.avatarUrl = payload.avatarUrl;
        }
        if (message.type === 'coins:updated') this.profile = { ...this.profile, coins: payload.balance };
        if (message.type === 'tournament:list') this.tournaments = payload.tournaments || [];
        if (message.type === 'tournament:update') {
          const index = this.tournaments.findIndex(item => item.id === payload.id);
          if (index >= 0) this.tournaments.splice(index, 1, payload); else this.tournaments.unshift(payload);
        }
        if (message.type === 'mission:list' || message.type === 'mission:update') this.missions = payload.missions || [];
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
      if (this.useWebSocketMatch) { this.queued = true; this.send('queue:join', { mode, wordLocale: mode === 'sozcukDuel' ? options.wordLocale : undefined, stake: Number(options.stake) || 0 }); return; }
      this.polling = true;
      this.lastQueueKey = '';
      this.request({ action: 'join', mode, wordLocale: mode === 'sozcukDuel' ? options.wordLocale : undefined, stake: Number(options.stake) || 0 })
        .then(payload => this.consume(payload))
        .catch(error => { this.polling = false; this.emitError(error); });
      this.schedulePoll(1000);
    }

    leave() {
      if (this.useWebSocketMatch) {
        if (this.match) this.send('game:leave', { matchId: this.match.matchId });
        else if (this.queued) this.send('queue:leave');
        this.queued = false;
        this.match = null;
        this.gameState = null;
        return;
      }
      const wasMatched = Boolean(this.match);
      const wasSearching = this.queued || this.polling || wasMatched;
      clearTimeout(this.pollTimer);
      this.polling = false;
      if (!wasSearching) return;
      this.request({ action: wasMatched ? 'leave' : 'cancel' })
        .then(() => {
          this.queued = false;
          this.match = null;
          this.gameState = null;
          this.lastQueueKey = '';
        })
        .catch(error => this.emitError(error));
    }

    act(action, payload = {}) {
      if (!this.match || !this.gameState) {
        this.emitError(new Error('Oyun durumu henüz hazır değil.'));
        return;
      }
      const request = {
        action: 'gameAction',
        matchId: this.match.matchId,
        turnId: this.gameState.turnId,
        actionId: crypto.randomUUID(),
        gameAction: action,
        payload
      };
      if (this.useWebSocketMatch) { this.send('game:action', { matchId: request.matchId, turnId: request.turnId, actionId: request.actionId, action, payload }); return; }
      this.request(request).then(result => this.consume(result, { forceState: true })).catch(error => this.emitError(error));
    }

    sync() {
      if (!this.playerId) return;
      if (this.useWebSocketMatch) { this.send('game:sync'); return; }
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
      if (userId === this.playerId || userId === 'self') { this.emit('profile:data', this.profile || {}); return; }
      this.request({ action: 'profile', userId })
        .then(payload => this.emit('profile:data', payload.profile || {}))
        .catch(() => this.send('profile:get', { userId }));
    }
    async friendRequest(action, userId = null) {
      const auth = global.KANTIN_AUTH, headers = { accept: 'application/json', 'content-type': 'application/json' }, accessToken = auth?.getAccessToken?.();
      if (accessToken) headers.authorization = `Bearer ${accessToken}`; else if (this.matchSessionToken) headers['x-kantin-match-session'] = this.matchSessionToken;
      const response = await fetch('/api/friends', { method: 'POST', headers, body: JSON.stringify({ action, userId }), signal: AbortSignal.timeout(12000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) { const error = new Error(payload.message || payload.error || 'Arkadaşlık işlemi tamamlanamadı.'); error.code = payload.error; throw error; }
      this.profile = { ...this.profile, friends: payload.friends || [], incoming: payload.incoming || [], outgoing: payload.outgoing || [] }; this.emit('friends:state', this.profile); if (action === 'request' || action === 'accept') this.loadMissions(); return payload;
    }
    loadFriends() { if (this.useWebSocketMatch) return; return this.friendRequest('list').catch(error => this.emitError(error)); }
    addFriend(userId) { if (this.useWebSocketMatch) return this.send('friend:add', { userId }); return this.friendRequest('request', userId).catch(error => this.emitError(error)); }
    acceptFriend(userId) { if (this.useWebSocketMatch) return this.send('friend:accept', { userId }); return this.friendRequest('accept', userId).then(result => { this.loadMissions(); return result; }).catch(error => this.emitError(error)); }
    removeFriend(userId) { if (this.useWebSocketMatch) return this.send('friend:remove', { userId }); return this.friendRequest('remove', userId).catch(error => this.emitError(error)); }
    sendChat(text, room = 'lobby') { this.send('chat:send', { text, room }); }
    sendGift(giftId, targetId) { return this.send('gift:send', { giftId, targetId }); }
    async tournamentRequest(action, tournamentId = null) {
      const auth = global.KANTIN_AUTH, headers = { accept: 'application/json', 'content-type': 'application/json' }, accessToken = auth?.getAccessToken?.();
      if (accessToken) headers.authorization = `Bearer ${accessToken}`; else if (this.matchSessionToken) headers['x-kantin-match-session'] = this.matchSessionToken;
      const response = await fetch('/api/tournament', { method: 'POST', headers, body: JSON.stringify({ action, tournamentId }), signal: AbortSignal.timeout(12000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) { const error = new Error(payload.message || payload.error || 'Turnuva işlemi tamamlanamadı.'); error.code = payload.error; throw error; }
      this.tournaments = payload.tournaments || this.tournaments; this.emit('tournament:list', { tournaments: this.tournaments }); return payload;
    }
    loadTournaments() { if (this.useWebSocketMatch) return this.send('tournament:list'); return this.tournamentRequest('list').catch(error => this.emitError(error)); }
    joinTournament(tournamentId) { if (this.useWebSocketMatch) return this.send('tournament:join', { tournamentId }); return this.tournamentRequest('join', tournamentId).catch(error => this.emitError(error)); }
    leaveTournament(tournamentId) { if (this.useWebSocketMatch) return this.send('tournament:leave', { tournamentId }); return this.tournamentRequest('leave', tournamentId).catch(error => this.emitError(error)); }
    async missionRequest(action, missionId = null) {
      const auth = global.KANTIN_AUTH, headers = { accept: 'application/json', 'content-type': 'application/json' }, accessToken = auth?.getAccessToken?.();
      if (accessToken) headers.authorization = `Bearer ${accessToken}`; else if (this.matchSessionToken) headers['x-kantin-match-session'] = this.matchSessionToken;
      const response = await fetch('/api/missions', { method: 'POST', headers, body: JSON.stringify({ action, missionId }), signal: AbortSignal.timeout(12000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) { const error = new Error(payload.message || payload.error || 'Görev işlemi tamamlanamadı.'); error.code = payload.error; throw error; }
      this.missions = payload.missions || this.missions; this.emit('mission:list', { missions: this.missions }); if (payload.claim) { if (Number.isSafeInteger(Number(payload.claim.balance))) { this.profile = { ...this.profile, coins: Number(payload.claim.balance) }; this.emit('coins:updated', { balance: Number(payload.claim.balance), delta: Number(payload.claim.reward)||0, type: 'mission_reward' }); } global.KANTIN_ECONOMY?.refresh?.(); this.emit('mission:claimed', payload.claim); } return payload;
    }
    loadMissions() { if (this.useWebSocketMatch) return this.send('mission:list'); return this.missionRequest('list').catch(error => this.emitError(error)); }
    claimMission(missionId) { if (this.useWebSocketMatch) return this.send('mission:claim', { missionId }); return this.missionRequest('claim', missionId).catch(error => this.emitError(error)); }
    setAvatar(avatarUrl) {
      if (this.profile) this.profile.avatarUrl = avatarUrl;
      const player = this.match?.players?.find(item => item.id === this.playerId);
      if (player) player.avatarUrl = avatarUrl;
      if (this.socket?.readyState !== WebSocket.OPEN) return false;
      this.socket.send(JSON.stringify({ type: 'profile:avatar', payload: { avatarUrl } }));
      return true;
    }
  }

  global.KANTIN_MATCH = new MatchClient();
})(window);
