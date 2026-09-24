/* Лягушка — перейти дорогу и реку */
(() => {
  'use strict';

  const T = 40; // размер клетки
  const COLS = 11;
  const ROWS = 13;
  const W = COLS * T;
  const H = ROWS * T;
  const BAYS = [1, 3, 5, 7, 9];
  const TIME = 30;

  // ряды сверху вниз: 0 — домики, 1–5 — река, 6 — берег, 7–11 — дорога, 12 — старт
  const LANES = [
    { row: 1, kind: 'log', speed: 60, len: 3, gap: 3 },
    { row: 2, kind: 'turtle', speed: -75, len: 2, gap: 2, dive: true },
    { row: 3, kind: 'log', speed: 90, len: 4, gap: 3 },
    { row: 4, kind: 'log', speed: 45, len: 2, gap: 3 },
    { row: 5, kind: 'turtle', speed: -60, len: 3, gap: 1, dive: true },
    { row: 7, kind: 'truck', speed: -55, len: 2, gap: 4, color: '#e5e7eb' },
    { row: 8, kind: 'car', speed: 95, len: 1, gap: 4, color: '#f472b6' },
    { row: 9, kind: 'car', speed: -70, len: 1, gap: 3, color: '#facc15' },
    { row: 10, kind: 'car', speed: 60, len: 1, gap: 3, color: '#60a5fa' },
    { row: 11, kind: 'car', speed: -45, len: 1, gap: 3, color: '#fb923c' },
  ];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');

  let state = 'idle';
  let frog, lanes, homes, score, lives, level, timeLeft, maxRow, dead, clock;
  let best = SG.store.get('frogger-best', 0);
  let last = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  // ---------- мир ----------

  function buildLanes() {
    const mul = 1 + (level - 1) * 0.15;
    lanes = LANES.map((l) => {
      const items = [];
      const span = (l.len + l.gap) * T;
      const count = Math.ceil((W + span) / span) + 1;
      const off = Math.random() * span;
      for (let k = 0; k < count; k++) items.push({ x: k * span - off, diveT: Math.random() * 10 });
      return Object.assign({}, l, { speed: l.speed * mul, items, span: count * span });
    });
  }

  function resetFrog() {
    frog = { col: 5, row: 12, x: 5 * T, dir: 'up', hop: 0 };
    maxRow = 12;
    timeLeft = TIME;
    dead = 0;
  }

  function newGame() {
    score = 0;
    lives = 3;
    level = 1;
    homes = BAYS.map(() => false);
    buildLanes();
    resetFrog();
    state = 'playing';
    overlay.hidden = true;
    hud();
  }

  function hud() {
    $('score').textContent = score;
    $('lives').textContent = lives > 0 ? '🐸'.repeat(lives) : '—';
    $('level').textContent = level;
    $('best').textContent = best;
  }

  // ---------- движение ----------

  function hop(dir) {
    if (state !== 'playing' || dead > 0 || frog.hop > 0) return;
    const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    const nr = frog.row + d[0];
    const nx = frog.x + d[1] * T;
    if (nr < 0 || nr > 12 || nx < -T / 2 || nx > W - T / 2) return;
    frog.row = nr;
    frog.x = nx;
    frog.dir = dir;
    frog.hop = 0.1;
    SG.sound.play('jump');
    if (nr < maxRow) {
      maxRow = nr;
      score += 10;
      hud();
    }
    if (nr === 0) reachHome();
  }

  function reachHome() {
    const cx = frog.x + T / 2;
    const k = BAYS.findIndex((c) => Math.abs(c * T + T / 2 - cx) < T * 0.45);
    if (k < 0 || homes[k]) return die();
    homes[k] = true;
    score += 50 + Math.floor(timeLeft) * 10;
    SG.sound.play('coin');
    if (homes.every(Boolean)) {
      score += 1000;
      level++;
      homes = BAYS.map(() => false);
      buildLanes();
      SG.sound.play('level');
    }
    hud();
    resetFrog();
  }

  function die() {
    if (dead > 0) return;
    dead = 1;
    lives--;
    SG.sound.play('hit');
    hud();
  }

  // ---------- обновление ----------

  function itemAt(lane, x) {
    // x — центр лягушки; возвращает предмет полосы под ней
    for (const it of lane.items) {
      if (x > it.x + 6 && x < it.x + lane.len * T - 6) return it;
    }
    return null;
  }

  const submerged = (lane, it) => lane.dive && it === lane.items[1] && Math.sin(it.diveT * 1.3) > 0.55;

  function update(dt) {
    if (!lanes) return;
    if (state === 'playing' || state === 'idle') {
      lanes.forEach((l) =>
        l.items.forEach((it) => {
          it.x += l.speed * dt;
          it.diveT += dt;
          if (l.speed > 0 && it.x > W) it.x -= l.span;
          if (l.speed < 0 && it.x + l.len * T < 0) it.x += l.span;
        })
      );
    }
    if (state !== 'playing') return;
    clock += dt;
    if (dead > 0) {
      dead -= dt;
      if (dead <= 0) {
        if (lives <= 0) return gameOver();
        resetFrog();
      }
      return;
    }
    if (frog.hop > 0) frog.hop -= dt;
    timeLeft -= dt;
    if (timeLeft <= 0) return die();

    const lane = lanes.find((l) => l.row === frog.row);
    const cx = frog.x + T / 2;
    if (lane && (lane.kind === 'log' || lane.kind === 'turtle')) {
      if (frog.hop > 0) return;
      const it = itemAt(lane, cx);
      if (!it || submerged(lane, it)) return die();
      frog.x += lane.speed * dt;
      if (frog.x < -T * 0.6 || frog.x > W - T * 0.4) return die();
    } else if (lane) {
      for (const it of lane.items) {
        if (cx + 12 > it.x + 4 && cx - 12 < it.x + lane.len * T - 4) return die();
      }
    }
  }

  function gameOver() {
    state = 'over';
    SG.sound.play('lose');
    const rec = score > best;
    if (rec) {
      best = score;
      SG.store.set('frogger-best', best);
    }
    $('overlay-title').textContent = 'Игра окончена';
    $('overlay-text').textContent = 'Очки: ' + score + ', уровень ' + level + '.' + (rec && score ? ' Новый рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    hud();
    overlay.hidden = false;
  }

  // ---------- отрисовка ----------

  function drawFrog(x, y, dir, splat) {
    ctx.save();
    ctx.translate(x + T / 2, y + T / 2);
    ctx.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir]);
    if (splat) {
      ctx.fillStyle = '#ef4444';
      ctx.font = '28px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✖', 0, 0);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#22c55e';
    // лапки
    ctx.fillRect(-15, -12, 6, 8);
    ctx.fillRect(9, -12, 6, 8);
    ctx.fillRect(-15, 6, 6, 9);
    ctx.fillRect(9, 6, 6, 9);
    ctx.beginPath();
    ctx.ellipse(0, 1, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-6, -9, 4, 0, Math.PI * 2);
    ctx.arc(6, -9, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-6, -10, 2, 0, Math.PI * 2);
    ctx.arc(6, -10, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function draw() {
    if (!lanes) return;
    // фон
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, T, W, T * 5);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, T * 7, W, T * 5);
    ctx.fillStyle = '#6d28d9';
    ctx.fillRect(0, T * 6, W, T);
    ctx.fillRect(0, T * 12, W, T);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < W; x += 16) {
      ctx.fillRect(x, T * 6 + 4, 8, 4);
      ctx.fillRect(x + 8, T * 12 + 30, 8, 4);
    }
    // разметка дороги
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let r = 8; r <= 11; r++) for (let x = 6; x < W; x += 40) ctx.fillRect(x, r * T - 1, 20, 2);
    // живая изгородь и домики
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, W, T);
    BAYS.forEach((c, k) => {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(c * T + 2, 8, T - 4, T - 8);
      if (homes[k]) drawFrog(c * T, 2, 'down');
    });
    // полосы
    lanes.forEach((l) => {
      const y = l.row * T;
      l.items.forEach((it) => {
        const w = l.len * T;
        if (l.kind === 'log') {
          ctx.fillStyle = '#92400e';
          roundRect(it.x + 2, y + 6, w - 4, T - 12, 12);
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          for (let k = 1; k < l.len; k++) ctx.fillRect(it.x + k * T, y + 10, 2, T - 20);
        } else if (l.kind === 'turtle') {
          const sub = submerged(l, it);
          const half = l.dive && it === l.items[1] && Math.sin(it.diveT * 1.3) > 0.2;
          if (sub) return;
          for (let k = 0; k < l.len; k++) {
            ctx.globalAlpha = half ? 0.5 : 1;
            ctx.fillStyle = '#15803d';
            ctx.beginPath();
            ctx.arc(it.x + k * T + T / 2, y + T / 2, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#4ade80';
            ctx.beginPath();
            ctx.arc(it.x + k * T + T / 2, y + T / 2, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        } else {
          ctx.fillStyle = l.color;
          roundRect(it.x + 3, y + 7, w - 6, T - 14, 6);
          ctx.fillStyle = 'rgba(15,23,42,0.75)';
          const front = l.speed > 0 ? it.x + w - 16 : it.x + 6;
          ctx.fillRect(front, y + 11, 10, T - 22);
          ctx.fillStyle = '#111';
          ctx.fillRect(it.x + 8, y + 4, 8, 4);
          ctx.fillRect(it.x + w - 16, y + 4, 8, 4);
          ctx.fillRect(it.x + 8, y + T - 8, 8, 4);
          ctx.fillRect(it.x + w - 16, y + T - 8, 8, 4);
        }
      });
    });
    // лягушка
    if (frog && state !== 'idle') {
      const lift = frog.hop > 0 ? Math.sin((frog.hop / 0.1) * Math.PI) * 4 : 0;
      drawFrog(frog.x, frog.row * T - lift, frog.dir, dead > 0);
    }
    // таймер
    if (state === 'playing') {
      const k = Math.max(0, timeLeft / TIME);
      ctx.fillStyle = k < 0.25 ? '#ef4444' : '#facc15';
      ctx.fillRect(0, H - 5, W * k, 5);
    }
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пауза', W / 2, H / 2);
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- управление ----------

  function togglePause() {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
    $('pause-btn').textContent = state === 'paused' ? 'Продолжить' : 'Пауза';
  }

  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  document.addEventListener('keydown', (e) => {
    if (KEYS[e.code]) {
      e.preventDefault();
      hop(KEYS[e.code]);
    } else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if ((e.code === 'Space' || e.code === 'Enter') && (state === 'idle' || state === 'over')) {
      e.preventDefault();
      newGame();
    }
  });
  window.addEventListener('blur', () => state === 'playing' && togglePause());
  SG.onSwipe(canvas, (dir) => hop(dir), 16);
  canvas.addEventListener('click', (e) => {
    // касание без свайпа — прыжок вперёд
    if (e.pointerType === 'mouse') return;
    hop('up');
  });
  document.querySelectorAll('.dpad [data-dir]').forEach((b) => b.addEventListener('click', () => hop(b.dataset.dir)));

  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('pause-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    togglePause();
  });
  window.addEventListener('resize', resize);

  level = 1;
  score = 0;
  lives = 3;
  clock = 0;
  homes = BAYS.map(() => false);
  buildLanes();
  resetFrog();
  hud();
  resize();
  last = performance.now();
  requestAnimationFrame(frame);
})();
