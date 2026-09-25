/* Тетрис-баттл: у каждого свой стакан, сожжённые линии прилетают сопернику мусором */
(() => {
  'use strict';

  const BW = 10;
  const BH = 20;
  const CELL = 19;
  const W = 640;
  const H = 420;
  const OX = [20, 430]; // левый край стаканов
  const OY = 20;
  const COLORS = ['', '#22d3ee', '#fbbf24', '#a855f7', '#22c55e', '#ef4444', '#3b82f6', '#f97316', '#6b7280'];
  // фигуры: список поворотов, каждый — клетки [x, y]
  const SHAPES = [
    null,
    [[0, 1], [1, 1], [2, 1], [3, 1]], // I
    [[1, 0], [2, 0], [1, 1], [2, 1]], // O
    [[1, 0], [0, 1], [1, 1], [2, 1]], // T
    [[1, 0], [2, 0], [0, 1], [1, 1]], // S
    [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
    [[0, 0], [0, 1], [1, 1], [2, 1]], // J
    [[2, 0], [0, 1], [1, 1], [2, 1]], // L
  ];
  const SIZE = [0, 4, 4, 3, 3, 3, 3, 3];
  const GARBAGE = [0, 0, 1, 2, 4]; // сколько линий мусора за 1–4 сожжённые

  function cellsOf(p) {
    const n = SIZE[p.t];
    return SHAPES[p.t].map(([x, y]) => {
      for (let k = 0; k < p.r; k++) [x, y] = [n - 1 - y, x];
      return [p.x + x, p.y + y];
    });
  }

  function fits(b, p) {
    return cellsOf(p).every(([x, y]) => x >= 0 && x < BW && y < BH && (y < 0 || !b.grid[y * BW + x]));
  }

  function nextType(b) {
    if (!b.bag.length) b.bag = SG.shuffle([1, 2, 3, 4, 5, 6, 7]);
    return b.bag.pop();
  }

  function spawn(b) {
    const t = b.next;
    b.next = nextType(b);
    b.piece = { t, r: 0, x: 3, y: t === 1 ? -1 : 0 };
    b.lock = 0;
    if (!fits(b, b.piece)) b.dead = true;
  }

  function newBoard() {
    const b = { grid: new Array(BW * BH).fill(0), bag: [], lines: 0, pending: 0, dead: false, fall: 0, rep: {}, prev: {}, flash: 0 };
    b.next = nextType(b);
    spawn(b);
    return b;
  }

  function create() {
    return { boards: [newBoard(), newBoard()], time: 0, id: Math.floor(Math.random() * 1e9) };
  }

  // скорость падения растёт со временем: клеток в секунду
  const speed = (s) => Math.min(12, 1.2 + s.time / 25);

  function lockPiece(s, i, fx) {
    const b = s.boards[i];
    cellsOf(b.piece).forEach(([x, y]) => y >= 0 && (b.grid[y * BW + x] = b.piece.t));
    if (cellsOf(b.piece).some(([, y]) => y < 0)) {
      b.dead = true;
      return;
    }
    let cleared = 0;
    for (let y = BH - 1; y >= 0; y--) {
      if (b.grid.slice(y * BW, y * BW + BW).every(Boolean)) {
        b.grid.splice(y * BW, BW);
        b.grid.unshift(...new Array(BW).fill(0));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      b.lines += cleared;
      b.flash = 0.25;
      fx(cleared >= 4 ? 'win' : 'match');
      // сожжённые линии сначала гасят входящий мусор, остальное летит сопернику
      let send = GARBAGE[cleared];
      const cancel = Math.min(send, b.pending);
      b.pending -= cancel;
      send -= cancel;
      if (send) s.boards[1 - i].pending += send;
    } else fx('drop');
    // мусор приходит, когда фигура легла
    if (b.pending) {
      const n = Math.min(b.pending, 8);
      b.pending -= n;
      const hole = Math.floor(Math.random() * BW);
      if (b.grid.slice(0, n * BW).some(Boolean)) b.dead = true;
      b.grid.splice(0, n * BW);
      for (let k = 0; k < n; k++) b.grid.push(...Array.from({ length: BW }, (_, x) => (x === hole ? 0 : 8)));
      fx('hit');
    }
    if (!b.dead) spawn(b);
  }

  // нажатие с автоповтором: сразу, затем через 10 кадров каждые 3
  function pressed(b, inp, k, repeat) {
    if (!inp[k]) {
      b.rep[k] = 0;
      return false;
    }
    const n = (b.rep[k] = (b.rep[k] || 0) + 1);
    return n === 1 || (repeat && n > 10 && n % 3 === 0);
  }

  function step(s, inputs, dt, fx) {
    s.time += dt;
    s.boards.forEach((b, i) => {
      if (b.dead) return;
      if (b.flash > 0) b.flash -= dt;
      const inp = inputs[i];
      const p = b.piece;
      const tryMove = (dx, dy, dr) => {
        const q = { t: p.t, r: (p.r + dr) % 4, x: p.x + dx, y: p.y + dy };
        if (fits(b, q)) {
          Object.assign(p, q);
          return true;
        }
        return false;
      };
      if (pressed(b, inp, 'l', true)) tryMove(-1, 0, 0);
      if (pressed(b, inp, 'r', true)) tryMove(1, 0, 0);
      // поворот с простыми «пинками» от стенок
      if (pressed(b, inp, 'u', false)) tryMove(0, 0, 1) || tryMove(-1, 0, 1) || tryMove(1, 0, 1) || tryMove(0, -1, 1) || tryMove(2, 0, 1) || tryMove(-2, 0, 1);
      if (pressed(b, inp, 'f', false)) {
        while (tryMove(0, 1, 0));
        lockPiece(s, i, fx);
        return;
      }
      const soft = inp.d ? 18 : 0;
      b.fall += dt * Math.max(speed(s), soft);
      while (b.fall >= 1) {
        b.fall -= 1;
        if (!tryMove(0, 1, 0)) {
          b.lock += 1;
          break;
        }
        b.lock = 0;
      }
      // фигура на дне — ещё полсекунды на доводку
      if (!fits(b, { t: p.t, r: p.r, x: p.x, y: p.y + 1 })) {
        b.lockT = (b.lockT || 0) + dt;
        if (b.lockT > 0.5) {
          b.lockT = 0;
          lockPiece(s, i, fx);
        }
      } else b.lockT = 0;
    });
  }

  // ---------- компьютер: оценивает все положения фигуры и ведёт её туда ----------

  function evaluate(grid) {
    let holes = 0;
    let agg = 0;
    let bump = 0;
    let prevH = -1;
    for (let x = 0; x < BW; x++) {
      let h = 0;
      let seen = false;
      for (let y = 0; y < BH; y++) {
        if (grid[y * BW + x]) {
          if (!seen) h = BH - y;
          seen = true;
        } else if (seen) holes++;
      }
      agg += h;
      if (prevH >= 0) bump += Math.abs(h - prevH);
      prevH = h;
    }
    return { holes, agg, bump };
  }

  function plan(b, level) {
    let best = null;
    const p = b.piece;
    for (let r = 0; r < 4; r++) {
      for (let x = -2; x < BW; x++) {
        const q = { t: p.t, r, x, y: p.y };
        if (!fits(b, q)) continue;
        while (fits(b, { ...q, y: q.y + 1 })) q.y++;
        const g = b.grid.slice();
        cellsOf(q).forEach(([cx, cy]) => cy >= 0 && (g[cy * BW + cx] = 1));
        let lines = 0;
        for (let y = 0; y < BH; y++) if (g.slice(y * BW, y * BW + BW).every(Boolean)) lines++;
        const clean = g.slice();
        for (let y = BH - 1; y >= 0; y--) {
          if (clean.slice(y * BW, y * BW + BW).every(Boolean)) {
            clean.splice(y * BW, BW);
            clean.unshift(...new Array(BW).fill(0));
            y++;
          }
        }
        const e = evaluate(clean);
        let v = -0.51 * e.agg + 0.76 * lines - 0.36 * e.holes * (level === 'easy' ? 0.5 : 1) - 0.18 * e.bump;
        if (level === 'easy') v += Math.random() * 2.5;
        if (!best || v > best.v) best = { v, r, x };
      }
    }
    return best;
  }

  const aiState = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const b = s.boards[side];
    if (b.dead) return inp;
    const st = aiState[side];
    const key = s.id + ':' + b.lines + ':' + b.piece.t + ':' + b.next + ':' + b.grid.filter(Boolean).length;
    if (st.key !== key) {
      st.key = key;
      st.target = plan(b, level);
      st.wait = 0;
    }
    // скорость рук: действие раз в несколько кадров
    const every = level === 'easy' ? 14 : level === 'normal' ? 8 : 4;
    if (++st.wait % every) return inp;
    const t = st.target;
    if (!t) return inp;
    const p = b.piece;
    if (p.r !== t.r) inp.u = true;
    else if (p.x < t.x) inp.r = true;
    else if (p.x > t.x) inp.l = true;
    else if (level !== 'easy') inp.f = true;
    else inp.d = true;
    return inp;
  }

  // ---------- отрисовка ----------

  function drawBoard(g, s, i, v) {
    const b = s.boards[i];
    const c = v.colors;
    const ox = OX[i];
    g.fillStyle = c.cell;
    g.fillRect(ox - 3, OY - 3, BW * CELL + 6, BH * CELL + 6);
    g.fillStyle = c.bg;
    g.fillRect(ox, OY, BW * CELL, BH * CELL);
    g.strokeStyle = c.line;
    g.globalAlpha = 0.25;
    g.beginPath();
    for (let x = 1; x < BW; x++) {
      g.moveTo(ox + x * CELL, OY);
      g.lineTo(ox + x * CELL, OY + BH * CELL);
    }
    for (let y = 1; y < BH; y++) {
      g.moveTo(ox, OY + y * CELL);
      g.lineTo(ox + BW * CELL, OY + y * CELL);
    }
    g.stroke();
    g.globalAlpha = 1;
    const block = (x, y, t, alpha) => {
      g.globalAlpha = alpha;
      g.fillStyle = COLORS[t];
      g.fillRect(ox + x * CELL + 1, OY + y * CELL + 1, CELL - 2, CELL - 2);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(ox + x * CELL + 1, OY + y * CELL + 1, CELL - 2, 3);
      g.globalAlpha = 1;
    };
    for (let k = 0; k < b.grid.length; k++) if (b.grid[k]) block(k % BW, Math.floor(k / BW), b.grid[k], b.dead ? 0.4 : 1);
    if (!b.dead && b.piece) {
      // тень
      const gh = { ...b.piece };
      while (fits(b, { ...gh, y: gh.y + 1 })) gh.y++;
      cellsOf(gh).forEach(([x, y]) => y >= 0 && block(x, y, b.piece.t, 0.2));
      cellsOf(b.piece).forEach(([x, y]) => y >= 0 && block(x, y, b.piece.t, 1));
    }
    // входящий мусор — красная полоска слева
    if (b.pending) {
      g.fillStyle = c.danger;
      const h = Math.min(BH, b.pending) * CELL;
      g.fillRect(ox - 10, OY + BH * CELL - h, 5, h);
    }
    // следующая фигура
    // у левого стакана подписи справа от него, у правого — слева, выровнены к стакану
    const tx = i === 0 ? ox + BW * CELL + 14 : ox - 14;
    const px = i === 0 ? tx : tx - 60;
    g.fillStyle = c.muted;
    g.font = '700 12px system-ui, sans-serif';
    g.textAlign = i === 0 ? 'left' : 'right';
    g.textBaseline = 'top';
    g.fillText('Далее', tx, OY);
    SHAPES[b.next].forEach(([x, y]) => {
      g.fillStyle = COLORS[b.next];
      g.fillRect(px + x * 15, OY + 22 + y * 15, 13, 13);
    });
    g.fillStyle = c.text;
    g.font = '800 15px system-ui, sans-serif';
    g.fillText('Линии: ' + b.lines, tx, OY + 70);
    g.fillStyle = i ? '#ef4444' : '#3b82f6';
    g.fillText(names(v)[i], tx, OY + 94);
    if (b.dead) {
      g.fillStyle = c.danger;
      g.font = '900 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Переполнен', ox + (BW * CELL) / 2, OY + (BH * CELL) / 2 - 12);
    }
  }

  function draw(g, s, v) {
    g.fillStyle = v.colors.bg;
    g.fillRect(0, 0, W, H);
    drawBoard(g, s, 0, v);
    drawBoard(g, s, 1, v);
  }

  const names = (v) => (v.mode === 'ai' ? ['Вы', 'Компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['Вы', 'Соперник'] : ['Соперник', 'Вы']) : v.mode === 'watch' ? ['Хозяин', 'Гость'] : ['Игрок 1', 'Игрок 2']);

  const enc = (grid) => grid.join('');
  SG.rt({
    game: 'tetrisduel',
    W,
    H,
    sides: ['Левый стакан', 'Правый стакан'],
    intro: 'Сжигайте по 2–4 линии сразу — сопернику прилетит мусор. Проигрывает тот, чей стакан переполнится.',
    create,
    step,
    ai,
    draw,
    pad: true,
    fireLabel: '⤓',
    over(s) {
      const [a, b] = s.boards.map((x) => x.dead);
      if (!a && !b) return null;
      const w = a && b ? null : a ? 1 : 0;
      return { winner: w, text: 'Линии ' + s.boards[0].lines + ' : ' + s.boards[1].lines + '.' };
    },
    hud(s, v) {
      const n = names(v);
      return n[0] + ': ' + s.boards[0].lines + ' лин. · ' + n[1] + ': ' + s.boards[1].lines + ' лин. · скорость ' + speed(s).toFixed(1);
    },
    snapshot: (s) => ({ t: s.time, b: s.boards.map((b) => ({ g: enc(b.grid), p: b.piece, n: b.next, l: b.lines, pe: b.pending, d: b.dead })) }),
    restore: (x) => ({
      time: x.t,
      boards: x.b.map((b) => ({ grid: [...b.g].map(Number), piece: b.p, next: b.n, lines: b.l, pending: b.pe, dead: b.d, rep: {} })),
    }),
  });
})();
