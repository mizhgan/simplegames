/* Динозаврик — бегун в духе офлайн-игры Chrome */
(() => {
  'use strict';

  const W = 600;
  const H = 220;
  const GROUND_Y = 180;
  const GRAVITY = 2600;
  const JUMP_V = -820;
  const START_SPEED = 380;
  const MAX_SPEED = 950;
  const DINO_X = 50;

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();

  let state = 'ready'; // ready | running | over
  let dino, obstacles, clouds, speed, distance, nextSpawn, time, overAt;
  let best = SG.store.get('dino-best', 0);
  let colors = {};
  let rafId = 0;
  let last = 0;
  let jumpHeld = false;
  let duckHeld = false;

  $('best').textContent = best;

  function readColors() {
    colors = {
      bg: SG.cssVar('--board-bg'),
      fg: SG.cssVar('--text'),
      muted: SG.cssVar('--muted'),
      cloud: SG.cssVar('--board-line'),
    };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  function reset() {
    dino = { y: 0, vy: 0, ducking: false }; // y — высота над землёй
    obstacles = [];
    clouds = [{ x: 120, y: 40 }, { x: 380, y: 70 }, { x: 560, y: 30 }];
    speed = START_SPEED;
    distance = 0;
    nextSpawn = 500;
    time = 0;
    $('score').textContent = 0;
  }

  const score = () => Math.floor(distance / 10);

  function start() {
    reset();
    state = 'running';
    overlay.hidden = true;
  }

  function jump() {
    if (state === 'ready') start();
    if (state === 'over') {
      if (performance.now() - overAt > 400) start();
      return;
    }
    if (dino.y === 0 && !dino.ducking) {
      dino.vy = JUMP_V;
      SG.sound.play('jump');
    }
  }

  function gameOver() {
    SG.sound.play('hit');
    state = 'over';
    overAt = performance.now();
    const s = score();
    if (s > best) {
      best = s;
      SG.store.set('dino-best', best);
      $('best').textContent = best;
    }
    overlay.title = 'Игра окончена';
    overlay.text = 'Счёт: ' + s + '.' + (s > 0 && s === best ? ' Новый рекорд! 🏆' : '') + ' Пробел или касание — заново.';
    overlay.hidden = false;
  }

  // ---------- препятствия ----------

  function spawn() {
    const s = score();
    if (s > 250 && Math.random() < 0.28) {
      const heights = [12, 32, 70]; // низкая — перепрыгнуть, средняя — пригнуться, высокая — пролетит сверху
      obstacles.push({ type: 'bird', x: W + 20, w: 42, h: 28, alt: heights[Math.floor(Math.random() * 3)] });
    } else {
      const big = Math.random() < 0.45;
      const count = 1 + Math.floor(Math.random() * (s > 150 ? 3 : 2));
      const cw = big ? 24 : 16;
      obstacles.push({ type: 'cactus', x: W + 20, w: cw * count + (count - 1) * 2, h: big ? 48 : 34, count, cw, alt: 0 });
    }
    // промежуток зависит от скорости, чтобы всегда можно было перепрыгнуть
    nextSpawn = speed * (0.75 + Math.random() * 0.9) + 120;
  }

  function dinoBox() {
    if (dino.ducking && dino.y === 0) return { x: DINO_X, y: GROUND_Y - 26, w: 56, h: 26 };
    return { x: DINO_X + 6, y: GROUND_Y - dino.y - 46, w: 30, h: 44 };
  }

  function obstacleBox(o) {
    return { x: o.x + 3, y: GROUND_Y - o.alt - o.h + 3, w: o.w - 6, h: o.h - 6 };
  }

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------- цикл ----------

  function update(dt) {
    time += dt;
    if (state !== 'running') return;

    speed = Math.min(MAX_SPEED, speed + 9 * dt);
    const prevScore = score();
    distance += speed * dt;
    if (Math.floor(score() / 100) > Math.floor(prevScore / 100)) SG.sound.play('coin');
    $('score').textContent = score();

    dino.ducking = duckHeld;
    if (dino.y > 0 || dino.vy < 0) {
      // короткое нажатие — низкий прыжок, долгое — высокий; вниз в воздухе — быстрое падение
      const g = GRAVITY * (duckHeld ? 2.2 : !jumpHeld && dino.vy < 0 ? 1.8 : 1);
      dino.vy += g * dt;
      dino.y -= dino.vy * dt;
      if (dino.y <= 0) {
        dino.y = 0;
        dino.vy = 0;
      }
    }

    nextSpawn -= speed * dt;
    if (nextSpawn <= 0) spawn();
    obstacles.forEach((o) => (o.x -= (o.type === 'bird' ? speed * 1.08 : speed) * dt));
    obstacles = obstacles.filter((o) => o.x + o.w > -20);
    clouds.forEach((c) => {
      c.x -= speed * 0.12 * dt;
      if (c.x < -60) {
        c.x = W + Math.random() * 100;
        c.y = 25 + Math.random() * 60;
      }
    });

    const box = dinoBox();
    if (obstacles.some((o) => overlap(box, obstacleBox(o)))) gameOver();
  }

  function drawDino() {
    ctx.fillStyle = colors.fg;
    const legPhase = state === 'running' && dino.y === 0 ? Math.floor(time * 14) % 2 : -1;
    if (dino.ducking && dino.y === 0) {
      const y = GROUND_Y - 26;
      ctx.fillRect(DINO_X, y + 4, 40, 16); // туловище
      ctx.fillRect(DINO_X + 34, y, 22, 14); // голова
      ctx.fillRect(DINO_X - 8, y + 6, 10, 6); // хвост
      ctx.fillStyle = colors.bg;
      ctx.fillRect(DINO_X + 40, y + 3, 3, 3);
      ctx.fillStyle = colors.fg;
      ctx.fillRect(DINO_X + 8, y + 20, 5, legPhase === 0 ? 6 : 3);
      ctx.fillRect(DINO_X + 24, y + 20, 5, legPhase === 1 ? 6 : 3);
      return;
    }
    const y = GROUND_Y - dino.y - 47;
    ctx.fillRect(DINO_X + 20, y, 22, 16); // голова
    ctx.fillRect(DINO_X + 20, y + 16, 10, 6); // шея
    ctx.fillRect(DINO_X + 6, y + 18, 26, 20); // туловище
    ctx.fillRect(DINO_X, y + 20, 8, 8); // хвост
    ctx.fillRect(DINO_X - 4, y + 16, 6, 6);
    ctx.fillRect(DINO_X + 30, y + 24, 6, 3); // лапка
    ctx.fillRect(DINO_X + 30, y + 12, 12, 4); // челюсть
    ctx.fillStyle = colors.bg;
    ctx.fillRect(DINO_X + 25, y + 4, 4, 4); // глаз
    ctx.fillStyle = colors.fg;
    const l1 = legPhase === 0 ? 4 : 9;
    const l2 = legPhase === 1 ? 4 : 9;
    ctx.fillRect(DINO_X + 10, y + 38, 6, l1);
    ctx.fillRect(DINO_X + 22, y + 38, 6, l2);
  }

  function drawObstacle(o) {
    ctx.fillStyle = colors.fg;
    if (o.type === 'cactus') {
      for (let i = 0; i < o.count; i++) {
        const x = o.x + i * (o.cw + 2);
        const top = GROUND_Y - o.h;
        const stem = Math.round(o.cw * 0.4);
        const sx = x + (o.cw - stem) / 2;
        ctx.fillRect(sx, top, stem, o.h);
        ctx.fillRect(x, top + o.h * 0.35, 3, o.h * 0.3);
        ctx.fillRect(x, top + o.h * 0.6, sx - x, 3);
        ctx.fillRect(x + o.cw - 3, top + o.h * 0.2, 3, o.h * 0.3);
        ctx.fillRect(sx + stem, top + o.h * 0.47, x + o.cw - sx - stem, 3);
      }
    } else {
      const y = GROUND_Y - o.alt - o.h;
      const up = Math.floor(time * 8) % 2 === 0;
      ctx.fillRect(o.x, y + 10, 42, 8); // туловище
      ctx.fillRect(o.x - 6, y + 12, 8, 4); // клюв
      ctx.fillRect(o.x + 2, y + 6, 10, 6); // голова
      if (up) ctx.fillRect(o.x + 14, y - 2, 12, 12);
      else ctx.fillRect(o.x + 14, y + 18, 12, 10);
    }
  }

  function draw() {
    if (!dino) return;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = colors.cloud;
    clouds.forEach((c) => {
      ctx.fillRect(c.x, c.y, 46, 8);
      ctx.fillRect(c.x + 8, c.y - 6, 26, 6);
    });

    ctx.fillStyle = colors.muted;
    ctx.fillRect(0, GROUND_Y - 1, W, 2);
    const off = distance % 60;
    for (let x = -off; x < W; x += 60) {
      ctx.fillRect(x + 10, GROUND_Y + 8, 6, 2);
      ctx.fillRect(x + 38, GROUND_Y + 16, 3, 2);
    }

    obstacles.forEach(drawObstacle);
    drawDino();

    ctx.fillStyle = colors.muted;
    ctx.font = '700 16px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('HI ' + String(best).padStart(5, '0') + '   ' + String(score()).padStart(5, '0'), W - 14, 28);
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  // ---------- ввод ----------

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      jumpHeld = true;
      if (!e.repeat) jump();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      duckHeld = true;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') jumpHeld = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') duckHeld = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jumpHeld = true;
    jump();
  });
  window.addEventListener('pointerup', () => (jumpHeld = false));

  const duckBtn = $('duck-btn');
  const jumpBtn = $('jump-btn');
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jumpHeld = true;
    jump();
  });
  duckBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    duckHeld = true;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => duckBtn.addEventListener(ev, () => (duckHeld = false)));

  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    start();
  });

  window.addEventListener('blur', () => {
    jumpHeld = false;
    duckHeld = false;
  });
  document.addEventListener('sg:themechange', readColors);
  window.addEventListener('resize', resize);

  readColors();
  reset();
  resize();
  last = performance.now();
  rafId = requestAnimationFrame(frame);
})();
