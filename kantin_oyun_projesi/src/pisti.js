/**
 * pisti.js
 * KANTİN - Pişti oyun motoru & Okey Hall Animasyon Sistemi
 */

(function (global) {
  'use strict';

  const MODE_SOLO = 'solo';
  const MODE_TEAM = 'team';

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

    jackPisti: true,
    jackOnJackPisti: true,

    bluffEnabled: true,
    bluffBelievedPoints: 10,
    bluffProvedPoints: 20,
    bluffCaughtPoints: 10,
    jackBluffMultiplier: 1,

    initialTableCards: 4,
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
        deck.push({ id: cardId(rank, suit), rank, suit });
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
      throw new Error(`${mode === MODE_SOLO ? 'Tekli' : 'Eşli'} mod tam olarak ${expected} oyuncu ister.`);
    }

    const ids = new Set();
    return players.map((p, index) => {
      if (!p?.id) throw new Error('Her oyuncunun id alanı olmalı.');
      const id = String(p.id);
      if (ids.has(id)) throw new Error(`Tekrarlanan oyuncu id: ${id}`);
      ids.add(id);

      let team = null;
      if (mode === MODE_TEAM) {
        team = p.team || (index % 2 === 0 ? TEAM_A : TEAM_B);
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
  }

  class PistiGame {
    constructor(options = {}) {
      this.listeners = new Map();
      this.mode = options.mode || MODE_SOLO;
      assertMode(this.mode);

      this.rules = { ...DEFAULT_RULES, ...(options.rules || {}) };

      const defaultPlayers =
        this.mode === MODE_SOLO
          ? [{ id: 'P1', username: 'Oyuncu 1' }, { id: 'P2', username: 'Oyuncu 2' }]
          : [
              { id: 'A1', username: 'Oyuncu A1', team: TEAM_A },
              { id: 'B1', username: 'Oyuncu B1', team: TEAM_B },
              { id: 'A2', username: 'Oyuncu A2', team: TEAM_A },
              { id: 'B2', username: 'Oyuncu B2', team: TEAM_B }
            ];

      this.players = normalizePlayers(this.mode, options.players || defaultPlayers);
      this.startingPlayerIndex = options.startingPlayerIndex || 0;

      this.reset();
    }

    on(eventName, handler) {
      if (!this.listeners.has(eventName)) {
        this.listeners.set(eventName, new Set());
      }
      this.listeners.get(eventName).add(handler);
      return () => this.listeners.get(eventName)?.delete(handler);
    }

    emit(eventName, payload) {
      for (const handler of this.listeners.get(eventName) || []) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[PISTI:${eventName}] Hata:`, err);
        }
      }
    }

    reset() {
      this.state = {
        version: 1,
        mode: this.mode,
        status: 'playing',
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
        initialHiddenCardIds: []
      };

      for (const p of this.players) {
        this.state.hands[p.id] = [];
        this.state.captures[p.id] = [];
        this.state.pistis[p.id] = [];
        this.state.bluffBonus[p.id] = 0;
      }

      this.startNewDeck();
      return this.getPublicState();
    }

    startNewDeck() {
      this.state.deck = shuffle(createDeck());
      this.state.table = [];
      this.state.dealNumber = 0;

      this.dealInitialTable();
      this.dealHands();

      this.emit('gameStart', this.getPublicState());
    }

    dealInitialTable() {
      const count = this.rules.initialTableCards;
      for (let i = 0; i < count; i++) {
        this.state.table.push(this.state.deck.pop());
      }
      this.emit('initialTable', { count: this.state.table.length });
    }

    dealHands() {
      if (this.state.deck.length === 0) return;

      const handSize = this.rules.cardsPerDeal;
      this.state.dealNumber += 1;

      for (let round = 0; round < handSize; round++) {
        for (const player of this.players) {
          this.state.hands[player.id].push(this.state.deck.pop());
        }
      }

      this.emit('deal', {
        dealNumber: this.state.dealNumber,
        deckRemaining: this.state.deck.length
      });
    }

    getPublicState() {
      return {
        mode: this.mode,
        status: this.state.status,
        players: clone(this.players),
        tableCount: this.state.table.length,
        dealNumber: this.state.dealNumber
      };
    }
  }

  /**
   * OKEY HALL ANIMATION ENGINE
   */
  class OkeyHallDealer {
    constructor(gameInstance, options = {}) {
      this.game = gameInstance;
      this.containerSelector = options.containerSelector || 'body';
      this.injectStyles();

      if (this.game) {
        this.initEvents();
      }
    }

    injectStyles() {
      if (document.getElementById('pisti-hall-dealer-style')) return;
      const style = document.createElement('style');
      style.id = 'pisti-hall-dealer-style';
      style.textContent = `
        .pisti-hall-flying-card {
          position: fixed !important;
          z-index: 9999999 !important;
          width: 60px !important;
          height: 88px !important;
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%) !important;
          border: 2px solid #ffffff !important;
          border-radius: 8px !important;
          box-shadow: 0 12px 28px rgba(0,0,0,0.6) !important;
          pointer-events: none !important;
          display: block !important;
          opacity: 1 !important;
          box-sizing: border-box !important;
        }
      `;
      document.head.appendChild(style);
    }

    initEvents() {
      const triggerDeal = () => setTimeout(() => this.startHallSequence(), 50);
      this.game.on('deal', triggerDeal);
      this.game.on('gameStart', triggerDeal);
    }

    startHallSequence() {
      const container = document.querySelector(this.containerSelector) || document.body;

      // Başlangıç noktası (Deste konumu)
      const stockEl = document.querySelector('.pisti-stock-card') || 
                      document.querySelector('.deck') || 
                      document.querySelector('#deck');

      let startRect = stockEl ? stockEl.getBoundingClientRect() : null;

      if (!startRect || startRect.width === 0) {
        startRect = {
          left: window.innerWidth / 2 - 30,
          top: window.innerHeight / 2 - 44,
          width: 60,
          height: 88
        };
      }

      // Hedef oyuncu alanları
      let targets = Array.from(document.querySelectorAll('.card, .player-card, .hand-card, .pisti-card'));

      // DOM'da henüz kartlar basılmamışsa ekranın alt/üst/sağ/sol hedeflerini kullan
      if (targets.length === 0) {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const dummyTargets = [
          { left: screenW / 2 - 30, top: screenH - 120 },
          { left: 40, top: screenH / 2 - 44 },
          { left: screenW / 2 - 30, top: 40 },
          { left: screenW - 100, top: screenH / 2 - 44 }
        ];

        dummyTargets.forEach((target, i) => {
          this.flyCard(startRect, target, i * 90);
        });
        return;
      }

      targets.forEach((targetEl, index) => {
        const rect = targetEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this.flyCard(startRect, rect, index * 70);
        }
      });
    }

    flyCard(startRect, endRect, delay = 0) {
      setTimeout(() => {
        const card = document.createElement('div');
        card.className = 'pisti-hall-flying-card';
        card.style.left = `${startRect.left}px`;
        card.style.top = `${startRect.top}px`;

        document.body.appendChild(card);

        const startTime = performance.now();
        const duration = 400; // ms

        const midX = (startRect.left + endRect.left) / 2;
        const midY = (startRect.top + endRect.top) / 2 - 120; // Yay çizme yüksekliği

        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Bezier Eğrisi ile Uçuş
          const t = progress;
          const currentX = (1 - t) * (1 - t) * startRect.left + 2 * (1 - t) * t * midX + t * t * endRect.left;
          const currentY = (1 - t) * (1 - t) * startRect.top + 2 * (1 - t) * t * midY + t * t * endRect.top;
          const rotate = t * 360;

          card.style.left = `${currentX}px`;
          card.style.top = `${currentY}px`;
          card.style.transform = `rotate(${rotate * 0.1}deg)`;

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            card.remove();
          }
        };

        requestAnimationFrame(animate);
      }, delay);
    }
  }

  global.PISTI = Object.freeze({
    MODE_SOLO,
    MODE_TEAM,
    DEFAULT_RULES,
    createDeck,
    PistiGame,
    SoloPisti: class extends PistiGame { constructor(o) { super({ ...o, mode: MODE_SOLO }); } },
    TeamPisti: class extends PistiGame { constructor(o) { super({ ...o, mode: MODE_TEAM }); } },
    OkeyHallDealer
  });

})(typeof window !== 'undefined' ? window : globalThis);
/**
 * Pişti / Okey Hall Tarzı UI Katmanı Animasyon Motoru
 */
class PistiUIAnimator {
  constructor() {
    this.tableScreen = document.querySelector('.pisti-screen');
  }

  /**
   * Merkezdeki destenin anlık ekran konumunu döndürür
   */
  getDeckElement() {
    return document.querySelector('.pisti-deal-deck') || document.querySelector('.pisti-stock-card');
  }

  /**
   * GPU Destekli Tekil Kart Uçuş Animasyonu
   */
  animateCard(fromEl, toEl, config = {}) {
    if (!fromEl || !toEl) return Promise.resolve();

    return new Promise((resolve) => {
      const startRect = fromEl.getBoundingClientRect();
      const endRect = toEl.getBoundingClientRect();

      // Uçan geçici DOM elementi
      const flyingCard = document.createElement('div');
      flyingCard.className = `pisti-hall-flying-card ${config.isFaceAsset ? 'pisti-face-asset' : ''}`;
      
      if (config.assetSrc) {
        const img = document.createElement('img');
        img.src = config.assetSrc;
        flyingCard.appendChild(img);
      }

      // Başlangıç Pozisyonu
      flyingCard.style.left = `${startRect.left}px`;
      flyingCard.style.top = `${startRect.top}px`;
      flyingCard.style.width = `${startRect.width}px`;
      flyingCard.style.height = `${startRect.height}px`;

      document.body.appendChild(flyingCard);

      const deltaX = endRect.left - startRect.left;
      const deltaY = endRect.top - startRect.top;

      // Web Animations API (UI Katmanı Hızlandırması)
      const animation = flyingCard.animate([
        {
          transform: `translate(0, 0) scale(1) rotate(${config.startRotate || 0}deg)`,
          opacity: 1
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(${endRect.width / startRect.width}) rotate(${config.endRotate || 0}deg)`,
          opacity: 1
        }
      ], {
        duration: config.duration || 300,
        easing: config.easing || 'cubic-bezier(0.18, 0.72, 0.24, 1)',
        fill: 'forwards'
      });

      animation.onfinish = () => {
        toEl.classList.add('pisti-deal-visible');
        flyingCard.remove();
        resolve();
      };
    });
  }

  /**
   * 1. MASADAKİ TÜM OYUNCULARA KART DAĞITIMI
   * @param {Object} options - { myCards: ['path/to/card1.png', ...] }
   */
  async startDealSequence(options = {}) {
    const deckEl = this.getDeckElement();
    if (!this.tableScreen || !deckEl) return;

    // CSS'inizdeki dealing modunu açarak asıl kartları gizler
    this.tableScreen.classList.add('dealing');

    // Dağıtım Hedefleri (Üst, Sol, Sağ, Oyuncu Eli)
    const targets = [
      ...document.querySelectorAll('.pisti-opponent.top .pisti-card-fan span'),
      ...document.querySelectorAll('.pisti-opponent.left .pisti-card-fan span'),
      ...document.querySelectorAll('.pisti-opponent.right .pisti-card-fan span'),
      ...document.querySelectorAll('.pisti-hand .card')
    ];

    // Kartları 75ms arayla sırayla uçur
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const isMyCard = target.closest('.pisti-hand');
      const assetSrc = isMyCard && options.myCards ? options.myCards[i % 4] : null;

      this.animateCard(deckEl, target, {
        duration: 320,
        startRotate: 18,
        endRotate: 0,
        isFaceAsset: !!assetSrc,
        assetSrc: assetSrc
      });

      await new Promise(res => setTimeout(res, 75));
    }

    // Dağıtım tamamlanınca 'dealing' modunu kapat
    setTimeout(() => {
      this.tableScreen.classList.remove('dealing');
    }, 350);
  }

  /**
   * 2. OYUNCU VEYA RAKİBİN ORTAYA KART ATMA ANİMASYONU
   * @param {HTMLElement} sourceEl - Kartı atan oyuncunun elindeki kart elementi
   * @param {string} cardAsset - Atılan kartın resmi/yüzü
   */
  async playCardToCenter(sourceEl, cardAsset = null) {
    const centerStack = document.querySelector('.pisti-table-stack') || document.querySelector('.pisti-center');
    if (!sourceEl || !centerStack) return;

    await this.animateCard(sourceEl, centerStack, {
      duration: 250,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      isFaceAsset: !!cardAsset,
      assetSrc: cardAsset
    });
  }
}

// Global olarak erişilebilir başlatıcı
window.pistiAnimator = new PistiUIAnimator();
// Örn: Oyuncunun tıkladığı kart
const clickedCard = document.querySelector('.pisti-hand .card:first-child');

window.pistiAnimator.playCardToCenter(clickedCard, '../assets/games/pisti/final/cards/kupa_a.png');
