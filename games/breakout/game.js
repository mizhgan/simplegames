/* Арканоид */
(() => {
  'use strict';

  // Логические размеры поля; на экране canvas масштабируется.
  const W = 480;
  const H = 400;
  const COLS = 10;
  const BRICK_H = 16;
  const BRICK_GAP = 5;
  const SIDE = 14;
  const TOP = 48;
  const PADDLE_W = 84;
  const PADDLE_H = 12;
  const PADDLE_Y = H - 30;
  const PADDLE_SPEED = 480;
  const BALL_R = 6;
  const MAX_ANGLE = (62 * Math.PI) / 180;
  const ROW_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#22d3ee', '#818cf8', '#e879f9'];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();
  const startBtn = $('start-btn');
  const pauseBtn = $('pause-btn');

  let colors = {};
  let state = 'idle'; // idle | ready | playing | paused | over
  let score = 0;
  let level = 1;
  let lives = 3;
  let best = SG.store.get('breakout-best', 0);
  let bricks = [];
  let particles = [];
  let paddle = { x: (W - PADDLE_W) / 2, w: PADDLE_W };
  let ball = { x: W / 2, y: PADDLE_Y - BALL_R, vx: 0, vy: 0, speed: 0 };
  let keys = { left: false, right: false };
  let rafId = 0;
  let last = 0;
  let scale = 1;

  $('best').textContent = best;

  function readColors() {
    colors = {
      bg: SG.cssVar('--board-bg'),
      line: SG.cssVar('--board-line'),
      accent: SG.cssVar('--accent'),
      accent2: SG.cssVar('--accent-2'),
      text: SG.cssVar('--text'),
    };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round((w * H) / W * dpr);
    scale = w / W;
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  // ---------- уровни ----------

  function buildLevel() {
    bricks = [];
    const rows = Math.min(4 + level, 7);
    const bw = (W - SIDE * 2 - BRICK_GAP * (COLS - 1)) / COLS;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        // Узоры на поздних уровнях: пропускаем часть кирпичей
        if (level % 3 === 2 && (r + c) % 5 === 0) continue;
        if (level % 3 === 0 && c % 3 === 1 && r % 2 === 1) continue;
        const tough = level >= 2 && r < Math.min(level - 1, 3);
        bricks.push({
          x: SIDE + c * (bw + BRICK_GAP),
          y: TOP + r * (BRICK_H + BRICK_GAP),
          w: bw,
          h: BRICK_H,
          hp: tough ? 2 : 1,
          color: ROW_COLORS[r % ROW_COLORS.length],
          points: (rows - r) * 10 * (tough ? 2 : 1),
        });
      }
    }
  }

  function ballSpeed() {
    return Math.min(250 + level * 30, 460);
  }

  function resetBall() {
    ball.speed = ballSpeed();
    ball.vx = 0;
    ball.vy = 0;
    ball.x = paddle.x + paddle.w / 2;
    ball.y = PADDLE_Y - BALL_R - 1;
    state = 'ready';
  }

  function launch() {
    if (state !== 'ready') return;
    const angle = (Math.random() * 0.6 - 0.3) * MAX_ANGLE;
    ball.vx = ball.speed * Math.sin(angle);
    ball.vy = -ball.speed * Math.cos(angle);
    state = 'playing';
  }

  function newGame() {
    score = 0;
    level = 1;
    lives = 3;
    particles = [];
    paddle.x = (W - paddle.w) / 2;
    buildLevel();
    resetBall();
    updateHud();
    overlay.hidden = true;
    pauseBtn.textContent = 'Пауза';
    loop();
  }

  function updateHud() {
    $('score').textContent = score;
    $('level').textContent = level;
    $('lives').textContent = lives > 0 ? '❤'.repeat(lives) : '0';
    if (score > best) {
      best = score;
      SG.store.set('breakout-best', best);
    }
    $('best').textContent = best;
  }

  function showOverlay(title, text, button) {
    overlay.title = title;
    overlay.text = text;
    startBtn.textContent = button;
    overlay.hidden = false;
  }

  function togglePause() {
    if (state === 'playing' || state === 'ready') {
      state = { paused: true, resume: state };
      cancelAnimationFrame(rafId);
      pauseBtn.textContent = 'Продолжить';
      showOverlay('Пауза', 'Нажмите «Продолжить» или P, чтобы вернуться.', 'Продолжить');
    } else if (state && state.paused) {
      state = state.resume;
      overlay.hidden = true;
      pauseBtn.textContent = 'Пауза';
      loop();
    }
  }

  const isPaused = () => state && state.paused;

  function gameOver() {
    SG.sound.play('lose');
    state = 'over';
    cancelAnimationFrame(rafId);
    draw();
    const record = score > 0 && score >= best ? ' Новый рекорд!' : '';
    showOverlay('Игра окончена', 'Счёт: ' + score + ', уровень ' + level + '.' + record, 'Ещё раз');
  }

  // ---------- физика ----------

  function spawnParticles(b) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: b.x + Math.random() * b.w,
        y: b.y + Math.random() * b.h,
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 0.7) * 200,
        life: 0.5 + Math.random() * 0.3,
        color: b.color,
      });
    }
  }

  function hitBrick() {
    for (const b of bricks) {
      const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
      const dx = ball.x - cx;
      const dy = ball.y - cy;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

      // сторона столкновения — по наименьшему перекрытию
      const overlapX = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R));
      const overlapY = Math.min(ball.y + BALL_R - b.y, b.y + b.h - (ball.y - BALL_R));
      if (overlapX < overlapY) {
        ball.vx = ball.x < b.x + b.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
      } else {
        ball.vy = ball.y < b.y + b.h / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
      }

      b.hp--;
      SG.sound.play('brick', b.hp > 0 ? -7 : 0);
      if (b.hp <= 0) {
        score += b.points;
        spawnParticles(b);
        bricks.splice(bricks.indexOf(b), 1);
      } else {
        score += 5;
      }
      updateHud();
      return;
    }
  }

  function stepBall(dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > W - BALL_R) {
      ball.x = W - BALL_R;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
    }

    // платформа
    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= PADDLE_Y &&
      ball.y - BALL_R <= PADDLE_Y + PADDLE_H &&
      ball.x >= paddle.x - BALL_R &&
      ball.x <= paddle.x + paddle.w + BALL_R
    ) {
      const hit = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)));
      const angle = hit * MAX_ANGLE;
      ball.vx = ball.speed * Math.sin(angle);
      ball.vy = -ball.speed * Math.cos(angle);
      ball.y = PADDLE_Y - BALL_R;
      SG.sound.play('bounce');
    }

    hitBrick();

    if (ball.y - BALL_R > H) {
      lives--;
      if (lives > 0) SG.sound.play('hit');
      updateHud();
      if (lives <= 0) {
        gameOver();
        return;
      }
      resetBall();
    }
  }

  function update(dt) {
    if (keys.left) paddle.x -= PADDLE_SPEED * dt;
    if (keys.right) paddle.x += PADDLE_SPEED * dt;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    if (state === 'ready') {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = PADDLE_Y - BALL_R - 1;
    } else if (state === 'playing') {
      // несколько подшагов, чтобы мяч не «пролетал» сквозь кирпичи
      const steps = Math.max(1, Math.ceil((ball.speed * dt) / 3));
      for (let i = 0; i < steps && state === 'playing'; i++) stepBall(dt / steps);
      if (state === 'playing' && bricks.length === 0) {
        level++;
        SG.sound.play('level');
        score += 100;
        buildLevel();
        resetBall();
        updateHud();
      }
    }

    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
  }

  // ---------- отрисовка ----------

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function draw() {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    for (const b of bricks) {
      ctx.fillStyle = b.hp > 1 ? '#cbd5e1' : b.color;
      rr(b.x, b.y, b.w, b.h, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      rr(b.x + 2, b.y + 2, b.w - 4, 4, 2);
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.8);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    const grad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    grad.addColorStop(0, colors.accent);
    grad.addColorStop(1, colors.accent2);
    ctx.fillStyle = grad;
    rr(paddle.x, PADDLE_Y, paddle.w, PADDLE_H, PADDLE_H / 2);

    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    if (state === 'ready' && overlay.hidden) {
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = 0.75;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Клик, касание или пробел — запуск', W / 2, H - 60);
      ctx.globalAlpha = 1;
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    if (state === 'ready' || state === 'playing') rafId = requestAnimationFrame(frame);
  }

  function loop() {
    cancelAnimationFrame(rafId);
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  // ---------- ввод ----------

  function pointerToPaddle(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    paddle.x = Math.max(0, Math.min(W - paddle.w, x - paddle.w / 2));
  }

  canvas.addEventListener('pointermove', (e) => {
    if (state === 'ready' || state === 'playing') pointerToPaddle(e);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (state === 'ready' || state === 'playing') {
      pointerToPaddle(e);
      if (e.pointerType === 'mouse') launch();
    }
  });
  // На сенсорных экранах мяч запускается по отпусканию пальца, чтобы можно было сначала прицелиться.
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') launch();
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = true;
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = true;
        e.preventDefault();
        break;
      case 'Space':
        e.preventDefault();
        if (state === 'ready') launch();
        else if (state === 'idle' || state === 'over') newGame();
        else if (isPaused()) togglePause();
        break;
      case 'KeyP':
      case 'Escape':
        togglePause();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  startBtn.addEventListener('click', () => {
    startBtn.blur();
    if (isPaused()) togglePause();
    else newGame();
  });

  pauseBtn.addEventListener('click', () => {
    pauseBtn.blur();
    togglePause();
  });

  $('restart-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'playing' || state === 'ready')) togglePause();
  });

  window.addEventListener('blur', () => (keys = { left: false, right: false }));
  window.addEventListener('resize', resize);
  document.addEventListener('sg:themechange', () => {
    readColors();
    draw();
  });

  readColors();
  buildLevel();
  resize();
})();
