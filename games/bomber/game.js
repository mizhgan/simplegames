/* Бомбермен-дуэль: взрывайте кирпичи, собирайте усилители и подорвите соперника */
(() => {
  'use strict';

  const CW = 13;
  const CH = 11;
  const T = 40;
  const W = CW * T;
  const H = CH * T;
  const WIN = 3;
  const FUSE = 2.2;
  const FLAME = 0.5;
  const ROUND_TIME = 120;
  // клетки: 0 пусто, 1 стена, 2 кирпич; бонусы: b — ещё бомба, r — дальность, s — скорость
  const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  const SPAWN = [[1, 1], [CW - 2, CH - 2]];

  function newRound(s) {
    const grid = [];
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const wall = x === 0 || y === 0 || x === CW - 1 || y === CH - 1 || (x % 2 === 0 && y % 2 === 0);
        const nearSpawn = SPAWN.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 2);
        grid.push(wall ? 1 : !nearSpawn && Math.random() < 0.62 ? 2 : 0);
      }
    }
    // кирпичи раскладываем симметрично, чтобы было честно
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) grid[(CH - 1 - y) * CW + (CW - 1 - x)] = grid[y * CW + x];
    s.grid = grid;
    s.items = {};
    s.bombs = [];
    s.flames = [];
    s.players = SPAWN.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5, alive: true, bombs: 1, range: 2, speed: 3.2, dir: 'd' }));
    s.pause = 0;
    s.time = ROUND_TIME;
    s.id = Math.floor(Math.random() * 1e9);
    s.roundWinner = undefined;
  }

  function create() {
    const s = { score: [0, 0], round: 0 };
    newRound(s);
    return s;
  }

  const cell = (s, x, y) => (x < 0 || y < 0 || x >= CW || y >= CH ? 1 : s.grid[y * CW + x]);
  const bombAt = (s, x, y) => s.bombs.find((b) => b.x === x && b.y === y);

  function passable(s, x, y, p, pi) {
    if (cell(s, x, y)) return false;
    const b = bombAt(s, x, y);
    return !b || (b.pass & (1 << pi)) !== 0;
  }

  function movePlayer(s, p, pi, inp, dt) {
    const want = inp.u ? 'u' : inp.d ? 'd' : inp.l ? 'l' : inp.r ? 'r' : null;
    if (!want) return;
    p.dir = want;
    const [dx, dy] = DIRS[want];
    const step = p.speed * dt;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    // «помощь на углах»: подтягиваем к центру ряда/столбца, чтобы вписаться в проход
    if (dx) {
      const off = p.y - (cy + 0.5);
      if (Math.abs(off) > 0.02) {
        const target = passable(s, cx + dx, cy, p, pi) ? cy + 0.5 : off > 0 && passable(s, cx + dx, cy + 1, p, pi) ? cy + 1.5 : off < 0 && passable(s, cx + dx, cy - 1, p, pi) ? cy - 0.5 : cy + 0.5;
        p.y += Math.sign(target - p.y) * Math.min(step, Math.abs(target - p.y));
        if (Math.abs(p.y - (cy + 0.5)) > 0.02 && target !== cy + 0.5) return;
      }
      const nx = p.x + dx * step;
      const edge = Math.floor(nx + dx * 0.45);
      if (edge !== cx && !passable(s, edge, cy, p, pi)) p.x = cx + 0.5;
      else p.x = nx;
    } else {
      const off = p.x - (cx + 0.5);
      if (Math.abs(off) > 0.02) {
        const target = passable(s, cx, cy + dy, p, pi) ? cx + 0.5 : off > 0 && passable(s, cx + 1, cy + dy, p, pi) ? cx + 1.5 : off < 0 && passable(s, cx - 1, cy + dy, p, pi) ? cx - 0.5 : cx + 0.5;
        p.x += Math.sign(target - p.x) * Math.min(step, Math.abs(target - p.x));
        if (Math.abs(p.x - (cx + 0.5)) > 0.02 && target !== cx + 0.5) return;
      }
      const ny = p.y + dy * step;
      const edge = Math.floor(ny + dy * 0.45);
      if (edge !== cy && !passable(s, cx, edge, p, pi)) p.y = cy + 0.5;
      else p.y = ny;
    }
  }

  function explode(s, b, fx) {
    b.done = true;
    const cells = [[b.x, b.y]];
    for (const d in DIRS) {
      for (let k = 1; k <= b.range; k++) {
        const x = b.x + DIRS[d][0] * k;
        const y = b.y + DIRS[d][1] * k;
        const c = cell(s, x, y);
        if (c === 1) break;
        cells.push([x, y]);
        if (c === 2) {
          s.grid[y * CW + x] = 0;
          // иногда из кирпича выпадает усилитель
          const r = Math.random();
          if (r < 0.3) s.items[y * CW + x] = r < 0.12 ? 'b' : r < 0.24 ? 'r' : 's';
          break;
        }
        const other = bombAt(s, x, y);
        if (other && !other.done) other.fuse = Math.min(other.fuse, 0.05);
        delete s.items[y * CW + x];
      }
    }
    for (const [x, y] of cells) s.flames.push({ x, y, t: FLAME });
    fx('explode');
  }

  function step(s, inputs, dt, fx) {
    if (s.pause > 0) {
      s.pause -= dt;
      if (s.pause <= 0 && s.score[0] < WIN && s.score[1] < WIN) newRound(s);
      return;
    }
    s.time -= dt;
    s.players.forEach((p, i) => {
      if (!p.alive) return;
      movePlayer(s, p, i, inputs[i], dt);
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      // бомба
      if (inputs[i].f && !bombAt(s, cx, cy) && s.bombs.filter((b) => b.owner === i).length < p.bombs) {
        let pass = 0;
        s.players.forEach((q, j) => q.alive && Math.floor(q.x) === cx && Math.floor(q.y) === cy && (pass |= 1 << j));
        s.bombs.push({ x: cx, y: cy, fuse: FUSE, range: p.range, owner: i, pass });
        fx('place');
      }
      // усилители
      const it = s.items[cy * CW + cx];
      if (it) {
        if (it === 'b') p.bombs = Math.min(5, p.bombs + 1);
        if (it === 'r') p.range = Math.min(7, p.range + 1);
        if (it === 's') p.speed = Math.min(5, p.speed + 0.5);
        delete s.items[cy * CW + cx];
        fx('coin');
      }
    });
    // сошли с бомбы — больше через неё не пройти
    for (const b of s.bombs) {
      s.players.forEach((q, j) => {
        if (b.pass & (1 << j) && (Math.abs(q.x - (b.x + 0.5)) > 0.9 || Math.abs(q.y - (b.y + 0.5)) > 0.9)) b.pass &= ~(1 << j);
      });
      b.fuse -= dt;
    }
    for (let guard = 0; guard < 20; guard++) {
      const ready = s.bombs.filter((b) => !b.done && b.fuse <= 0);
      if (!ready.length) break;
      ready.forEach((b) => explode(s, b, fx));
    }
    s.bombs = s.bombs.filter((b) => !b.done);
    s.flames.forEach((f) => (f.t -= dt));
    s.flames = s.flames.filter((f) => f.t > 0);
    // кто в огне
    const hit = s.players.map((p) => p.alive && s.flames.some((f) => f.x === Math.floor(p.x) && f.y === Math.floor(p.y)));
    hit.forEach((h, i) => h && (s.players[i].alive = false));
    const alive = s.players.map((p) => p.alive);
    if (!alive[0] || !alive[1] || s.time <= 0) {
      if (hit[0] || hit[1]) fx('lose');
      s.roundWinner = alive[0] && !alive[1] ? 0 : alive[1] && !alive[0] ? 1 : null;
      if (s.roundWinner !== null) s.score[s.roundWinner]++;
      s.round++;
      s.pause = 1.8;
    }
  }

  // ---------- компьютер ----------

  // через сколько секунд клетка окажется в огне (Infinity — безопасна)
  function dangerMap(s) {
    const dm = new Array(CW * CH).fill(Infinity);
    for (const f of s.flames) dm[f.y * CW + f.x] = 0;
    for (const b of s.bombs) {
      const t = Math.max(0, b.fuse);
      const mark = (x, y) => (dm[y * CW + x] = Math.min(dm[y * CW + x], t));
      mark(b.x, b.y);
      for (const d in DIRS) {
        for (let k = 1; k <= b.range; k++) {
          const x = b.x + DIRS[d][0] * k;
          const y = b.y + DIRS[d][1] * k;
          const c = cell(s, x, y);
          if (c === 1) break;
          mark(x, y);
          if (c === 2) break;
        }
      }
    }
    return dm;
  }

  // поиск в ширину: первый шаг к ближайшей клетке, удовлетворяющей goal
  function bfs(s, pi, goal, dm, speed) {
    const p = s.players[pi];
    const sx = Math.floor(p.x);
    const sy = Math.floor(p.y);
    const seen = new Map([[sy * CW + sx, null]]);
    const q = [[sx, sy, 0]];
    while (q.length) {
      const [x, y, d] = q.shift();
      if (goal(x, y, d)) {
        let k = y * CW + x;
        let first = null;
        while (seen.get(k)) {
          first = seen.get(k);
          k = first.from;
        }
        return { dir: first ? first.dir : null, x, y, d };
      }
      for (const dir in DIRS) {
        const nx = x + DIRS[dir][0];
        const ny = y + DIRS[dir][1];
        const k = ny * CW + nx;
        if (seen.has(k) || !passable(s, nx, ny, p, pi)) continue;
        // не лезем туда, где рванёт к нашему приходу
        const arrive = (d + 1) / speed;
        if (dm && dm[k] < arrive + 0.35 && dm[k] > arrive - 0.6) continue;
        if (dm && dm[k] === 0) continue;
        seen.set(k, { from: y * CW + x, dir });
        q.push([nx, ny, d + 1]);
      }
    }
    return null;
  }

  const AIL = { easy: { bomb: 0.35, chase: 0.3 }, normal: { bomb: 0.7, chase: 0.7 }, hard: { bomb: 1, chase: 1 } };
  let memo = { t: -1, out: null };
  function ai(s, pi, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, px: null, py: null };
    const p = s.players[pi];
    const o = s.players[1 - pi];
    if (!p.alive || s.pause > 0) return inp;
    const cfg = AIL[level];
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const dm = dangerMap(s);
    const centered = Math.abs(p.x - cx - 0.5) < 0.12 && Math.abs(p.y - cy - 0.5) < 0.12;
    const go = (dir) => dir && (inp[dir] = true);
    // в опасности — бежим в безопасную клетку
    if (dm[cy * CW + cx] < Infinity) {
      const r = bfs(s, pi, (x, y) => dm[y * CW + x] === Infinity, dm, p.speed);
      if (r) go(r.dir || nearestCenter(p));
      return inp;
    }
    // решаем не чаще, чем раз в клетку (иначе дёргается)
    if (!centered && memo.t === cx * 100 + cy && memo.id === s.id) {
      go(memo.dir);
      return inp;
    }
    // ставим бомбу, если рядом кирпич или соперник на линии огня, и есть куда убежать
    const nearBrick = Object.values(DIRS).some(([dx, dy]) => cell(s, cx + dx, cy + dy) === 2);
    const oppInLine = o.alive && (Math.floor(o.x) === cx || Math.floor(o.y) === cy) && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= p.range + 0.5;
    const myBombs = s.bombs.filter((b) => b.owner === pi).length;
    if ((nearBrick || oppInLine) && myBombs < p.bombs && !bombAt(s, cx, cy) && Math.random() < cfg.bomb) {
      const fake = { ...s, bombs: s.bombs.concat({ x: cx, y: cy, fuse: FUSE, range: p.range, owner: pi, pass: 1 << pi }) };
      const dm2 = dangerMap(fake);
      const esc = bfs(fake, pi, (x, y) => dm2[y * CW + x] === Infinity, dm2, p.speed);
      if (esc && esc.d <= 4) {
        inp.f = true;
        return inp;
      }
    }
    // цель: усилитель, соперник или кирпич
    let r = bfs(s, pi, (x, y) => !!s.items[y * CW + x], dm, p.speed);
    if ((!r || r.d > 6) && Math.random() < cfg.chase && o.alive) r = bfs(s, pi, (x, y, d) => d > 0 && Math.abs(x - Math.floor(o.x)) + Math.abs(y - Math.floor(o.y)) <= 1, dm, p.speed) || r;
    if (!r) r = bfs(s, pi, (x, y, d) => d > 0 && Object.values(DIRS).some(([dx, dy]) => cell(s, x + dx, y + dy) === 2), dm, p.speed);
    const dir = r && r.dir ? r.dir : null;
    // не шагаем в клетку, где скоро рванёт
    if (dir) {
      const nx = cx + DIRS[dir][0];
      const ny = cy + DIRS[dir][1];
      if (dm[ny * CW + nx] < Infinity) return inp;
    }
    memo = { t: cx * 100 + cy, dir, id: s.id };
    go(dir || (centered ? null : nearestCenter(p)));
    return inp;
  }
  function nearestCenter(p) {
    const ox = p.x - Math.floor(p.x) - 0.5;
    const oy = p.y - Math.floor(p.y) - 0.5;
    if (Math.abs(ox) > Math.abs(oy)) return ox > 0 ? 'l' : 'r';
    return oy > 0 ? 'u' : 'd';
  }

  // ---------- отрисовка ----------
  const PAL = ['#22d3ee', '#ff5c93'];
  const ICON = { b: '💣', r: '🔥', s: '👟' };
  function draw(g, s, v) {
    const c = v.colors;
    g.fillStyle = '#2f7d4f';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const k = s.grid[y * CW + x];
        const px = x * T;
        const py = y * T;
        if (k === 0 && (x + y) % 2) {
          g.fillStyle = '#358a58';
          g.fillRect(px, py, T, T);
        }
        if (k === 1) {
          g.fillStyle = '#5b6173';
          g.fillRect(px, py, T, T);
          g.fillStyle = '#7d8498';
          g.fillRect(px + 3, py + 3, T - 6, T - 6);
        } else if (k === 2) {
          g.fillStyle = '#b4532a';
          g.fillRect(px + 1, py + 1, T - 2, T - 2);
          g.fillStyle = '#d97745';
          g.fillRect(px + 4, py + 4, T / 2 - 6, T / 2 - 6);
          g.fillRect(px + T / 2 + 2, py + T / 2 + 2, T / 2 - 6, T / 2 - 6);
        }
        const it = s.items[y * CW + x];
        if (it && !k) {
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.beginPath();
          g.arc(px + T / 2, py + T / 2, T * 0.36, 0, Math.PI * 2);
          g.fill();
          g.font = Math.round(T * 0.5) + 'px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(ICON[it], px + T / 2, py + T / 2 + 1);
        }
      }
    }
    for (const b of s.bombs) {
      const pulse = 1 + Math.sin(b.fuse * 12) * 0.06;
      g.fillStyle = '#1b1b24';
      g.beginPath();
      g.arc(b.x * T + T / 2, b.y * T + T / 2 + 2, T * 0.34 * pulse, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = b.fuse < 0.6 ? '#ef4444' : '#f59e0b';
      g.fillRect(b.x * T + T / 2 + 6, b.y * T + 6, 4, 6);
    }
    for (const f of s.flames) {
      g.globalAlpha = Math.min(1, f.t / FLAME + 0.2);
      g.fillStyle = '#fbbf24';
      g.fillRect(f.x * T + 3, f.y * T + 3, T - 6, T - 6);
      g.fillStyle = '#fff7cc';
      g.fillRect(f.x * T + 11, f.y * T + 11, T - 22, T - 22);
      g.globalAlpha = 1;
    }
    s.players.forEach((p, i) => {
      const x = p.x * T;
      const y = p.y * T;
      g.globalAlpha = p.alive ? 1 : 0.35;
      g.fillStyle = PAL[i];
      g.beginPath();
      g.arc(x, y + 2, T * 0.34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x, y - 4, T * 0.22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1b24';
      const [ex, ey] = DIRS[p.dir];
      g.fillRect(x - 5 + ex * 3, y - 6 + ey * 2, 3, 4);
      g.fillRect(x + 2 + ex * 3, y - 6 + ey * 2, 3, 4);
      g.globalAlpha = 1;
    });
    if (s.pause > 0 && s.roundWinner !== undefined) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, H / 2 - 30, W, 60);
      g.fillStyle = '#fff';
      g.font = '800 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = names(v);
      g.fillText(s.roundWinner === null ? 'Ничья в раунде' : 'Раунд: ' + n[s.roundWinner], W / 2, H / 2);
    }
    void c;
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['игрок 1', 'игрок 2']);

  SG.rt({
    game: 'bomber',
    W,
    H,
    sides: ['Голубой', 'Розовый'],
    intro: 'Подорвите соперника бомбой. До ' + WIN + ' побед в раундах.',
    create,
    step,
    ai,
    draw,
    pad: true,
    fireLabel: 'Бомба',
    over: (s) => (s.pause <= 0.05 && (s.score[0] >= WIN || s.score[1] >= WIN) ? { winner: s.score[0] >= WIN ? 0 : 1, text: 'Раунды ' + s.score[0] + ' : ' + s.score[1] + '.' } : null),
    hud(s, v) {
      const n = names(v);
      return 'Голубой (' + n[0] + ') ' + s.score[0] + ' : ' + s.score[1] + ' розовый (' + n[1] + ') · ' + Math.max(0, Math.ceil(s.time)) + ' с';
    },
  });
})();
