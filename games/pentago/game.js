/* Пентаго: пять в ряд, но после каждого хода поворачивается четверть доски */
(() => {
  'use strict';

  const N = 6;
  // все отрезки из пяти клеток
  const LINES = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const cells = [];
        for (let k = 0; k < 5; k++) {
          const nx = x + dx * k;
          const ny = y + dy * k;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) break;
          cells.push(ny * N + nx);
        }
        if (cells.length === 5) LINES.push(cells);
      }
    }
  }
  // поворот четверти q (0 — левая верхняя, 1 — правая верхняя, 2 — левая нижняя, 3 — правая нижняя)
  const QUAD = [0, 1, 2, 3].map((q) => {
    const ox = (q % 2) * 3;
    const oy = Math.floor(q / 2) * 3;
    const cells = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push((oy + y) * N + ox + x);
    return cells;
  });
  function rotate(b, q, dir) {
    const c = QUAD[q];
    const old = c.map((i) => b[i]);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        // по часовой: (x, y) ← (y, 2 − x); против: (x, y) ← (2 − y, x)
        const from = dir > 0 ? (2 - x) * 3 + y : x * 3 + (2 - y);
        b[c[y * 3 + x]] = old[from];
      }
    }
  }

  const create = () => ({ b: new Array(N * N).fill(-1), turn: 0, n: 0 });
  const clone = (s) => ({ b: s.b.slice(), turn: s.turn, n: s.n, win: s.win });

  function winners(b) {
    const w = [false, false];
    const lines = [];
    for (const L of LINES) {
      const v = b[L[0]];
      if (v >= 0 && L.every((i) => b[i] === v)) {
        w[v] = true;
        lines.push(L);
      }
    }
    return { w, lines };
  }

  function apply(s, m) {
    s.b[m.c] = s.turn;
    rotate(s.b, m.q, m.d);
    s.n++;
    s.last = m;
    const { w } = winners(s.b);
    if (w[0] && w[1]) s.win = null;
    else if (w[0] || w[1]) s.win = w[0] ? 0 : 1;
    else if (s.n === N * N) s.win = null;
    s.turn = 1 - s.turn;
  }

  function moves(s) {
    if (s.win !== undefined) return [];
    const out = [];
    for (let c = 0; c < N * N; c++) if (s.b[c] < 0) for (let q = 0; q < 4; q++) for (const d of [1, -1]) out.push({ c, q, d });
    return out;
  }

  const legal = (s, m) => !!m && s.win === undefined && Number.isInteger(m.c) && m.c >= 0 && m.c < N * N && s.b[m.c] < 0 && [0, 1, 2, 3].includes(m.q) && (m.d === 1 || m.d === -1);

  // оценка: сколько у стороны «живых» отрезков и насколько они заполнены
  function evaluate(s) {
    const me = s.turn;
    let v = 0;
    for (const L of LINES) {
      let a = 0;
      let o = 0;
      for (const i of L) {
        if (s.b[i] === me) a++;
        else if (s.b[i] === 1 - me) o++;
      }
      if (!o && a) v += a * a * a;
      if (!a && o) v -= o * o * o * 1.2;
    }
    // центр четвертей особенно ценен: он не сдвигается при повороте
    for (const q of QUAD) {
      if (s.b[q[4]] === me) v += 4;
      else if (s.b[q[4]] === 1 - me) v -= 4;
    }
    return v;
  }

  const G = {
    moves,
    play(s, m) {
      const c = clone(s);
      apply(c, m);
      return c;
    },
    terminal(s, depth) {
      if (s.win === undefined) return null;
      if (s.win === null) return 0;
      return s.win === s.turn ? 100000 + depth : -100000 - depth;
    },
    evaluate,
    order(s, ms) {
      // сначала ходы рядом со своими камнями
      const me = s.turn;
      return ms
        .map((m) => {
          let k = 0;
          const x = m.c % N;
          const y = Math.floor(m.c / N);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < N && ny < N && s.b[ny * N + nx] >= 0) k += s.b[ny * N + nx] === me ? 2 : 1;
          }
          return [m, k + Math.random()];
        })
        .sort((a, b) => b[1] - a[1])
        .map((x) => x[0]);
    },
  };

  function ai(s, level) {
    const ms = moves(s);
    // выигрыш сразу
    for (const m of ms) {
      const c = G.play(s, m);
      if (c.win === s.turn) return m;
    }
    if (level === 'easy' && Math.random() < 0.5) return ms[Math.floor(Math.random() * ms.length)];
    return SG.duel.search(s, G, { depth: level === 'hard' ? 3 : 2, timeMs: level === 'hard' ? 1800 : 700 });
  }

  // ---------- интерфейс: сначала клетка, потом поворот ----------

  const boardEl = document.getElementById('board');
  const cells = [];
  const quads = [];
  for (let q = 0; q < 4; q++) {
    const qd = document.createElement('div');
    qd.className = 'pg-quad';
    for (let k = 0; k < 9; k++) {
      const i = QUAD[q][k];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pg-cell';
      b.addEventListener('click', () => pick(i));
      qd.appendChild(b);
      cells[i] = b;
    }
    for (const d of [-1, 1]) {
      const r = document.createElement('button');
      r.type = 'button';
      r.className = 'pg-rot ' + (d > 0 ? 'cw' : 'ccw');
      r.textContent = d > 0 ? '↻' : '↺';
      r.setAttribute('aria-label', 'Повернуть ' + (d > 0 ? 'по часовой' : 'против часовой'));
      r.addEventListener('click', () => turn(q, d));
      qd.appendChild(r);
    }
    boardEl.appendChild(qd);
    quads.push(qd);
  }
  let placed = -1;

  function pick(i) {
    if (!duel.canMove() || duel.state.b[i] >= 0) return;
    placed = placed === i ? -1 : i;
    SG.sound.play('place');
    duel.render();
  }
  function turn(q, d) {
    if (!duel.canMove() || placed < 0) return;
    const c = placed;
    placed = -1;
    duel.play({ c, q, d });
  }

  const duel = SG.duel({
    game: 'pentago',
    sides: ['Белые', 'Чёрные'],
    create,
    legal,
    apply,
    over(s) {
      if (s.win === undefined) return null;
      if (s.win === null) return { winner: null, text: winners(s.b).lines.length ? 'Пять в ряд у обоих!' : 'Доска заполнена.' };
      return { winner: s.win, text: 'Пять в ряд!' };
    },
    hint: () => (placed < 0 ? 'поставьте шарик' : 'поверните любую четверть стрелкой'),
    ai,
    aiDelay: 300,
    sound: () => 'rotate',
    onNew() {
      placed = -1;
    },
    render(s, v) {
      if (!v.canMove) placed = -1;
      const win = s.win !== undefined ? new Set(winners(s.b).lines.flat()) : new Set();
      const last = v.last && v.last.m;
      for (let i = 0; i < N * N; i++) {
        const val = i === placed ? s.turn : s.b[i];
        const c = cells[i];
        c.className = 'pg-cell' + (val === 0 ? ' w' : val === 1 ? ' b' : '') + (i === placed ? ' ghost' : '') + (win.has(i) ? ' win' : '');
        c.disabled = !v.canMove || s.b[i] >= 0;
      }
      quads.forEach((qd, q) => {
        qd.classList.toggle('can-rotate', v.canMove && placed >= 0);
        qd.classList.toggle('turned', !!last && last.q === q);
        qd.dataset.dir = last && last.q === q ? last.d : '';
      });
    },
  });
})();
