/* Хасами-сёги: японские «шашки-клещи» — ходите как ладья и зажимайте фишки соперника с двух сторон */
(() => {
  'use strict';

  const N = 9;
  const WIN = 5; // столько фишек нужно взять
  const LIMIT = 200;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function create() {
    const b = Array(N * N).fill(-1);
    for (let c = 0; c < N; c++) {
      b[(N - 1) * N + c] = 0; // сторона 0 — снизу
      b[c] = 1;
    }
    return { b, turn: 0, taken: [0, 0], n: 0 };
  }

  const at = (s, x, y) => (x >= 0 && y >= 0 && x < N && y < N ? s.b[y * N + x] : -2);

  function moves(s) {
    const out = [];
    for (let i = 0; i < N * N; i++) {
      if (s.b[i] !== s.turn) continue;
      const x = i % N;
      const y = Math.floor(i / N);
      for (const [dx, dy] of DIRS) {
        let nx = x + dx;
        let ny = y + dy;
        while (at(s, nx, ny) === -1) {
          out.push({ f: i, t: ny * N + nx });
          nx += dx;
          ny += dy;
        }
      }
    }
    return out;
  }

  // взятия после хода на клетку t
  function captures(s, t, side) {
    const x = t % N;
    const y = Math.floor(t / N);
    const opp = 1 - side;
    const out = [];
    for (const [dx, dy] of DIRS) {
      const line = [];
      let nx = x + dx;
      let ny = y + dy;
      while (at(s, nx, ny) === opp) {
        line.push(ny * N + nx);
        nx += dx;
        ny += dy;
      }
      if (line.length && at(s, nx, ny) === side) out.push(...line);
    }
    // угол: фишка в углу берётся, если заняты обе соседние клетки
    for (const [cx, cy, ax, ay, bx, by] of [[0, 0, 1, 0, 0, 1], [N - 1, 0, N - 2, 0, N - 1, 1], [0, N - 1, 1, N - 1, 0, N - 2], [N - 1, N - 1, N - 2, N - 1, N - 1, N - 2]]) {
      if (at(s, cx, cy) === opp && at(s, ax, ay) === side && at(s, bx, by) === side && ((ax === x && ay === y) || (bx === x && by === y))) out.push(cy * N + cx);
    }
    return [...new Set(out)];
  }

  function play(s, m) {
    const c = { b: s.b.slice(), turn: s.turn, taken: s.taken.slice(), n: s.n + 1 };
    c.b[m.t] = c.turn;
    c.b[m.f] = -1;
    const cap = captures(c, m.t, c.turn);
    cap.forEach((i) => (c.b[i] = -1));
    c.taken[c.turn] += cap.length;
    c.lastCap = cap;
    c.turn = 1 - c.turn;
    return c;
  }

  const legal = (s, m) => !!m && moves(s).some((x) => x.f === m.f && x.t === m.t);
  function apply(s, m) {
    Object.assign(s, play(s, m));
  }

  function winner(s) {
    if (s.taken[0] >= WIN) return 0;
    if (s.taken[1] >= WIN) return 1;
    if (!moves(s).length) return 1 - s.turn;
    if (s.n >= LIMIT) return s.taken[0] === s.taken[1] ? null : s.taken[0] > s.taken[1] ? 0 : 1;
    return undefined;
  }

  // ---------- компьютер ----------

  const G = {
    moves,
    play,
    terminal(s) {
      const w = winner(s);
      if (w === undefined) return null;
      return w === null ? 0 : w === s.turn ? 10000 : -10000;
    },
    evaluate(s) {
      const me = s.turn;
      let v = (s.taken[me] - s.taken[1 - me]) * 100;
      // фишки под угрозой зажима: рядом соперник, а с другой стороны пусто
      for (let i = 0; i < N * N; i++) {
        if (s.b[i] < 0) continue;
        const x = i % N;
        const y = Math.floor(i / N);
        let risk = 0;
        for (const [dx, dy] of DIRS) if (at(s, x + dx, y + dy) === 1 - s.b[i] && at(s, x - dx, y - dy) === -1) risk++;
        v += (s.b[i] === me ? -1 : 1) * risk * 6;
        // продвижение к центру
        v += (s.b[i] === me ? 1 : -1) * (4 - Math.abs(4 - y)) * 0.8;
      }
      return v;
    },
    order(s, ms) {
      return ms.map((m) => [m, captures({ b: s.b.map((v, k) => (k === m.f ? -1 : k === m.t ? s.turn : v)) }, m.t, s.turn).length + Math.random() * 0.3]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    },
  };

  function ai(s, level) {
    const ms = moves(s);
    if (level === 'easy') {
      const caps = ms.filter((m) => G.order(s, [m]) && captures({ b: s.b.map((v, k) => (k === m.f ? -1 : k === m.t ? s.turn : v)) }, m.t, s.turn).length);
      if (caps.length && Math.random() < 0.7) return caps[Math.floor(Math.random() * caps.length)];
      return SG.duel.search(s, G, { depth: 1, timeMs: 300 });
    }
    return SG.duel.search(s, G, { depth: level === 'hard' ? 3 : 2, timeMs: level === 'hard' ? 2000 : 900 });
  }

  // ---------- интерфейс ----------

  const boardEl = document.getElementById('board');
  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hs-cell';
    b.dataset.i = i;
    b.addEventListener('click', () => click(+b.dataset.i));
    boardEl.appendChild(b);
    cells.push(b);
  }
  let sel = -1;

  function click(i) {
    if (!duel.canMove()) return;
    const s = duel.state;
    if (s.b[i] === s.turn) {
      sel = sel === i ? -1 : i;
      SG.sound.play('click');
      return duel.render();
    }
    if (sel >= 0 && legal(s, { f: sel, t: i })) {
      const f = sel;
      sel = -1;
      duel.play({ f, t: i });
    }
  }

  const duel = SG.duel({
    game: 'hasami',
    sides: ['Красные', 'Синие'],
    create,
    legal,
    apply,
    over(s) {
      const w = winner(s);
      if (w === undefined) return null;
      return { winner: w, text: 'Взято ' + s.taken[0] + ':' + s.taken[1] + '.' };
    },
    hint: () => (sel < 0 ? 'выберите свою фишку' : 'куда пойти? (как ладья)'),
    ai,
    aiDelay: 300,
    sound: (s) => (s.lastCap && s.lastCap.length ? 'capture' : 'place'),
    flipPvp: false,
    onNew() {
      sel = -1;
    },
    render(s, v) {
      if (!v.canMove) sel = -1;
      const flip = v.flip;
      const targets = sel >= 0 ? new Set(moves(s).filter((m) => m.f === sel).map((m) => m.t)) : new Set();
      const last = v.last && v.last.m;
      for (let k = 0; k < N * N; k++) {
        const i = flip ? N * N - 1 - k : k;
        const c = cells[k];
        c.dataset.i = i;
        const p = s.b[i];
        c.className = 'hs-cell' + (targets.has(i) ? ' can' : '') + (i === sel ? ' sel' : '') + (last && (last.f === i || last.t === i) ? ' last' : '') + (s.lastCap && s.lastCap.includes(i) ? ' gone' : '');
        c.innerHTML = p >= 0 ? `<i class="hs-pc s${p}">${p ? '金' : '歩'}</i>` : '';
      }
      document.getElementById('taken').textContent = 'Взято: красные ' + s.taken[0] + ' · синие ' + s.taken[1] + ' (до ' + WIN + ')';
    },
  });
})();
