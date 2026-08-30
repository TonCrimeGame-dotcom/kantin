/**
 * pisti.js
 * KANTİN - Pişti oyun motoru
 *
 * Desteklenen modlar:
 *   1) Tekli: 2 oyuncu (1v1)
 *   2) Eşli: 4 oyuncu (2v2)
 *
 * Temel kurallar:
 * - 52 kartlık standart deste, jokersiz.
 * - Her oyuncuya 4 kart dağıtılır.
 * - Ortaya başlangıçta 4 kart konur; yalnız en üstteki kart açık kabul edilir.
 * - Oyuncular sırayla bir kart atar.
 * - Atılan kart yerdeki en üst kartla aynı değerdeyse yerdeki tüm kartları alır.
 * - Vale (J) yerdeki kartların tamamını alır.
 * - Yerde yalnız 1 kart varken aynı değerde kartla almak "pişti"dir.
 * - Vale ile tek kartlık yığını alma davranışı `jackPisti` ayarıyla kontrol edilir.
 * - Eller bitince destede kart varsa tekrar 4'er kart dağıtılır.
 * - Deste tamamen bittiğinde yerde kalan kartları son kart alan oyuncu/takım alır.
 *
 * Varsayılan puanlama:
 * - Her As: 1 puan
 * - Her Vale: 1 puan
 * - Sinek 2: 2 puan
 * - Karo 10: 3 puan
 * - Her pişti: 10 puan
 * - Vale ile pişti (açıksa): 20 puan
 * - En çok kart: 3 puan
 *
 * Online kullanım:
 * - Deste karıştırma ve dağıtım SUNUCUDA yapılmalıdır.
 * - Client'a yalnızca kendi eli gönderilmelidir.
 * - Aşağıdaki motor authoritative server mantığına uygundur.
 */

