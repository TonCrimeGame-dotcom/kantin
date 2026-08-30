/**
 * upvp.js
 * KANTİN - Üniversite Tavlası / 4 Kişilik Eşli PvP
 *
 * Bağımlılık:
 *   spvp.js dosyası bundan önce yüklenmelidir.
 *
 *   <script src="./src/spvp.js" defer></script>
 *   <script src="./src/upvp.js" defer></script>
 *
 * Oyun modeli:
 * - 4 oyuncu, 2 takım.
 * - 2 bağımsız standart tavla tahtası.
 * - Tahta 1: A1 vs B1
 * - Tahta 2: A2 vs B2
 * - Aynı takım iki tahtada da aynı renk ile oynar.
 * - Takım sırası geldiğinde o round için belirlenmiş TEK oyuncu zar atar.
 * - Atılan aynı zar, takımın iki oyuncusuna / iki tahtaya da uygulanır.
 * - Her oyuncu kendi tahtasında aynı zarları standart tavla kurallarına göre oynar.
 * - Bir tahtada hamle yoksa o tahta o zar için otomatik tamamlanabilir;
 *   diğer eş kendi tahtasında oynamaya devam eder.
 * - İki aktif tahta da ortak zar turunu bitirmeden rakip takıma sıra geçmez.
 * - Her round sonunda zar atan oyuncular takım içinde değişir.
 * - Varsayılan maç 4 round'dur.
 *
 * ÖNEMLİ:
 * - Gerçek online PvP'de zar sonucu SUNUCUDA üretilmelidir.
 * - İstemci yalnızca `setSharedDice(d1, d2, rollerId)` çağrısını server event'i
 *   aldıktan sonra çalıştırmalıdır.
 */

