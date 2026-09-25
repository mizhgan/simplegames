/* Уголки: перевести свои 9 шашек в противоположный угол, шагая или прыгая через шашки */
(() => {
  'use strict';

  const N = 8;
  const K = 3; // угол 3×3
  const HOME = [[], []];
  for (let r = 0; r < K; r++) {
    for (let c = 0; c < K; c++) {
      HOME[0].push(r * N + c); // белые: левый нижний угол (строка 0 — нижняя)
      HOME[1].push((N - 1 - r) * N + (N - 1 - c)); // чёрные: правый верхний
    }
  }
  const TARGET = [HOME[1], HOME[0]];
  const HOME_LIMIT = 80; // через 40 ходов каждого из своего угла нужно уйти
  const PLY_LIMIT = 300;

  const rc = (i) => [Math.floor(i / N), i % N];
  // расстояние до дальнего угла цели
  const DIST = [
    Array.from({ length: N * N }, (_, i) => { const [r, c] = rc(i); return N - 1 - r + (N - 1 - c); }),
    Array.from({ length: N * N }, (_, i) => { const [r, c] = rc(i); return r + c; }),
  ];

  function create() {
    const b = new Array(N * N).fill(-1);
    HOME[0].forEach((i) => (b[i] = 0));
    HOME[1].forEach((i) => (b[i] = 1));
    return { b, turn: 0, ply: 0 };
  }
  const clone = (s) => ({ b: s.b.slice(), turn: s.turn, ply: s.ply, doneAt: s.doneAt });

  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // все ходы шашки: шаги и цепочки прыжков (кратчайший путь до каждой клетки)
  function pieceMoves(b, from) {
    const out = [];
    const [r0, c0] = rc(from);
    for (const [dr, dc] of STEPS) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] < 0) out.push([from, r * N + c]);
    }
    const seen = new Set([from]);
    const queue = [[from]];
    while (queue.length) {
      const path = queue.shift();
      const [r, c] = rc(path[path.length - 1]);
      for (const [dr, dc] of STEPS) {
        const mr = r + dr;
        const mc = c + dc;
        const tr = r + 2 * dr;
        const tc = c + 2 * dc;
        if (tr < 0 || tr >= N || tc < 0 || tc >= N) continue;
        const t = tr * N + tc;
        if (b[mr * N + mc] < 0 || b[t] >= 0 || seen.has(t)) continue;
        seen.add(t);
        const np = path.concat(t);
        out.push(np);
        queue.push(np);
      }
    }
    return out;
  }

  function moves(s) {
    if (s.result) return [];
    const out = [];
    for (let i = 0; i < N * N; i++) if (s.b[i] === s.turn) for (const p of pieceMoves(s.b, i)) out.push(p);
    return out;
  }

  const full = (b, side) => TARGET[side].every((i) => b[i] === side);
  const atHome = (b, side) => HOME[side].some((i) => b[i] === side);
  const distSum = (b, side) => {
    let d = 0;
    for (let i = 0; i < N * N; i++) if (b[i] === side) d += DIST[side][i];
    return d;
  };

  // сколько ещё идти: шашкам вне цели — до ближайшей свободной клетки цели, плюс немного за глубину
  const TSET = [new Set(TARGET[0]), new Set(TARGET[1])];
  function cost(b, side) {
    const free = TARGET[side].filter((i) => b[i] !== side);
    let c = 0;
    for (let i = 0; i < N * N; i++) {
      if (b[i] !== side) continue;
      c += DIST[side][i] * 0.3;
      if (TSET[side].has(i)) continue;
      const [r, cc] = rc(i);
      let best = 99;
      for (const t of free) {
        const [tr, tc] = rc(t);
        const d = Math.abs(tr - r) + Math.abs(tc - cc);
        if (d < best) best = d;
      }
      c += best * 2;
    }
    return c;
  }

  function apply(s, path) {
    const from = path[0];
    const to = path[path.length - 1];
    const me = s.turn;
    s.b[to] = me;
    s.b[from] = -1;
    s.ply++;
    s.last = path;
    s.turn = 1 - me;
    s.result = judge(s, me);
  }

  // итог после хода стороны me
  function judge(s, me) {
    const done0 = full(s.b, 0);
    const done1 = full(s.b, 1);
    if (me === 0 && done0 && !done1) {
      // белые пришли первыми — у чёрных есть ещё один ход, чтобы сравнять
      if (!moves(Object.assign(clone(s), { result: null })).some((p) => {
        const b = s.b.slice();
        b[p[p.length - 1]] = 1;
        b[p[0]] = -1;
        return full(b, 1);
      })) return { winner: 0, text: 'Белые первыми заняли угол.' };
      return null;
    }
    if (me === 1 && done1) return done0 ? { winner: null, text: 'Обе стороны заняли углы за равное число ходов.' } : { winner: 1, text: 'Чёрные первыми заняли угол.' };
    if (me === 1 && done0) return { winner: 0, text: 'Белые первыми заняли угол.' };
    if (s.ply === HOME_LIMIT) {
      const h0 = atHome(s.b, 0);
      const h1 = atHome(s.b, 1);
      if (h0 && h1) return { winner: null, text: 'Обе стороны не вывели шашки из дома за 40 ходов.' };
      if (h0) return { winner: 1, text: 'Белые не вывели шашки из дома за 40 ходов.' };
      if (h1) return { winner: 0, text: 'Чёрные не вывели шашки из дома за 40 ходов.' };
    }
    if (s.ply >= PLY_LIMIT) {
      const d0 = distSum(s.b, 0);
      const d1 = distSum(s.b, 1);
      return { winner: d0 === d1 ? null : d0 < d1 ? 0 : 1, text: 'Лимит ходов: побеждает тот, кто ближе к цели.' };
    }
    if (!moves(s).length) return { winner: me, text: 'Соперник заперт.' };
    return null;
  }

  const legal = (s, p) => Array.isArray(p) && moves(s).some((x) => x.length === p.length && x.every((v, i) => v === p[i]));

  const G = {
    moves,
    play(s, m) {
      const c = clone(s);
      apply(c, m);
      return c;
    },
    terminal(s, depth) {
      if (!s.result) return null;
      if (s.result.winner === null) return 0;
      return s.result.winner === s.turn ? 10000 + depth : -10000 - depth;
    },
    evaluate(s) {
      const me = s.turn;
      let v = cost(s.b, 1 - me) - cost(s.b, me);
      // отставшие шашки в своём доме — плохо
      for (const side of [0, 1]) {
        let home = 0;
        HOME[side].forEach((i) => s.b[i] === side && home++);
        // чем ближе срок (40 ходов), тем дороже шашка, оставшаяся дома; отстающая шашка тоже плохо
        let worst = 0;
        for (let i = 0; i < N * N; i++) if (s.b[i] === side && DIST[side][i] > worst) worst = DIST[side][i];
        const pen = home * (3 + s.ply * 0.5) + worst * 2;
        v += side === me ? -pen : pen;
      }
      return v;
    },
    order: (s, ms) => {
      const me = s.turn;
      return ms
        .map((p) => [p, DIST[me][p[0]] - DIST[me][p[p.length - 1]]])
        .sort((a, b) => b[1] - a[1])
        .map((x) => x[0]);
    },
  };

  const LEVEL = { easy: [1, 200], normal: [2, 600], hard: [3, 1500] };

  // ---------- отрисовка ----------

  const boardEl = document.getElementById('board');
  const cells = [];
  for (let k = 0; k < N * N; k++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ug-cell';
    b.addEventListener('click', () => click(b.idx));
    boardEl.appendChild(b);
    cells.push(b);
  }
  let sel = -1;

  function click(i) {
    const s = duel.state;
    if (!duel.canMove()) return;
    if (s.b[i] === s.turn) {
      sel = sel === i ? -1 : i;
      SG.sound.play('click');
      return duel.render();
    }
    if (sel < 0) return;
    const path = pieceMoves(s.b, sel).find((p) => p[p.length - 1] === i);
    if (!path) {
      sel = -1;
      return duel.render();
    }
    sel = -1;
    duel.play(path);
  }

  const duel = SG.duel({
    game: 'ugolki',
    sides: ['Белые', 'Чёрные'],
    create,
    legal,
    apply,
    over: (s) => s.result || null,
    hint: (s) => (sel >= 0 ? 'куда пойти?' : s.turn === 0 ? 'ведите шашки в правый верхний угол' : 'ведите шашки в левый нижний угол'),
    ai(s, level) {
      const [depth, ms] = LEVEL[level];
      if (level === 'easy' && Math.random() < 0.3) {
        const all = moves(s).filter((p) => DIST[s.turn][p[p.length - 1]] < DIST[s.turn][p[0]]);
        if (all.length) return all[Math.floor(Math.random() * all.length)];
      }
      return SG.duel.search(s, G, { depth, timeMs: ms });
    },
    aiDelay: 350,
    onNew() {
      sel = -1;
    },
    sound: (s, m) => (m.length > 2 || Math.abs(m[1] - m[0]) > 1 && Math.abs(m[1] - m[0]) !== N ? 'jump' : 'move'),
    render(s, v) {
      if (!v.canMove) sel = -1;
      const targets = new Set(sel >= 0 ? pieceMoves(s.b, sel).map((p) => p[p.length - 1]) : []);
      const lastPath = s.last ? new Set(s.last) : new Set();
      const tgt0 = new Set(TARGET[0]);
      const tgt1 = new Set(TARGET[1]);
      for (let k = 0; k < N * N; k++) {
        // своя сторона снизу: для чёрных доска повёрнута
        const r = v.flip ? Math.floor(k / N) : N - 1 - Math.floor(k / N);
        const c = v.flip ? N - 1 - (k % N) : k % N;
        const i = r * N + c;
        const el = cells[k];
        el.idx = i;
        const p = s.b[i];
        let cls = 'ug-cell ' + ((r + c) % 2 ? 'light' : 'dark');
        if (tgt0.has(i)) cls += ' zone-0';
        if (tgt1.has(i)) cls += ' zone-1';
        if (lastPath.has(i)) cls += ' last';
        if (i === sel) cls += ' sel';
        if (targets.has(i)) cls += ' target';
        el.className = cls;
        el.innerHTML = p >= 0 ? `<span class="ug-man ${p ? 'black' : 'white'}${v.canMove && p === s.turn ? ' mine' : ''}"></span>` : '';
      }
    },
  });
})();
