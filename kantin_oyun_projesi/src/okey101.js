/**
 * okey101.js
 * KANTİN - 101 Okey oyun motoru
 *
 * Desteklenen modlar:
 *   1) Tekli 101: 4 oyuncu, herkes kendi puanı için oynar.
 *   2) Eşli 101: 4 oyuncu, karşılıklı eşler takım olur (A-B-A-B oturma).
 *
 * Temel yapı:
 * - 106 taş:
 *   1..13 x 4 renk x 2 kopya = 104
 *   + 2 sahte okey.
 * - Gösterge, gerçek taşlardan seçilir.
 * - Okey = göstergenin aynı renkte bir sonraki sayısı (13 -> 1).
 * - Sahte okey, gösterge taşının kendisi gibi değerlendirilir.
 * - Başlayan oyuncu 22 taş, diğerleri 21 taş alır.
 * - Sıra: çek -> (aç / işle) -> taş at.
 * - Normal açılış varsayılanı: en az 101 puan.
 * - Çift açılışı varsayılanı: en az 5 çift.
 *
 * NOT:
 * 101 Okey'de masa/uygulama kuralları değişebildiği için tartışmalı alanlar
 * config üzerinden ayarlanabilir:
 *   openingPoints
 *   pairsToOpen
 *   allowPairOpening
 *   requireTakenDiscardToBeUsed
 *   allowJokerInPairs
 *   scoring
 *
 * Online kullanım:
 * - Taş karıştırma/dağıtma SUNUCUDA yapılmalıdır.
 * - Client'a yalnız kendi eli gönderilmelidir.
 */

