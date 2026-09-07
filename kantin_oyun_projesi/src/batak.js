/**
 * batak.js
 * KANTİN - Batak oyun motoru
 *
 * Desteklenen modlar:
 *   1) Koz Maça: Koz her zaman maça olur
 *   2) Gömmeli: Görmeyen oyuncu 100 puan yazar
 *
 * Temel kurallar:
 * - 52 kartlık standart deste, jokersiz.
 * - 4 oyuncu ile oynanır.
 * - Her oyuncuya 13 kart dağıtılır.
 * - Her el için koz belirlenir (koz maça modunda her zaman maça).
 * - İlk oyuncu bir kart atar, diğerleri aynı seriden atmak zorundadır.
 * - Aynı seriden kart yoksa koz atılabilir.
 * - Ne koz ne de seri varsa istenilen kart atılabilir.
 * - En yüksek kartı atan el kazanır (koz ile koz kırılabilir).
 * - Görmeyen oyuncu 100 puan yazar (gömmeli modunda).
 *
 * Puanlama:
 * - A (As): 11 puan
 * - 10: 10 puan
 * - K (Kral): 4 puan
 * - Q (Kız): 3 puan
 * - J (Vale): 2 puan
 * - Diğerleri: 0 puan
 *
 * Online kullanım:
 * - Deste karıştırma ve dağıtım SUNUCUDA yapılmalıdır.
 * - Client'a yalnızca kendi eli gönderilmelidir.
 * - Aşağıdaki motor authoritative server mantığına uygundur.
 */

