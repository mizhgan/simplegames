/* Змейки-дуэль: две змейки на одном поле — собирайте яблоки и не врезайтесь */
(() => {
  'use strict';

  const CW = 40;
  const CH = 25;
  const CELL = 16;
  const W = CW * CELL;
  const H = CH * CELL;
  const MOVE_EVERY = 6; // шагов физики на клетку (10 клеток в секунду)
  const WIN = 3;
  const APPLES = 3;
  const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  const OPP = { u: 'd', d: 'u', l: 'r', r: 'l' };

  function newRound(s) {
    const y = CH >> 1;
    s.snakes = [
      { body: [[6, y], [5, y], [4, y]], dir: 'r', queue: [], grow: 0, alive: true },
      { body: [[CW - 7, y], [CW - 6, y], [CW - 5, y]], dir: 'l', queue: [], grow: 0, alive: true },
    ];
    s.apples = [];
    for (let i = 0; i < APPLES; i++) addApple(s);
    s.tick = 0;
    s.pause = 0;
    s.roundWinner = undefined;
    s.id = Math.floor(Math.random() * 1e9);
  }

  function occupied(s, x, y) {
    return s.snakes.some((sn) => sn.body.some(([bx, by]) => bx === x && by === y));
  }

  function addApple(s) {
    for (let k = 0; k < 500; k++) {
      const x = 1 + Math.floor(Math.random() * (CW - 2));
      const y = 1 + Math.floor(Math.random() * (CH - 2));
      if (!occupied(s, x, y) && !s.apples.some((a) => a[0] === x && a[1] === y)) {
        // золотое яблоко изредка: +3 длины
        s.apples.push([x, y, Math.random() < 0.12 ? 3 : 1]);
        return;
      }
    }
  }

  function create() {
    const s = { score: [0, 0], round: 0 };
    newRound(s);
    return s;
  }

  function step(s, inputs, dt, fx) {
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0 && s.score[0] < WIN && s.score[1] < WIN) newRound(s);
      return;
    }
    // очередь поворотов: успеваем развернуться «змейкой» между двумя клетками
    s.snakes.forEach((sn, i) => {
      const inp = inputs[i];
      const lastDir = sn.queue.length ? sn.queue[sn.queue.length - 1] : sn.dir;
      for (const k of ['u', 'd', 'l', 'r']) {
        if (inp[k] && k !== lastDir && k !== OPP[lastDir] && sn.queue.length < 2) sn.queue.push(k);
      }
    });
    if (++s.tick % MOVE_EVERY) return;
    const heads = s.snakes.map((sn) => {
      if (sn.queue.length) sn.dir = sn.queue.shift();
      const [hx, hy] = sn.body[0];
      return [hx + DIRS[sn.dir][0], hy + DIRS[sn.dir][1]];
    });
    // хвосты уходят одновременно с ходом головы (если змейка не растёт)
    const tails = s.snakes.map((sn) => (sn.grow ? null : sn.body[sn.body.length - 1]));
    const blocked = (x, y) => {
      if (x < 0 || y < 0 || x >= CW || y >= CH) return true;
      return s.snakes.some((sn, j) => sn.body.some(([bx, by], k) => bx === x && by === y && !(k === sn.body.length - 1 && tails[j])));
    };
    const crash = heads.map(([x, y]) => blocked(x, y));
    if (heads[0][0] === heads[1][0] && heads[0][1] === heads[1][1]) crash[0] = crash[1] = true;
    s.snakes.forEach((sn, i) => {
      if (crash[i]) {
        sn.alive = false;
        return;
      }
      sn.body.unshift(heads[i]);
      if (sn.grow) sn.grow--;
      else sn.body.pop();
      const a = s.apples.findIndex(([ax, ay]) => ax === heads[i][0] && ay === heads[i][1]);
      if (a >= 0) {
        sn.grow += s.apples[a][2];
        s.apples.splice(a, 1);
        addApple(s);
        fx('eat');
      }
    });
    if (crash[0] || crash[1]) {
      fx('explode');
      let w;
      if (crash[0] && crash[1]) {
        // столкнулись оба: раунд за более длинной змейкой
        const l0 = s.snakes[0].body.length;
        const l1 = s.snakes[1].body.length;
        w = l0 === l1 ? null : l0 > l1 ? 0 : 1;
      } else w = crash[0] ? 1 : 0;
      if (w !== null) s.score[w]++;
      s.roundWinner = w;
      s.round++;
      s.pause = 1.5;
    }
  }

  // ---------- компьютер: путь к яблоку поиском в ширину, с проверкой простора ----------

  function grid(s) {
    const g = new Uint8Array(CW * CH);
    s.snakes.forEach((sn) => sn.body.forEach(([x, y], k) => k < sn.body.length - 1 && (g[y * CW + x] = 1)));
    return g;
  }

  function space(g, x0, y0, limit) {
    const seen = new Uint8Array(CW * CH);
    const q = [[x0, y0]];
    seen[y0 * CW + x0] = 1;
    let n = 0;
    while (q.length && n < limit) {
      const [x, y] = q.pop();
      n++;
      for (const d in DIRS) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH || g[ny * CW + nx] || seen[ny * CW + nx]) continue;
        seen[ny * CW + nx] = 1;
        q.push([nx, ny]);
      }
    }
    return n;
  }

  function choose(s, side, level) {
    const sn = s.snakes[side];
    const o = s.snakes[1 - side];
    const g = grid(s);
    const [hx, hy] = sn.body[0];
    // клетки рядом с головой соперника опасны
    const [ox, oy] = o.body[0];
    const opts = ['u', 'd', 'l', 'r'].filter((d) => d !== OPP[sn.dir]);
    // расстояния до яблок от каждой клетки — поиск в ширину от яблок
    const dist = new Int16Array(CW * CH).fill(-1);
    const q = [];
    s.apples.forEach(([x, y, v]) => {
      dist[y * CW + x] = v > 1 ? 0 : 1;
      q.push([x, y]);
    });
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y] = q[qi];
      for (const d in DIRS) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH || g[ny * CW + nx] || dist[ny * CW + nx] >= 0) continue;
        dist[ny * CW + nx] = dist[y * CW + x] + 1;
        q.push([nx, ny]);
      }
    }
    const need = sn.body.length + 4;
    let best = null;
    let bestV = -Infinity;
    for (const d of opts) {
      const nx = hx + DIRS[d][0];
      const ny = hy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= CW || ny >= CH || g[ny * CW + nx]) continue;
      let v = 0;
      const room = space(g, nx, ny, level === 'easy' ? 40 : 300);
      if (room < need) v -= 1000 - room * 10;
      const di = dist[ny * CW + nx];
      v -= di < 0 ? 60 : di * (level === 'easy' ? 1 : 2);
      if (Math.abs(nx - ox) + Math.abs(ny - oy) <= 1 && level !== 'easy') v -= o.body.length >= sn.body.length ? 300 : 20;
      if (d === sn.dir) v += 0.5;
      v += Math.random() * (level === 'easy' ? 6 : 0.4);
      if (v > bestV) {
        bestV = v;
        best = d;
      }
    }
    return best || sn.dir;
  }

  const aiCache = [{ key: '' }, { key: '' }];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const sn = s.snakes[side];
    if (s.pause > 0 || !sn.alive) return inp;
    const key = s.id + ':' + Math.floor(s.tick / MOVE_EVERY);
    if (aiCache[side].key !== key) {
      // на лёгком иногда «задумывается» и едет прямо
      const lazy = level === 'easy' && Math.random() < 0.25;
      aiCache[side] = { key, dir: lazy ? null : choose(s, side, level) };
    }
    const dir = aiCache[side].dir;
    if (dir && dir !== sn.dir) inp[dir] = true;
    return inp;
  }

  // ---------- отрисовка ----------

  const PAL = [
    ['#3b82f6', '#1d4ed8'],
    ['#ef4444', '#b91c1c'],
  ];
  function draw(g, s, v) {
    const c = v.colors;
    g.fillStyle = c.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = c.cell;
    for (let y = 0; y < CH; y++) for (let x = (y & 1); x < CW; x += 2) g.fillRect(x * CELL, y * CELL, CELL, CELL);
    s.apples.forEach(([x, y, val]) => {
      g.fillStyle = val > 1 ? '#fbbf24' : '#84cc16';
      g.beginPath();
      g.arc(x * CELL + CELL / 2, y * CELL + CELL / 2 + 1, CELL * 0.38, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#78350f';
      g.fillRect(x * CELL + CELL / 2, y * CELL + 1, 3, 4);
    });
    s.snakes.forEach((sn, i) => {
      sn.body.forEach(([x, y], k) => {
        g.fillStyle = k ? PAL[i][k % 2] : sn.alive ? '#fff' : c.danger;
        const pad = k ? 2 : 1;
        g.beginPath();
        g.roundRect(x * CELL + pad, y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 4);
        g.fill();
        if (!k) {
          g.fillStyle = PAL[i][0];
          g.beginPath();
          g.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 3, 0, Math.PI * 2);
          g.fill();
        }
      });
    });
    if (s.pause > 0 && s.roundWinner !== undefined) {
      g.fillStyle = c.text;
      g.font = '800 28px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = names(v);
      g.fillText(s.roundWinner === null ? 'Ничья в раунде!' : 'Раунд: ' + n[s.roundWinner], W / 2, H / 2);
    }
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синяя', 'красная']);

  SG.rt({
    game: 'snakeduel',
    W,
    H,
    sides: ['Синяя змейка', 'Красная змейка'],
    intro: 'Собирайте яблоки и не врезайтесь. До ' + WIN + ' побед в раундах.',
    create,
    step,
    ai,
    draw,
    pad: true,
    over: (s) => (s.pause <= 0.05 && (s.score[0] >= WIN || s.score[1] >= WIN) ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Раунды ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Синяя (' + n[0] + ', длина ' + s.snakes[0].body.length + ') ' + s.score[0] + ' : ' + s.score[1] + ' красная (' + n[1] + ', длина ' + s.snakes[1].body.length + ')';
    },
    snapshot: (s) => ({ sn: s.snakes.map((sn) => ({ b: sn.body, d: sn.dir, a: sn.alive })), ap: s.apples, sc: s.score, p: s.pause, rw: s.roundWinner, t: s.tick }),
    restore: (x) => ({
      snakes: x.sn.map((sn) => ({ body: sn.b, dir: sn.d, alive: sn.a, queue: [], grow: 0 })),
      apples: x.ap,
      score: x.sc,
      pause: x.p,
      roundWinner: x.rw,
      tick: x.t,
    }),
  });
})();