(function (global) {
  'use strict';

  const MODE_SOLO = 'solo';
  const MODE_TEAM = 'team';

  const TEAM_A = 'teamA';
  const TEAM_B = 'teamB';

  const COLORS = Object.freeze(['red', 'blue', 'black', 'yellow']);

  const DEFAULT_RULES = Object.freeze({
    profile: 'katlamali-101',
    turnDirection: 'counter-clockwise',
    openingPoints: 101,
    pairsToOpen: 5,
    competitiveOpening: true,
    allowPairOpening: true,
    allowJokerInPairs: true,
    pairOpenerLayoffLimit: 2,
    penalizeInvalidOpening: true,
    invalidOpeningPenalty: 101,
    playableDiscardPenalty: 101,
    okeyDiscardPenalty: 101,
    retrievedOkeyOwnerPenalty: 0,
    allowOkeyRetrieval: true,
    requireFinalDiscard: true,
    cancelWhenAllPlayersOpenPairs: true,

    // Yerden alınan taşın aynı tur açılış/işleme içinde kullanılmasını zorunlu kılar.
    requireTakenDiscardToBeUsed: true,

    // Seri minimum uzunluğu.
    minRunLength: 3,

    // Aynı sayı / farklı renk grup minimum ve maksimum.
    minSetLength: 3,
    maxSetLength: 4,

    // 13'ten sonra 1 devam eden seri YOKTUR.
    allowWrapRuns: false,

    // Varsayılan puan mantığı configurable tutulmuştur.
    scoring: {
      unopenedPenalty: 202,
      pairOpenedMultiplier: 2,
      jokerFinishMultiplier: 2,
      pairFinishMultiplier: 2,
      directFinishMultiplier: 2,

      // Kazananın temel cezası/ödülü.
      winnerScore: -101,

      // Elde kalan taşlar sayı değeriyle sayılır.
      falseJokerValue: null, // null => gerçek okeyin sayı değerini kullan
      jokerValue: 101
    }
  });

  const clone = (obj) =>
    typeof structuredClone === 'function'
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));

  function assertMode(mode) {
    if (mode !== MODE_SOLO && mode !== MODE_TEAM) {
      throw new Error(`Geçersiz 101 modu: ${mode}`);
    }
  }

  function assertColor(color) {
    if (!COLORS.includes(color)) {
      throw new Error(`Geçersiz taş rengi: ${color}`);
    }
  }

  function nextNumber(number) {
    return number === 13 ? 1 : number + 1;
  }

  function tileKey(tile) {
    if (tile.isFalseJoker) return 'false_joker';
    return `${tile.color}_${tile.number}`;
  }

  function createTiles() {
    const tiles = [];
    let serial = 1;

    for (const color of COLORS) {
      for (let number = 1; number <= 13; number++) {
        for (let copy = 1; copy <= 2; copy++) {
          tiles.push({
            id: `T${serial++}`,
            color,
            number,
            copy,
            isFalseJoker: false
          });
        }
      }
    }

    tiles.push({
      id: `T${serial++}`,
      color: null,
      number: null,
      copy: 1,
      isFalseJoker: true
    });

    tiles.push({
      id: `T${serial++}`,
      color: null,
      number: null,
      copy: 2,
      isFalseJoker: true
    });

    return tiles;
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

  function shuffle(array) {
    const arr = [...array];

    for (let i = arr.length - 1; i > 0; i--) {
      const j = secureRandomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
  }

  function normalizePlayers(mode, players) {
    assertMode(mode);

    if (!Array.isArray(players) || players.length !== 4) {
      throw new Error('101 Okey her iki modda da tam olarak 4 oyuncu ister.');
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
        seat: index,
        team,
        connected: p.connected !== false
      };
    });

    if (mode === MODE_TEAM) {
      const a = normalized.filter(p => p.team === TEAM_A).length;
      const b = normalized.filter(p => p.team === TEAM_B).length;

      if (a !== 2 || b !== 2) {
        throw new Error('Eşli 101 modunda her takımda 2 oyuncu olmalı.');
      }

      // Oturma A-B-A-B olmalı; eşler karşılıklı olur.
      for (let i = 0; i < 4; i++) {
        const current = normalized[i];
        const next = normalized[(i + 1) % 4];

        if (current.team === next.team) {
          throw new Error('Eşli 101 oturma düzeni A-B-A-B olmalı.');
        }
      }
    }

    return normalized;
  }

  class Okey101Game {
    constructor(options = {}) {
      this.listeners = new Map();
      this._meldSuggestionCache = new Map();

      this.mode = options.mode || MODE_SOLO;
      assertMode(this.mode);

      this.rules = {
        ...DEFAULT_RULES,
        ...(options.rules || {}),
        scoring: {
          ...DEFAULT_RULES.scoring,
          ...(options.rules?.scoring || {})
        }
      };

      const defaultPlayers =
        this.mode === MODE_SOLO
          ? [
              { id: 'P1', username: 'Oyuncu 1' },
              { id: 'P2', username: 'Oyuncu 2' },
              { id: 'P3', username: 'Oyuncu 3' },
              { id: 'P4', username: 'Oyuncu 4' }
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
          ? ((options.startingPlayerIndex % 4) + 4) % 4
          : 0;

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
          console.error(`[OKEY101:${eventName}] listener hatası`, err);
        }
      }
    }

    getPlayer(playerId) {
      const player = this.players.find(p => p.id === playerId);

      if (!player) {
        throw new Error(`Oyuncu bulunamadı: ${playerId}`);
      }

      return player;
    }

    getCurrentPlayer() {
      return clone(this.players[this.state.currentPlayerIndex]);
    }

    reset() {
      this.state = {
        version: 1,
        mode: this.mode,
        status: 'playing', // playing | finished

        stock: [],
        discardPile: [],
        discardsByPlayer: {},

        indicator: null,
        okey: null,

        hands: {},
        opened: {},
        openType: {}, // null | melds | pairs
        openingScores: {},
        pairOpeningCounts: {},

        // El içindeki kural ihlali cezaları bitiş puanına ayrıca eklenir.
        penalties: {},
        penaltyEvents: [],

        // Oyuncunun masaya kendi açtığı perler.
        tableMelds: {},

        currentPlayerIndex: this.startingPlayerIndex,
        phase: 'discard', // İlk başlayan 22 taşı olduğu için direkt taş atar.

        roundNumber: 1,
        turnNumber: 1,
        lastDraw: null,
        lastDiscard: null,

        // Yerden alınan taşın bu tur kullanılması gerekiyorsa takip edilir.
        forcedUseTileId: null,
        takenDiscardSourcePlayerId: null,
        openedCountAtTurnStart: 0,
        openedThisTurnPlayerId: null,
        turnLayoffCount: 0,

        winnerPlayerId: null,
        finishedWithJoker: false,
        finishedWithPairs: false,
        finishedDirect: false,
        finishType: null,

        scores: null
      };

      for (const p of this.players) {
        this.state.hands[p.id] = [];
        this.state.opened[p.id] = false;
        this.state.openType[p.id] = null;
        this.state.openingScores[p.id] = 0;
        this.state.pairOpeningCounts[p.id] = 0;
        this.state.penalties[p.id] = 0;
        this.state.tableMelds[p.id] = [];
        this.state.discardsByPlayer[p.id] = [];
      }

      this.startRound();
      return this.getPublicState();
    }

    startRound(preShuffledTiles = null) {
      let tiles = preShuffledTiles
        ? clone(preShuffledTiles)
        : shuffle(createTiles());

      this.validateTiles(tiles);

      // Gösterge sahte okey olamaz.
      let indicatorIndex = -1;

      for (let i = tiles.length - 1; i >= 0; i--) {
        if (!tiles[i].isFalseJoker) {
          indicatorIndex = i;
          break;
        }
      }

      if (indicatorIndex === -1) {
        throw new Error('Gösterge seçilemedi.');
      }

      const [indicator] = tiles.splice(indicatorIndex, 1);

      this.state.indicator = indicator;
      this.state.okey = {
        color: indicator.color,
        number: nextNumber(indicator.number)
      };

      this.state.stock = tiles;
      this.state.discardPile = [];
      this.state.discardsByPlayer = {};
      this.state.openingScores = {};
      this.state.pairOpeningCounts = {};
      this.state.penalties = {};
      this.state.penaltyEvents = [];

      for (const p of this.players) {
        this.state.hands[p.id] = [];
        this.state.opened[p.id] = false;
        this.state.openType[p.id] = null;
        this.state.openingScores[p.id] = 0;
        this.state.pairOpeningCounts[p.id] = 0;
        this.state.penalties[p.id] = 0;
        this.state.tableMelds[p.id] = [];
        this.state.discardsByPlayer[p.id] = [];
      }

      // Başlayan oyuncuya 22, diğerlerine 21.
      for (let round = 0; round < 21; round++) {
        for (const p of this.players) {
          this.state.hands[p.id].push(this.drawFromStockInternal());
        }
      }

      this.state.hands[this.players[this.startingPlayerIndex].id]
        .push(this.drawFromStockInternal());

      this.state.currentPlayerIndex = this.startingPlayerIndex;
      this.state.phase = 'discard';
      this.state.turnNumber = 1;
      this.state.lastDraw = null;
      this.state.lastDiscard = null;
      this.state.forcedUseTileId = null;
      this.state.takenDiscardSourcePlayerId = null;
      this.state.openedCountAtTurnStart = 0;
      this.state.openedThisTurnPlayerId = null;
      this.state.turnLayoffCount = 0;
      this.state.status = 'playing';
      this.state.winnerPlayerId = null;
      this.state.finishedWithJoker = false;
      this.state.finishedWithPairs = false;
      this.state.finishedDirect = false;
      this.state.finishType = null;
      this.state.scores = null;

      this.emit('roundStart', {
        indicator: clone(this.state.indicator),
        okey: clone(this.state.okey),
        currentPlayer: this.getCurrentPlayer(),
        stockCount: this.state.stock.length
      });
    }

    /**
     * Yeni elde başlangıç hakkı masa sırasındaki bir sonraki oyuncuya geçer.
     */
    startNextRound(preShuffledTiles = null) {
      if (this.state.status === 'playing') {
        throw new Error('Devam eden el bitmeden yeni el başlatılamaz.');
      }

      const step = this.rules.turnDirection === 'clockwise' ? -1 : 1;
      this.startingPlayerIndex = (this.startingPlayerIndex + step + 4) % 4;
      this.state.roundNumber = (this.state.roundNumber || 1) + 1;
      this.startRound(preShuffledTiles);
      return this.getPublicState();
    }

    validateTiles(tiles) {
      if (!Array.isArray(tiles) || tiles.length !== 106) {
        throw new Error('101 Okey seti 106 taş olmalı.');
      }

      const ids = new Set();

      for (const tile of tiles) {
        if (!tile?.id) throw new Error('Geçersiz taş.');

        if (ids.has(tile.id)) {
          throw new Error(`Tekrarlanan taş id: ${tile.id}`);
        }

        ids.add(tile.id);

        if (tile.isFalseJoker) continue;

        assertColor(tile.color);

        if (!Number.isInteger(tile.number) || tile.number < 1 || tile.number > 13) {
          throw new Error(`Geçersiz taş sayısı: ${tile.number}`);
        }
      }
    }

    isOkey(tile) {
      if (!tile || tile.isFalseJoker) return false;

      return (
        tile.color === this.state.okey.color &&
        tile.number === this.state.okey.number
      );
    }

    /**
     * Taşın normal mantıksal değerini döndürür.
      * Sahte okey, gerçek okeyin renk ve sayısını taşıyan normal taştır.
     * Gerçek okey, joker olarak `isJoker=true` döner.
     */
    resolveTile(tile) {
      if (tile.isFalseJoker) {
        return {
          id: tile.id,
          color: this.state.okey.color,
          number: this.state.okey.number,
          isJoker: false,
          isFalseJoker: true
        };
      }

      if (this.isOkey(tile)) {
        return {
          id: tile.id,
          color: tile.color,
          number: tile.number,
          isJoker: true,
          isFalseJoker: false
        };
      }

      return {
        id: tile.id,
        color: tile.color,
        number: tile.number,
        isJoker: false,
        isFalseJoker: false
      };
    }

    drawFromStockInternal() {
      if (this.state.stock.length === 0) {
        throw new Error('Ortadaki taşlar bitti.');
      }

      return this.state.stock.pop();
    }

    assertTurn(playerId) {
      if (this.state.status !== 'playing') {
        throw new Error('Oyun bitmiş.');
      }

      const current = this.players[this.state.currentPlayerIndex];

      if (current.id !== playerId) {
        throw new Error(`Sıra ${current.username} oyuncusunda.`);
      }

      return current;
    }

    drawFromStock(playerId) {
      this.assertTurn(playerId);

      if (this.state.phase !== 'draw') {
        throw new Error('Şu anda taş çekme aşaması değil.');
      }

      if (this.state.stock.length === 0) {
        this.finishNoWinner();
        return null;
      }

      const tile = this.drawFromStockInternal();

      this.state.hands[playerId].push(tile);
      this.state.phase = 'play';
      this.state.lastDraw = {
        source: 'stock',
        tileId: tile.id,
        playerId
      };
      this.state.forcedUseTileId = null;
      this.state.takenDiscardSourcePlayerId = null;

      this.emit('draw', {
        playerId,
        source: 'stock',
        tile: clone(tile),
        stockCount: this.state.stock.length
      });

      return clone(tile);
    }

    takeDiscard(playerId) {
      this.assertTurn(playerId);

      if (this.state.phase !== 'draw') {
        throw new Error('Şu anda yerden taş alma aşaması değil.');
      }

      if (this.state.discardPile.length === 0) {
        throw new Error('Yerde alınacak taş yok.');
      }

      const tile = this.state.discardPile.pop();
      const discardOwner=this.state.lastDiscard?.playerId;
      if(discardOwner&&this.state.discardsByPlayer?.[discardOwner])this.state.discardsByPlayer[discardOwner].pop();

      this.state.hands[playerId].push(tile);
      this.state.phase = 'play';
      this.state.lastDraw = {
        source: 'discard',
        tileId: tile.id,
        playerId
      };

      this.state.forcedUseTileId =
        this.rules.requireTakenDiscardToBeUsed
          ? tile.id
          : null;
      this.state.takenDiscardSourcePlayerId = discardOwner || null;

      this.emit('draw', {
        playerId,
        source: 'discard',
        tile: clone(tile),
        stockCount: this.state.stock.length
      });

      return clone(tile);
    }

    returnTakenDiscard(playerId) {
      this.assertTurn(playerId);

      const tileId = this.state.forcedUseTileId;
      const sourcePlayerId = this.state.takenDiscardSourcePlayerId;
      const lastDraw = this.state.lastDraw;

      if (
        this.state.phase !== 'play' ||
        !tileId ||
        lastDraw?.source !== 'discard' ||
        lastDraw.playerId !== playerId ||
        lastDraw.tileId !== tileId ||
        !sourcePlayerId
      ) {
        throw new Error('Geri bırakılabilecek bir yerden alınmış taş yok.');
      }

      const hand = this.state.hands[playerId];
      const index = hand.findIndex(tile => tile.id === tileId);
      if (index === -1) {
        throw new Error('Geri bırakılacak taş ıstakada bulunamadı.');
      }

      const [tile] = hand.splice(index, 1);
      this.state.discardPile.push(tile);
      if (!this.state.discardsByPlayer[sourcePlayerId]) {
        this.state.discardsByPlayer[sourcePlayerId] = [];
      }
      this.state.discardsByPlayer[sourcePlayerId].push(clone(tile));
      this.state.phase = 'draw';
      this.state.lastDraw = null;
      this.state.forcedUseTileId = null;
      this.state.takenDiscardSourcePlayerId = null;

      this.emit('returnDiscard', {
        playerId,
        sourcePlayerId,
        tile: clone(tile)
      });

      return clone(tile);
    }

    /**
     * Meld tipini otomatik tanır:
     * - run: aynı renk ardışık en az 3
     * - set: aynı sayı farklı renk 3 veya 4
     *
     * Okey joker olabilir.
     */
    validateMeld(tileIds, playerId) {
      const hand = this.state.hands[playerId];
      const tiles = tileIds.map(id => {
        const tile = hand.find(t => t.id === id);
        if (!tile) throw new Error(`Taş elde yok: ${id}`);
        return tile;
      });

      if (tiles.length < 3) {
        return { valid: false, reason: 'Per en az 3 taş olmalı.' };
      }

      const run = this.validateRun(tiles);
      if (run.valid) return run;

      const set = this.validateSet(tiles);
      if (set.valid) return set;

      return {
        valid: false,
        reason: 'Taşlar geçerli seri veya grup oluşturmuyor.'
      };
    }

    validateRun(tiles) {
      if (tiles.length < this.rules.minRunLength) {
        return { valid: false };
      }

      const resolved = tiles.map(t => this.resolveTile(t));
      const jokers = resolved.filter(t => t.isJoker);
      const normals = resolved.filter(t => !t.isJoker);

      if (normals.length === 0) {
        return { valid: false, reason: 'Tamamı okey olan seri kabul edilmez.' };
      }

      const color = normals[0].color;

      if (!normals.every(t => t.color === color)) {
        return { valid: false };
      }

      const numbers = normals
        .map(t => t.number)
        .sort((a, b) => a - b);

      // Aynı sayının tekrarı seri içinde olamaz.
      if (new Set(numbers).size !== numbers.length) {
        return { valid: false };
      }

      if (this.rules.allowWrapRuns) {
        // Bu sürüm varsayılan olarak kapalıdır.
        // İstenirse genişletilebilir.
      }

      // Jokerleri aradaki eksikleri dolduracak şekilde hesapla.
      let gaps = 0;

      for (let i = 1; i < numbers.length; i++) {
        const diff = numbers[i] - numbers[i - 1];

        if (diff <= 0) return { valid: false };
        gaps += diff - 1;
      }

      if (gaps > jokers.length) {
        return { valid: false };
      }

      const unusedJokers = jokers.length - gaps;

      // Kalan jokerler serinin başına/sonuna eklenebilmeli.
      const minPossible = numbers[0] - unusedJokers;
      const maxPossible = numbers[numbers.length - 1] + unusedJokers;

      if (minPossible < 1 && maxPossible > 13) {
        return { valid: false };
      }

      // Serinin olası en iyi yerleşimini bul.
      let start = numbers[0] - Math.min(unusedJokers, numbers[0] - 1);
      let end = start + tiles.length - 1;

      if (end > 13) {
        const overflow = end - 13;
        start -= overflow;
        end -= overflow;
      }

      if (start < 1 || end > 13) {
        return { valid: false };
      }

      const pointValue = this.calculateMeldPoints({
        type: 'run',
        tiles,
        runStart: start,
        runEnd: end,
        color
      });

      return {
        valid: true,
        type: 'run',
        color,
        runStart: start,
        runEnd: end,
        tiles: clone(tiles),
        points: pointValue
      };
    }

    validateSet(tiles) {
      if (
        tiles.length < this.rules.minSetLength ||
        tiles.length > this.rules.maxSetLength
      ) {
        return { valid: false };
      }

      const resolved = tiles.map(t => this.resolveTile(t));
      const jokers = resolved.filter(t => t.isJoker);
      const normals = resolved.filter(t => !t.isJoker);

      if (normals.length === 0) {
        return { valid: false, reason: 'Tamamı okey olan grup kabul edilmez.' };
      }

      const number = normals[0].number;

      if (!normals.every(t => t.number === number)) {
        return { valid: false };
      }

      const colors = normals.map(t => t.color);

      if (new Set(colors).size !== colors.length) {
        return { valid: false };
      }

      if (colors.length + jokers.length > 4) {
        return { valid: false };
      }

      const pointValue = number * tiles.length;

      return {
        valid: true,
        type: 'set',
        number,
        tiles: clone(tiles),
        points: pointValue
      };
    }

    calculateMeldPoints(meld) {
      if (meld.type === 'set') {
        return meld.number * meld.tiles.length;
      }

      if (meld.type === 'run') {
        let sum = 0;

        for (let n = meld.runStart; n <= meld.runEnd; n++) {
          sum += n;
        }

        return sum;
      }

      return 0;
    }

    validatePair(tileA, tileB) {
      const a = this.resolveTile(tileA);
      const b = this.resolveTile(tileB);

      if (!this.rules.allowJokerInPairs && (a.isJoker || b.isJoker)) {
        return false;
      }

      // İki gerçek aynı taş.
      if (!a.isJoker && !b.isJoker) {
        return a.color === b.color && a.number === b.number;
      }

      // En az biri jokerse eş tamamlanabilir.
      return true;
    }

    addPenalty(playerId, points, reason, details = null) {
      this.getPlayer(playerId);
      const amount = Number(points);

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Ceza puanı geçersiz.');
      }

      if (!this.state.penalties) this.state.penalties = {};
      if (!this.state.penaltyEvents) this.state.penaltyEvents = [];
      this.state.penalties[playerId] = (this.state.penalties[playerId] || 0) + amount;

      const event = {
        playerId,
        points: amount,
        reason,
        turnNumber: this.state.turnNumber,
        details: details ? clone(details) : null
      };

      this.state.penaltyEvents.push(event);
      this.emit('penalty', clone(event));
      return clone(event);
    }

    invalidOpeningError(playerId, message) {
      const error = new Error(message);

      if (this.rules.penalizeInvalidOpening) {
        this.addPenalty(
          playerId,
          this.rules.invalidOpeningPenalty,
          'invalid-opening',
          { message }
        );
        error.penaltyApplied = true;
      }

      return error;
    }

    openingTarget() {
      if (!this.rules.competitiveOpening) return this.rules.openingPoints;
      const highest = Math.max(0, ...Object.values(this.state.openingScores || {}));
      return Math.max(this.rules.openingPoints, highest > 0 ? highest + 1 : 0);
    }

    pairOpeningTarget() {
      if (!this.rules.competitiveOpening) return this.rules.pairsToOpen;
      const highest = Math.max(
        0,
        ...Object.values(this.state.pairOpeningCounts || {})
      );
      return Math.max(this.rules.pairsToOpen, highest > 0 ? highest + 1 : 0);
    }

    suggestMeldGroups(playerId) {
      this.getPlayer(playerId);
      const hand = this.state.hands[playerId];
      const cacheKey = [
        playerId,
        this.state.okey.color,
        this.state.okey.number,
        ...hand.map(tile => tile.id).sort()
      ].join('|');
      const cached = this._meldSuggestionCache.get(cacheKey);
      if (cached) return clone(cached);

      const byId = new Map(hand.map((tile, index) => [tile.id, { tile, index }]));
      const normals = [];
      const jokers = [];
      for (const tile of hand) {
        const resolved = this.resolveTile(tile);
        (resolved.isJoker ? jokers : normals).push({ tile, resolved });
      }

      const candidates = [];
      const seenMasks = new Set();
      const addCandidate = ids => {
        const mask = ids.reduce(
          (value, id) => value | (1n << BigInt(byId.get(id).index)),
          0n
        );
        const key = mask.toString();
        if (seenMasks.has(key)) return;
        const validation = this.validateMeld(ids, playerId);
        if (!validation.valid) return;
        seenMasks.add(key);
        candidates.push({ ids: [...ids], mask, points: validation.points });
      };

      // Uzun seriler 3, 4 ve 5 taşlık geçerli parçalara ayrılabildiği için
      // bu uzunluklar bütün olası toplamı kayıpsız kapsar.
      for (const color of COLORS) {
        const byNumber = new Map();
        for (const item of normals) {
          if (item.resolved.color !== color) continue;
          const list = byNumber.get(item.resolved.number) || [];
          list.push(item.tile);
          byNumber.set(item.resolved.number, list);
        }

        for (let length = 3; length <= 5; length++) {
          for (let start = 1; start + length - 1 <= 13; start++) {
            const buildRun = (offset, ids, usedJokers) => {
              if (offset === length) {
                addCandidate(ids);
                return;
              }
              const number = start + offset;
              for (const tile of byNumber.get(number) || []) {
                buildRun(offset + 1, [...ids, tile.id], usedJokers);
              }
              for (const joker of jokers) {
                if (!usedJokers.has(joker.tile.id)) {
                  const next = new Set(usedJokers);
                  next.add(joker.tile.id);
                  buildRun(offset + 1, [...ids, joker.tile.id], next);
                }
              }
            };
            buildRun(0, [], new Set());
          }
        }
      }

      const chooseColors = (start, count, chosen, visit) => {
        if (chosen.length === count) return visit(chosen);
        for (let i = start; i <= COLORS.length - (count - chosen.length); i++) {
          chooseColors(i + 1, count, [...chosen, COLORS[i]], visit);
        }
      };

      for (let number = 1; number <= 13; number++) {
        const byColor = new Map();
        for (const item of normals) {
          if (item.resolved.number !== number) continue;
          const list = byColor.get(item.resolved.color) || [];
          list.push(item.tile);
          byColor.set(item.resolved.color, list);
        }

        for (const size of [3, 4]) {
          chooseColors(0, size, [], colors => {
            const buildSet = (offset, ids, usedJokers) => {
              if (offset === colors.length) {
                addCandidate(ids);
                return;
              }
              for (const tile of byColor.get(colors[offset]) || []) {
                buildSet(offset + 1, [...ids, tile.id], usedJokers);
              }
              for (const joker of jokers) {
                if (!usedJokers.has(joker.tile.id)) {
                  const next = new Set(usedJokers);
                  next.add(joker.tile.id);
                  buildSet(offset + 1, [...ids, joker.tile.id], next);
                }
              }
            };
            buildSet(0, [], new Set());
          });
        }
      }

      const candidatesByTile = hand.map(() => []);
      candidates.forEach((candidate, candidateIndex) => {
        for (let i = 0; i < hand.length; i++) {
          if (candidate.mask & (1n << BigInt(i))) {
            candidatesByTile[i].push(candidateIndex);
          }
        }
      });

      const memo = new Map();
      const solve = availableMask => {
        const key = availableMask.toString();
        if (memo.has(key)) return memo.get(key);

        let pivot = -1;
        let options = null;
        for (let i = 0; i < hand.length; i++) {
          const bit = 1n << BigInt(i);
          if (!(availableMask & bit)) continue;
          const usable = candidatesByTile[i].filter(index => {
            const mask = candidates[index].mask;
            return (mask & availableMask) === mask;
          });
          if (usable.length && (!options || usable.length < options.length)) {
            pivot = i;
            options = usable;
          }
        }

        if (pivot < 0) {
          const empty = { points: 0, groups: [] };
          memo.set(key, empty);
          return empty;
        }

        const pivotBit = 1n << BigInt(pivot);
        let best = solve(availableMask & ~pivotBit);
        for (const index of options) {
          const candidate = candidates[index];
          const tail = solve(availableMask & ~candidate.mask);
          const points = candidate.points + tail.points;
          if (points > best.points) {
            best = { points, groups: [candidate.ids, ...tail.groups] };
          }
        }
        memo.set(key, best);
        return best;
      };

      // Açılıştan sonra atılacak en az bir taş elde kalmalıdır.
      const fullMask = (1n << BigInt(hand.length)) - 1n;
      let best = { points: 0, groups: [] };
      for (let i = 0; i < hand.length; i++) {
        const result = solve(fullMask & ~(1n << BigInt(i)));
        if (result.points > best.points) best = result;
      }

      if (this._meldSuggestionCache.size > 63) this._meldSuggestionCache.clear();
      this._meldSuggestionCache.set(cacheKey, clone(best.groups));
      return clone(best.groups);
    }

    openingPotential(playerId) {
      const groups = this.suggestMeldGroups(playerId);
      const points = groups.reduce(
        (sum, group) => sum + this.validateMeld(group, playerId).points,
        0
      );
      return { points, groups: clone(groups) };
    }

    suggestPairGroups(playerId) {
      this.getPlayer(playerId);
      const hand = this.state.hands[playerId];
      const map = new Map();
      const jokers = [];
      const groups = [];

      for (const tile of hand) {
        const resolved = this.resolveTile(tile);
        if (resolved.isJoker) {
          jokers.push(tile.id);
          continue;
        }
        const key = `${resolved.color}:${resolved.number}`;
        const list = map.get(key) || [];
        list.push(tile.id);
        map.set(key, list);
      }

      const singles = [];
      for (const list of map.values()) {
        while (list.length >= 2) groups.push(list.splice(0, 2));
        if (list.length === 1) singles.push(list[0]);
      }

      while (this.rules.allowJokerInPairs && jokers.length && singles.length) {
        groups.push([singles.shift(), jokers.shift()]);
      }
      if (this.rules.allowJokerInPairs && jokers.length >= 2) {
        groups.push([jokers.shift(), jokers.shift()]);
      }

      return groups.slice(0, Math.floor((hand.length - 1) / 2));
    }

    pairPotential(playerId) {
      const groups = this.suggestPairGroups(playerId);
      return { count: groups.length, groups: clone(groups) };
    }

    autoOpenMelds(playerId) {
      const groups = this.suggestMeldGroups(playerId);
      return this.openMelds(playerId, groups);
    }

    autoOpenPairs(playerId) {
      return this.openPairs(playerId, this.suggestPairGroups(playerId));
    }

    /**
     * Oyuncunun bu turda masadaki mevcut bir pere tek başına
     * işleyebileceği taşları döndürür. Arayüz bu listeyi yalnızca
     * görsel yardım için kullanır; asıl işlem yine addToMeld ile doğrulanır.
     */
    layoffCandidateTileIds(playerId) {
      this.getPlayer(playerId);

      const currentPlayer = this.players[this.state.currentPlayerIndex];
      if (
        this.state.status !== 'playing' ||
        currentPlayer?.id !== playerId ||
        !this.state.opened[playerId] ||
        (this.state.phase !== 'play' && this.state.phase !== 'discard')
      ) {
        return [];
      }

      const hand = this.state.hands[playerId];
      const forcedTileId = this.state.forcedUseTileId;
      const candidates = [];

      for (const tile of hand) {
        if (forcedTileId && tile.id !== forcedTileId) continue;

        let playable = false;
        for (const owner of Object.keys(this.state.tableMelds || {})) {
          for (const meld of this.state.tableMelds[owner]) {
            const canRetrieveOkey =
              this.rules.allowOkeyRetrieval &&
              this.findOkeyReplacementIndex(meld, tile) !== -1;

            if (canRetrieveOkey) {
              playable = true;
              break;
            }

            // Çift alanına iki taş birlikte işlenir; tek taş yardımına dahil değildir.
            if (meld.type === 'pair' || hand.length <= 1) continue;

            if (
              this.state.openType[playerId] === 'pairs' &&
              this.state.turnLayoffCount + 1 > this.rules.pairOpenerLayoffLimit
            ) {
              continue;
            }

            const combined = [...meld.tiles, tile];
            const validation = meld.type === 'run'
              ? this.validateRun(combined)
              : this.validateSet(combined);

            if (validation.valid) {
              playable = true;
              break;
            }
          }
          if (playable) break;
        }

        if (playable) candidates.push(tile.id);
      }

      return candidates;
    }

    autoLayoff(playerId) {
      if (!this.state.opened[playerId]) {
        throw new Error('Taş işlemek için önce açmalısın.');
      }

      let count = 0;
      let progress = true;

      while (progress && this.state.hands[playerId].length > 1) {
        progress = false;
        const hand = this.state.hands[playerId];
        const forced = this.state.forcedUseTileId;
        const ids = hand.map(tile => tile.id).sort((a, b) =>
          a === forced ? -1 : b === forced ? 1 : 0
        );

        outer:
        for (const owner of Object.keys(this.state.tableMelds)) {
          for (const meld of this.state.tableMelds[owner]) {
            if (meld.type === 'pair') {
              // Önce çift içindeki okeyin gerçek karşılığını arar.
              for (const id of ids) {
                const tile = hand.find(candidate => candidate.id === id);
                if (this.findOkeyReplacementIndex(meld, tile) !== -1) {
                  this.addToMeld(playerId, owner, meld.id, [id]);
                  count += 1;
                  progress = true;
                  break outer;
                }
              }

              if (hand.length < 3) continue;
              const pairCandidates = [];
              for (let first = 0; first < ids.length; first++) {
                for (let second = first + 1; second < ids.length; second++) {
                  const pairIds = [ids[first], ids[second]];
                  const a = hand.find(tile => tile.id === pairIds[0]);
                  const b = hand.find(tile => tile.id === pairIds[1]);
                  if (this.validatePair(a, b)) pairCandidates.push(pairIds);
                }
              }
              pairCandidates.sort((a, b) =>
                Number(b.includes(forced)) - Number(a.includes(forced))
              );
              if (pairCandidates.length) {
                this.addToMeld(playerId, owner, meld.id, pairCandidates[0]);
                count += 2;
                progress = true;
                break outer;
              }
              continue;
            }

            if (
              this.state.openType[playerId] === 'pairs' &&
              this.state.turnLayoffCount >= this.rules.pairOpenerLayoffLimit
            ) {
              continue;
            }

            for (const id of ids) {
              const tile = hand.find(candidate => candidate.id === id);
              const canRetrieve = this.findOkeyReplacementIndex(meld, tile) !== -1;
              const combined = [...meld.tiles, tile];
              const validation = meld.type === 'run'
                ? this.validateRun(combined)
                : this.validateSet(combined);
              if (canRetrieve || validation.valid) {
                this.addToMeld(playerId, owner, meld.id, [id]);
                count += 1;
                progress = true;
                break outer;
              }
            }
          }
        }
      }

      if (!count) {
        throw new Error('Istakadaki taşlardan hiçbiri masadaki perlere işlenemiyor.');
      }
      return { count };
    }

    /**
     * Normal açılış.
     * meldGroups = [
     *   [tileId, tileId, tileId],
     *   [tileId, tileId, tileId, tileId]
     * ]
     */
    openMelds(playerId, meldGroups) {
      this.assertTurn(playerId);

      if (this.state.phase !== 'play' && this.state.phase !== 'discard') {
        throw new Error('Şu anda per açma aşaması değil.');
      }

      if (this.state.opened[playerId]) {
        if (this.state.openType[playerId] === 'pairs') {
          throw new Error('Çift açan oyuncu yeni seri açamaz.');
        }
        return this.layNewMelds(playerId, meldGroups);
      }

      if (!Array.isArray(meldGroups) || meldGroups.length === 0) {
        throw this.invalidOpeningError(playerId, 'En az bir per gerekli.');
      }

      const allIds = meldGroups.flat();

      if (new Set(allIds).size !== allIds.length) {
        throw this.invalidOpeningError(
          playerId,
          'Aynı taş birden fazla perde kullanılamaz.'
        );
      }

      const validations = meldGroups.map(group =>
        this.validateMeld(group, playerId)
      );

      const invalid = validations.find(v => !v.valid);

      if (invalid) {
        throw this.invalidOpeningError(
          playerId,
          invalid.reason || 'Geçersiz per.'
        );
      }

      const totalPoints = validations.reduce(
        (sum, m) => sum + m.points,
        0
      );

      const openingTarget = this.openingTarget();
      if (totalPoints < openingTarget) {
        throw this.invalidOpeningError(
          playerId,
          `Katlamalı açılış toplamı en az ${openingTarget} olmalı. Mevcut: ${totalPoints}`
        );
      }

      this.requireForcedTileUsed(allIds);
      this.requireFinishTileRemains(playerId, allIds.length);

      for (const validation of validations) {
        const removed = this.removeTilesFromHand(
          playerId,
          validation.tiles.map(t => t.id)
        );

        this.state.tableMelds[playerId].push({
          id: this.makeMeldId(),
          ownerPlayerId: playerId,
          type: validation.type,
          tiles: removed
        });
      }

      this.state.opened[playerId] = true;
      this.state.openedThisTurnPlayerId = playerId;
      if (!this.state.openingScores) this.state.openingScores = {};
      this.state.openingScores[playerId] = totalPoints;
      this.state.openType[playerId] = 'melds';
      this.state.forcedUseTileId = null;
      this.state.phase = 'discard';

      this.emit('opened', {
        playerId,
        type: 'melds',
        totalPoints,
        melds: clone(this.state.tableMelds[playerId])
      });

      return {
        type: 'melds',
        totalPoints
      };
    }

    /**
     * Seri açmış oyuncu sonraki turlarda yeni perler koyabilir.
     * Bunlar yeniden katlamalı açılış barajına tabi değildir.
     */
    layNewMelds(playerId, meldGroups) {
      this.assertTurn(playerId);

      if (!this.state.opened[playerId] || this.state.openType[playerId] !== 'melds') {
        throw new Error('Yeni per koymak için seri açmış olmalısın.');
      }

      if (this.state.phase !== 'play' && this.state.phase !== 'discard') {
        throw new Error('Şu anda per koyma aşaması değil.');
      }

      if (!Array.isArray(meldGroups) || meldGroups.length === 0) {
        throw new Error('En az bir per gerekli.');
      }

      const allIds = meldGroups.flat();
      if (new Set(allIds).size !== allIds.length) {
        throw new Error('Aynı taş birden fazla perde kullanılamaz.');
      }

      const validations = meldGroups.map(group => this.validateMeld(group, playerId));
      const invalid = validations.find(v => !v.valid);
      if (invalid) throw new Error(invalid.reason || 'Geçersiz per.');

      this.requireForcedTileUsed(allIds);
      this.requireFinishTileRemains(playerId, allIds.length);

      for (const validation of validations) {
        const removed = this.removeTilesFromHand(
          playerId,
          validation.tiles.map(t => t.id)
        );
        this.state.tableMelds[playerId].push({
          id: this.makeMeldId(),
          ownerPlayerId: playerId,
          type: validation.type,
          tiles: removed
        });
      }

      if (this.state.forcedUseTileId && allIds.includes(this.state.forcedUseTileId)) {
        this.state.forcedUseTileId = null;
      }
      this.state.phase = 'discard';

      this.emit('meldsAdded', {
        playerId,
        melds: clone(validations)
      });

      return {
        type: 'melds-added',
        meldCount: validations.length
      };
    }

    /**
     * Çift açılışı: varsayılan 5 çift.
     * pairGroups = [[id,id],[id,id],...]
     */
    openPairs(playerId, pairGroups) {
      this.assertTurn(playerId);

      if (!this.rules.allowPairOpening) {
        throw new Error('Çift açma bu masada kapalı.');
      }

      if (this.state.opened[playerId]) {
        throw new Error('Oyuncu zaten açmış.');
      }

      const pairOpeningTarget = this.pairOpeningTarget();
      if (!Array.isArray(pairGroups) || pairGroups.length < pairOpeningTarget) {
        throw this.invalidOpeningError(
          playerId,
          `Katlamalı çift açılışı için en az ${pairOpeningTarget} çift gerekir.`
        );
      }

      const allIds = pairGroups.flat();

      if (new Set(allIds).size !== allIds.length) {
        throw this.invalidOpeningError(
          playerId,
          'Aynı taş birden fazla çiftte kullanılamaz.'
        );
      }

      const hand = this.state.hands[playerId];

      for (const pair of pairGroups) {
        if (!Array.isArray(pair) || pair.length !== 2) {
          throw this.invalidOpeningError(
            playerId,
            'Her çift tam olarak 2 taştan oluşmalı.'
          );
        }

        const a = hand.find(t => t.id === pair[0]);
        const b = hand.find(t => t.id === pair[1]);

        if (!a || !b || !this.validatePair(a, b)) {
          throw this.invalidOpeningError(playerId, 'Geçersiz çift bulundu.');
        }
      }

      this.requireForcedTileUsed(allIds);
      this.requireFinishTileRemains(playerId, allIds.length);

      for (const pair of pairGroups) {
        const removed = this.removeTilesFromHand(playerId, pair);

        this.state.tableMelds[playerId].push({
          id: this.makeMeldId(),
          ownerPlayerId: playerId,
          type: 'pair',
          tiles: removed
        });
      }

      this.state.opened[playerId] = true;
      this.state.openedThisTurnPlayerId = playerId;
      if (!this.state.pairOpeningCounts) this.state.pairOpeningCounts = {};
      this.state.pairOpeningCounts[playerId] = pairGroups.length;
      this.state.openType[playerId] = 'pairs';
      this.state.forcedUseTileId = null;
      this.state.phase = 'discard';

      this.emit('opened', {
        playerId,
        type: 'pairs',
        pairCount: pairGroups.length
      });

      if (
        this.rules.cancelWhenAllPlayersOpenPairs &&
        this.players.every(p => this.state.openType[p.id] === 'pairs')
      ) {
        this.finishCancelledRound('all-players-opened-pairs');
      }

      return {
        type: 'pairs',
        pairCount: pairGroups.length
      };
    }

    requireForcedTileUsed(usedIds) {
      if (
        this.state.forcedUseTileId &&
        !usedIds.includes(this.state.forcedUseTileId)
      ) {
        throw new Error(
          'Yerden alınan taş bu tur açılış/işleme içinde kullanılmak zorunda.'
        );
      }
    }

    requireFinishTileRemains(playerId, usedCount) {
      if (
        this.rules.requireFinalDiscard &&
        this.state.hands[playerId].length - usedCount < 1
      ) {
        throw new Error('Oyunu bitirmek için elde atılacak son bir taş kalmalı.');
      }
    }

    removeTilesFromHand(playerId, ids) {
      const hand = this.state.hands[playerId];
      const removed = [];

      for (const id of ids) {
        const index = hand.findIndex(t => t.id === id);

        if (index === -1) {
          throw new Error(`Taş elde bulunamadı: ${id}`);
        }

        removed.push(hand.splice(index, 1)[0]);
      }

      return removed;
    }

    makeMeldId() {
      return `M${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Açmış oyuncu masadaki bir pere taş işler.
     * Bu sürümde hedef per yeniden doğrulanır.
     */
    addToMeld(playerId, targetOwnerId, meldId, tileIds) {
      this.assertTurn(playerId);

      if (!this.state.opened[playerId]) {
        throw new Error('Taş işlemek için önce açmalısın.');
      }

      if (this.state.phase !== 'play' && this.state.phase !== 'discard') {
        throw new Error('Şu anda taş işleme aşaması değil.');
      }

      const meld = this.state.tableMelds[targetOwnerId]?.find(
        m => m.id === meldId
      );

      if (!meld) {
        throw new Error('Hedef per bulunamadı.');
      }

      const hand = this.state.hands[playerId];
      const added = tileIds.map(id => {
        const tile = hand.find(t => t.id === id);
        if (!tile) throw new Error(`Taş elde bulunamadı: ${id}`);
        return tile;
      });

      if (new Set(tileIds).size !== tileIds.length) {
        throw new Error('Aynı taş birden fazla kez işlenemez.');
      }

      if (
        added.length === 1 &&
        this.findOkeyReplacementIndex(meld, added[0]) !== -1
      ) {
        return this.retrieveOkey(playerId, targetOwnerId, meldId, tileIds[0]);
      }

      if (meld.type === 'pair') {
        if (added.length !== 2 || !this.validatePair(added[0], added[1])) {
          throw new Error('Çift alanına yalnızca geçerli bir çift işlenebilir.');
        }

        this.requireForcedTileUsed(tileIds);
        this.requireFinishTileRemains(playerId, tileIds.length);
        const removedPair = this.removeTilesFromHand(playerId, tileIds);
        meld.tiles.push(...removedPair);

        if (this.state.forcedUseTileId && tileIds.includes(this.state.forcedUseTileId)) {
          this.state.forcedUseTileId = null;
        }
        this.state.phase = 'discard';

        this.emit('layoff', {
          playerId,
          targetOwnerId,
          meldId,
          tileIds: [...tileIds],
          type: 'pair'
        });

        return clone(meld);
      }

      if (
        this.state.openType[playerId] === 'pairs' &&
        this.state.turnLayoffCount + tileIds.length > this.rules.pairOpenerLayoffLimit
      ) {
        throw new Error(
          `Çift açan oyuncu bir turda serilere en fazla ${this.rules.pairOpenerLayoffLimit} taş işleyebilir.`
        );
      }

      const combined = [...meld.tiles, ...added];

      let validation;

      if (meld.type === 'run') {
        validation = this.validateRun(combined);
      } else {
        validation = this.validateSet(combined);
      }

      if (!validation.valid) {
        throw new Error('Bu taşlar hedef pere işlenemez.');
      }

      this.requireForcedTileUsed(tileIds);
      this.requireFinishTileRemains(playerId, tileIds.length);

      const removed = this.removeTilesFromHand(playerId, tileIds);
      meld.tiles.push(...removed);
      this.state.turnLayoffCount += tileIds.length;

      if (this.state.forcedUseTileId && tileIds.includes(this.state.forcedUseTileId)) {
        this.state.forcedUseTileId = null;
      }

      this.state.phase = 'discard';

      this.emit('layoff', {
        playerId,
        targetOwnerId,
        meldId,
        tileIds: [...tileIds]
      });

      return clone(meld);
    }

    findOkeyReplacementIndex(meld, replacementTile) {
      const replacement = this.resolveTile(replacementTile);
      if (replacement.isJoker) return -1;

      for (let index = 0; index < meld.tiles.length; index++) {
        if (!this.isOkey(meld.tiles[index])) continue;

        if (meld.type === 'pair') {
          const pairStart = Math.floor(index / 2) * 2;
          const mate = meld.tiles[pairStart + (index === pairStart ? 1 : 0)];
          if (mate && this.validatePair(replacementTile, mate)) return index;
          continue;
        }

        const candidate = meld.tiles.map((tile, tileIndex) =>
          tileIndex === index ? replacementTile : tile
        );
        const validation =
          meld.type === 'run'
            ? this.validateRun(candidate)
            : this.validateSet(candidate);
        if (validation.valid) return index;
      }

      return -1;
    }

    /**
     * Açmış oyuncu, okeyin temsil ettiği gerçek taşı koyup masadaki okeyi alır.
     */
    retrieveOkey(playerId, targetOwnerId, meldId, replacementTileId) {
      this.assertTurn(playerId);

      if (!this.rules.allowOkeyRetrieval) {
        throw new Error('Masadan okey alma bu masada kapalı.');
      }

      if (!this.state.opened[playerId]) {
        throw new Error('Masadaki okeyi almak için önce elini açmalısın.');
      }
      if (this.state.phase !== 'play' && this.state.phase !== 'discard') {
        throw new Error('Şu anda masadan okey alma aşaması değil.');
      }

      const meld = this.state.tableMelds[targetOwnerId]?.find(m => m.id === meldId);
      if (!meld) throw new Error('Hedef per bulunamadı.');

      const replacement = this.state.hands[playerId].find(
        tile => tile.id === replacementTileId
      );
      if (!replacement) throw new Error('Okeyin karşılığı olan taş elde bulunamadı.');

      const okeyIndex = this.findOkeyReplacementIndex(meld, replacement);
      if (okeyIndex === -1) {
        throw new Error('Seçilen taş bu perdeki okeyin karşılığı değil.');
      }

      this.requireForcedTileUsed([replacementTileId]);
      const [placed] = this.removeTilesFromHand(playerId, [replacementTileId]);
      const retrieved = meld.tiles[okeyIndex];
      meld.tiles[okeyIndex] = placed;
      this.state.hands[playerId].push(retrieved);

      if (this.state.forcedUseTileId === replacementTileId) {
        this.state.forcedUseTileId = null;
      }
      this.state.phase = 'discard';

      if (this.rules.retrievedOkeyOwnerPenalty > 0) {
        this.addPenalty(
          targetOwnerId,
          this.rules.retrievedOkeyOwnerPenalty,
          'opened-okey-retrieved',
          { retrievedBy: playerId, meldId }
        );
      }

      this.emit('okeyRetrieved', {
        playerId,
        targetOwnerId,
        meldId,
        replacementTileId,
        okeyTileId: retrieved.id
      });

      return {
        meld: clone(meld),
        okey: clone(retrieved)
      };
    }

    isPlayableDiscard(tile) {
      for (const owner of Object.keys(this.state.tableMelds || {})) {
        for (const meld of this.state.tableMelds[owner]) {
          if (meld.type === 'pair') continue;
          const combined = [...meld.tiles, tile];
          const validation =
            meld.type === 'run'
              ? this.validateRun(combined)
              : this.validateSet(combined);
          if (validation.valid) return true;
        }
      }
      return false;
    }

    discard(playerId, tileId) {
      this.assertTurn(playerId);

      if (this.state.phase !== 'discard' && this.state.phase !== 'play') {
        throw new Error('Şu anda taş atma aşaması değil.');
      }

      const returningTakenDiscard = this.state.forcedUseTileId === tileId;
      if (this.state.forcedUseTileId && !returningTakenDiscard) {
        throw new Error(
          'Yerden aldığın taşı kullanmalı veya aynı taşı geri atmalısın.'
        );
      }

      const hand = this.state.hands[playerId];
      const index = hand.findIndex(t => t.id === tileId);

      if (index === -1) {
        throw new Error('Atılacak taş elde yok.');
      }

      const tile = hand[index];
      const willFinish =
        this.state.opened[playerId] &&
        this.state.hands[playerId].length === 1;

      if (!willFinish && !returningTakenDiscard) {
        if (this.isOkey(tile)) {
          this.addPenalty(
            playerId,
            this.rules.okeyDiscardPenalty,
            'okey-discard',
            { tileId }
          );
        } else if (this.isPlayableDiscard(tile)) {
          this.addPenalty(
            playerId,
            this.rules.playableDiscardPenalty,
            'playable-discard',
            { tileId }
          );
        }
      }

      hand.splice(index, 1);

      this.state.discardPile.push(tile);
      if(!this.state.discardsByPlayer)this.state.discardsByPlayer={};
      if(!this.state.discardsByPlayer[playerId])this.state.discardsByPlayer[playerId]=[];
      this.state.discardsByPlayer[playerId].push(clone(tile));
      this.state.lastDiscard = {
        playerId,
        tile: clone(tile)
      };

      const finished =
        this.state.opened[playerId] &&
        this.state.hands[playerId].length === 0;

      this.emit('discard', {
        playerId,
        tile: clone(tile),
        finished
      });

      if (finished) {
        this.finishWithWinner(playerId, this.isOkey(tile));
        return clone(tile);
      }

      this.advanceTurn();
      return clone(tile);
    }

    advanceTurn() {
      const step = this.rules.turnDirection === 'clockwise' ? -1 : 1;
      this.state.currentPlayerIndex =
        (this.state.currentPlayerIndex + step + 4) % 4;

      this.state.phase = 'draw';
      this.state.turnNumber += 1;
      this.state.lastDraw = null;
      this.state.forcedUseTileId = null;
      this.state.takenDiscardSourcePlayerId = null;
      this.state.openedCountAtTurnStart = this.players.filter(
        p => this.state.opened[p.id]
      ).length;
      this.state.openedThisTurnPlayerId = null;
      this.state.turnLayoffCount = 0;

      this.emit('turn', {
        currentPlayer: this.getCurrentPlayer(),
        turnNumber: this.state.turnNumber
      });
    }

    finishType() {
      const parts = [];
      if (this.state.finishedDirect) parts.push('direct');
      if (this.state.finishedWithPairs) parts.push('pairs');
      if (this.state.finishedWithJoker) parts.push('okey');
      return parts.length ? parts.join('-') : 'normal';
    }

    finishWithWinner(playerId, finishedWithJoker = false) {
      this.state.status = 'finished';
      this.state.phase = 'finished';
      this.state.winnerPlayerId = playerId;
      this.state.finishedWithJoker = Boolean(finishedWithJoker);
      this.state.finishedWithPairs = this.state.openType[playerId] === 'pairs';
      this.state.finishedDirect =
        this.state.openedThisTurnPlayerId === playerId &&
        this.state.openedCountAtTurnStart === 0;
      this.state.finishType = this.finishType();
      this.state.scores = this.calculateScores(playerId);

      const result = {
        winnerPlayerId: playerId,
        winnerTeam:
          this.mode === MODE_TEAM
            ? this.getPlayer(playerId).team
            : null,
        finishedWithJoker: this.state.finishedWithJoker,
        finishedWithPairs: this.state.finishedWithPairs,
        finishedDirect: this.state.finishedDirect,
        finishType: this.state.finishType,
        scores: clone(this.state.scores)
      };

      this.emit('gameOver', result);
      this.emit('state', this.getPublicState());

      return result;
    }

    finishCancelledRound(reason = 'cancelled') {
      this.state.status = 'finished';
      this.state.phase = 'finished';
      this.state.winnerPlayerId = null;
      this.state.finishedWithJoker = false;
      this.state.finishedWithPairs = false;
      this.state.finishedDirect = false;
      this.state.finishType = reason;

      const individual = Object.fromEntries(
        this.players.map(p => [
          p.id,
          {
            playerId: p.id,
            opened: this.state.opened[p.id],
            openType: this.state.openType[p.id],
            handPenalty: 0,
            actionPenalties: 0,
            multiplier: 0,
            roundPenalty: 0,
            total: 0
          }
        ])
      );

      if (this.mode === MODE_SOLO) {
        this.state.scores = { mode: MODE_SOLO, individual };
      } else {
        const teams = {
          [TEAM_A]: { team: TEAM_A, playerIds: [], total: 0 },
          [TEAM_B]: { team: TEAM_B, playerIds: [], total: 0 }
        };
        for (const p of this.players) teams[p.team].playerIds.push(p.id);
        this.state.scores = { mode: MODE_TEAM, individual, teams };
      }

      const result = {
        winnerPlayerId: null,
        winnerTeam: null,
        finishType: reason,
        scores: clone(this.state.scores),
        reason
      };
      this.emit('gameOver', result);
      return result;
    }

    finishNoWinner() {
      const eligible = this.players
        .filter(player => this.state.opened[player.id])
        .map((player, index) => ({ player, index, total: this.handPenalty(player.id) }))
        .sort((a, b) => a.total - b.total || a.index - b.index);
      const winnerPlayerId = eligible[0]?.player.id || null;
      const winnerTeam = winnerPlayerId && this.mode === MODE_TEAM
        ? this.getPlayer(winnerPlayerId).team
        : null;
      this.state.status = 'finished';
      this.state.phase = 'finished';
      this.state.winnerPlayerId = winnerPlayerId;
      this.state.finishedWithJoker = false;
      this.state.finishedWithPairs = false;
      this.state.finishedDirect = false;
      this.state.finishType = 'stock-empty';
      this.state.scores = this.calculateScores(null);

      const result = {
        winnerPlayerId,
        winnerTeam,
        finishedWithJoker: false,
        finishedWithPairs: false,
        finishedDirect: false,
        finishType: this.state.finishType,
        scores: clone(this.state.scores),
        reason: 'stock-empty'
      };

      this.emit('gameOver', result);
      return result;
    }

    tileHandValue(tile) {
      const resolved = this.resolveTile(tile);

      if (resolved.isJoker) {
        return this.rules.scoring.jokerValue;
      }

      if (tile.isFalseJoker) {
        return this.rules.scoring.falseJokerValue == null
          ? this.state.okey.number
          : this.rules.scoring.falseJokerValue;
      }

      return tile.number;
    }

    handPenalty(playerId) {
      return this.state.hands[playerId].reduce(
        (sum, tile) => sum + this.tileHandValue(tile),
        0
      );
    }

    calculateScores(winnerPlayerId) {
      const individual = {};
      const winnerPlayer = winnerPlayerId ? this.getPlayer(winnerPlayerId) : null;
      const winnerTeam = winnerPlayer?.team || null;
      let finishMultiplier = 1;

      if (this.state.finishedDirect) {
        finishMultiplier *= this.rules.scoring.directFinishMultiplier;
      }
      if (this.state.finishedWithPairs) {
        finishMultiplier *= this.rules.scoring.pairFinishMultiplier;
      }
      if (this.state.finishedWithJoker) {
        finishMultiplier *= this.rules.scoring.jokerFinishMultiplier;
      }

      for (const p of this.players) {
        const actionPenalties = this.state.penalties?.[p.id] || 0;

        if (p.id === winnerPlayerId) {
          const winnerScore = this.rules.scoring.winnerScore * finishMultiplier;

          individual[p.id] = {
            playerId: p.id,
            opened: this.state.opened[p.id],
            openType: this.state.openType[p.id],
            handPenalty: 0,
            actionPenalties,
            multiplier: finishMultiplier,
            roundPenalty: winnerScore,
            total: winnerScore + actionPenalties
          };

          continue;
        }

        let multiplier = finishMultiplier;

        if (this.state.openType[p.id] === 'pairs') {
          multiplier *= this.rules.scoring.pairOpenedMultiplier;
        }

        const handPenalty = this.state.opened[p.id]
          ? this.handPenalty(p.id)
          : this.rules.scoring.unopenedPenalty;
        const winningPartner =
          this.mode === MODE_TEAM &&
          winnerTeam &&
          p.team === winnerTeam;
        const roundPenalty = winningPartner ? 0 : handPenalty * multiplier;

        individual[p.id] = {
          playerId: p.id,
          opened: this.state.opened[p.id],
          openType: this.state.openType[p.id],
          handPenalty,
          actionPenalties,
          multiplier,
          roundPenalty,
          total: roundPenalty + actionPenalties
        };
      }

      if (this.mode === MODE_SOLO) {
        return {
          mode: MODE_SOLO,
          individual
        };
      }

      const teams = {
        [TEAM_A]: {
          team: TEAM_A,
          playerIds: [],
          total: 0
        },
        [TEAM_B]: {
          team: TEAM_B,
          playerIds: [],
          total: 0
        }
      };

      for (const p of this.players) {
        teams[p.team].playerIds.push(p.id);
        teams[p.team].total += individual[p.id].total;
      }

      return {
        mode: MODE_TEAM,
        individual,
        teams
      };
    }

    /**
     * Public state: eller gizli.
     */
    getPublicState() {
      return {
        version: this.state.version,
        mode: this.mode,
        status: this.state.status,

        players: clone(this.players),
        currentPlayer: this.getCurrentPlayer(),
        phase: this.state.phase,
        roundNumber: this.state.roundNumber,
        turnNumber: this.state.turnNumber,
        turnDeadlineAt: this.state.turnDeadlineAt || null,
        timeoutCounts: clone(this.state.timeoutCounts || {}),

        indicator: clone(this.state.indicator),
        okey: clone(this.state.okey),

        stockCount: this.state.stock.length,
        discardTop:
          this.state.discardPile.length > 0
            ? clone(this.state.discardPile[this.state.discardPile.length - 1])
            : null,
        discardsByPlayer: clone(this.state.discardsByPlayer||{}),

        handCounts: Object.fromEntries(
          this.players.map(p => [p.id, this.state.hands[p.id].length])
        ),

        opened: clone(this.state.opened),
        openType: clone(this.state.openType),
        openingScores: clone(this.state.openingScores||{}),
        openingTarget: this.openingTarget(),
        pairOpeningCounts: clone(this.state.pairOpeningCounts || {}),
        pairOpeningTarget: this.pairOpeningTarget(),
        penalties: clone(this.state.penalties || {}),
        penaltyEvents: clone(this.state.penaltyEvents || []),
        tableMelds: clone(this.state.tableMelds),

        winnerPlayerId: this.state.winnerPlayerId,
        finishedWithJoker: this.state.finishedWithJoker,
        finishedWithPairs: this.state.finishedWithPairs,
        finishedDirect: this.state.finishedDirect,
        finishType: this.state.finishType,
        scores: clone(this.state.scores)
      };
    }

    /**
     * Client'a yalnız kendi eli açık gider.
     */
    getStateForPlayer(playerId) {
      this.getPlayer(playerId);
      const opening = this.openingPotential(playerId);
      const pairs = this.pairPotential(playerId);

      return {
        ...this.getPublicState(),
        yourPlayerId: playerId,
        yourHand: clone(this.state.hands[playerId]),
        openingPotential: opening.points,
        openingGroups: clone(opening.groups),
        pairPotential: pairs.count,
        pairGroups: clone(pairs.groups),
        rackTotal: this.handPenalty(playerId),
        layoffCandidateTileIds: this.layoffCandidateTileIds(playerId),
        forcedUseTileId:
          this.players[this.state.currentPlayerIndex].id === playerId
            ? this.state.forcedUseTileId
            : null,
        takenDiscardSourcePlayerId:
          this.players[this.state.currentPlayerIndex].id === playerId &&
          this.state.forcedUseTileId
            ? this.state.takenDiscardSourcePlayerId
            : null
      };
    }

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

  class Solo101Okey extends Okey101Game {
    constructor(options = {}) {
      super({
        ...options,
        mode: MODE_SOLO
      });
    }
  }

  class Team101Okey extends Okey101Game {
    constructor(options = {}) {
      super({
        ...options,
        mode: MODE_TEAM
      });
    }
  }

  global.OKEY101 = Object.freeze({
    MODE_SOLO,
    MODE_TEAM,

    TEAM_A,
    TEAM_B,

    COLORS,
    DEFAULT_RULES,

    createTiles,

    Okey101Game,
    Solo101Okey,
    Team101Okey
  });

})(typeof window !== 'undefined' ? window : globalThis);