(function (global) {
  'use strict';

  const MODE_SOLO = 'solo';      // 2 oyuncu
  const MODE_TEAM = 'team';      // 4 oyuncu / 2v2

  const TEAM_A = 'teamA';
  const TEAM_B = 'teamB';

  const SUITS = Object.freeze(['clubs', 'diamonds', 'hearts', 'spades']);
  const RANKS = Object.freeze([
    'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'
  ]);

  const DEFAULT_RULES = Object.freeze({
    pistiPoints: 10,
    jackPistiPoints: 20,
    acePoints: 1,
    jackPoints: 1,
    clubsTwoPoints: 2,
    diamondsTenPoints: 3,
    mostCardsPoints: 3,

    // true -> yerde tek kart varken Vale atıp almak "vale piştisi" sayılır.
    jackPisti: true,

    // true -> Vale, Vale'nin üstüne atılıp tek kart alınırsa da pişti kabul edilir.
    jackOnJackPisti: true,

    // Masada tek kart varken kapalı kartla pişti iddiasına izin verir.
    bluffEnabled: true,
    bluffBelievedPoints: 10,
    bluffProvedPoints: 20,
    bluffCaughtPoints: 10,
    jackBluffMultiplier: 1,

    // Başlangıçta ortaya 4 kart konur.
    initialTableCards: 4,

    // Her dağıtımda oyuncu başına kart.
    cardsPerDeal: 4
  });

  const clone = (obj) =>
    typeof structuredClone === 'function'
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));

  function assertMode(mode) {
    if (mode !== MODE_SOLO && mode !== MODE_TEAM) {
      throw new Error(`Geçersiz Pişti modu: ${mode}`);
    }
  }

  function cardId(rank, suit) {
    return `${rank}_${suit}`;
  }

  function createDeck() {
    const deck = [];

    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: cardId(rank, suit),
          rank,
          suit
        });
      }
    }

    return deck;
  }

  function secureRandomInt(max) {
    if (max <= 0) return 0;

    if (global.crypto?.getRandomValues) {
      const maxUint = 0xFFFFFFFF;
      const limit = maxUint - (maxUint % max);
      const buf = new Uint32Array(1);

      do {
        global.crypto.getRandomValues(buf);
      } while (buf[0] >= limit);

      return buf[0] % max;
    }

    return Math.floor(Math.random() * max);
  }

  function shuffle(deck) {
    const arr = [...deck];

    for (let i = arr.length - 1; i > 0; i--) {
      const j = secureRandomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
  }

  function normalizePlayers(mode, players) {
    assertMode(mode);

    const expected = mode === MODE_SOLO ? 2 : 4;

    if (!Array.isArray(players) || players.length !== expected) {
      throw new Error(
        `${mode === MODE_SOLO ? 'Tekli' : 'Eşli'} mod tam olarak ${expected} oyuncu ister.`
      );
    }

    const ids = new Set();

    const normalized = players.map((p, index) => {
      if (!p?.id) {
        throw new Error('Her oyuncunun id alanı olmalı.');
      }

      const id = String(p.id);

      if (ids.has(id)) {
        throw new Error(`Tekrarlanan oyuncu id: ${id}`);
      }

      ids.add(id);

      let team = null;

      if (mode === MODE_TEAM) {
        // Varsayılan oturma düzeni:
        // 0=A1, 1=B1, 2=A2, 3=B2
        // Böylece eşler karşılıklı değil, dönüşümlü sırada oynar.
        team = p.team || (index % 2 === 0 ? TEAM_A : TEAM_B);

        if (team !== TEAM_A && team !== TEAM_B) {
          throw new Error(`Geçersiz takım: ${team}`);
        }
      }

      return {
        id,
        username: p.username || id,
        avatar: p.avatar || null,
        level: Number.isFinite(p.level) ? p.level : 1,
        team,
        seat: index,
        connected: p.connected !== false
      };
    });

    if (mode === MODE_TEAM) {
      const a = normalized.filter(p => p.team === TEAM_A).length;
      const b = normalized.filter(p => p.team === TEAM_B).length;

      if (a !== 2 || b !== 2) {
        throw new Error('Eşli modda her takımda tam olarak 2 oyuncu olmalı.');
      }

      // Pişti'de sıra düzeni A-B-A-B olmalı.
      for (let i = 0; i < normalized.length; i++) {
        const current = normalized[i];
        const next = normalized[(i + 1) % normalized.length];

        if (current.team === next.team) {
          throw new Error(
            'Eşli mod oturma sırası A-B-A-B olmalı; eşler arka arkaya oynayamaz.'
          );
        }
      }
    }

    return normalized;
  }

  class PistiGame {
    constructor(options = {}) {
      this.listeners = new Map();

      this.mode = options.mode || MODE_SOLO;
      assertMode(this.mode);

      this.rules = {
        ...DEFAULT_RULES,
        ...(options.rules || {})
      };

      const defaultPlayers =
        this.mode === MODE_SOLO
          ? [
              { id: 'P1', username: 'Oyuncu 1' },
              { id: 'P2', username: 'Oyuncu 2' }
            ]
          : [
              { id: 'A1', username: 'Oyuncu A1', team: TEAM_A },
              { id: 'B1', username: 'Oyuncu B1', team: TEAM_B },
              { id: 'A2', username: 'Oyuncu A2', team: TEAM_A },
              { id: 'B2', username: 'Oyuncu B2', team: TEAM_B }
            ];

      this.players = normalizePlayers(
        this.mode,
        options.players || defaultPlayers
      );

      this.startingPlayerIndex =
        Number.isInteger(options.startingPlayerIndex)
          ? ((options.startingPlayerIndex % this.players.length) + this.players.length) %
            this.players.length
          : 0;

      this.reset();
    }

    on(eventName, handler) {
      if (!this.listeners.has(eventName)) {
        this.listeners.set(eventName, new Set());
      }

      this.listeners.get(eventName).add(handler);

      return () => {
        this.listeners.get(eventName)?.delete(handler);
      };
    }

    emit(eventName, payload) {
      for (const handler of this.listeners.get(eventName) || []) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[PISTI:${eventName}] listener hatası`, err);
        }
      }
    }

    reset() {
      this.state = {
        version: 1,
        mode: this.mode,
        status: 'playing', // playing | finished

        deck: [],
        hands: {},
        table: [],

        currentPlayerIndex: this.startingPlayerIndex,
        dealNumber: 0,
        moveNumber: 0,

        lastCollectorId: null,

        captures: {},
        pistis: {},
        bluffBonus: {},
        pendingBluff: null,
        playedCards: [],
        initialHiddenCardIds: [],

        score: null,
        winner: null,
        winners: []
      };

      for (const p of this.players) {
        this.state.hands[p.id] = [];
        this.state.captures[p.id] = [];
        this.state.pistis[p.id] = [];
        this.state.bluffBonus[p.id] = 0;
      }

      this.startNewDeck();

      this.emit('reset', this.getPublicState());
      return this.getPublicState();
    }

    /**
     * Authoritative server için:
     * Hazır karıştırılmış 52 kartlık deste yüklenebilir.
     */
    startNewDeck(preShuffledDeck = null) {
      const source = preShuffledDeck
        ? clone(preShuffledDeck)
        : shuffle(createDeck());

      this.validateDeck(source);

      this.state.deck = source;
      this.state.table = [];
      this.state.playedCards = [];
      this.state.initialHiddenCardIds = [];
      this.state.lastCollectorId = null;
      this.state.dealNumber = 0;
      this.state.moveNumber = 0;
      this.state.status = 'playing';
      this.state.score = null;
      this.state.winner = null;
      this.state.winners = [];
      this.state.pendingBluff = null;

      for (const p of this.players) {
        this.state.hands[p.id] = [];
        this.state.captures[p.id] = [];
        this.state.pistis[p.id] = [];
        this.state.bluffBonus[p.id] = 0;
      }

      this.dealInitialTable();
      this.dealHands();

      this.emit('gameStart', this.getPublicState());
    }

    validateDeck(deck) {
      if (!Array.isArray(deck) || deck.length !== 52) {
        throw new Error('Pişti destesi 52 kart olmalı.');
      }

      const ids = new Set();

      for (const card of deck) {
        if (!card || !RANKS.includes(card.rank) || !SUITS.includes(card.suit)) {
          throw new Error('Destede geçersiz kart var.');
        }

        if (ids.has(card.id)) {
          throw new Error(`Destede tekrarlanan kart var: ${card.id}`);
        }

        ids.add(card.id);
      }
    }

    dealInitialTable() {
      const count = this.rules.initialTableCards;

      if (this.state.deck.length < count) {
        throw new Error('Başlangıç masa kartları için destede yeterli kart yok.');
      }

      // İlk 3 kart kapalı, son kart açık mantığını UI yönetebilir.
      // Motor, masa yığınını tam olarak saklar.
      for (let i = 0; i < count; i++) {
        this.state.table.push(this.state.deck.pop());
      }
      this.state.initialHiddenCardIds = this.state.table
        .slice(0, Math.max(0, count - 1))
        .map(card => card.id);

      this.emit('initialTable', {
        tableCount: this.state.table.length,
        topCard: clone(this.getTopTableCard())
      });
    }

    dealHands() {
      if (this.state.status !== 'playing') return;

      const handSize = this.rules.cardsPerDeal;
      const playerCount = this.players.length;
      const needed = handSize * playerCount;

      if (this.state.deck.length === 0) {
        return;
      }

      if (this.state.deck.length < needed) {
        // 52 kart yapısı nedeniyle normal akışta bu durum oluşmamalı.
        throw new Error(
          `Dağıtım için yeterli kart yok. Gerekli: ${needed}, kalan: ${this.state.deck.length}`
        );
      }

      this.state.dealNumber += 1;

      // Gerçek kart dağıtımı gibi tur tur birer kart.
      for (let round = 0; round < handSize; round++) {
        for (const player of this.players) {
          this.state.hands[player.id].push(this.state.deck.pop());
        }
      }

      this.emit('deal', {
        dealNumber: this.state.dealNumber,
        deckRemaining: this.state.deck.length,
        handCounts: this.getHandCounts()
      });
    }

    getCurrentPlayer() {
      return clone(this.players[this.state.currentPlayerIndex]);
    }

    getPlayer(playerId) {
      const p = this.players.find(x => x.id === playerId);

      if (!p) {
        throw new Error(`Oyuncu bulunamadı: ${playerId}`);
      }

      return p;
    }

    getTopTableCard() {
      if (this.state.table.length === 0) return null;
      return this.state.table[this.state.table.length - 1];
    }

    getHand(playerId) {
      this.getPlayer(playerId);
      return clone(this.state.hands[playerId]);
    }

    getHandCounts() {
      const out = {};

      for (const p of this.players) {
        out[p.id] = this.state.hands[p.id].length;
      }

      return out;
    }

    canPlay(playerId, cardIdValue) {
      if (this.state.status !== 'playing') return false;
      if (this.state.pendingBluff) return false;

      const current = this.players[this.state.currentPlayerIndex];
      if (current.id !== playerId) return false;

      return this.state.hands[playerId].some(c => c.id === cardIdValue);
    }

    /**
     * Ana oyun hamlesi.
     */
    playCard(playerId, cardIdValue) {
      if (this.state.pendingBluff) {
        throw new Error('Önce blöf kararı verilmelidir.');
      }
      if (this.state.status !== 'playing') {
        throw new Error('Oyun bitmiş.');
      }

      const player = this.getPlayer(playerId);
      const current = this.players[this.state.currentPlayerIndex];

      if (current.id !== playerId) {
        throw new Error(`Sıra ${current.username} oyuncusunda.`);
      }

      const hand = this.state.hands[playerId];
      const index = hand.findIndex(c => c.id === cardIdValue);

      if (index === -1) {
        throw new Error('Bu kart oyuncunun elinde yok.');
      }

      const card = hand.splice(index, 1)[0];

      const tableBefore = clone(this.state.table);
      const topBefore = this.getTopTableCard();
      const tableCountBefore = this.state.table.length;

      this.state.table.push(card);
      this.state.playedCards.push({
        playerId,
        card: clone(card),
        moveNumber: this.state.moveNumber + 1
      });

      let captured = false;
      let pisti = false;
      let pistiType = null;
      let capturedCards = [];

      if (tableCountBefore > 0) {
        const sameRank = topBefore.rank === card.rank;
        const isJack = card.rank === 'J';

        if (sameRank || isJack) {
          captured = true;

          // Pişti: yerde kart atılmadan önce yalnız bir kart vardı.
          if (tableCountBefore === 1) {
            if (isJack) {
              const jackAllowed =
                this.rules.jackPisti &&
                topBefore.rank === 'J' &&
                this.rules.jackOnJackPisti;

              if (jackAllowed) {
                pisti = true;
                pistiType = 'jack';
              }
            } else if (sameRank) {
              pisti = true;
              pistiType = 'normal';
            }
          }

          capturedCards = this.state.table.splice(
            0,
            this.state.table.length
          );

          this.state.captures[playerId].push(...capturedCards);
          this.state.lastCollectorId = playerId;

          if (pisti) {
            this.state.pistis[playerId].push({
              type: pistiType,
              card: clone(card),
              matchedCard: clone(topBefore),
              moveNumber: this.state.moveNumber + 1
            });
          }
        }
      }

      this.state.moveNumber += 1;

      const event = {
        playerId,
        player: clone(player),
        card: clone(card),

        tableBefore,
        topBefore: clone(topBefore),

        captured,
        capturedCards: clone(capturedCards),

        pisti,
        pistiType,

        moveNumber: this.state.moveNumber
      };

      this.emit('cardPlayed', event);

      if (captured) {
        this.emit('capture', event);
      }

      if (pisti) {
        this.emit('pisti', event);
      }

      this.advanceTurn();
      this.handleEndOfHandCycle();

      return event;
    }

    canDeclareBluff(playerId, cardIdValue) {
      if (!this.rules.bluffEnabled || this.state.status !== 'playing') return false;
      if (this.state.pendingBluff || this.state.table.length !== 1) return false;
      const current = this.players[this.state.currentPlayerIndex];
      if (current.id !== playerId) return false;
      if (!this.state.hands[playerId].some(c => c.id === cardIdValue)) return false;
      const previous = this.state.playedCards[this.state.playedCards.length - 1];
      return Boolean(previous && previous.playerId !== playerId);
    }

    declareBluff(playerId, cardIdValue) {
      if (!this.canDeclareBluff(playerId, cardIdValue)) {
        throw new Error('Blöf yalnız masada tek kart varken yapılabilir.');
      }

      const hand = this.state.hands[playerId];
      const index = hand.findIndex(c => c.id === cardIdValue);
      const card = hand.splice(index, 1)[0];
      const baseCard = clone(this.state.table[0]);
      const previous = this.state.playedCards[this.state.playedCards.length - 1];

      this.state.table.push(card);
      this.state.moveNumber += 1;
      this.state.playedCards.push({
        playerId,
        card: clone(card),
        faceDown: true,
        moveNumber: this.state.moveNumber
      });
      this.state.pendingBluff = {
        claimantId: playerId,
        responderId: previous.playerId,
        card: clone(card),
        baseCard,
        moveNumber: this.state.moveNumber
      };

      const event = {
        claimantId: playerId,
        responderId: previous.playerId,
        baseCard: clone(baseCard),
        moveNumber: this.state.moveNumber
      };
      this.emit('bluffDeclared', event);
      this.emit('state', this.getPublicState());
      return event;
    }

    resolveBluff(responderId, believe) {
      const pending = this.state.pendingBluff;
      if (!pending) throw new Error('Karar bekleyen bir blöf yok.');
      if (pending.responderId !== responderId) {
        throw new Error('Bu blöfe yalnız önceki kartı atan oyuncu cevap verebilir.');
      }

      const matched = pending.card.rank === pending.baseCard.rank;
      let winnerId = null;
      let awardedPoints = 0;
      let captured = false;

      if (believe || matched) {
        winnerId = pending.claimantId;
        captured = true;
        awardedPoints = believe
          ? this.rules.bluffBelievedPoints
          : this.rules.bluffProvedPoints;
        const cards = this.state.table.splice(0, this.state.table.length);
        this.state.captures[winnerId].push(...cards);
        this.state.lastCollectorId = winnerId;
        this.state.pistis[winnerId].push({
          type: believe ? 'bluff-believed' : 'bluff-proved',
          points: awardedPoints,
          card: clone(pending.card),
          matchedCard: clone(pending.baseCard),
          moveNumber: pending.moveNumber
        });
      } else {
        winnerId = responderId;
        awardedPoints = this.rules.bluffCaughtPoints;
        this.state.bluffBonus[winnerId] += awardedPoints;
      }

      this.state.pendingBluff = null;
      const event = {
        claimantId: pending.claimantId,
        responderId,
        believed: Boolean(believe),
        revealed: !believe,
        card: believe ? null : clone(pending.card),
        matched,
        captured,
        winnerId,
        awardedPoints
      };
      this.emit('bluffResolved', event);
      this.advanceTurn();
      this.handleEndOfHandCycle();
      return event;
    }

    advanceTurn() {
      this.state.currentPlayerIndex =
        (this.state.currentPlayerIndex + 1) % this.players.length;

      this.emit('turn', {
        player: this.getCurrentPlayer()
      });
    }

    allHandsEmpty() {
      return this.players.every(
        p => this.state.hands[p.id].length === 0
      );
    }

    handleEndOfHandCycle() {
      if (!this.allHandsEmpty()) {
        this.emit('state', this.getPublicState());
        return;
      }

      if (this.state.deck.length > 0) {
        this.dealHands();
        this.emit('state', this.getPublicState());
        return;
      }

      this.finishGame();
    }

    finishGame() {
      // Deste bittikten sonra ortada kalan kartlar,
      // son kez kart alan oyuncuya / takım oyuncusuna gider.
      if (
        this.state.table.length > 0 &&
        this.state.lastCollectorId
      ) {
        const remaining = this.state.table.splice(
          0,
          this.state.table.length
        );

        this.state.captures[this.state.lastCollectorId].push(...remaining);

        this.emit('lastTableCollected', {
          playerId: this.state.lastCollectorId,
          cards: clone(remaining)
        });
      }

      this.state.status = 'finished';
      this.state.score = this.calculateScore();

      const winnerInfo = this.determineWinner(this.state.score);

      this.state.winner = winnerInfo.winner;
      this.state.winners = winnerInfo.winners;

      const result = {
        mode: this.mode,
        score: clone(this.state.score),
        winner: this.state.winner,
        winners: clone(this.state.winners)
      };

      this.emit('gameOver', result);
      this.emit('state', this.getPublicState());

      return result;
    }

    scoreCapturedCards(cards) {
      let points = 0;

      for (const card of cards) {
        if (card.rank === 'A') {
          points += this.rules.acePoints;
        }

        if (card.rank === 'J') {
          points += this.rules.jackPoints;
        }

        if (card.rank === '2' && card.suit === 'clubs') {
          points += this.rules.clubsTwoPoints;
        }

        if (card.rank === '10' && card.suit === 'diamonds') {
          points += this.rules.diamondsTenPoints;
        }
      }

      return points;
    }

    scorePistis(pistis) {
      let points = 0;

      for (const p of pistis) {
        if (Number.isFinite(p.points)) {
          points += p.points;
          continue;
        }
        points +=
          p.type === 'jack'
            ? this.rules.jackPistiPoints
            : this.rules.pistiPoints;
      }

      return points;
    }

    calculateScore() {
      if (this.mode === MODE_SOLO) {
        return this.calculateSoloScore();
      }

      return this.calculateTeamScore();
    }

    calculateLivePlayerScores() {
      const result = {};
      for (const p of this.players) {
        result[p.id] =
          this.scoreCapturedCards(this.state.captures[p.id]) +
          this.scorePistis(this.state.pistis[p.id]) +
          this.state.bluffBonus[p.id];
      }
      return result;
    }

    calculateSoloScore() {
      const result = {};

      for (const p of this.players) {
        const captured = this.state.captures[p.id];
        const pistis = this.state.pistis[p.id];

        result[p.id] = {
          playerId: p.id,
          username: p.username,

          cardCount: captured.length,
          cardPoints: this.scoreCapturedCards(captured),
          pistiPoints: this.scorePistis(pistis),
          bluffBonus: this.state.bluffBonus[p.id],
          mostCardsPoints: 0,

          pistiCount: pistis.length,
          total: 0
        };
      }

      const maxCards = Math.max(
        ...Object.values(result).map(r => r.cardCount)
      );

      const leaders = Object.values(result).filter(
        r => r.cardCount === maxCards
      );

      // En çok kart bonusu yalnız tek lider varsa verilir.
      if (leaders.length === 1) {
        leaders[0].mostCardsPoints = this.rules.mostCardsPoints;
      }

      for (const entry of Object.values(result)) {
        entry.total =
          entry.cardPoints +
          entry.pistiPoints +
          entry.bluffBonus +
          entry.mostCardsPoints;
      }

      return result;
    }

    calculateTeamScore() {
      const teams = {
        [TEAM_A]: {
          team: TEAM_A,
          playerIds: [],
          cardCount: 0,
          cardPoints: 0,
          pistiPoints: 0,
          mostCardsPoints: 0,
          pistiCount: 0,
          bluffBonus: 0,
          total: 0
        },

        [TEAM_B]: {
          team: TEAM_B,
          playerIds: [],
          cardCount: 0,
          cardPoints: 0,
          pistiPoints: 0,
          mostCardsPoints: 0,
          pistiCount: 0,
          bluffBonus: 0,
          total: 0
        }
      };

      for (const p of this.players) {
        const team = teams[p.team];
        const captures = this.state.captures[p.id];
        const pistis = this.state.pistis[p.id];

        team.playerIds.push(p.id);
        team.cardCount += captures.length;
        team.cardPoints += this.scoreCapturedCards(captures);
        team.pistiPoints += this.scorePistis(pistis);
        team.pistiCount += pistis.length;
        team.bluffBonus += this.state.bluffBonus[p.id];
      }

      if (teams[TEAM_A].cardCount > teams[TEAM_B].cardCount) {
        teams[TEAM_A].mostCardsPoints = this.rules.mostCardsPoints;
      } else if (teams[TEAM_B].cardCount > teams[TEAM_A].cardCount) {
        teams[TEAM_B].mostCardsPoints = this.rules.mostCardsPoints;
      }

      for (const team of Object.values(teams)) {
        team.total =
          team.cardPoints +
          team.pistiPoints +
          team.bluffBonus +
          team.mostCardsPoints;
      }

      return teams;
    }

    determineWinner(score) {
      if (this.mode === MODE_SOLO) {
        const entries = Object.values(score);
        const max = Math.max(...entries.map(e => e.total));
        const winners = entries
          .filter(e => e.total === max)
          .map(e => e.playerId);

        return {
          winner: winners.length === 1 ? winners[0] : null,
          winners
        };
      }

      const a = score[TEAM_A].total;
      const b = score[TEAM_B].total;

      if (a > b) {
        return {
          winner: TEAM_A,
          winners: [TEAM_A]
        };
      }

      if (b > a) {
        return {
          winner: TEAM_B,
          winners: [TEAM_B]
        };
      }

      return {
        winner: null,
        winners: [TEAM_A, TEAM_B]
      };
    }

    /**
     * İstemciye gönderilebilecek public state.
     * Eller gizlenir, yalnız kart sayıları görünür.
     */
    getPublicState() {
      return {
        version: this.state.version,
        mode: this.mode,
        status: this.state.status,

        players: clone(this.players),
        currentPlayer: this.getCurrentPlayer(),

        deckCount: this.state.deck.length,
        handCounts: this.getHandCounts(),

        tableCount: this.state.table.length,
        topTableCard: clone(
          this.state.pendingBluff
            ? this.state.pendingBluff.baseCard
            : this.getTopTableCard()
        ),
        tablePreview: this.state.table.slice(-3).map(card => {
          const pendingFaceDown =
            this.state.pendingBluff?.card?.id === card.id;
          const initialFaceDown =
            this.state.initialHiddenCardIds.includes(card.id);
          return pendingFaceDown || initialFaceDown
            ? { faceDown: true }
            : { ...clone(card), faceDown: false };
        }),

        dealNumber: this.state.dealNumber,
        moveNumber: this.state.moveNumber,

        capturesCount: Object.fromEntries(
          this.players.map(p => [
            p.id,
            this.state.captures[p.id].length
          ])
        ),

        pistiCount: Object.fromEntries(
          this.players.map(p => [
            p.id,
            this.state.pistis[p.id].length
          ])
        ),

        bluffBonus: clone(this.state.bluffBonus),
        liveScores: this.calculateLivePlayerScores(),
        pendingBluff: this.state.pendingBluff
          ? {
              claimantId: this.state.pendingBluff.claimantId,
              responderId: this.state.pendingBluff.responderId,
              baseCard: clone(this.state.pendingBluff.baseCard),
              moveNumber: this.state.pendingBluff.moveNumber
            }
          : null,

        lastCollectorId: this.state.lastCollectorId,

        score: clone(this.state.score),
        winner: this.state.winner,
        winners: clone(this.state.winners)
      };
    }

    /**
     * Belirli client için state.
     * Sadece kendi elini açık verir.
     */
    getStateForPlayer(playerId) {
      this.getPlayer(playerId);

      const state = this.getPublicState();

      return {
        ...state,
        yourPlayerId: playerId,
        yourHand: this.getHand(playerId),
        yourBluffCard:
          this.state.pendingBluff?.claimantId === playerId
            ? clone(this.state.pendingBluff.card)
            : null
      };
    }

    /**
     * Sunucu / debug için tam state.
     */
    getFullState() {
      return {
        ...clone(this.state),
        players: clone(this.players),
        rules: clone(this.rules)
      };
    }

    serializeFullState() {
      return JSON.stringify(this.getFullState());
    }

    /**
     * Bağlantı durumu.
     */
    setPlayerConnected(playerId, connected) {
      const player = this.getPlayer(playerId);
      player.connected = Boolean(connected);

      this.emit('connection', {
        playerId,
        connected: player.connected
      });

      return clone(player);
    }
  }

  class SoloPisti extends PistiGame {
    constructor(options = {}) {
      super({
        ...options,
        mode: MODE_SOLO
      });
    }
  }

  class TeamPisti extends PistiGame {
    constructor(options = {}) {
      super({
        ...options,
        mode: MODE_TEAM
      });
    }
  }

  global.PISTI = Object.freeze({
    MODE_SOLO,
    MODE_TEAM,

    TEAM_A,
    TEAM_B,

    SUITS,
    RANKS,

    DEFAULT_RULES,

    createDeck,

    PistiGame,
    SoloPisti,
    TeamPisti
  });

})(typeof window !== 'undefined' ? window : globalThis);
