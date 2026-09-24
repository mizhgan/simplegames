/* Змейка */
(() => {
  'use strict';

  const N = 20; // размер поля в клетках
  const SPEEDS = { slow: 170, normal: 125, fast: 90 };
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = $('score');
  const bestEl = $('best');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const startBtn = $('start-btn');
  const pauseBtn = $('pause-btn');

  let colors = {};
  let snake, dir, queue, food, score, stepMs;
  let state = 'idle'; // idle | running | paused | over
  let speed = SG.store.get('snake-speed', 'normal');
  if (!SPEEDS[speed]) speed = 'normal';
  let best = SG.store.get('snake-best', 0);
  let rafId = 0;
  let last = 0;
  let acc = 0;

  bestEl.textContent = best;

  function readColors() {
    colors = {
      bg: SG.cssVar('--board-bg'),
      cell: SG.cssVar('--board-cell'),
    };
  }

  function resize() {
    const size = canvas.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    // 1 единица = 1 клетка
    ctx.setTransform(canvas.width / N, 0, 0, canvas.height / N, 0, 0);
    draw();
  }

  function reset() {
    snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    dir = DIRS.right;
    queue = [];
    score = 0;
    stepMs = SPEEDS[speed];
    placeFood();
    updateScore();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function updateScore() {
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      SG.store.set('snake-best', best);
    }
  }

  function showOverlay(title, text, button) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
    overlay.hidden = false;
  }

  function start() {
    reset();
    state = 'running';
    overlay.hidden = true;
    pauseBtn.textContent = 'Пауза';
    run();
  }

  function run() {
    cancelAnimationFrame(rafId);
    last = performance.now();
    acc = 0;
    rafId = requestAnimationFrame(frame);
  }

  function togglePause() {
    if (state === 'running') {
      state = 'paused';
      cancelAnimationFrame(rafId);
      pauseBtn.textContent = 'Продолжить';
      showOverlay('Пауза', 'Нажмите «Продолжить» или пробел, чтобы вернуться в игру.', 'Продолжить');
    } else if (state === 'paused') {
      state = 'running';
      overlay.hidden = true;
      pauseBtn.textContent = 'Пауза';
      run();
    }
  }

  function gameOver(win) {
    state = 'over';
    SG.sound.play(win ? 'win' : 'lose');
    cancelAnimationFrame(rafId);
    draw();
    const record = score > 0 && score >= best ? ' Новый рекорд!' : '';
    showOverlay(win ? 'Победа!' : 'Игра окончена', 'Ваш счёт: ' + score + '.' + record, 'Ещё раз');
  }

  function turn(name) {
    if (state === 'paused') return;
    if (state !== 'running') start();
    const d = DIRS[name];
    const lastDir = queue.length ? queue[queue.length - 1] : dir;
    if (d === lastDir || (d.x === -lastDir.x && d.y === -lastDir.y)) return;
    if (queue.length < 3) queue.push(d);
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const eats = food && head.x === food.x && head.y === food.y;
    // хвост успевает уйти, если змейка не ест
    const body = eats ? snake : snake.slice(0, -1);
    if (
      head.x < 0 || head.y < 0 || head.x >= N || head.y >= N ||
      body.some((s) => s.x === head.x && s.y === head.y)
    ) {
      gameOver(false);
      return;
    }
    snake.unshift(head);
    if (eats) {
      score++;
      SG.sound.play('eat');
      stepMs = Math.max(55, SPEEDS[speed] - score * 2);
      updateScore();
      placeFood();
      if (!food) gameOver(true);
    } else {
      snake.pop();
    }
  }

  function frame(t) {
    if (state !== 'running') return;
    acc += Math.min(250, t - last);
    last = t;
    while (acc >= stepMs && state === 'running') {
      acc -= stepMs;
      step();
    }
    draw();
    if (state === 'running') rafId = requestAnimationFrame(frame);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function draw() {
    if (!snake) return;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, N, N);
    ctx.fillStyle = colors.cell;
    for (let y = 0; y < N; y++) {
      for (let x = (y % 2); x < N; x += 2) ctx.fillRect(x, y, 1, 1);
    }

    if (food) {
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(food.x + 0.5, food.y + 0.55, 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(food.x + 0.64, food.y + 0.18, 0.16, 0.08, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    const len = snake.length;
    for (let i = len - 1; i >= 0; i--) {
      const s = snake[i];
      const t = len > 1 ? i / (len - 1) : 0;
      ctx.fillStyle = `hsl(${158 - t * 30}, 70%, ${52 - t * 14}%)`;
      const pad = i === 0 ? 0.03 : 0.08;
      roundRect(s.x + pad, s.y + pad, 1 - pad * 2, 1 - pad * 2, 0.3);
    }

    // глаза
    const h = snake[0];
    const cx = h.x + 0.5 + dir.x * 0.18;
    const cy = h.y + 0.5 + dir.y * 0.18;
    const ox = dir.y * 0.2;
    const oy = dir.x * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, 0.13, 0, Math.PI * 2);
    ctx.arc(cx - ox, cy - oy, 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.beginPath();
    ctx.arc(cx + ox + dir.x * 0.04, cy + oy + dir.y * 0.04, 0.065, 0, Math.PI * 2);
    ctx.arc(cx - ox + dir.x * 0.04, cy - oy + dir.y * 0.04, 0.065, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- ввод ----------

  document.addEventListener('keydown', (e) => {
    const d = KEYS[e.code];
    if (d) {
      e.preventDefault();
      turn(d);
    } else if (e.code === 'Space' || e.code === 'KeyP') {
      e.preventDefault();
      if (state === 'running' || state === 'paused') togglePause();
      else if (e.code === 'Space') start();
    } else if (e.code === 'Enter' && (state === 'idle' || state === 'over')) {
      e.preventDefault();
      start();
    }
  });

  SG.onSwipe(canvas, turn);

  document.querySelectorAll('.dpad [data-dir]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      turn(b.dataset.dir);
    });
  });

  startBtn.addEventListener('click', () => {
    startBtn.blur();
    if (state === 'paused') togglePause();
    else start();
  });

  pauseBtn.addEventListener('click', () => {
    pauseBtn.blur();
    if (state === 'running' || state === 'paused') togglePause();
  });

  SG.segmented($('speed'), speed, (v) => {
    speed = v;
    SG.store.set('snake-speed', v);
    if (state === 'running') stepMs = Math.max(55, SPEEDS[speed] - score * 2);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'running') togglePause();
  });

  document.addEventListener('sg:themechange', () => {
    readColors();
    draw();
  });

  window.addEventListener('resize', resize);

  readColors();
  reset();
  resize();
})();
