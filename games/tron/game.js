/* Трон: световые мотоциклы оставляют след — не врежьтесь в стену и в следы */
(() => {
  'use strict';

  const CW = 64;
  const CH = 40;
  const CELL = 10;
  const W = CW * CELL;
  const H = CH * CELL;
  const MOVE_EVERY = 4; // шагов физики на клетку (15 клеток в секунду)
  const WIN = 3;
  const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  const OPP = { u: 'd', d: 'u', l: 'r', r: 'l' };

  function newRound(s) {
    s.grid = new Array(CW * CH).fill(0);
    s.trail = [];
    s.id = Math.floor(Math.random() * 1e9);
    s.bikes = [
      { x: 8, y: CH >> 1, dir: 'r', next: 'r', alive: true },
      { x: CW - 9, y: CH >> 1, dir: 'l', next: 'l', alive: true },
    ];
    s.bikes.forEach((b, i) => mark(s, b.x, b.y, i));
    s.tick = 0;
    s.pause = 0;
    s.roundWinner = undefined;
  }

  function mark(s, x, y, side) {
    const i = y * CW + x;
    s.grid[i] = side + 1;
    s.trail.push(i * 2 + side);
  }

  function create() {
    const s = { score: [0, 0], round: 0 };
    newRound(s);
    return s;
  }

  const free = (s, x, y) => x >= 0 && y >= 0 && x < CW && y < CH && !s.grid[y * CW + x];

  function step(s, inputs, dt, fx) {
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0 && s.score[0] < WIN && s.score[1] < WIN) newRound(s);
      return;
    }
    // поворот: запоминаем последнее нажатие (разворот назад невозможен)
    s.bikes.forEach((b, i) => {
      const inp = inputs[i];
      for (const k of ['u', 'd', 'l', 'r']) if (inp[k] && k !== OPP[b.dir] && k !== b.dir) b.next = k;
    });
    if (++s.tick % MOVE_EVERY) return;
    const heads = s.bikes.map((b) => {
      b.dir = b.next;
      return [b.x + DIRS[b.dir][0], b.y + DIRS[b.dir][1]];
    });
    const crash = heads.map(([x, y]) => !free(s, x, y));
    // лобовое столкновение в одной клетке
    if (heads[0][0] === heads[1][0] && heads[0][1] === heads[1][1]) crash[0] = crash[1] = true;
    s.bikes.forEach((b, i) => {
      if (crash[i]) b.alive = false;
      else {
        b.x = heads[i][0];
        b.y = heads[i][1];
        mark(s, b.x, b.y, i);
      }
    });
    if (crash[0] || crash[1]) {
      fx('explode');
      if (crash[0] && !crash[1]) s.score[1]++;
      if (crash[1] && !crash[0]) s.score[0]++;
      s.roundWinner = crash[0] && crash[1] ? null : crash[0] ? 1 : 0;
      s.round++;
      s.pause = 1.4;
    }
  }

  // ---------- компьютер: выбирает направление с наибольшим свободным пространством ----------

  const seen = new Int32Array(CW * CH);
  let stamp = 0;
  function space(s, x0, y0, limit, avoid) {
    stamp++;
    const q = [[x0, y0]];
    seen[y0 * CW + x0] = stamp;
    let n = 0;
    while (q.length && n < limit) {
      const [x, y] = q.pop();
      n++;
      for (const d in DIRS) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (!free(s, nx, ny) || seen[ny * CW + nx] === stamp) continue;
        if (avoid && Math.abs(nx - avoid[0]) + Math.abs(ny - avoid[1]) <= 1) continue;
        seen[ny * CW + nx] = stamp;
        q.push([nx, ny]);
      }
    }
    return n;
  }

  let aiCache = { tick: -1, dir: null };
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const b = s.bikes[side];
    if (s.pause > 0 || !b.alive) return inp;
    // решаем один раз перед каждым шагом мотоцикла
    if (aiCache.tick !== Math.floor(s.tick / MOVE_EVERY) || aiCache.id !== s.id) {
      aiCache = { tick: Math.floor(s.tick / MOVE_EVERY), id: s.id, dir: choose(s, side, level) };
    }
    if (aiCache.dir) inp[aiCache.dir] = true;
    return inp;
  }

  function choose(s, side, level) {
    const b = s.bikes[side];
    const o = s.bikes[1 - side];
    const opts = ['u', 'd', 'l', 'r'].filter((d) => d !== OPP[b.dir]);
    const scored = opts.map((d) => {
      const nx = b.x + DIRS[d][0];
      const ny = b.y + DIRS[d][1];
      if (!free(s, nx, ny)) return [d, -1];
      if (level === 'easy') return [d, Math.random() * 10 + (d === b.dir ? 5 : 0)];
      let v = space(s, nx, ny, level === 'hard' ? 900 : 350, level === 'hard' ? [o.x + DIRS[o.dir][0], o.y + DIRS[o.dir][1]] : null);
      if (d === b.dir) v += 2;
      // на сложном — стараемся отрезать соперника: ближе к нему, пока места хватает
      if (level === 'hard') v -= (Math.abs(nx - o.x) + Math.abs(ny - o.y)) * 0.15;
      return [d, v + Math.random() * 0.5];
    });
    scored.sort((a, c) => c[1] - a[1]);
    // на лёгком иногда зевает
    if (level === 'easy' && Math.random() < 0.08) return opts[Math.floor(Math.random() * opts.length)];
    return scored[0][0];
  }

  // ---------- отрисовка ----------

  const PAL = SG.colors.players; // [0] — синий, [1] — красный
  function draw(g, s, v) {
    const c = v.colors;
    g.fillStyle = c.bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = c.line;
    g.globalAlpha = 0.35;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= CW; x += 4) {
      g.moveTo(x * CELL, 0);
      g.lineTo(x * CELL, H);
    }
    for (let y = 0; y <= CH; y += 4) {
      g.moveTo(0, y * CELL);
      g.lineTo(W, y * CELL);
    }
    g.stroke();
    g.globalAlpha = 1;
    for (let i = 0; i < s.grid.length; i++) {
      const v2 = s.grid[i];
      if (!v2) continue;
      g.fillStyle = PAL[v2 - 1];
      g.globalAlpha = 0.75;
      g.fillRect((i % CW) * CELL + 1, Math.floor(i / CW) * CELL + 1, CELL - 2, CELL - 2);
    }
    g.globalAlpha = 1;
    s.bikes.forEach((b, i) => {
      g.fillStyle = b.alive ? '#fff' : c.danger;
      g.shadowColor = PAL[i];
      g.shadowBlur = 14;
      g.fillRect(b.x * CELL - 1, b.y * CELL - 1, CELL + 2, CELL + 2);
      g.shadowBlur = 0;
    });
    if (s.pause > 0 && s.roundWinner !== undefined) {
      g.fillStyle = c.text;
      g.font = '800 28px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = names(v);
      g.fillText(s.roundWinner === null ? 'Столкнулись оба!' : 'Раунд: ' + n[s.roundWinner], W / 2, H / 2);
    }
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синий', 'красный']);

  // по сети передаём только новые клетки следа
  let sent = { id: null, n: 0 };
  SG.rt({
    game: 'tron',
    W,
    H,
    sides: ['Синий', 'Красный'],
    intro: 'Не врезайтесь в стены и следы. До ' + WIN + ' побед в раундах.',
    create,
    step,
    ai,
    draw,
    pad: true,
    over: (s) => (s.pause <= 0.05 && (s.score[0] >= WIN || s.score[1] >= WIN) ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Раунды ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Синий (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' красный (' + n[1] + ')';
    },
    snapshot(s, full) {
      // full — весь след целиком (для зрителя, пришедшего посреди раунда)
      if (full) return { id: s.id, add: s.trail.slice(), bikes: s.bikes, score: s.score, round: s.round, pause: s.pause, rw: s.roundWinner, tick: s.tick };
      if (sent.id !== s.id) sent = { id: s.id, n: 0 };
      const add = s.trail.slice(sent.n);
      sent.n = s.trail.length;
      return { id: s.id, add, bikes: s.bikes, score: s.score, round: s.round, pause: s.pause, rw: s.roundWinner, tick: s.tick };
    },
    restore(snap, prev) {
      const s = prev && prev.id === snap.id ? prev : { grid: new Array(CW * CH).fill(0), trail: [] };
      for (const code of snap.add) s.grid[code >> 1] = (code & 1) + 1;
      Object.assign(s, { id: snap.id, bikes: snap.bikes, score: snap.score, round: snap.round, pause: snap.pause, roundWinner: snap.rw, tick: snap.tick });
      return s;
    },
  });
})();
