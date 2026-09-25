/* Абалон: шестиугольное поле, ряды из 1–3 шаров и «сумито» — выталкивайте шары соперника за край */
(() => {
  'use strict';

  const R = 4;
  const WIN = 6;
  const LIMIT = 250;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const CELLS = [];
  const IDX = new Map();
  for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) if (Math.abs(q + r) <= R) {
    IDX.set(q + ',' + r, CELLS.length);
    CELLS.push([q, r]);
  }
  const at = (q, r) => (IDX.has(q + ',' + r) ? IDX.get(q + ',' + r) : -1);
  const NB = CELLS.map(([q, r]) => DIRS.map(([dq, dr]) => at(q + dq, r + dr)));
  const DIST = CELLS.map(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)));

  function create() {
    const b = Array(CELLS.length).fill(-1);
    CELLS.forEach(([q, r], i) => {
      if (r === 4 || r === 3 || (r === 2 && q >= -2 && q <= 0)) b[i] = 0;
      if (r === -4 || r === -3 || (r === -2 && q >= 0 && q <= 2)) b[i] = 1;
    });
    return { b, turn: 0, out: [0, 0], n: 0 };
  }

  // все ходы: группа из 1–3 шаров в линию и направление
  function moves(s) {
    const out = [];
    const me = s.turn;
    const b = s.b;
    for (let i = 0; i < CELLS.length; i++) {
      if (b[i] !== me) continue;
      // одиночный шар
      for (let d = 0; d < 6; d++) {
        const t = NB[i][d];
        if (t >= 0 && b[t] === -1) out.push({ g: [i], d });
      }
      // группы по трём осям (в «положительную» сторону, чтобы не повторяться)
      for (const ax of [0, 2, 4]) {
        const g = [i];
        let k = NB[i][ax];
        while (g.length < 3 && k >= 0 && b[k] === me) {
          g.push(k);
          for (let d = 0; d < 6; d++) {
            const m = check(s, g, d, ax);
            if (m) out.push(m);
          }
          k = NB[k][ax];
        }
      }
    }
    return out;
  }

  // проверка хода группы g (упорядочена вдоль оси ax) в направлении d
  function check(s, g, d, ax) {
    const b = s.b;
    const me = s.turn;
    const inline = d === ax || d === (ax ^ 1);
    if (!inline) {
      for (const c of g) {
        const t = NB[c][d];
        if (t < 0 || b[t] !== -1) return null;
      }
      return { g: g.slice(), d };
    }
    const head = d === ax ? g[g.length - 1] : g[0];
    let t = NB[head][d];
    if (t < 0) return null;
    if (b[t] === -1) return { g: g.slice(), d };
    if (b[t] === me) return null;
    // сумито: соперника меньше, за ним пусто или край
    let k = 0;
    while (t >= 0 && b[t] === 1 - me) {
      k++;
      t = NB[t][d];
    }
    if (k >= g.length) return null;
    if (t >= 0 && b[t] !== -1) return null;
    return { g: g.slice(), d, push: k };
  }

  function play(s, m) {
    const c = { b: s.b.slice(), turn: s.turn, out: s.out.slice(), n: s.n + 1 };
    const me = s.turn;
    const d = m.d;
    if (m.push) {
      // сдвигаем шары соперника от дальнего к ближнему
      const ax = m.g.length > 1 ? (NB[m.g[0]][0] === m.g[1] ? 0 : NB[m.g[0]][2] === m.g[1] ? 2 : 4) : d;
      const head = d === ax ? m.g[m.g.length - 1] : m.g[0];
      const line = [];
      let t = NB[head][d];
      while (t >= 0 && c.b[t] === 1 - me) {
        line.push(t);
        t = NB[t][d];
      }
      for (let k = line.length - 1; k >= 0; k--) {
        const to = NB[line[k]][d];
        if (to < 0) c.out[me]++;
        else c.b[to] = 1 - me;
        c.b[line[k]] = -1;
      }
      c.pushed = true;
    }
    m.g.forEach((x) => (c.b[x] = -1));
    m.g.forEach((x) => (c.b[NB[x][d]] = me));
    c.turn = 1 - me;
    return c;
  }

  const same = (a, b) => a.d === b.d && a.g.length === b.g.length && a.g.slice().sort().join() === b.g.slice().sort().join();
  const legal = (s, m) => !!m && Array.isArray(m.g) && moves(s).some((x) => same(x, m));
  function apply(s, m) {
    const real = moves(s).find((x) => same(x, m));
    Object.assign(s, play(s, real));
    s.last = real;
  }

  function winner(s) {
    if (s.out[0] >= WIN) return 0;
    if (s.out[1] >= WIN) return 1;
    if (s.n >= LIMIT) return s.out[0] === s.out[1] ? null : s.out[0] > s.out[1] ? 0 : 1;
    return undefined;
  }

  // ---------- компьютер ----------

  const G = {
    moves,
    play,
    terminal(s) {
      const w = winner(s);
      if (w === undefined) return null;
      return w === null ? 0 : w === s.turn ? 100000 : -100000;
    },
    evaluate(s) {
      const me = s.turn;
      let v = (s.out[me] - s.out[1 - me]) * 1000;
      for (let i = 0; i < CELLS.length; i++) {
        const p = s.b[i];
        if (p < 0) continue;
        const sign = p === me ? 1 : -1;
        let near = 0;
        for (let d = 0; d < 6; d++) if (NB[i][d] >= 0 && s.b[NB[i][d]] === p) near++;
        v += sign * ((4 - DIST[i]) * 12 + near * 3 - (DIST[i] === 4 ? 10 : 0));
      }
      return v;
    },
    order(s, ms) {
      return ms.map((m) => [m, (m.push ? 50 : 0) + m.g.length * 3 + Math.random()]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    },
  };

  function ai(s, level) {
    if (level === 'easy') return SG.duel.search(s, G, { depth: 1, timeMs: 400 });
    return SG.duel.search(s, G, { depth: level === 'hard' ? 3 : 2, timeMs: level === 'hard' ? 2500 : 1200 });
  }

  // ---------- интерфейс ----------

  const boardEl = document.getElementById('board');
  const cells = CELLS.map(([q, r], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ab-cell';
    const x = 50 + (q + r / 2) * 10.4;
    const y = 50 + r * 9;
    b.style.left = x + '%';
    b.style.top = y + '%';
    b.addEventListener('click', () => click(i));
    boardEl.appendChild(b);
    return b;
  });
  let sel = [];

  // группа должна быть линией соседних шаров
  function lineOk(g) {
    if (g.length <= 1) return true;
    for (const ax of [0, 2, 4]) {
      const sorted = g.slice().sort((a, b) => (CELLS[a][0] * 10 + CELLS[a][1]) - (CELLS[b][0] * 10 + CELLS[b][1]));
      // ищем такую упорядоченность, где каждый следующий — сосед по оси
      for (const start of g) {
        const chain = [start];
        let k = NB[start][ax];
        while (chain.length < g.length && g.includes(k)) {
          chain.push(k);
          k = NB[k][ax];
        }
        if (chain.length === g.length) return true;
      }
      void sorted;
    }
    return false;
  }

  function targetsFor(s) {
    if (!sel.length) return new Map();
    const map = new Map();
    for (const m of moves(s)) {
      if (m.g.length !== sel.length || !sel.every((x) => m.g.includes(x))) continue;
      // куда нажать: для одиночного и «в линию» — клетка перед головой, для «вбок» — соседняя с первым шаром
      let cell;
      if (m.g.length === 1) cell = NB[m.g[0]][m.d];
      else {
        const ax = NB[m.g[0]][0] === m.g[1] ? 0 : NB[m.g[0]][2] === m.g[1] ? 2 : 4;
        if (m.d === ax) cell = NB[m.g[m.g.length - 1]][m.d];
        else if (m.d === (ax ^ 1)) cell = NB[m.g[0]][m.d];
        else cell = NB[m.g[0]][m.d];
      }
      if (cell >= 0) map.set(cell, m);
    }
    return map;
  }

  function click(i) {
    if (!duel.canMove()) return;
    const s = duel.state;
    const t = targetsFor(s);
    if (t.has(i) && !(s.b[i] === s.turn && !sel.includes(i) && lineOk(sel.concat(i)) && sel.length < 3)) {
      const m = t.get(i);
      sel = [];
      return duel.play({ g: m.g, d: m.d });
    }
    if (s.b[i] === s.turn) {
      if (sel.includes(i)) sel = sel.filter((x) => x !== i);
      else if (sel.length < 3 && lineOk(sel.concat(i))) sel.push(i);
      else sel = [i];
      SG.sound.play('click');
      return duel.render();
    }
    sel = [];
    duel.render();
  }

  const duel = SG.duel({
    game: 'abalone',
    sides: ['Белые', 'Чёрные'],
    create,
    legal,
    apply,
    over(s) {
      const w = winner(s);
      if (w === undefined) return null;
      return { winner: w, text: 'Вытолкнуто ' + s.out[0] + ':' + s.out[1] + '.' };
    },
    hint: () => (sel.length ? 'выберите ещё шар в линию или клетку, куда двигать' : 'выберите 1–3 своих шара в линию'),
    ai,
    aiDelay: 300,
    sound: (s) => (s.pushed ? 'hit' : 'slide'),
    onNew() {
      sel = [];
    },
    render(s, v) {
      if (!v.canMove) sel = [];
      const t = v.canMove ? targetsFor(s) : new Map();
      const last = s.last ? new Set(s.last.g.map((x) => NB[x][s.last.d])) : new Set();
      cells.forEach((c, i) => {
        const p = s.b[i];
        c.className = 'ab-cell' + (p === 0 ? ' w' : p === 1 ? ' k' : '') + (sel.includes(i) ? ' sel' : '') + (t.has(i) ? ' can' : '') + (last.has(i) ? ' last' : '');
      });
      document.getElementById('out').innerHTML = 'Вытолкнуто: <b>белыми ' + s.out[0] + '</b> · <b>чёрными ' + s.out[1] + '</b> (до ' + WIN + ')';
    },
  });
})();
