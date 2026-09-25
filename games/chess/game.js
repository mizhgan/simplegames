/* Шахматы: все правила (рокировка, взятие на проходе, превращение, пат, ничьи), компьютер и игра по сети */
(() => {
  'use strict';

  // ---------- движок: доска 0x88 ----------
  // фигуры: 1 пешка, 2 конь, 3 слон, 4 ладья, 5 ферзь, 6 король; чёрные — +8
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const color = (p) => p >> 3;
  const kind = (p) => p & 7;
  const sq = (f, r) => r * 16 + f; // r = 0 — первая горизонталь (белые)
  const fileOf = (s) => s & 7;
  const rankOf = (s) => s >> 4;
  const name = (s) => 'abcdefgh'[fileOf(s)] + (rankOf(s) + 1);

  const DIRS = {
    [N]: [33, 31, 18, 14, -33, -31, -18, -14],
    [B]: [17, 15, -17, -15],
    [R]: [16, -16, 1, -1],
    [Q]: [17, 15, -17, -15, 16, -16, 1, -1],
    [K]: [17, 15, -17, -15, 16, -16, 1, -1],
  };
  const SLIDE = { [B]: true, [R]: true, [Q]: true };

  // флаги ходов
  const CAP = 1, EP = 2, CASTLE = 4, DOUBLE = 8;
  const enc = (f, t, promo, flags) => f | (t << 7) | (promo << 14) | (flags << 17);
  const mFrom = (m) => m & 127;
  const mTo = (m) => (m >> 7) & 127;
  const mPromo = (m) => (m >> 14) & 7;
  const mFlags = (m) => m >> 17;

  function create() {
    const b = new Array(128).fill(0);
    const back = [R, N, B, Q, K, B, N, R];
    for (let f = 0; f < 8; f++) {
      b[sq(f, 0)] = back[f];
      b[sq(f, 1)] = P;
      b[sq(f, 6)] = P + 8;
      b[sq(f, 7)] = back[f] + 8;
    }
    const s = { b, turn: 0, castle: 15, ep: -1, half: 0, kings: [sq(4, 0), sq(4, 7)], reps: {}, moves: [] };
    s.reps[posKey(s)] = 1;
    return s;
  }

  const posKey = (s) => s.b.join(',') + '|' + s.turn + s.castle + '|' + s.ep;

  function attacked(s, t, by) {
    const b = s.b;
    // пешки
    const pd = by === 0 ? -16 : 16;
    for (const d of [pd - 1, pd + 1]) {
      const x = t + d;
      if (!(x & 0x88) && b[x] === P + by * 8) return true;
    }
    for (const d of DIRS[N]) {
      const x = t + d;
      if (!(x & 0x88) && b[x] === N + by * 8) return true;
    }
    for (const d of DIRS[K]) {
      const x = t + d;
      if (!(x & 0x88) && b[x] === K + by * 8) return true;
    }
    for (const d of DIRS[Q]) {
      const diag = d === 17 || d === 15 || d === -17 || d === -15;
      let x = t + d;
      while (!(x & 0x88)) {
        const p = b[x];
        if (p) {
          if (color(p) === by) {
            const k = kind(p);
            if (k === Q || (diag ? k === B : k === R)) return true;
          }
          break;
        }
        x += d;
      }
    }
    return false;
  }

  const inCheck = (s, side) => attacked(s, s.kings[side], 1 - side);

  function genMoves(s, capsOnly) {
    const out = [];
    const b = s.b;
    const me = s.turn;
    for (let f = 0; f < 128; f++) {
      if (f & 0x88) {
        f += 7;
        continue;
      }
      const p = b[f];
      if (!p || color(p) !== me) continue;
      const k = kind(p);
      if (k === P) {
        const dir = me === 0 ? 16 : -16;
        const startRank = me === 0 ? 1 : 6;
        const lastRank = me === 0 ? 7 : 0;
        const t = f + dir;
        if (!capsOnly && !(t & 0x88) && !b[t]) {
          if (rankOf(t) === lastRank) for (const pr of [Q, R, B, N]) out.push(enc(f, t, pr, 0));
          else {
            out.push(enc(f, t, 0, 0));
            const t2 = t + dir;
            if (rankOf(f) === startRank && !b[t2]) out.push(enc(f, t2, 0, DOUBLE));
          }
        }
        for (const d of [dir - 1, dir + 1]) {
          const x = f + d;
          if (x & 0x88) continue;
          if (b[x] && color(b[x]) !== me) {
            if (rankOf(x) === lastRank) for (const pr of [Q, R, B, N]) out.push(enc(f, x, pr, CAP));
            else out.push(enc(f, x, 0, CAP));
          } else if (x === s.ep) out.push(enc(f, x, 0, CAP | EP));
        }
        continue;
      }
      for (const d of DIRS[k]) {
        let x = f + d;
        while (!(x & 0x88)) {
          const q = b[x];
          if (q) {
            if (color(q) !== me) out.push(enc(f, x, 0, CAP));
            break;
          }
          if (!capsOnly) out.push(enc(f, x, 0, 0));
          if (!SLIDE[k]) break;
          x += d;
        }
      }
      if (k === K && !capsOnly) {
        const r0 = me === 0 ? 0 : 7;
        const kb = me === 0 ? 1 : 4;
        const qb = me === 0 ? 2 : 8;
        if (f === sq(4, r0) && !inCheck(s, me)) {
          if (s.castle & kb && !b[sq(5, r0)] && !b[sq(6, r0)] && b[sq(7, r0)] === R + me * 8 && !attacked(s, sq(5, r0), 1 - me) && !attacked(s, sq(6, r0), 1 - me))
            out.push(enc(f, sq(6, r0), 0, CASTLE));
          if (s.castle & qb && !b[sq(3, r0)] && !b[sq(2, r0)] && !b[sq(1, r0)] && b[sq(0, r0)] === R + me * 8 && !attacked(s, sq(3, r0), 1 - me) && !attacked(s, sq(2, r0), 1 - me))
            out.push(enc(f, sq(2, r0), 0, CASTLE));
        }
      }
    }
    return out;
  }

  // права на рокировку теряются, когда трогают короля или ладью (или ладью бьют)
  const CASTLE_MASK = new Array(128).fill(15);
  CASTLE_MASK[sq(4, 0)] = 15 & ~3;
  CASTLE_MASK[sq(7, 0)] = 15 & ~1;
  CASTLE_MASK[sq(0, 0)] = 15 & ~2;
  CASTLE_MASK[sq(4, 7)] = 15 & ~12;
  CASTLE_MASK[sq(7, 7)] = 15 & ~4;
  CASTLE_MASK[sq(0, 7)] = 15 & ~8;

  function make(s, m) {
    const b = s.b;
    const f = mFrom(m);
    const t = mTo(m);
    const fl = mFlags(m);
    const p = b[f];
    const me = s.turn;
    const u = { m, cap: b[t], capSq: t, castle: s.castle, ep: s.ep, half: s.half };
    if (fl & EP) {
      u.capSq = t + (me === 0 ? -16 : 16);
      u.cap = b[u.capSq];
      b[u.capSq] = 0;
    }
    b[t] = mPromo(m) ? mPromo(m) + me * 8 : p;
    b[f] = 0;
    if (fl & CASTLE) {
      const r0 = me === 0 ? 0 : 7;
      if (fileOf(t) === 6) {
        b[sq(5, r0)] = b[sq(7, r0)];
        b[sq(7, r0)] = 0;
      } else {
        b[sq(3, r0)] = b[sq(0, r0)];
        b[sq(0, r0)] = 0;
      }
    }
    if (kind(p) === K) s.kings[me] = t;
    s.castle &= CASTLE_MASK[f] & CASTLE_MASK[t];
    s.ep = fl & DOUBLE ? (f + t) >> 1 : -1;
    s.half = kind(p) === P || u.cap ? 0 : s.half + 1;
    s.turn = 1 - me;
    return u;
  }

  function unmake(s, u) {
    const b = s.b;
    const m = u.m;
    const f = mFrom(m);
    const t = mTo(m);
    const fl = mFlags(m);
    s.turn = 1 - s.turn;
    const me = s.turn;
    const p = mPromo(m) ? P + me * 8 : b[t];
    b[f] = p;
    b[t] = 0;
    b[u.capSq] = u.cap;
    if (fl & CASTLE) {
      const r0 = me === 0 ? 0 : 7;
      if (fileOf(t) === 6) {
        b[sq(7, r0)] = b[sq(5, r0)];
        b[sq(5, r0)] = 0;
      } else {
        b[sq(0, r0)] = b[sq(3, r0)];
        b[sq(3, r0)] = 0;
      }
    }
    if (kind(p) === K) s.kings[me] = f;
    s.castle = u.castle;
    s.ep = u.ep;
    s.half = u.half;
  }

  function legalMoves(s) {
    const me = s.turn;
    return genMoves(s).filter((m) => {
      const u = make(s, m);
      const ok = !inCheck(s, me);
      unmake(s, u);
      return ok;
    });
  }

  function insufficient(s) {
    const minors = [];
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      const k = kind(s.b[i]);
      if (!k || k === K) continue;
      if (k === P || k === R || k === Q) return false;
      minors.push(k);
    }
    return minors.length <= 1;
  }

  // ---------- оценка и поиск ----------

  const VAL = [0, 100, 320, 330, 500, 900, 0];
  // таблицы позиций для белых (a1…h8 по горизонталям снизу вверх)
  const PST = {
    [P]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0, -10, -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0],
    [N]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30, 5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [B]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [R]: [0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [Q]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5, 5, 5, 5, 5, 0, -10, 0, 0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5, -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [K]: [20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20, -10, -20, -30, -30, -40, -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30],
  };
  // в эндшпиле королю лучше идти в центр
  const K_END = [-50, -30, -30, -30, -30, -30, -30, -50, -30, -30, 0, 0, 0, 0, -30, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -20, -10, 0, 0, -10, -20, -30, -50, -40, -30, -20, -20, -30, -40, -50];

  function evaluate(s) {
    let score = 0;
    let heavy = 0;
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) {
        i += 7;
        continue;
      }
      const p = s.b[i];
      if (p && kind(p) !== P && kind(p) !== K) heavy += VAL[kind(p)];
    }
    const endgame = heavy <= 1600;
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) {
        i += 7;
        continue;
      }
      const p = s.b[i];
      if (!p) continue;
      const k = kind(p);
      const c = color(p);
      const idx = (c === 0 ? rankOf(i) : 7 - rankOf(i)) * 8 + fileOf(i);
      const v = VAL[k] + (k === K && endgame ? K_END[idx] : PST[k][idx]);
      score += c === 0 ? v : -v;
    }
    return s.turn === 0 ? score : -score;
  }

  const MATE = 100000;

  function think(s, level) {
    const cfg = { easy: { depth: 1, ms: 200, blunder: 0.35 }, normal: { depth: 3, ms: 900, blunder: 0 }, hard: { depth: 7, ms: 2200, blunder: 0 } }[level];
    const root = { b: s.b.slice(), turn: s.turn, castle: s.castle, ep: s.ep, half: s.half, kings: s.kings.slice() };
    const moves = legalMoves(root);
    if (!moves.length) return null;
    if (Math.random() < cfg.blunder) return moves[Math.floor(Math.random() * moves.length)];
    const deadline = performance.now() + cfg.ms;
    let nodes = 0;
    let stop = false;
    const order = (st, ms) => {
      const b = st.b;
      return ms
        .map((m) => [m, (b[mTo(m)] ? 10 * VAL[kind(b[mTo(m)])] - VAL[kind(b[mFrom(m)])] : 0) + (mPromo(m) ? 800 : 0)])
        .sort((a, c) => c[1] - a[1])
        .map((x) => x[0]);
    };
    function quiesce(st, alpha, beta, qd) {
      const stand = evaluate(st);
      if (stand >= beta) return beta;
      if (alpha < stand) alpha = stand;
      if (qd > 6) return alpha;
      const me = st.turn;
      for (const m of order(st, genMoves(st, true))) {
        const u = make(st, m);
        if (inCheck(st, me)) {
          unmake(st, u);
          continue;
        }
        const v = -quiesce(st, -beta, -alpha, qd + 1);
        unmake(st, u);
        if (v >= beta) return beta;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }
    function nega(st, depth, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && performance.now() > deadline) stop = true;
      if (st.half >= 100) return 0;
      if (depth <= 0) return quiesce(st, alpha, beta, 0);
      const me = st.turn;
      let any = false;
      let best = -Infinity;
      for (const m of order(st, genMoves(st))) {
        const u = make(st, m);
        if (inCheck(st, me)) {
          unmake(st, u);
          continue;
        }
        any = true;
        const v = -nega(st, depth - 1, -beta, -alpha, ply + 1);
        unmake(st, u);
        if (stop) return best === -Infinity ? 0 : best;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      if (!any) return inCheck(st, me) ? -MATE + ply : 0;
      return best;
    }
    // перемешиваем, чтобы при равных оценках компьютер играл разнообразно
    let rootMoves = order(root, SG.shuffle(moves.slice()));
    let bestMove = rootMoves[0];
    for (let d = 1; d <= cfg.depth; d++) {
      const scored = [];
      let alpha = -Infinity;
      for (const m of rootMoves) {
        const u = make(root, m);
        // повтор позиции оцениваем как ничью, чтобы компьютер не ходил по кругу в выигранной позиции
        const rep = (s.reps[posKey(root)] || 0) >= 2;
        const v = rep ? 0 : -nega(root, d - 1, -Infinity, -alpha, 1);
        unmake(root, u);
        if (stop) break;
        scored.push([v, m]);
        if (v > alpha) alpha = v;
      }
      if (stop && scored.length < rootMoves.length && d > 1) {
        // незаконченная итерация: берём её лучший ход, только если он лучше прежнего
        scored.sort((a, c) => c[0] - a[0]);
        if (scored.length) bestMove = scored[0][1];
        break;
      }
      // сортировка устойчивая: среди равных остаётся первый найденный (точная оценка, а не граница)
      scored.sort((a, c) => c[0] - a[0]);
      rootMoves = scored.map((x) => x[1]);
      bestMove = rootMoves[0];
      if (scored[0][0] > MATE - 100 || stop) break;
    }
    return bestMove;
  }

  // ---------- запись ходов ----------

  const FIG = { [K]: '♔', [Q]: '♕', [R]: '♖', [B]: '♗', [N]: '♘' };
  const GLYPH = { [K]: '♚', [Q]: '♛', [R]: '♜', [B]: '♝', [N]: '♞', [P]: '♟' };

  function san(s, m) {
    const f = mFrom(m);
    const t = mTo(m);
    const p = s.b[f];
    const k = kind(p);
    let out;
    if (mFlags(m) & CASTLE) out = fileOf(t) === 6 ? 'O-O' : 'O-O-O';
    else {
      out = '';
      if (k !== P) {
        out = FIG[k];
        const others = legalMoves(s).filter((x) => x !== m && mTo(x) === t && s.b[mFrom(x)] === p);
        if (others.length) {
          if (others.every((x) => fileOf(mFrom(x)) !== fileOf(f))) out += 'abcdefgh'[fileOf(f)];
          else if (others.every((x) => rankOf(mFrom(x)) !== rankOf(f))) out += rankOf(f) + 1;
          else out += name(f);
        }
      }
      if (mFlags(m) & CAP) out += (k === P ? 'abcdefgh'[fileOf(f)] : '') + '×';
      out += name(t);
      if (mPromo(m)) out += '=' + FIG[mPromo(m)];
    }
    const u = make(s, m);
    const check = inCheck(s, s.turn);
    const mate = check && !legalMoves(s).length;
    unmake(s, u);
    return out + (mate ? '#' : check ? '+' : '');
  }

  // ---------- правила для каркаса ----------

  const toMove = (m) => ({ f: mFrom(m), t: mTo(m), p: mPromo(m) });
  const findMove = (s, mv) =>
    mv && legalMoves(s).find((m) => mFrom(m) === mv.f && mTo(m) === mv.t && mPromo(m) === (mv.p || 0));

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const movesEl = $('moves');
  const promoEl = $('promo');
  let selected = -1;
  let pendingPromo = null;
  let lastSound = 'move';

  const cells = [];
  for (let i = 0; i < 64; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ch-cell';
    b.addEventListener('click', () => clickCell(b.sqIndex));
    boardEl.appendChild(b);
    cells.push(b);
  }

  function clickCell(t) {
    const s = duel.state;
    if (!duel.canMove() || pendingPromo) return;
    const p = s.b[t];
    if (p && color(p) === s.turn) {
      selected = selected === t ? -1 : t;
      SG.sound.play('click');
      return duel.render();
    }
    if (selected < 0) return;
    const opts = legalMoves(s).filter((m) => mFrom(m) === selected && mTo(m) === t);
    if (!opts.length) {
      selected = -1;
      return duel.render();
    }
    if (opts.length > 1) {
      // превращение пешки — выбираем фигуру
      pendingPromo = opts;
      promoEl.innerHTML = '';
      for (const pr of [Q, R, B, N]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ch-piece ' + (s.turn ? 'black' : 'white');
        b.textContent = GLYPH[pr];
        b.addEventListener('click', () => {
          promoEl.hidden = true;
          const m = pendingPromo.find((x) => mPromo(x) === pr);
          pendingPromo = null;
          selected = -1;
          duel.play(toMove(m));
        });
        promoEl.appendChild(b);
      }
      promoEl.hidden = false;
      return;
    }
    selected = -1;
    duel.play(toMove(opts[0]));
  }

  const duel = SG.duel({
    game: 'chess',
    sides: ['Белые', 'Чёрные'],
    create,
    legal: (s, mv) => !!findMove(s, mv),
    apply(s, mv) {
      const m = findMove(s, mv);
      const note = san(s, m);
      lastSound = mFlags(m) & CAP ? 'capture' : mFlags(m) & CASTLE ? 'slide' : 'move';
      make(s, m);
      if (inCheck(s, s.turn)) lastSound = 'hint';
      s.moves.push(note);
      const k = posKey(s);
      s.reps[k] = (s.reps[k] || 0) + 1;
      s.lastRep = s.reps[k];
      s.last = [mFrom(m), mTo(m)];
    },
    sound: () => lastSound,
    over(s) {
      if (!legalMoves(s).length) return inCheck(s, s.turn) ? { winner: 1 - s.turn, text: 'Мат!' } : { winner: null, text: 'Пат.' };
      if (s.half >= 100) return { winner: null, text: '50 ходов без взятий и ходов пешками.' };
      if (s.lastRep >= 3) return { winner: null, text: 'Троекратное повторение позиции.' };
      if (insufficient(s)) return { winner: null, text: 'Никто не может поставить мат.' };
      return null;
    },
    hint: (s) => (inCheck(s, s.turn) ? 'шах!' : ''),
    ai: (s, level) => {
      const m = think(s, level);
      return m === null ? null : toMove(m);
    },
    aiDelay: 200,
    onNew() {
      selected = -1;
      pendingPromo = null;
      promoEl.hidden = true;
    },
    render(s, v) {
      if (!v.canMove) selected = -1;
      const targets = new Set(selected >= 0 ? legalMoves(s).filter((m) => mFrom(m) === selected).map(mTo) : []);
      const check = inCheck(s, s.turn) ? s.kings[s.turn] : -1;
      boardEl.classList.toggle('flipped', v.flip);
      for (let i = 0; i < 64; i++) {
        const r = v.flip ? Math.floor(i / 8) : 7 - Math.floor(i / 8);
        const f = v.flip ? 7 - (i % 8) : i % 8;
        const t = sq(f, r);
        const c = cells[i];
        c.sqIndex = t;
        const p = s.b[t];
        c.className = 'ch-cell ' + ((f + r) % 2 ? 'light' : 'dark');
        if (s.last && s.last.includes(t)) c.classList.add('last');
        if (t === selected) c.classList.add('sel');
        if (targets.has(t)) c.classList.add(p ? 'target-cap' : 'target');
        if (t === check) c.classList.add('check');
        c.innerHTML = p ? `<span class="ch-piece ${color(p) ? 'black' : 'white'}">${GLYPH[kind(p)]}</span>` : '';
        c.setAttribute('aria-label', name(t) + (p ? ' ' + (color(p) ? 'чёрн. ' : 'бел. ') + ['', 'пешка', 'конь', 'слон', 'ладья', 'ферзь', 'король'][kind(p)] : ''));
        const coords = (i % 8 === 0 ? `<i class="rk">${r + 1}</i>` : '') + (i >= 56 ? `<i class="fl">${'abcdefgh'[f]}</i>` : '');
        if (coords) c.insertAdjacentHTML('beforeend', coords);
      }
      let html = '';
      for (let i = 0; i < s.moves.length; i += 2) html += `<li><b>${i / 2 + 1}.</b> ${s.moves[i]} ${s.moves[i + 1] || ''}</li>`;
      movesEl.innerHTML = html || '<li class="empty">Ходов пока нет</li>';
      movesEl.scrollTop = movesEl.scrollHeight;
    },
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected >= 0) {
      selected = -1;
      duel.render();
    }
  });

  // для тестов
  window.__chess = { evaluate, legalMoves, make, unmake, create, toMove, name, think, sq };
})();
