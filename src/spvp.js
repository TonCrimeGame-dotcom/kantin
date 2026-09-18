/**
 * spvp.js
 * KANTİN - Tekli PvP / Standart Backgammon çekirdek oyun motoru
 *
 * Kullanım:
 *   <script src="./src/spvp.js" defer></script>
 *   const game = new SPVP.StandardBackgammonPvP();
 *
 * Tahta indeksleri: 0..23
 * WHITE: 23 -> 0 yönünde ilerler, sonra çıkar.
 * BLACK: 0 -> 23 yönünde ilerler, sonra çıkar.
 *
 * Not:
 * - Online oyunda zar sonucunu istemcide üretmek yerine sunucudan game.setDice(...)
 *   ile vermek daha güvenlidir.
 * - Bu dosya UI'dan bağımsızdır. Canvas/DOM çizimi daha sonra bağlanabilir.
 */

(function (global) {
  'use strict';

  const WHITE = 'white';
  const BLACK = 'black';

  const clone = (obj) =>
    typeof structuredClone === 'function'
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));

  function opponent(player) {
    return player === WHITE ? BLACK : WHITE;
  }

  function assertPlayer(player) {
    if (player !== WHITE && player !== BLACK) {
      throw new Error(`Geçersiz oyuncu: ${player}`);
    }
  }

  function makeEmptyPoint() {
    return { owner: null, count: 0 };
  }

  function makeInitialBoard() {
    const points = Array.from({ length: 24 }, makeEmptyPoint);

    const set = (index, owner, count) => {
      points[index] = { owner, count };
    };

    // Standart başlangıç dizilimi.
    // WHITE 23 -> 0 hareket eder.
    set(23, WHITE, 2);
    set(12, WHITE, 5);
    set(7, WHITE, 3);
    set(5, WHITE, 5);

    // BLACK 0 -> 23 hareket eder.
    set(0, BLACK, 2);
    set(11, BLACK, 5);
    set(16, BLACK, 3);
    set(18, BLACK, 5);

    return points;
  }

  class StandardBackgammonPvP {
    constructor(options = {}) {
      this.listeners = new Map();
      this.reset(options.startingPlayer || WHITE);
    }

    reset(startingPlayer = WHITE) {
      assertPlayer(startingPlayer);

      this.state = {
        version: 1,
        status: 'playing', // playing | finished
        turn: startingPlayer,
        openingComplete: false,
        openingRolls: { [WHITE]: null, [BLACK]: null },
        openingLastRoll: null,
        openingStarter: null,
        points: makeInitialBoard(),

        bar: {
          [WHITE]: 0,
          [BLACK]: 0,
        },

        off: {
          [WHITE]: 0,
          [BLACK]: 0,
        },

        // Orijinal zar sonucu.
        dice: [],

        // Henüz oynanmamış zarlar. Double ise örn. [4,4,4,4].
        remainingDice: [],

        winner: null,
        moveNumber: 0,
        turnNumber: 0,
        movesThisTurn: 0,
        lastMove: null,
        cubeValue: 1,
        cubeOwner: null,
        pendingDouble: null,
        turnDeadlineAt: null,
        timeoutCounts: { [WHITE]: 0, [BLACK]: 0 },
        finishReason: null,
        finalPoints: null,
      };

      this.emit('reset', this.getState());
      return this.getState();
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
          console.error(`[SPVP:${eventName}] listener hatası`, err);
        }
      }
    }

    getState() {
      return clone(this.state);
    }

    loadState(nextState) {
      this.validateState(nextState);
      this.state = clone(nextState);
      if (typeof this.state.openingComplete !== 'boolean') this.state.openingComplete = true;
      if (!this.state.openingRolls) this.state.openingRolls = { [WHITE]: null, [BLACK]: null };
      if (!('openingLastRoll' in this.state)) this.state.openingLastRoll = null;
      if (!('openingStarter' in this.state)) this.state.openingStarter = this.state.openingComplete ? this.state.turn : null;
      if (!Number.isInteger(this.state.turnNumber)) this.state.turnNumber = 0;
      if (!Number.isInteger(this.state.movesThisTurn)) this.state.movesThisTurn = 0;
      if (!Number.isInteger(this.state.cubeValue)) this.state.cubeValue = 1;
      if (!('cubeOwner' in this.state)) this.state.cubeOwner = null;
      if (!('pendingDouble' in this.state)) this.state.pendingDouble = null;
      if (!('turnDeadlineAt' in this.state)) this.state.turnDeadlineAt = null;
      if (!this.state.timeoutCounts) this.state.timeoutCounts = { [WHITE]: 0, [BLACK]: 0 };
      if (!('finishReason' in this.state)) this.state.finishReason = null;
      if (!('finalPoints' in this.state)) this.state.finalPoints = null;
      this.emit('state', this.getState());
      return this.getState();
    }

    serialize() {
      return JSON.stringify(this.state);
    }

    deserialize(json) {
      return this.loadState(JSON.parse(json));
    }

    validateState(state) {
      if (!state || !Array.isArray(state.points) || state.points.length !== 24) {
        throw new Error('Geçersiz SPVP state.');
      }

      assertPlayer(state.turn);

      for (const p of state.points) {
        if (!p || !Number.isInteger(p.count) || p.count < 0) {
          throw new Error('Geçersiz point.');
        }

        if (p.count === 0 && p.owner !== null) {
          throw new Error('Boş point owner=null olmalı.');
        }

        if (p.count > 0 && p.owner !== WHITE && p.owner !== BLACK) {
          throw new Error('Dolu point geçerli owner taşımalı.');
        }
      }

      for (const player of [WHITE, BLACK]) {
        const onBoard = state.points.reduce(
          (sum, p) => sum + (p.owner === player ? p.count : 0),
          0
        );

        const total =
          onBoard +
          Number(state.bar?.[player] || 0) +
          Number(state.off?.[player] || 0);

        if (total !== 15) {
          throw new Error(`${player} toplam pul sayısı 15 olmalı; mevcut: ${total}`);
        }
      }
    }

    /**
     * Online maçta tercih edilen yöntem.
     * Zarları sunucu üretir ve iki istemciye de gönderir.
     */
    setDice(d1, d2) {
      if (this.state.status !== 'playing') {
        throw new Error('Oyun bitmiş.');
      }

      if (this.state.pendingDouble) {
        throw new Error('Katlama teklifi cevaplanmadan zar atılamaz.');
      }

      if (this.state.remainingDice.length > 0) {
        throw new Error('Mevcut zarlar bitmeden yeni zar verilemez.');
      }

      this.assertDie(d1);
      this.assertDie(d2);

      this.state.openingComplete = true;

      this.state.dice = [d1, d2];
      this.state.remainingDice =
        d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];

      const legalTurns = this.getLegalTurnSequences();

      this.emit('dice', {
        player: this.state.turn,
        dice: [...this.state.dice],
        remainingDice: [...this.state.remainingDice],
        legalTurns: clone(legalTurns),
      });

      // Hiç legal hamle yoksa sıra otomatik geçer.
      if (legalTurns.length === 0) {
        this.endTurn({ reason: 'no-legal-move' });
      }

      return this.getState();
    }

    submitOpeningRoll(player, value) {
      assertPlayer(player);
      this.assertDie(value);
      if (this.state.openingComplete) throw new Error('Başlangıç zarları zaten tamamlandı.');
      if (this.state.openingRolls[player] != null) throw new Error('Başlangıç zarını zaten attın.');
      this.state.openingRolls[player] = value;
      this.state.openingLastRoll = player;
      const whiteDie = this.state.openingRolls[WHITE];
      const blackDie = this.state.openingRolls[BLACK];
      if (whiteDie == null || blackDie == null) return this.getState();
      if (whiteDie === blackDie) {
        this.state.openingRolls = { [WHITE]: null, [BLACK]: null };
        this.emit('openingTie', { white: whiteDie, black: blackDie });
        return this.getState();
      }
      this.state.turn = whiteDie > blackDie ? WHITE : BLACK;
      this.state.openingStarter = this.state.turn;
      this.state.openingComplete = true;
      return this.setDice(whiteDie, blackDie);
    }

    rollOpeningLocal() {
      const randomDie = () => Math.floor(Math.random() * 6) + 1;
      let whiteDie, blackDie;
      do { whiteDie = randomDie(); blackDie = randomDie(); } while (whiteDie === blackDie);
      this.submitOpeningRoll(WHITE, whiteDie);
      return this.submitOpeningRoll(BLACK, blackDie);
    }

    /**
     * Sadece local test için.
     * Gerçek online PvP'de setDice() + sunucu kullanılmalı.
     */
    rollDiceLocal() {
      const randomDie = () => {
        if (global.crypto?.getRandomValues) {
          const buf = new Uint32Array(1);
          global.crypto.getRandomValues(buf);
          return (buf[0] % 6) + 1;
        }
        return Math.floor(Math.random() * 6) + 1;
      };

      return this.setDice(randomDie(), randomDie());
    }

    assertDie(value) {
      if (!Number.isInteger(value) || value < 1 || value > 6) {
        throw new Error(`Zar 1-6 arasında olmalı. Gelen: ${value}`);
      }
    }

    doubleEligiblePlayer(state = this.state) {
      return state.cubeOwner || state.openingStarter;
    }

    canOfferDouble(player, state = this.state) {
      assertPlayer(player);
      if (state.status !== 'playing' || !state.openingComplete || state.pendingDouble) return false;
      if (state.turn !== player || this.doubleEligiblePlayer(state) !== player) return false;
      if (state.movesThisTurn > 0 || state.cubeValue >= 64) return false;
      // Başlangıç zarları ilk turun hamle zarlarıdır; yalnız o ilk turda zarlar
      // görünürken de, ilk pul oynanmadan önce katlama teklifi yapılabilir.
      return state.remainingDice.length === 0 || state.turnNumber === 0;
    }

    offerDouble(player) {
      if (!this.canOfferDouble(player)) {
        throw new Error('Katlama yalnız zar atmadan ve pul oynamadan önce, küp hakkı sendeyken teklif edilebilir.');
      }
      const to = opponent(player);
      this.state.pendingDouble = {
        from: player,
        to,
        proposedValue: this.state.cubeValue * 2,
      };
      this.state.turnDeadlineAt = null;
      this.emit('doubleOffered', clone(this.state.pendingDouble));
      this.emit('state', this.getState());
      return this.getState();
    }

    acceptDouble(player) {
      assertPlayer(player);
      const offer = this.state.pendingDouble;
      if (!offer || offer.to !== player) throw new Error('Cevaplanacak katlama teklifi yok.');
      this.state.cubeValue = offer.proposedValue;
      this.state.cubeOwner = player;
      this.state.pendingDouble = null;
      this.state.turnDeadlineAt = null;
      this.emit('doubleAccepted', { player, cubeValue: this.state.cubeValue });
      this.emit('state', this.getState());
      return this.getState();
    }

    declineDouble(player) {
      assertPlayer(player);
      const offer = this.state.pendingDouble;
      if (!offer || offer.to !== player) throw new Error('Reddedilecek katlama teklifi yok.');
      return this.finishForfeit(offer.from, player, 'double-declined', this.state.cubeValue);
    }

    setTurnDeadline(deadlineAt) {
      this.state.turnDeadlineAt = deadlineAt == null ? null : Number(deadlineAt);
      return this.getState();
    }

    registerTimeout(player) {
      assertPlayer(player);
      this.state.timeoutCounts[player] = Number(this.state.timeoutCounts[player] || 0) + 1;
      this.state.turnDeadlineAt = null;
      this.emit('timeout', { player, count: this.state.timeoutCounts[player] });
      return this.state.timeoutCounts[player];
    }

    finishForfeit(winner, loser, reason = 'forfeit', points = this.state.cubeValue) {
      assertPlayer(winner);
      assertPlayer(loser);
      if (winner === loser) throw new Error('Kazanan ve kaybeden aynı olamaz.');
      this.state.pendingDouble = null;
      this.state.finishReason = reason;
      this.state.finalPoints = Math.max(1, Number(points) || 1);
      return this.finishGame(winner);
    }

    direction(player) {
      return player === WHITE ? -1 : 1;
    }

    entryPointFromBar(player, die) {
      // WHITE bar'dan 24-die noktasına girer:
      // die=1 -> 23, die=6 -> 18
      // BLACK die-1:
      // die=1 -> 0, die=6 -> 5
      return player === WHITE ? 24 - die : die - 1;
    }

    distanceToOff(player, pointIndex) {
      // WHITE point 0'dan 1 ile çıkar; point 5'ten 6 ile çıkar.
      // BLACK point 23'ten 1 ile çıkar; point 18'den 6 ile çıkar.
      return player === WHITE ? pointIndex + 1 : 24 - pointIndex;
    }

    homeRange(player) {
      return player === WHITE
        ? { min: 0, max: 5 }
        : { min: 18, max: 23 };
    }

    allCheckersInHome(player, state = this.state) {
      if (state.bar[player] > 0) return false;

      const { min, max } = this.homeRange(player);

      for (let i = 0; i < 24; i++) {
        if (i >= min && i <= max) continue;
        if (state.points[i].owner === player && state.points[i].count > 0) {
          return false;
        }
      }

      return true;
    }

    pointIsOpenFor(player, to, state = this.state) {
      if (to < 0 || to > 23) return false;

      const point = state.points[to];

      return (
        point.count === 0 ||
        point.owner === player ||
        (point.owner === opponent(player) && point.count === 1)
      );
    }

    hasCheckerFartherFromOff(player, from, state = this.state) {
      // Bearing-off'ta zar tam gelmediyse ancak daha uzakta pul yoksa büyük zarla çıkarılabilir.
      if (player === WHITE) {
        // WHITE için daha uzakta = daha yüksek index.
        for (let i = from + 1; i <= 5; i++) {
          if (state.points[i].owner === player && state.points[i].count > 0) {
            return true;
          }
        }
      } else {
        // BLACK için daha uzakta = daha düşük index.
        for (let i = 18; i < from; i++) {
          if (state.points[i].owner === player && state.points[i].count > 0) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Tek bir zar için mevcut state'teki legal hamleleri döndürür.
     *
     * Hamle biçimi:
     * {
     *   from: 'bar' | 0..23,
     *   to: 'off' | 0..23,
     *   die: 1..6,
     *   hit: boolean
     * }
     */
    legalMovesForDie(player, die, state = this.state) {
      assertPlayer(player);
      this.assertDie(die);

      if (state.status !== 'playing') return [];

      const moves = [];

      // Barda pul varsa başka hiçbir pul oynanamaz.
      if (state.bar[player] > 0) {
        const to = this.entryPointFromBar(player, die);

        if (this.pointIsOpenFor(player, to, state)) {
          const target = state.points[to];

          moves.push({
            from: 'bar',
            to,
            die,
            hit: target.owner === opponent(player) && target.count === 1,
          });
        }

        return moves;
      }

      const dir = this.direction(player);
      const canBearOff = this.allCheckersInHome(player, state);

      for (let from = 0; from < 24; from++) {
        const source = state.points[from];

        if (source.owner !== player || source.count <= 0) continue;

        const to = from + dir * die;

        // Normal tahta hamlesi.
        if (to >= 0 && to <= 23) {
          if (this.pointIsOpenFor(player, to, state)) {
            const target = state.points[to];

            moves.push({
              from,
              to,
              die,
              hit: target.owner === opponent(player) && target.count === 1,
            });
          }
          continue;
        }

        // Pul çıkarma.
        if (!canBearOff) continue;

        const exactDistance = this.distanceToOff(player, from);

        if (die === exactDistance) {
          moves.push({
            from,
            to: 'off',
            die,
            hit: false,
          });
          continue;
        }

        // Daha büyük zarla pul çıkarma:
        // sadece o puldan çıkışa daha uzak başka pul yoksa.
        if (
          die > exactDistance &&
          !this.hasCheckerFartherFromOff(player, from, state)
        ) {
          moves.push({
            from,
            to: 'off',
            die,
            hit: false,
          });
        }
      }

      return moves;
    }

    applyMoveToState(state, player, move) {
      const next = clone(state);
      const enemy = opponent(player);

      if (move.from === 'bar') {
        if (next.bar[player] <= 0) {
          throw new Error('Barda oynanacak pul yok.');
        }
        next.bar[player] -= 1;
      } else {
        const source = next.points[move.from];

        if (source.owner !== player || source.count <= 0) {
          throw new Error('Kaynak noktada oyuncunun pulu yok.');
        }

        source.count -= 1;

        if (source.count === 0) {
          source.owner = null;
        }
      }

      if (move.to === 'off') {
        next.off[player] += 1;
        return next;
      }

      const target = next.points[move.to];

      if (target.owner === enemy && target.count === 1) {
        target.owner = null;
        target.count = 0;
        next.bar[enemy] += 1;
      }

      if (target.count === 0) {
        target.owner = player;
        target.count = 1;
      } else if (target.owner === player) {
        target.count += 1;
      } else {
        throw new Error('Kapalı rakip hanesine oynanamaz.');
      }

      return next;
    }

    /**
     * Bir turun tüm olası legal hamle dizilerini üretir.
     * Böylece:
     * - mümkünse iki zarın da kullanılması,
     * - double'da mümkün olan maksimum sayıda hamlenin yapılması,
     * - tek zar oynanabiliyorsa büyük zarın zorunlu olması
     * doğru uygulanabilir.
     */
    getLegalTurnSequences(state = this.state) {
      if (state.status !== 'playing') return [];
      if (!Array.isArray(state.remainingDice) || state.remainingDice.length === 0) {
        return [];
      }

      const player = state.turn;
      const dice = [...state.remainingDice];

      const sequences = [];

      const recurse = (workingState, remainingDice, sequence) => {
        let extended = false;

        // Aynı değerdeki zarları gereksiz tekrar aramamak için unique.
        const uniqueDice = [...new Set(remainingDice)];

        for (const die of uniqueDice) {
          const moves = this.legalMovesForDie(player, die, workingState);

          if (moves.length === 0) continue;

          extended = true;

          for (const move of moves) {
            const nextState = this.applyMoveToState(
              workingState,
              player,
              move
            );

            const nextDice = [...remainingDice];
            nextDice.splice(nextDice.indexOf(die), 1);

            recurse(nextState, nextDice, [...sequence, move]);
          }
        }

        if (!extended) {
          sequences.push(sequence);
        }
      };

      recurse(clone(state), dice, []);

      // Boş sequence'leri hariç tut.
      let legal = sequences.filter((seq) => seq.length > 0);

      if (legal.length === 0) return [];

      // Standart kural: mümkün olan en fazla zar kullanılmalı.
      const maxLength = Math.max(...legal.map((seq) => seq.length));
      legal = legal.filter((seq) => seq.length === maxLength);

      // Farklı iki zar atıldığında yalnızca tek zar oynanabiliyorsa
      // büyük zar kullanılmak zorundadır, eğer büyük zar ile legal bir sequence varsa.
      if (
        dice.length === 2 &&
        dice[0] !== dice[1] &&
        maxLength === 1
      ) {
        const high = Math.max(dice[0], dice[1]);
        const highSequences = legal.filter((seq) => seq[0].die === high);

        if (highSequences.length > 0) {
          legal = highSequences;
        }
      }

      return this.dedupeSequences(legal);
    }

    dedupeSequences(sequences) {
      const seen = new Set();
      const out = [];

      for (const sequence of sequences) {
        const key = sequence
          .map((m) => `${m.from}>${m.to}:${m.die}`)
          .join('|');

        if (!seen.has(key)) {
          seen.add(key);
          out.push(sequence);
        }
      }

      return out;
    }

    getLegalMoves() {
      const sequences = this.getLegalTurnSequences();

      if (sequences.length === 0) return [];

      const seen = new Set();
      const firstMoves = [];

      for (const seq of sequences) {
        const move = seq[0];
        const key = `${move.from}>${move.to}:${move.die}`;

        if (!seen.has(key)) {
          seen.add(key);
          firstMoves.push(clone(move));
        }
      }

      return firstMoves;
    }

    getCombinedMoves() {
      const seen = new Set();
      const combined = [];
      for (const sequence of this.getLegalTurnSequences()) {
        if (sequence.length < 2) continue;
        const first = sequence[0], second = sequence[1];
        if (!Number.isInteger(first.to) || second.from !== first.to) continue;
        const key = `${first.from}>${second.to}:${first.die}+${second.die}`;
        if (seen.has(key)) continue;
        seen.add(key);
        combined.push({ from: first.from, via: first.to, to: second.to, dice: [first.die, second.die], combined: true });
      }
      return combined;
    }

    moveCombined(from, to) {
      const choice = this.getCombinedMoves().find(move => move.from === from && move.to === to);
      if (!choice) throw new Error('Bu toplam hamlede ara hane kapalı veya zarlar uygun değil.');
      this.move(choice.from, choice.via, choice.dice[0]);
      this.move(choice.via, choice.to, choice.dice[1]);
      return this.getState();
    }

    isMoveLegal(from, to, die = null) {
      return this.getLegalMoves().some((move) => {
        if (move.from !== from || move.to !== to) return false;
        return die == null || move.die === die;
      });
    }

    /**
     * UI için kolay kullanım:
     * game.move(23, 18)
     * game.move('bar', 20)
     * game.move(2, 'off')
     *
     * Eğer aynı from/to için iki farklı zar ihtimali varsa `die` verilebilir.
     */
    move(from, to, die = null) {
      if (this.state.status !== 'playing') {
        throw new Error('Oyun bitmiş.');
      }

      if (this.state.remainingDice.length === 0) {
        throw new Error('Önce zar atılmalı.');
      }

      if (this.state.pendingDouble) {
        throw new Error('Katlama teklifi cevaplanmadan pul oynanamaz.');
      }

      const legalMoves = this.getLegalMoves();

      let candidates = legalMoves.filter(
        (m) => m.from === from && m.to === to
      );

      if (die != null) {
        this.assertDie(die);
        candidates = candidates.filter((m) => m.die === die);
      }

      if (candidates.length === 0) {
        throw new Error('Geçersiz tavla hamlesi.');
      }

      // Aynı from/to iki zarla da legal olabiliyorsa düşük zarı keyfi seçmek
      // sonraki hamleyi bozabilir. Legal turn sequence'ler üzerinden en güvenli
      // adayı seçiyoruz.
      const legalSequences = this.getLegalTurnSequences();

      let selected = candidates[0];

      for (const candidate of candidates) {
        const startsAFullLegalSequence = legalSequences.some((seq) => {
          const first = seq[0];
          return (
            first.from === candidate.from &&
            first.to === candidate.to &&
            first.die === candidate.die
          );
        });

        if (startsAFullLegalSequence) {
          selected = candidate;
          break;
        }
      }

      const player = this.state.turn;

      this.state = this.applyMoveToState(
        this.state,
        player,
        selected
      );

      const dieIndex = this.state.remainingDice.indexOf(selected.die);

      if (dieIndex === -1) {
        throw new Error('Kullanılan zar remainingDice içinde bulunamadı.');
      }

      this.state.remainingDice.splice(dieIndex, 1);

      this.state.moveNumber += 1;
      this.state.movesThisTurn += 1;
      this.state.lastMove = {
        player,
        ...selected,
        moveNumber: this.state.moveNumber,
      };

      this.emit('move', clone(this.state.lastMove));
      this.emit('state', this.getState());

      if (this.state.off[player] === 15) {
        this.finishGame(player);
        return this.getState();
      }

      const sequencesAfterMove = this.getLegalTurnSequences();

      // Zar kalmadıysa veya kalan zarlarla hiçbir legal hamle yoksa sıra biter.
      if (
        this.state.remainingDice.length === 0 ||
        sequencesAfterMove.length === 0
      ) {
        this.endTurn({
          reason:
            this.state.remainingDice.length === 0
              ? 'dice-completed'
              : 'no-more-legal-moves',
        });
      }

      return this.getState();
    }

    endTurn(meta = {}) {
      if (this.state.status !== 'playing') return this.getState();

      const previousPlayer = this.state.turn;

      this.state.turn = opponent(previousPlayer);
      this.state.dice = [];
      this.state.remainingDice = [];
      this.state.turnNumber += 1;
      this.state.movesThisTurn = 0;
      this.state.turnDeadlineAt = null;

      this.emit('turnEnd', {
        player: previousPlayer,
        nextPlayer: this.state.turn,
        ...meta,
      });

      this.emit('turn', {
        player: this.state.turn,
      });

      this.emit('state', this.getState());

      return this.getState();
    }

    finishGame(winner) {
      assertPlayer(winner);

      this.state.status = 'finished';
      this.state.winner = winner;
      this.state.dice = [];
      this.state.remainingDice = [];
      this.state.pendingDouble = null;
      this.state.turnDeadlineAt = null;

      const result = this.getGameResult(winner);

      this.emit('gameOver', result);
      this.emit('state', this.getState());

      return result;
    }

    /**
     * Backgammon puanlama:
     * normal = 1
     * gammon = 2 (kaybeden hiç pul çıkarmadı)
     * backgammon = 3 (kaybeden hiç pul çıkarmadı ve bar'da veya
     * kazananın home board'unda en az bir pulu var)
     */
    getGameResult(winner = this.state.winner) {
      if (!winner) return null;

      const loser = opponent(winner);

      if (this.state.finishReason) {
        return {
          winner,
          loser,
          type: 'forfeit',
          reason: this.state.finishReason,
          cubeValue: this.state.cubeValue,
          points: this.state.finalPoints || this.state.cubeValue,
        };
      }

      if (this.state.off[loser] > 0) {
        return {
          winner,
          loser,
          type: 'single',
          cubeValue: this.state.cubeValue,
          points: this.state.cubeValue,
        };
      }

      const winnerHome = this.homeRange(winner);

      let loserInWinnerHome = false;

      for (let i = winnerHome.min; i <= winnerHome.max; i++) {
        const p = this.state.points[i];

        if (p.owner === loser && p.count > 0) {
          loserInWinnerHome = true;
          break;
        }
      }

      if (this.state.bar[loser] > 0 || loserInWinnerHome) {
        return {
          winner,
          loser,
          type: 'backgammon',
          cubeValue: this.state.cubeValue,
          points: 3 * this.state.cubeValue,
        };
      }

      return {
        winner,
        loser,
        type: 'gammon',
        cubeValue: this.state.cubeValue,
        points: 2 * this.state.cubeValue,
      };
    }

    /**
     * UI'da seçilen taş için gidilebilecek hedefleri döndürür.
     */
    getDestinations(from) {
      return this.getLegalMoves()
        .filter((m) => m.from === from)
        .map((m) => ({
          to: m.to,
          die: m.die,
          hit: m.hit,
        }));
    }

    /**
     * Debug / geliştirme kolaylığı.
     */
    countCheckers(player) {
      assertPlayer(player);

      const onBoard = this.state.points.reduce(
        (sum, p) => sum + (p.owner === player ? p.count : 0),
        0
      );

      return {
        onBoard,
        bar: this.state.bar[player],
        off: this.state.off[player],
        total: onBoard + this.state.bar[player] + this.state.off[player],
      };
    }
  }

  global.SPVP = Object.freeze({
    WHITE,
    BLACK,
    StandardBackgammonPvP,
  });
})(typeof window !== 'undefined' ? window : globalThis);