(function (global) {
  'use strict';

  if (!global.SPVP || !global.SPVP.StandardBackgammonPvP) {
    throw new Error(
      'UPVP başlatılamadı: Önce spvp.js yüklenmelidir.'
    );
  }

  const {
    WHITE,
    BLACK,
    StandardBackgammonPvP,
  } = global.SPVP;

  const TEAM_A = 'teamA';
  const TEAM_B = 'teamB';

  const BOARD_1 = 'board1';
  const BOARD_2 = 'board2';

  const clone = (obj) =>
    typeof structuredClone === 'function'
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));

  const otherTeam = (team) => (team === TEAM_A ? TEAM_B : TEAM_A);

  function assertTeam(team) {
    if (team !== TEAM_A && team !== TEAM_B) {
      throw new Error(`Geçersiz takım: ${team}`);
    }
  }

  function assertBoard(boardId) {
    if (boardId !== BOARD_1 && boardId !== BOARD_2) {
      throw new Error(`Geçersiz tahta: ${boardId}`);
    }
  }

  function defaultPlayers() {
    return {
      A1: {
        id: 'A1',
        username: 'Oyuncu_A1',
        team: TEAM_A,
        boardId: BOARD_1,
        color: WHITE,
      },
      A2: {
        id: 'A2',
        username: 'Oyuncu_A2',
        team: TEAM_A,
        boardId: BOARD_2,
        color: WHITE,
      },
      B1: {
        id: 'B1',
        username: 'Oyuncu_B1',
        team: TEAM_B,
        boardId: BOARD_1,
        color: BLACK,
      },
      B2: {
        id: 'B2',
        username: 'Oyuncu_B2',
        team: TEAM_B,
        boardId: BOARD_2,
        color: BLACK,
      },
    };
  }

  class UniversityBackgammonPvP {
    constructor(options = {}) {
      this.listeners = new Map();

      this.config = {
        totalRounds:
          Number.isInteger(options.totalRounds) && options.totalRounds > 0
            ? options.totalRounds
            : 5,

        // Round sonunda iki tahtanın da bitmesini bekler.
        roundEndsWhenBothBoardsFinish:
          options.roundEndsWhenBothBoardsFinish !== false,

        // Takımlar ortak zar turlarında sırayla oynar.
        startingTeam:
          options.startingTeam === TEAM_B ? TEAM_B : TEAM_A,
      };

      this.players = this.normalizePlayers(options.players || defaultPlayers());

      this.boards = {
        [BOARD_1]: new StandardBackgammonPvP({
          startingPlayer:
            this.config.startingTeam === TEAM_A ? WHITE : BLACK,
        }),
        [BOARD_2]: new StandardBackgammonPvP({
          startingPlayer:
            this.config.startingTeam === TEAM_A ? WHITE : BLACK,
        }),
      };

      this._suppressBoardEvents = false;

      this.attachBoardListeners();
      this.resetMatch();
    }

    normalizePlayers(playersInput) {
      const list = Array.isArray(playersInput)
        ? playersInput
        : Object.values(playersInput);

      if (list.length !== 4) {
        throw new Error('UPVP tam olarak 4 oyuncu ister.');
      }

      const result = {};

      for (const raw of list) {
        if (!raw || !raw.id) {
          throw new Error('Her oyuncunun benzersiz id alanı olmalı.');
        }

        if (result[raw.id]) {
          throw new Error(`Tekrarlanan oyuncu id: ${raw.id}`);
        }

        assertTeam(raw.team);
        assertBoard(raw.boardId);

        const expectedColor = raw.team === TEAM_A ? WHITE : BLACK;

        result[raw.id] = {
          id: String(raw.id),
          username: raw.username || String(raw.id),
          avatar: raw.avatar || null,
          level: Number.isFinite(raw.level) ? raw.level : 1,
          team: raw.team,
          boardId: raw.boardId,
          color: expectedColor,
          connected: raw.connected !== false,
        };
      }

      const counts = {
        [TEAM_A]: 0,
        [TEAM_B]: 0,
        [BOARD_1]: 0,
        [BOARD_2]: 0,
      };

      for (const p of Object.values(result)) {
        counts[p.team] += 1;
        counts[p.boardId] += 1;
      }

      if (counts[TEAM_A] !== 2 || counts[TEAM_B] !== 2) {
        throw new Error('Her takım tam olarak 2 oyuncudan oluşmalı.');
      }

      if (counts[BOARD_1] !== 2 || counts[BOARD_2] !== 2) {
        throw new Error('Her tavlada tam olarak 2 oyuncu olmalı.');
      }

      for (const boardId of [BOARD_1, BOARD_2]) {
        const boardPlayers = Object.values(result).filter(
          (p) => p.boardId === boardId
        );

        const teamSet = new Set(boardPlayers.map((p) => p.team));

        if (!teamSet.has(TEAM_A) || !teamSet.has(TEAM_B)) {
          throw new Error(
            `${boardId} üzerinde her iki takımdan birer oyuncu bulunmalı.`
          );
        }
      }

      return result;
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
          console.error(`[UPVP:${eventName}] listener hatası`, err);
        }
      }
    }

    attachBoardListeners() {
      for (const boardId of [BOARD_1, BOARD_2]) {
        const board = this.boards[boardId];

        board.on('move', (move) => {
          if (this._suppressBoardEvents) return;

          this.emit('boardMove', {
            boardId,
            ...clone(move),
          });
        });

        board.on('gameOver', (result) => {
          if (this._suppressBoardEvents) return;

          this.handleBoardFinished(boardId, result);
        });

        board.on('state', () => {
          if (this._suppressBoardEvents) return;

          this.syncSharedTurnProgress();
          this.emit('state', this.getState());
        });
      }
    }

    resetMatch() {
      this.match = {
        version: 1,
        mode: 'university-backgammon-2v2',
        status: 'playing', // playing | finished
        totalRounds: this.config.totalRounds,
        round: 1,

        activeTeam: this.config.startingTeam,

        // Her roundda hangi eşin takım adına zar atacağını belirler.
        rollerByTeam: {
          [TEAM_A]: null,
          [TEAM_B]: null,
        },

        // Ortak zar turu.
        sharedDice: [],
        sharedRollId: null,
        sharedRollOpen: false,

        // Bu zar turunu hangi tahtalar tamamladı?
        boardRollStatus: {
          [BOARD_1]: 'idle', // idle | playing | done | finished
          [BOARD_2]: 'idle',
        },

        roundBoardResults: {
          [BOARD_1]: null,
          [BOARD_2]: null,
        },

        roundHistory: [],

        score: {
          [TEAM_A]: 0,
          [TEAM_B]: 0,
        },

        winnerTeam: null,
      };

      this.configureRoundRollers(1);
      this.resetBoardsForRound();

      this.emit('matchReset', this.getState());
      return this.getState();
    }

    resetBoardsForRound() {
      const startingColor =
        this.match.activeTeam === TEAM_A ? WHITE : BLACK;

      this._suppressBoardEvents = true;

      try {
        this.boards[BOARD_1].reset(startingColor);
        this.boards[BOARD_2].reset(startingColor);
      } finally {
        this._suppressBoardEvents = false;
      }

      this.match.sharedDice = [];
      this.match.sharedRollId = null;
      this.match.sharedRollOpen = false;

      this.match.boardRollStatus = {
        [BOARD_1]: 'idle',
        [BOARD_2]: 'idle',
      };

      this.match.roundBoardResults = {
        [BOARD_1]: null,
        [BOARD_2]: null,
      };
    }

    getTeamPlayers(team) {
      assertTeam(team);

      return Object.values(this.players)
        .filter((p) => p.team === team)
        .sort((a, b) => a.boardId.localeCompare(b.boardId));
    }

    getBoardPlayers(boardId) {
      assertBoard(boardId);

      return Object.values(this.players)
        .filter((p) => p.boardId === boardId)
        .sort((a, b) => a.team.localeCompare(b.team));
    }

    getPlayer(playerId) {
      const player = this.players[playerId];

      if (!player) {
        throw new Error(`Oyuncu bulunamadı: ${playerId}`);
      }

      return player;
    }

    /**
     * Round 1:
     *   Team A -> A1, Team B -> B1
     * Round 2:
     *   Team A -> A2, Team B -> B2
     * Round 3:
     *   Team A -> A1, Team B -> B1
     * Round 4:
     *   Team A -> A2, Team B -> B2
     * Round 5:
     *   Team A -> A1, Team B -> B1
     *
     * Böylece beş oyunluk partide zar atılan tavla her oyunda değişir.
     */
    configureRoundRollers(roundNumber) {
      const teamA = this.getTeamPlayers(TEAM_A);
      const teamB = this.getTeamPlayers(TEAM_B);

      const index = (roundNumber - 1) % 2;

      this.match.rollerByTeam = {
        [TEAM_A]: teamA[index].id,
        [TEAM_B]: teamB[index].id,
      };
    }

    getCurrentRollerId() {
      return this.match.rollerByTeam[this.match.activeTeam];
    }

    getCurrentRoller() {
      const id = this.getCurrentRollerId();
      return id ? clone(this.players[id]) : null;
    }

    assertCanRoll(playerId) {
      if (this.match.status !== 'playing') {
        throw new Error('Maç bitmiş.');
      }

      if (this.match.sharedRollOpen) {
        throw new Error('Mevcut ortak zar turu bitmeden yeni zar atılamaz.');
      }

      const player = this.getPlayer(playerId);

      if (player.team !== this.match.activeTeam) {
        throw new Error('Zar sırası bu oyuncunun takımında değil.');
      }

      if (playerId !== this.getCurrentRollerId()) {
        throw new Error(
          `Bu round takım adına zar atacak oyuncu ${this.getCurrentRollerId()}.`
        );
      }

      return true;
    }

    /**
     * Gerçek online kullanım:
     * Server zarları üretir ve rollerId ile birlikte tüm client'lara yollar.
     */
    setSharedDice(d1, d2, rollerId, rollId = null) {
      this.assertCanRoll(rollerId);

      if (!Number.isInteger(d1) || d1 < 1 || d1 > 6) {
        throw new Error(`Geçersiz zar: ${d1}`);
      }

      if (!Number.isInteger(d2) || d2 < 1 || d2 > 6) {
        throw new Error(`Geçersiz zar: ${d2}`);
      }

      const activeColor =
        this.match.activeTeam === TEAM_A ? WHITE : BLACK;

      this.match.sharedDice = [d1, d2];
      this.match.sharedRollId =
        rollId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.match.sharedRollOpen = true;

      for (const boardId of [BOARD_1, BOARD_2]) {
        const board = this.boards[boardId];

        if (board.state.status === 'finished') {
          this.match.boardRollStatus[boardId] = 'finished';
          continue;
        }

        // İki tahta da her ortak zar turunda aynı takım/rengi oynamalı.
        if (board.state.turn !== activeColor) {
          throw new Error(
            `${boardId} sıra senkronizasyonu bozuldu. Beklenen: ${activeColor}, mevcut: ${board.state.turn}`
          );
        }

        this.match.boardRollStatus[boardId] = 'playing';

        board.setDice(d1, d2);

        // Eğer setDice sonrası legal hamle yoksa spvp kendi turunu otomatik kapatır.
        if (board.state.remainingDice.length === 0) {
          this.match.boardRollStatus[boardId] =
            board.state.status === 'finished' ? 'finished' : 'done';
        }
      }

      this.emit('sharedDice', {
        rollId: this.match.sharedRollId,
        rollerId,
        team: this.match.activeTeam,
        dice: [...this.match.sharedDice],
        boardRollStatus: clone(this.match.boardRollStatus),
      });

      this.syncSharedTurnProgress();

      return this.getState();
    }

    /**
     * Yalnızca local test için.
     * Production online PvP'de kullanılmamalı.
     */
    rollSharedDiceLocal(playerId) {
      const randomDie = () => {
        if (global.crypto?.getRandomValues) {
          const buf = new Uint32Array(1);
          global.crypto.getRandomValues(buf);
          return (buf[0] % 6) + 1;
        }

        return Math.floor(Math.random() * 6) + 1;
      };

      return this.setSharedDice(
        randomDie(),
        randomDie(),
        playerId
      );
    }

    /**
     * Oyuncu yalnızca kendi tahtasında hareket ettirebilir.
     */
    move(playerId, from, to, die = null) {
      if (this.match.status !== 'playing') {
        throw new Error('Maç bitmiş.');
      }

      if (!this.match.sharedRollOpen) {
        throw new Error('Aktif ortak zar yok.');
      }

      const player = this.getPlayer(playerId);

      if (player.team !== this.match.activeTeam) {
        throw new Error('Sıra rakip takımda.');
      }

      const boardId = player.boardId;
      const board = this.boards[boardId];

      if (board.state.status === 'finished') {
        throw new Error('Bu tavla bu round için zaten bitmiş.');
      }

      const expectedColor =
        this.match.activeTeam === TEAM_A ? WHITE : BLACK;

      if (player.color !== expectedColor) {
        throw new Error('Oyuncu rengi aktif takım ile uyuşmuyor.');
      }

      if (board.state.turn !== expectedColor) {
        throw new Error('Bu tahtada oyuncunun sırası değil.');
      }

      if (this.match.boardRollStatus[boardId] !== 'playing') {
        throw new Error('Bu tahta ortak zar turunu tamamlamış.');
      }

      const beforeTurn = board.state.turn;
      const beforeRemaining = [...board.state.remainingDice];

      board.move(from, to, die);

      const payload = {
        playerId,
        boardId,
        team: player.team,
        from,
        to,
        die,
        beforeTurn,
        beforeRemaining,
        afterRemaining: [...board.state.remainingDice],
      };

      this.emit('playerMove', payload);

      this.syncSharedTurnProgress();

      return this.getState();
    }

    /**
     * UI'da oyuncunun seçebileceği legal hamleler.
     */
    getLegalMovesForPlayer(playerId) {
      const player = this.getPlayer(playerId);

      if (
        this.match.status !== 'playing' ||
        !this.match.sharedRollOpen ||
        player.team !== this.match.activeTeam ||
        this.match.boardRollStatus[player.boardId] !== 'playing'
      ) {
        return [];
      }

      return this.boards[player.boardId].getLegalMoves();
    }

    getDestinationsForPlayer(playerId, from) {
      const player = this.getPlayer(playerId);

      if (
        this.match.status !== 'playing' ||
        !this.match.sharedRollOpen ||
        player.team !== this.match.activeTeam ||
        this.match.boardRollStatus[player.boardId] !== 'playing'
      ) {
        return [];
      }

      return this.boards[player.boardId].getDestinations(from);
    }

    /**
     * İki eşin de ortak zar turunu tamamlayıp tamamlamadığını kontrol eder.
     */
    syncSharedTurnProgress() {
      if (
        this.match.status !== 'playing' ||
        !this.match.sharedRollOpen
      ) {
        return;
      }

      const activeColor =
        this.match.activeTeam === TEAM_A ? WHITE : BLACK;

      for (const boardId of [BOARD_1, BOARD_2]) {
        const board = this.boards[boardId];

        if (board.state.status === 'finished') {
          this.match.boardRollStatus[boardId] = 'finished';
          continue;
        }

        // SPVP bir zar turu bittiğinde remainingDice temizlenir ve turn değişir.
        if (
          this.match.boardRollStatus[boardId] === 'playing' &&
          board.state.remainingDice.length === 0 &&
          board.state.turn !== activeColor
        ) {
          this.match.boardRollStatus[boardId] = 'done';
        }
      }

      const statuses = Object.values(this.match.boardRollStatus);
      const allResolved = statuses.every(
        (s) => s === 'done' || s === 'finished'
      );

      if (allResolved) {
        this.finishSharedRoll();
      }
    }

    finishSharedRoll() {
      if (!this.match.sharedRollOpen) return;

      const previousTeam = this.match.activeTeam;
      const nextTeam = otherTeam(previousTeam);

      this.match.sharedRollOpen = false;
      this.match.sharedDice = [];
      this.match.sharedRollId = null;

      this.match.boardRollStatus = {
        [BOARD_1]:
          this.boards[BOARD_1].state.status === 'finished'
            ? 'finished'
            : 'idle',
        [BOARD_2]:
          this.boards[BOARD_2].state.status === 'finished'
            ? 'finished'
            : 'idle',
      };

      // Eğer round halen sürüyorsa takım sırasını geçir.
      if (!this.isRoundFinished()) {
        this.match.activeTeam = nextTeam;

        this.forceUnfinishedBoardsToActiveTeam();

        this.emit('teamTurn', {
          previousTeam,
          activeTeam: this.match.activeTeam,
          rollerId: this.getCurrentRollerId(),
          round: this.match.round,
        });
      }

      this.emit('state', this.getState());
    }

    /**
     * Bir tahta diğerinden önce biterse biten tahta artık oyuna katılmaz.
     * Kalan tahtanın sırası aktif takım rengiyle senkron tutulur.
     */
    forceUnfinishedBoardsToActiveTeam() {
      const desiredColor =
        this.match.activeTeam === TEAM_A ? WHITE : BLACK;

      for (const boardId of [BOARD_1, BOARD_2]) {
        const board = this.boards[boardId];

        if (board.state.status === 'finished') continue;

        if (board.state.remainingDice.length > 0) {
          throw new Error(
            'Senkronizasyon hatası: aktif zar kalırken takım sırası değiştirilemez.'
          );
        }

        // Normal durumda SPVP zaten turn'ü değiştirmiş olur.
        // Tek bir tahta bitmişse kalan tahta üzerinden senkronizasyonu koruruz.
        board.state.turn = desiredColor;
      }
    }

    normalizeUniversityResult(result) {
      const normalized = clone(result);
      const isMars = normalized.isMars === true || normalized.type === 'mars' || normalized.type === 'gammon' || normalized.type === 'backgammon';

      normalized.originalType = normalized.originalType || normalized.type;
      normalized.type = isMars ? 'mars' : normalized.type;
      normalized.label = isMars ? 'MARS' : normalized.label || (normalized.type === 'single' ? 'NORMAL' : normalized.type.toLocaleUpperCase('tr-TR'));
      normalized.isMars = isMars;
      // Üniversite tavlasında katmerli/backgammon ayrımı yoktur:
      // kaybeden hiç pul toplamadıysa sonuç her zaman sabit 2 sayıdır.
      normalized.points = isMars ? 2 : normalized.type === 'single' ? 1 : normalized.points;

      return normalized;
    }

    handleBoardFinished(boardId, result) {
      const universityResult = this.normalizeUniversityResult(result);
      this.match.roundBoardResults[boardId] = universityResult;
      this.match.boardRollStatus[boardId] = 'finished';

      this.emit('boardFinished', {
        boardId,
        result: clone(universityResult),
        round: this.match.round,
      });

      if (this.isRoundFinished()) {
        this.finishRound();
      } else {
        this.syncSharedTurnProgress();
      }
    }

    isRoundFinished() {
      if (this.config.roundEndsWhenBothBoardsFinish) {
        return (
          this.boards[BOARD_1].state.status === 'finished' &&
          this.boards[BOARD_2].state.status === 'finished'
        );
      }

      return (
        this.boards[BOARD_1].state.status === 'finished' ||
        this.boards[BOARD_2].state.status === 'finished'
      );
    }

    /**
     * Her biten tavla sonucu takım skoruna eklenir.
     * Normal=1, kaybeden hiç pul toplamadıysa MARS=2.
     */
    calculateRoundScore() {
      const gained = {
        [TEAM_A]: 0,
        [TEAM_B]: 0,
      };

      for (const boardId of [BOARD_1, BOARD_2]) {
        const result = this.match.roundBoardResults[boardId];

        if (!result) continue;

        const winnerTeam =
          result.winner === WHITE ? TEAM_A : TEAM_B;

        gained[winnerTeam] += this.normalizeUniversityResult(result).points;
      }

      return gained;
    }

    finishRound() {
      if (!this.isRoundFinished()) return;

      const gained = this.calculateRoundScore();

      this.match.score[TEAM_A] += gained[TEAM_A];
      this.match.score[TEAM_B] += gained[TEAM_B];

      const roundSnapshot = {
        round: this.match.round,
        rollerByTeam: clone(this.match.rollerByTeam),
        boardResults: clone(this.match.roundBoardResults),
        gained,
        totalScore: clone(this.match.score),
      };

      this.match.roundHistory.push(roundSnapshot);

      this.emit('roundEnd', clone(roundSnapshot));

      if (this.match.round >= this.match.totalRounds) {
        this.finishMatch();
        return;
      }

      this.match.round += 1;

      // Yeni round başlangıç takımını değiştiriyoruz.
      // Böylece dört round boyunca açılış avantajı dengelenir.
      this.match.activeTeam =
        this.match.round % 2 === 0
          ? otherTeam(this.config.startingTeam)
          : this.config.startingTeam;

      this.configureRoundRollers(this.match.round);
      this.resetBoardsForRound();

      this.emit('roundStart', {
        round: this.match.round,
        activeTeam: this.match.activeTeam,
        rollerByTeam: clone(this.match.rollerByTeam),
      });

      this.emit('state', this.getState());
    }

    finishMatch() {
      this.match.status = 'finished';

      if (this.match.score[TEAM_A] > this.match.score[TEAM_B]) {
        this.match.winnerTeam = TEAM_A;
      } else if (this.match.score[TEAM_B] > this.match.score[TEAM_A]) {
        this.match.winnerTeam = TEAM_B;
      } else {
        this.match.winnerTeam = null; // beraberlik
      }

      this.match.sharedRollOpen = false;
      this.match.sharedDice = [];
      this.match.sharedRollId = null;

      const result = {
        winnerTeam: this.match.winnerTeam,
        score: clone(this.match.score),
        roundHistory: clone(this.match.roundHistory),
      };

      this.emit('matchEnd', result);
      this.emit('state', this.getState());

      return result;
    }

    setPlayerConnected(playerId, connected) {
      const player = this.getPlayer(playerId);
      player.connected = Boolean(connected);

      this.emit('connection', {
        playerId,
        connected: player.connected,
      });

      return clone(player);
    }

    /**
     * İkinci oyunu transparan pullarla ana tahtaya bindirmek için UI helper.
     *
     * viewerId hangi oyuncunun ekranı olduğunu belirtir.
     * Dönen veri:
     * - mainBoard: oyuncunun kendi gerçek tavlası
     * - partnerBoard: eşinin tavlası
     * - partnerOverlay: eş + eşin rakibi transparan gösterim için state
     */
    getOverlayView(viewerId) {
      const viewer = this.getPlayer(viewerId);

      const partner = Object.values(this.players).find(
        (p) =>
          p.team === viewer.team &&
          p.id !== viewer.id
      );

      if (!partner) {
        throw new Error('Eş bulunamadı.');
      }

      const directOpponent = Object.values(this.players).find(
        (p) =>
          p.boardId === viewer.boardId &&
          p.team !== viewer.team
      );

      const partnerOpponent = Object.values(this.players).find(
        (p) =>
          p.boardId === partner.boardId &&
          p.team !== viewer.team
      );

      return {
        viewer: clone(viewer),
        partner: clone(partner),
        directOpponent: clone(directOpponent),
        partnerOpponent: clone(partnerOpponent),

        mainBoardId: viewer.boardId,
        partnerBoardId: partner.boardId,

        mainBoard: this.boards[viewer.boardId].getState(),
        partnerBoard: this.boards[partner.boardId].getState(),

        overlay: {
          // UI bu iki rengi transparan çizer.
          teammateColor: partner.color,
          opponentPartnerColor: partnerOpponent.color,
          opacity: 0.35,
        },
      };
    }

    /**
     * Server/client state senkronu için sade snapshot.
     */
    getState() {
      return {
        config: clone(this.config),
        players: clone(this.players),
        match: clone(this.match),
        boards: {
          [BOARD_1]: this.boards[BOARD_1].getState(),
          [BOARD_2]: this.boards[BOARD_2].getState(),
        },
      };
    }

    serialize() {
      return JSON.stringify(this.getState());
    }

    /**
     * Server snapshot'ı client'a yüklemek için.
     */
    loadState(snapshot) {
      if (!snapshot?.match || !snapshot?.boards) {
        throw new Error('Geçersiz UPVP snapshot.');
      }

      this.players = this.normalizePlayers(snapshot.players);
      this.match = clone(snapshot.match);

      this._suppressBoardEvents = true;

      try {
        this.boards[BOARD_1].loadState(snapshot.boards[BOARD_1]);
        this.boards[BOARD_2].loadState(snapshot.boards[BOARD_2]);
      } finally {
        this._suppressBoardEvents = false;
      }

      this.emit('stateLoaded', this.getState());
      this.emit('state', this.getState());

      return this.getState();
    }
  }

  global.UPVP = Object.freeze({
    TEAM_A,
    TEAM_B,
    BOARD_1,
    BOARD_2,
    UniversityBackgammonPvP,
  });
})(typeof window !== 'undefined' ? window : globalThis);
