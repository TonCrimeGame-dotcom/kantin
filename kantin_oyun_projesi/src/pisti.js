// pisti.js - Authoritative Pişti Game Engine
(function (global) {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  const TEAM_A = 'TEAM_A';
  const TEAM_B = 'TEAM_B';

  function clone(obj) {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  }

  function secureRandomInt(min, max) {
    const range = max - min + 1;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return min + (array[0] % range);
    }
    return Math.floor(Math.random() * range) + min;
  }

  function createDeck() {
    const deck = [];
    let id = 1;
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        let points = 1;
        if (rank === 'J' || rank === 'A') points = 1;
        if (suit === 'C' && rank === '2') points = 2;
        if (suit === 'D' && rank === '10') points = 3;

        deck.push({
          id: id++,
          suit,
          rank,
          points
        });
      }
    }
    return deck;
  }

  function shuffle(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = secureRandomInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  class PistiGame {
    constructor(options = {}) {
      this.targetScore = options.targetScore || 101;
      this.isPairs = !!options.isPairs;
      this.bluffEnabled = options.bluffEnabled !== false;
      this.onStateChange = options.onStateChange || null;

      const rawPlayers = options.players || [
        { id: 'p1', name: 'Oyuncu 1' },
        { id: 'p2', name: 'Oyuncu 2' }
      ];

      this.players = this.normalizePlayers(rawPlayers);
      this.resetGame();
    }

    normalizePlayers(raw) {
      if (this.isPairs && raw.length !== 4) {
        throw new Error('Eşli oyun tam olarak 4 oyuncu gerektirir.');
      }
      if (!this.isPairs && (raw.length < 2 || raw.length > 4)) {
        throw new Error('Tekli oyun 2 ile 4 oyuncu arasında olmalıdır.');
      }

      return raw.map((p, index) => {
        let team = null;
        if (this.isPairs) {
          team = (index % 2 === 0) ? TEAM_A : TEAM_B;
        }
        return {
          id: String(p.id),
          name: p.name || `Oyuncu ${index + 1}`,
          team: team,
          connected: true
        };
      });
    }

    resetGame() {
      this.state = {
        status: 'WAITING', // WAITING, PLAYING, BLUFF_PENDING, GAME_OVER
        round: 0,
        scores: {},
        capturedCards: {},
        pistiCount: {},
        deck: [],
        table: [],
        hands: {},
        turnIndex: 0,
        lastCapturerId: null,
        playedCards: [],
        pendingBluff: null,
        winner: null,
        activeTableCardInfo: null // Blöf doğrulaması için eklendi
      };

      for (const p of this.players) {
        this.state.scores[p.id] = 0;
        this.state.capturedCards[p.id] = [];
        this.state.pistiCount[p.id] = 0;
        this.state.hands[p.id] = [];
      }

      if (this.isPairs) {
        this.state.teamScores = { [TEAM_A]: 0, [TEAM_B]: 0 };
      }
    }

    startNewGame() {
      this.resetGame();
      this.startNewRound();
    }

    startNewRound() {
      this.state.round += 1;
      this.state.status = 'PLAYING';
      this.state.table = [];
      this.state.playedCards = [];
      this.state.pendingBluff = null;
      this.state.lastCapturerId = null;
      this.state.activeTableCardInfo = null;

      for (const p of this.players) {
        this.state.hands[p.id] = [];
      }

      let fullDeck = shuffle(createDeck());

      // Masaya 4 kart aç (sonuncusu kapalı değilse standart pişti kuralları)
      this.state.table = fullDeck.splice(0, 4);
      this.state.deck = fullDeck;

      this.dealHands();
      this.emitChange();
    }

    dealHands() {
      if (this.state.deck.length < this.players.length * 4) {
        return false;
      }
      for (let i = 0; i < 4; i++) {
        for (const p of this.players) {
          this.state.hands[p.id].push(this.state.deck.shift());
        }
      }
      return true;
    }

    getCurrentPlayer() {
      return this.players[this.state.turnIndex];
    }

    nextTurn() {
      this.state.turnIndex = (this.state.turnIndex + 1) % this.players.length;
    }

    canPlayCard(playerId, cardId) {
      if (this.state.status !== 'PLAYING') return false;
      const current = this.getCurrentPlayer();
      if (!current || current.id !== String(playerId)) return false;

      const hand = this.state.hands[playerId] || [];
      return hand.some(c => c.id === cardId);
    }

    playCard(playerId, cardId) {
      if (!this.canPlayCard(playerId, cardId)) {
        return { success: false, reason: 'Geçersiz hamle veya sıra sizde değil.' };
      }

      const hand = this.state.hands[playerId];
      const cardIndex = hand.findIndex(c => c.id === cardId);
      const playedCard = hand.splice(cardIndex, 1)[0];

      const topTableCard = this.state.table.length > 0 
        ? this.state.table[this.state.table.length - 1] 
        : null;

      let captured = false;
      let isPisti = false;
      let captureType = null;

      this.state.playedCards.push({
        playerId,
        card: playedCard,
        timestamp: Date.now()
      });

      if (topTableCard) {
        if (playedCard.rank === topTableCard.rank || playedCard.rank === 'J') {
          captured = true;
          if (this.state.table.length === 1 && playedCard.rank === topTableCard.rank) {
            isPisti = true;
          }
        }
      }

      if (captured) {
        const collected = [...this.state.table, playedCard];
        this.state.capturedCards[playerId].push(...collected);
        this.state.lastCapturerId = playerId;
        this.state.table = [];
        this.state.activeTableCardInfo = null; // Masa temizlendi

        if (isPisti) {
          this.state.pistiCount[playerId] += 1;
          const bonus = (playedCard.rank === 'J') ? 20 : 10;
          this.state.scores[playerId] += bonus;
          captureType = 'PISTI';
        } else {
          captureType = 'CAPTURE';
        }
      } else {
        this.state.table.push(playedCard);
        // Masadaki kartın kim tarafından atıldığını takip et
        this.state.activeTableCardInfo = {
          playedBy: playerId,
          card: playedCard
        };
      }

      this.checkRoundOrHandCompletion();
      if (this.state.status === 'PLAYING') {
        this.nextTurn();
      }

      this.emitChange();
      return {
        success: true,
        captured,
        isPisti,
        captureType,
        playedCard
      };
    }

    canDeclareBluff(playerId) {
      if (!this.bluffEnabled) return false;
      if (this.state.status !== 'PLAYING') return false;
      
      // Masa sıfırlanmışsa veya tam 1 kart yoksa blöf yapılamaz
      if (this.state.table.length !== 1 || !this.state.activeTableCardInfo) return false;
      
      // Kendi attığı karta blöf diyemez
      if (this.state.activeTableCardInfo.playedBy === String(playerId)) return false;

      const current = this.getCurrentPlayer();
      return current && current.id === String(playerId);
    }

    declareBluff(declarerId) {
      if (!this.canDeclareBluff(declarerId)) {
        return { success: false, reason: 'Blöf çağrısı şartları karşılanmıyor.' };
      }

      const responderId = this.state.activeTableCardInfo.playedBy;

      this.state.status = 'BLUFF_PENDING';
      this.state.pendingBluff = {
        declarerId: String(declarerId),
        responderId: String(responderId),
        createdAt: Date.now()
      };

      this.emitChange();
      return { success: true, pendingBluff: this.state.pendingBluff };
    }

    resolveBluff(responderId, claimsReal) {
      if (this.state.status !== 'BLUFF_PENDING' || !this.state.pendingBluff) {
        return { success: false, reason: 'Bekleyen bir blöf süreci yok.' };
      }

      const { declarerId, responderId: expectedResponder } = this.state.pendingBluff;
      if (String(responderId) !== expectedResponder) {
        return { success: false, reason: 'Yanıt verme yetkiniz yok.' };
      }

      const tableCard = this.state.table[this.state.table.length - 1];
      const isActuallyJoker = (tableCard.rank === 'J');

      let winnerId = null;
      let penalty = 10;

      if (claimsReal) {
        winnerId = isActuallyJoker ? declarerId : responderId;
      } else {
        winnerId = isActuallyJoker ? responderId : declarerId;
      }

      const loserId = (winnerId === declarerId) ? responderId : declarerId;

      this.state.scores[winnerId] += penalty;
      this.state.scores[loserId] = Math.max(0, this.state.scores[loserId] - penalty);

      const result = {
        declarerId,
        responderId,
        claimsReal,
        isActuallyJoker,
        winnerId,
        loserId,
        penalty
      };

      this.state.pendingBluff = null;
      this.state.status = 'PLAYING';

      this.checkRoundOrHandCompletion();
      this.emitChange();

      return { success: true, result };
    }

    checkRoundOrHandCompletion() {
      const allHandsEmpty = this.players.every(p => (this.state.hands[p.id] || []).length === 0);

      if (allHandsEmpty) {
        if (this.state.deck.length > 0) {
          this.dealHands();
        } else {
          this.endRound();
        }
      }
    }

    endRound() {
      // Masada kalan kartları son toplayana ver
      if (this.state.table.length > 0 && this.state.lastCapturerId) {
        this.state.capturedCards[this.state.lastCapturerId].push(...this.state.table);
        this.state.table = [];
        this.state.activeTableCardInfo = null;
      }

      // Kart puanlarını hesapla
      let maxCardsCount = -1;
      let mostCardsPlayerId = null;
      let isTieForMostCards = false;

      for (const p of this.players) {
        const cards = this.state.capturedCards[p.id] || [];
        let cardPoints = 0;
        for (const c of cards) {
          cardPoints += c.points;
        }

        this.state.scores[p.id] += cardPoints;

        if (cards.length > maxCardsCount) {
          maxCardsCount = cards.length;
          mostCardsPlayerId = p.id;
          isTieForMostCards = false;
        } else if (cards.length === maxCardsCount) {
          isTieForMostCards = true;
        }
      }

      // En çok kart toplayana +3 puan (Eşitlik yoksa)
      if (mostCardsPlayerId && !isTieForMostCards) {
        this.state.scores[mostCardsPlayerId] += 3;
      }

      // Takım skorlarını güncelle
      if (this.isPairs) {
        this.state.teamScores[TEAM_A] = 0;
        this.state.teamScores[TEAM_B] = 0;
        for (const p of this.players) {
          this.state.teamScores[p.team] += this.state.scores[p.id];
        }
      }

      // Oyun bitti mi kontrol et
      let highestScore = 0;
      let leadingWinner = null;

      if (this.isPairs) {
        if (this.state.teamScores[TEAM_A] >= this.targetScore || this.state.teamScores[TEAM_B] >= this.targetScore) {
          this.state.status = 'GAME_OVER';
          this.state.winner = this.state.teamScores[TEAM_A] > this.state.teamScores[TEAM_B] ? TEAM_A : TEAM_B;
        }
      } else {
        for (const p of this.players) {
          const sc = this.state.scores[p.id];
          if (sc > highestScore) {
            highestScore = sc;
            leadingWinner = p.id;
          }
        }
        if (highestScore >= this.targetScore) {
          this.state.status = 'GAME_OVER';
          this.state.winner = leadingWinner;
        }
      }

      if (this.state.status !== 'GAME_OVER') {
        this.startNewRound();
      }
    }

    setPlayerConnected(playerId, connected) {
      const p = this.players.find(x => x.id === String(playerId));
      if (p) {
        p.connected = !!connected;
        // Eğer blöf bekleyen oyuncu koparsa blöfü iptal et
        if (!connected && this.state.pendingBluff && this.state.pendingBluff.responderId === p.id) {
          this.state.pendingBluff = null;
          this.state.status = 'PLAYING';
        }
        this.emitChange();
      }
    }

    getPublicState(playerId) {
      const stateCopy = clone(this.state);
      
      // Diğer oyuncuların elindeki kartları gizle
      for (const p of this.players) {
        if (p.id !== String(playerId)) {
          stateCopy.hands[p.id] = (stateCopy.hands[p.id] || []).map(() => ({ hidden: true }));
        }
      }

      // Desteyi gizle
      stateCopy.deckCount = stateCopy.deck.length;
      delete stateCopy.deck;

      return stateCopy;
    }

    emitChange() {
      if (typeof this.onStateChange === 'function') {
        this.onStateChange(this.state);
      }
    }
  }

  global.PistiGame = PistiGame;
})(typeof window !== 'undefined' ? window : globalThis);
