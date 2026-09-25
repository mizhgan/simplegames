/* Танчики вдвоём: дуэль на поле с кирпичными стенами */
(() => {
  'use strict';

  const N = 13;
  const T = 32;
  const W = N * T;
  const H = N * T;
  const SIZE = 26; // размер танка
  const SPEED = 88;
  const BULLET = 270;
  const RELOAD = 0.45;
  const WIN = 5;
  const DIR = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

  // карты: B — кирпич, S — сталь, . — пусто (половина карты зеркалится)
  const MAPS = [
    ['.............', '.B.B.B.B.B.B.', '.B.B.B.B.B.B.', '.B.B.BSB.B.B.', '.B.B.....B.B.', '.....B.B.....', 'SS.BB...BB.SS', '.....B.B.....', '.B.B.....B.B.', '.B.B.BSB.B.B.', '.B.B.B.B.B.B.', '.B.B.B.B.B.B.', '.............'],
    ['.............', '..BBB...BBB..', '..B.......B..', '..B..SSS..B..', '.....B.B.....', '.BB.......BB.', '.B..BB.BB..B.', '.BB.......BB.', '.....B.B.....', '..B..SSS..B..', '..B.......B..', '..BBB...BBB..', '.............'],
    ['.............', '.SBBB...BBBS.', '.B.........B.', '.B.BB.B.BB.B.', '.....B.B.....', '.B.B.....B.B.', '.B.B.SSS.B.B.', '.B.B.....B.B.', '.....B.B.....', '.B.BB.B.BB.B.', '.B.........B.', '.SBBB...BBBS.', '.............'],
  ];
  const SPAWN = [
    { x: 0 * T + T / 2, y: (N - 1) * T + T / 2, dir: 'u' },
    { x: (N - 1) * T + T / 2, y: 0 * T + T / 2, dir: 'd' },
  ];

  function create() {
    const m = MAPS[Math.floor(Math.random() * MAPS.length)];
    const map = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) map.push(m[y][x] === 'B' ? 1 : m[y][x] === 'S' ? 2 : 0);
    const s = { map, tanks: [0, 1].map(spawn), bullets: [], score: [0, 0], booms: [] };
    return s;
  }
  function spawn(i) {
    return { x: SPAWN[i].x, y: SPAWN[i].y, dir: SPAWN[i].dir, reload: 0, dead: 0, shield: 1.5 };
  }

  const tile = (s, tx, ty) => (tx < 0 || ty < 0 || tx >= N || ty >= N ? 2 : s.map[ty * N + tx]);

  function blocked(s, x, y, self) {
    const h = SIZE / 2;
    if (x - h < 0 || y - h < 0 || x + h > W || y + h > H) return true;
    for (const [cx, cy] of [[x - h, y - h], [x + h - 0.01, y - h], [x - h, y + h - 0.01], [x + h - 0.01, y + h - 0.01]]) {
      if (tile(s, Math.floor(cx / T), Math.floor(cy / T))) return true;
    }
    return s.tanks.some((t, i) => i !== self && !t.dead && Math.abs(t.x - x) < SIZE && Math.abs(t.y - y) < SIZE);
  }

  function step(s, inputs, dt, fx) {
    s.tanks.forEach((t, i) => {
      if (t.dead > 0) {
        t.dead -= dt;
        if (t.dead <= 0) Object.assign(t, spawn(i));
        return;
      }
      if (t.shield > 0) t.shield -= dt;
      if (t.reload > 0) t.reload -= dt;
      const inp = inputs[i];
      const want = inp.u ? 'u' : inp.d ? 'd' : inp.l ? 'l' : inp.r ? 'r' : null;
      if (want) {
        if (want !== t.dir) {
          // при повороте выравниваемся по сетке в полклетки, чтобы проезжать в проходы
          if ((want === 'u' || want === 'd') !== (t.dir === 'u' || t.dir === 'd')) {
            if (want === 'u' || want === 'd') t.x = Math.round(t.x / (T / 2)) * (T / 2);
            else t.y = Math.round(t.y / (T / 2)) * (T / 2);
          }
          t.dir = want;
        }
        const nx = t.x + DIR[want][0] * SPEED * dt;
        const ny = t.y + DIR[want][1] * SPEED * dt;
        if (!blocked(s, nx, ny, i)) {
          t.x = nx;
          t.y = ny;
        }
      }
      if (inp.f && t.reload <= 0 && !s.bullets.some((b) => b.owner === i)) {
        t.reload = RELOAD;
        s.bullets.push({ x: t.x + DIR[t.dir][0] * 14, y: t.y + DIR[t.dir][1] * 14, dir: t.dir, owner: i });
        fx('hit');
      }
    });
    // снаряды
    for (const b of s.bullets) {
      const sub = 3;
      for (let k = 0; k < sub && !b.gone; k++) {
        b.x += (DIR[b.dir][0] * BULLET * dt) / sub;
        b.y += (DIR[b.dir][1] * BULLET * dt) / sub;
        const tx = Math.floor(b.x / T);
        const ty = Math.floor(b.y / T);
        const kind = tile(s, tx, ty);
        if (kind) {
          b.gone = true;
          if (kind === 1) {
            s.map[ty * N + tx] = 0;
            fx('brick');
          }
          s.booms.push({ x: b.x, y: b.y, t: 0.25, big: false });
          continue;
        }
        s.tanks.forEach((t, i) => {
          if (b.gone || i === b.owner || t.dead > 0) return;
          if (Math.abs(t.x - b.x) < SIZE / 2 && Math.abs(t.y - b.y) < SIZE / 2) {
            b.gone = true;
            if (t.shield > 0) return;
            t.dead = 1.2;
            s.score[b.owner]++;
            s.booms.push({ x: t.x, y: t.y, t: 0.6, big: true });
            fx('explode');
          }
        });
      }
      // встречные снаряды гасят друг друга
      for (const o of s.bullets) {
        if (o !== b && !o.gone && !b.gone && o.owner !== b.owner && Math.abs(o.x - b.x) < 6 && Math.abs(o.y - b.y) < 6) o.gone = b.gone = true;
      }
    }
    s.bullets = s.bullets.filter((b) => !b.gone);
    s.booms.forEach((e) => (e.t -= dt));
    s.booms = s.booms.filter((e) => e.t > 0);
  }

  // ---------- компьютер ----------
  const AI = { easy: { aim: 0.5, think: 0.5 }, normal: { aim: 0.8, think: 0.25 }, hard: { aim: 1, think: 0.1 } };
  let plan = { at: 0, dir: null, id: null };
  const stuck = { side: -1, x: 0, y: 0, since: 0, until: 0, dir: 'u' };

  function lineClear(s, a, b) {
    // есть ли прямая видимость по строке или столбцу (кирпичи тоже мешают)
    const ax = Math.floor(a.x / T);
    const ay = Math.floor(a.y / T);
    const bx = Math.floor(b.x / T);
    const by = Math.floor(b.y / T);
    if (ax === bx) {
      for (let y = Math.min(ay, by) + 1; y < Math.max(ay, by); y++) if (tile(s, ax, y)) return false;
      return Math.abs(a.x - b.x) < 12;
    }
    if (ay === by) {
      for (let x = Math.min(ax, bx) + 1; x < Math.max(ax, bx); x++) if (tile(s, x, ay)) return false;
      return Math.abs(a.y - b.y) < 12;
    }
    return false;
  }

  function ai(s, side, level) {
    const cfg = AI[level];
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const me = s.tanks[side];
    const op = s.tanks[1 - side];
    if (me.dead > 0) return inp;
    const now = performance.now() / 1000;
    // видим соперника на линии — разворачиваемся и стреляем
    if (!op.dead && lineClear(s, me, op) && Math.random() < cfg.aim) {
      const vertical = Math.abs(me.x - op.x) < 12;
      const dir = vertical ? (op.y < me.y ? 'u' : 'd') : op.x < me.x ? 'l' : 'r';
      // сначала точнее встаём на линию соперника
      const off = vertical ? op.x - me.x : op.y - me.y;
      if (Math.abs(off) > 4) inp[vertical ? (off > 0 ? 'r' : 'l') : off > 0 ? 'd' : 'u'] = true;
      else if (me.dir !== dir) inp[dir] = true;
      else inp.f = true;
      return inp;
    }
    // уворачиваемся от летящего снаряда
    if (level !== 'easy') {
      for (const b of s.bullets) {
        if (b.owner === side) continue;
        const toward = (b.dir === 'd' && b.y < me.y) || (b.dir === 'u' && b.y > me.y) || (b.dir === 'r' && b.x < me.x) || (b.dir === 'l' && b.x > me.x);
        const inLine = b.dir === 'u' || b.dir === 'd' ? Math.abs(b.x - me.x) < SIZE / 2 + 3 : Math.abs(b.y - me.y) < SIZE / 2 + 3;
        if (toward && inLine && Math.hypot(b.x - me.x, b.y - me.y) < 150) {
          const side1 = b.dir === 'u' || b.dir === 'd' ? ['l', 'r'] : ['u', 'd'];
          for (const d of side1) if (!blocked(s, me.x + DIR[d][0] * 8, me.y + DIR[d][1] * 8, side)) {
            inp[d] = true;
            return inp;
          }
        }
      }
    }
    // идём к сопернику по кратчайшему пути (кирпичи можно простреливать)
    if (now - plan.at > cfg.think || plan.id !== side) {
      plan = { at: now, dir: route(s, me, op), id: side };
    }
    // застряли — ненадолго едем в случайную сторону
    if (stuck.side === side && Math.hypot(me.x - stuck.x, me.y - stuck.y) < 1) {
      if (now - stuck.since > 1.2) {
        stuck.until = now + 0.5;
        stuck.dir = ['u', 'd', 'l', 'r'][Math.floor(Math.random() * 4)];
        stuck.since = now;
      }
    } else Object.assign(stuck, { side, x: me.x, y: me.y, since: now });
    if (now < stuck.until) {
      inp[stuck.dir] = true;
      inp.f = true;
      return inp;
    }
    if (plan.dir) {
      // сначала выравниваемся по центру своей клетки, иначе задеваем углы стен
      const cx = Math.floor(me.x / T) * T + T / 2;
      const cy = Math.floor(me.y / T) * T + T / 2;
      if ((plan.dir === 'l' || plan.dir === 'r') && Math.abs(me.y - cy) > 3) {
        inp[me.y < cy ? 'd' : 'u'] = true;
        return inp;
      }
      if ((plan.dir === 'u' || plan.dir === 'd') && Math.abs(me.x - cx) > 3) {
        inp[me.x < cx ? 'r' : 'l'] = true;
        return inp;
      }
      const [dx, dy] = DIR[plan.dir];
      const ahead = tile(s, Math.floor((me.x + dx * T * 0.6) / T), Math.floor((me.y + dy * T * 0.6) / T));
      if (ahead === 1 && me.dir === plan.dir) inp.f = true; // пробиваем кирпич
      inp[plan.dir] = true;
    }
    return inp;
  }

  // поиск пути по клеткам; кирпич стоит дороже пустой клетки
  function route(s, me, op) {
    const sx = Math.floor(me.x / T);
    const sy = Math.floor(me.y / T);
    const gx = Math.floor(op.x / T);
    const gy = Math.floor(op.y / T);
    const dist = new Array(N * N).fill(Infinity);
    const first = new Array(N * N).fill(null);
    const q = [[0, sx, sy]];
    dist[sy * N + sx] = 0;
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]);
      const [d, x, y] = q.shift();
      if (d > dist[y * N + x]) continue;
      // цель — клетка на одной линии с соперником с чистым выстрелом
      if ((x === gx || y === gy) && !(x === sx && y === sy)) {
        if (lineClear(s, { x: x * T + T / 2, y: y * T + T / 2 }, { x: op.x, y: op.y })) return first[y * N + x];
      }
      for (const k in DIR) {
        const nx = x + DIR[k][0];
        const ny = y + DIR[k][1];
        const t = tile(s, nx, ny);
        if (t === 2) continue;
        const nd = d + (t === 1 ? 4 : 1);
        if (nd < dist[ny * N + nx]) {
          dist[ny * N + nx] = nd;
          first[ny * N + nx] = first[y * N + x] || k;
          q.push([nd, nx, ny]);
        }
      }
    }
    return null;
  }

  // ---------- отрисовка ----------
  const PAL = ['#3b82f6', '#ef4444'];
  function draw(g, s, v) {
    const c = v.colors;
    g.fillStyle = c.bg;
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = s.map[y * N + x];
        if (!k) continue;
        if (k === 1) {
          g.fillStyle = '#b4532a';
          g.fillRect(x * T, y * T, T, T);
          g.fillStyle = '#d97745';
          for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) g.fillRect(x * T + q * 16 + (r % 2) * 8 - (r % 2 && q ? 16 : 0) + 1, y * T + r * 8 + 1, 14, 6);
        } else {
          g.fillStyle = '#8a93a6';
          g.fillRect(x * T, y * T, T, T);
          g.fillStyle = '#c5cbd8';
          g.fillRect(x * T + 4, y * T + 4, T - 8, T - 8);
        }
      }
    }
    s.tanks.forEach((t, i) => {
      if (t.dead > 0) return;
      g.save();
      g.translate(t.x, t.y);
      g.rotate({ u: 0, r: Math.PI / 2, d: Math.PI, l: -Math.PI / 2 }[t.dir]);
      if (t.shield > 0 && Math.floor(t.shield * 10) % 2) g.globalAlpha = 0.5;
      g.fillStyle = '#2a2d45';
      g.fillRect(-SIZE / 2, -SIZE / 2, 6, SIZE);
      g.fillRect(SIZE / 2 - 6, -SIZE / 2, 6, SIZE);
      g.fillStyle = PAL[i];
      g.fillRect(-SIZE / 2 + 5, -SIZE / 2 + 3, SIZE - 10, SIZE - 6);
      g.fillStyle = '#fff';
      g.fillRect(-2.5, -SIZE / 2 - 5, 5, SIZE / 2 + 4);
      g.beginPath();
      g.arc(0, 2, 6, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
    g.fillStyle = c.text;
    for (const b of s.bullets) g.fillRect(b.x - 3, b.y - 3, 6, 6);
    for (const e of s.booms) {
      g.fillStyle = e.big ? '#f59e0b' : '#fde68a';
      g.globalAlpha = Math.min(1, e.t * 3);
      g.beginPath();
      g.arc(e.x, e.y, (e.big ? 26 : 10) * (1.2 - e.t), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['игрок 1', 'игрок 2']);

  SG.rt({
    game: 'tankduel',
    W,
    H,
    sides: ['Синий танк', 'Красный танк'],
    intro: 'Подбейте танк соперника ' + WIN + ' раз.',
    create,
    step,
    ai,
    draw,
    pad: true,
    fireLabel: 'Огонь',
    over: (s) => (s.score[0] >= WIN || s.score[1] >= WIN ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Попадания ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Синий (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' красный (' + n[1] + ')';
    },
  });
})();