(function (global) {
  'use strict';

  const MODE_KOZ_MACA = 'kozMaca';      // Koz her zaman maça
  const MODE_GOMMELI = 'gommedi';       // Görmeyen 100 yazar

  const TEAM_A = 'teamA';
  const TEAM_B = 'teamB';

  const SUITS = Object.freeze(['clubs', 'diamonds', 'hearts', 'spades']);
  const RANKS = Object.freeze([
    'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'
  ]);

  const TRUMP_RANKS = Object.freeze({
    'A': 14,
    'K': 13,
    'Q': 12,
    'J': 11,
    '10': 10,
    '9': 9,
    '8': 8,
    '7': 7,
    '6': 6,
    '5': 5,
    '4': 4,
    '3': 3,
    '2': 2
  });

  const CARD_POINTS = Object.freeze({
    'A': 11,
    '10': 10,
    'K': 4,
    'Q': 3,
    'J': 2,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
    '6': 0,
    '7': 0,
    '8': 0,
    '9': 0
  });

  const DEFAULT_RULES = Object.freeze({
    // Gömmeli modunda görmeyenin ceza puanı
    gommeliPenalty: 100,

    // Her oyuncunun görmesi için minimum tahmin
    minBid: 4,

    // Maksimum tahmin
    maxBid: 13,

    // İlk koz belirleme süresi (milisaniye)
    trumpSelectionTimeout: 15000
  });

  const clone = (obj) =>
    typeof structuredClone === 'function'
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));

  function assertMode(mode) {
    if (mode !== MODE_KOZ_MACA && mode !== MODE_GOMMELI) {
      throw new Error(`Geçersiz Batak modu: ${mode}`);
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

  function normalizePlayers(players) {
    if (!Array.isArray(players) || players.length !== 4) {
      throw new Error('Batak tam olarak 4 oyuncu ister.');
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

      // Varsayılan oturma düzeni:
      // 0=A1, 1=B1, 2=A2, 3=B2
      const team = p.team || (index % 2 === 0 ? TEAM_A : TEAM_B);

      if (team !== TEAM_A && team !== TEAM_B) {
        throw new Error(`Geçersiz takım: ${team}`);
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

    // Takım kontrolü
    const a = normalized.filter(p => p.team === TEAM_A).length;
    const b = normalized.filter(p => p.team === TEAM_B).length;

    if (a !== 2 || b !== 2) {
      throw new Error('Her takımda tam olarak 2 oyuncu olmalı.');
    }

    // Sıra düzeni A-B-A-B olmalı
    for (let i = 0; i < normalized.length; i++) {
      const current = normalized[i];
      const next = normalized[(i + 1) % normalized.length];

      if (current.team === next.team) {
        throw new Error(
          'Oturma sırası A-B-A-B olmalı; eşler arka arkaya oynayamaz.'
        );
      }
    }

    return normalized;
  }

  class BatakGame {
    constructor(options = {}) {
      this.listeners = new Map();

      this.mode = options.mode || MODE_KOZ_MACA;
      assertMode(this.mode);

      this.rules = {
        ...DEFAULT_RULES,
        ...(options.rules || {})
      };

      const defaultPlayers = [
        { id: 'A1', username: 'Oyuncu A1', team: TEAM_A },
        { id: 'B1', username: 'Oyuncu B1', team: TEAM_B },
        { id: 'A2', username: 'Oyuncu A2', team: TEAM_A },
        { id: 'B2', username: 'Oyuncu B2', team: TEAM_B }
      ];

      this.players = normalizePlayers(options.players || defaultPlayers);

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
          console.error(`[BATAK:${eventName}] listener hatası`, err);
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
        trump: null,
        trumpSelector: null,

        currentPlayerIndex: this.startingPlayerIndex,
        trickNumber: 0,
        leadSuit: null,
        currentTrick: [],

        bids: {},
        bidder: null,
        bidAmount: null,

        tricksWon: {},
        roundPoints: {},
        totalPoints: {},

        winner: null,
        winners: []
      };

      for (const p of this.players) {
        this.state.hands[p.id] = [];
        this.state.bids[p.id] = null;
        this.state.tricksWon[p.id] = 0;
        this.state.roundPoints[p.id] = 0;
        this.state.totalPoints[p.id] = 0;
      }

      this.startNewDeck();

      this.emit('reset', this.getPublicState());
      return this.getPublicState();
    }

    startNewDeck(preShuffledDeck = null) {
      const source = preShuffledDeck
        ? clone(preShuffledDeck)
        : shuffle(createDeck());

      this.validateDeck(source);

      this.state.deck = source;
      this.state.trump = null;
      this.state.trumpSelector = null;
      this.state.currentTrick = [];
      this.state.leadSuit = null;
      this.state.trickNumber = 0;

      for (const p of this.players) {
        this.state.hands[p.id] = [];
        this.state.bids[p.id] = null;
        this.state.tricksWon[p.id] = 0;
        this.state.roundPoints[p.id] = 0;
      }

      this.dealHands();

      if (this.mode === MODE_KOZ_MACA) {
        this.state.trump = 'spades'; // Maça
        this.state.currentPlayerIndex = this.startingPlayerIndex;
        this.emit('trumpSelected', { trump: 'spades', selector: null });
      } else {
        // Gömmeli modunda rastgele koz belirleyici seç
        this.state.trumpSelector = this.players[
          secureRandomInt(this.players.length)
        ].id;
        this.state.currentPlayerIndex = this.players.findIndex(
          p => p.id === this.state.trumpSelector
        );
        this.emit('trumpSelectionStart', {
          selector: this.state.trumpSelector
        });
      }

      this.emit('gameStart', this.getPublicState());
    }

    validateDeck(deck) {
      if (!Array.isArray(deck) || deck.length !== 52) {
        throw new Error('Batak destesi 52 kart olmalı.');
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

    dealHands() {
      const handSize = 13; // Batak'ta her oyuncu 13 kart alır
      const playerCount = this.players.length;
      const needed = handSize * playerCount;

      if (this.state.deck.length < needed) {
        throw new Error(
          `Dağıtım için yeterli kart yok. Gerekli: ${needed}, kalan: ${this.state.deck.length}`
        );
      }

      // Gerçek kart dağıtımı gibi tur tur birer kart
      for (let round = 0; round < handSize; round++) {
        for (const player of this.players) {
          this.state.hands[player.id].push(this.state.deck.pop());
        }
      }

      this.emit('deal', {
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

    canSelectTrump(playerId, suit) {
      if (this.mode === MODE_KOZ_MACA) return false;
      if (this.state.trump) return false;
      if (this.state.trumpSelector !== playerId) return false;
      if (!SUITS.includes(suit)) return false;
      return true;
    }

    selectTrump(playerId, suit) {
      if (!this.canSelectTrump(playerId, suit)) {
        throw new Error('Koz seçimi yapılamaz.');
      }

      this.state.trump = suit;
      this.state.bids[playerId] = this.rules.minBid; // Koz seçen minimum görür
      this.state.bidder = playerId;
      this.state.bidAmount = this.rules.minBid;

      // Koz seçen başlar
      this.state.currentPlayerIndex = this.players.findIndex(
        p => p.id === playerId
      );

      const event = {
        selector: playerId,
        trump: suit,
        bid: this.rules.minBid
      };

      this.emit('trumpSelected', event);
      this.emit('state', this.getPublicState());

      return event;
    }

    canPlay(playerId, cardIdValue) {
      if (this.state.status !== 'playing') return false;
      if (!this.state.trump) return false; // Koz seçilmemişse kart atılamaz

      const current = this.players[this.state.currentPlayerIndex];
      if (current.id !== playerId) return false;

      return this.state.hands[playerId].some(c => c.id === cardIdValue);
    }

    playCard(playerId, cardIdValue) {
      if (this.state.status !== 'playing') {
        throw new Error('Oyun bitmiş.');
      }

      if (!this.state.trump) {
        throw new Error('Önce koz seçilmeli.');
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

      // İlk kart atılıyorsa seri belirle
      if (this.state.currentTrick.length === 0) {
        this.state.leadSuit = card.suit;
      }

      // Kuralları kontrol et
      if (!this.isValidMove(playerId, card)) {
        hand.push(card); // Kartı geri koy
        throw new Error('Geçersiz hamle. Aynı seriden kart atmalısınız.');
      }

      this.state.currentTrick.push({
        playerId,
        card: clone(card),
        player: clone(player)
      });

      const event = {
        playerId,
        player: clone(player),
        card: clone(card),
        trickNumber: this.state.trickNumber,
        trickIndex: this.state.currentTrick.length - 1
      };

      this.emit('cardPlayed', event);

      // 4 kart atıldıysa eli tamamla
      if (this.state.currentTrick.length === 4) {
        this.completeTrick();
      } else {
        this.advanceTurn();
      }

      this.emit('state', this.getPublicState());

      return event;
    }

    isValidMove(playerId, card) {
      const hand = this.state.hands[playerId];

      // İlk kart serbest
      if (this.state.currentTrick.length === 0) {
        return true;
      }

      const leadSuit = this.state.leadSuit;
      const hasLeadSuit = hand.some(c => c.suit === leadSuit);

      // Aynı seriden kart varsa o seri atılmalı
      if (hasLeadSuit) {
        return card.suit === leadSuit;
      }

      // Aynı seri yoksa koz atılabilir (isterseler)
      const hasTrump = hand.some(c => c.suit === this.state.trump);

      // Koz varsa koz atılabilir
      if (hasTrump) {
        return true;
      }

      // Ne koz ne de seri yoksa istenilen kart atılabilir
      return true;
    }

    completeTrick() {
      const trick = this.state.currentTrick;
      const leadSuit = this.state.leadSuit;
      const trump = this.state.trump;

      // Eli kazananı belirle
      let winner = trick[0];

      for (let i = 1; i < trick.length; i++) {
        const current = trick[i];
        const currentCard = current.card;
        const winnerCard = winner.card;

        // Koz ile kırılma
        if (currentCard.suit === trump && winnerCard.suit !== trump) {
          winner = current;
          continue;
        }

        if (winnerCard.suit === trump && currentCard.suit !== trump) {
          continue;
        }

        // Aynı seri karşılaştırması
        if (currentCard.suit === winnerCard.suit) {
          if (TRUMP_RANKS[currentCard.rank] > TRUMP_RANKS[winnerCard.rank]) {
            winner = current;
          }
        }
      }

      const winnerId = winner.playerId;
      this.state.tricksWon[winnerId]++;

      // Puanları hesapla
      let trickPoints = 0;
      for (const play of trick) {
        trickPoints += CARD_POINTS[play.card.rank] || 0;
      }

      this.state.roundPoints[winnerId] += trickPoints;

      const event = {
        trickNumber: this.state.trickNumber,
        trick: clone(trick),
        winnerId,
        winner: clone(winner.player),
        points: trickPoints,
        leadSuit
      };

      this.emit('trickComplete', event);

      // Yeni eli hazırla
      this.state.currentTrick = [];
      this.state.leadSuit = null;
      this.state.trickNumber++;

      // Sonraki eli kazanan başlatır
      this.state.currentPlayerIndex = this.players.findIndex(
        p => p.id === winnerId
      );

      // Oyun bitti mi kontrol et
      if (this.state.trickNumber === 13) {
        this.finishGame();
      } else {
        this.emit('turn', {
          player: this.getCurrentPlayer()
        });
      }
    }

    advanceTurn() {
      this.state.currentPlayerIndex =
        (this.state.currentPlayerIndex + 1) % this.players.length;

      this.emit('turn', {
        player: this.getCurrentPlayer()
      });
    }

    finishGame() {
      this.state.status = 'finished';

      // Gömmeli modunda görmeyenleri işaretle
      const gommeliOffenders = [];

      for (const p of this.players) {
        const bid = this.state.bids[p.id];
        const tricks = this.state.tricksWon[p.id];

        if (bid !== null && tricks < bid) {
          gommeliOffenders.push(p.id);
          this.state.roundPoints[p.id] += this.rules.gommeliPenalty;
        }
      }

      // Takım puanlarını topla
      const teamAPoints = this.players
        .filter(p => p.team === TEAM_A)
        .reduce((sum, p) => sum + this.state.roundPoints[p.id], 0);

      const teamBPoints = this.players
        .filter(p => p.team === TEAM_B)
        .reduce((sum, p) => sum + this.state.roundPoints[p.id], 0);

      // Kazananı belirle
      if (teamAPoints > teamBPoints) {
        this.state.winners = this.players
          .filter(p => p.team === TEAM_A)
          .map(p => p.id);
      } else if (teamBPoints > teamAPoints) {
        this.state.winners = this.players
          .filter(p => p.team === TEAM_B)
          .map(p => p.id);
      } else {
        // Beraberlik
        this.state.winners = this.players.map(p => p.id);
      }

      const event = {
        teamAPoints,
        teamBPoints,
        winners: this.state.winners,
        gommeliOffenders,
        finalScores: clone(this.state.roundPoints)
      };

      this.emit('gameFinished', event);
      this.emit('state', this.getPublicState());

      return event;
    }

    getPublicState() {
      return {
        version: this.state.version,
        mode: this.state.mode,
        status: this.state.status,

        trump: this.state.trump,
        trumpSelector: this.state.trumpSelector,

        currentPlayerIndex: this.state.currentPlayerIndex,
        trickNumber: this.state.trickNumber,
        leadSuit: this.state.leadSuit,
        currentTrick: clone(this.state.currentTrick),

        bids: clone(this.state.bids),
        bidder: this.state.bidder,
        bidAmount: this.state.bidAmount,

        tricksWon: clone(this.state.tricksWon),
        roundPoints: clone(this.state.roundPoints),
        totalPoints: clone(this.state.totalPoints),

        handCounts: this.getHandCounts(),

        winner: this.state.winner,
        winners: this.state.winners
      };
    }

    getStateForPlayer(playerId) {
      const publicState = this.getPublicState();
      const hand = this.getHand(playerId);

      return {
        ...publicState,
        hand
      };
    }

    getFullState() {
      return {
        ...this.getPublicState(),
        hands: clone(this.state.hands),
        players: clone(this.players),
        rules: clone(this.rules)
      };
    }
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BatakGame, MODE_KOZ_MACA, MODE_GOMMELI };
  } else {
    global.BATAK = { BatakGame, MODE_KOZ_MACA, MODE_GOMMELI };
  }
})(this);