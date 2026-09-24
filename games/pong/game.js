/* Понг */
(() => {
  'use strict';

  const W = 600;
  const H = 400;
  const PAD_W = 12;
  const PAD_H = 72;
  const BALL = 10;
  const WIN = 7;
  const AI_SPEED = { easy: 230, normal: 330, hard: 460 };

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');

  let mode = SG.store.get('pong-mode', 'ai');
  let difficulty = SG.store.get('pong-diff', 'normal');
  let left, right, ball, score, state, serveTimer, colors;
  const keys = {};
  const touchY = { left: null, right: null };
  let rafId = 0;
  let last = 0;

  function readColors() {
    colors = { bg: SG.cssVar('--board-bg'), line: SG.cssVar('--board-line'), text: SG.cssVar('--text'), accent: SG.cssVar('--accent'), accent2: SG.cssVar('--accent-2') };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  function serve(dir) {
    ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: 330 };
    serveTimer = 0.9;
    ball.dir = dir;
  }

  function newGame() {
    left = { y: H / 2 - PAD_H / 2 };
    right = { y: H / 2 - PAD_H / 2 };
    score = [0, 0];
    state = 'playing';
    overlay.hidden = true;
    $('labels').textContent = mode === 'ai' ? 'Вы — Компьютер' : 'Игрок 1 — Игрок 2';
    serve(Math.random() < 0.5 ? -1 : 1);
    updateScore();
  }

  function updateScore() {
    $('score').textContent = score[0] + ' : ' + score[1];
  }

  function movePaddle(p, target, maxSpeed, dt) {
    const c = p.y + PAD_H / 2;
    const d = target - c;
    p.y += Math.max(-maxSpeed * dt, Math.min(maxSpeed * dt, d));
    p.y = Math.max(0, Math.min(H - PAD_H, p.y));
  }

  function update(dt) {
    if (state !== 'playing') return;
    // левая ракетка: W/S или касание левой половины
    if (touchY.left !== null) movePaddle(left, touchY.left, 900, dt);
    else left.y += ((keys.KeyS || (mode === 'ai' && keys.ArrowDown) ? 1 : 0) - (keys.KeyW || (mode === 'ai' && keys.ArrowUp) ? 1 : 0)) * 420 * dt;
    left.y = Math.max(0, Math.min(H - PAD_H, left.y));

    if (mode === 'ai') {
      // компьютер следит за мячом с ограниченной скоростью и небольшой ошибкой
      const target = ball.vx > 0 ? ball.y + Math.sin(performance.now() / 300) * (difficulty === 'hard' ? 8 : 22) : H / 2;
      movePaddle(right, target, AI_SPEED[difficulty], dt);
    } else if (touchY.right !== null) movePaddle(right, touchY.right, 900, dt);
    else {
      right.y += ((keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0)) * 420 * dt;
      right.y = Math.max(0, Math.min(H - PAD_H, right.y));
    }

    if (serveTimer > 0) {
      serveTimer -= dt;
      if (serveTimer <= 0) {
        const a = (Math.random() - 0.5) * 0.8;
        ball.vx = Math.cos(a) * ball.speed * ball.dir;
        ball.vy = Math.sin(a) * ball.speed;
      }
      return;
    }

    const steps = 3;
    for (let s = 0; s < steps; s++) {
      ball.x += (ball.vx * dt) / steps;
      ball.y += (ball.vy * dt) / steps;
      if (ball.y < BALL / 2) {
        ball.y = BALL / 2;
        ball.vy = Math.abs(ball.vy);
        SG.sound.play('tick');
      } else if (ball.y > H - BALL / 2) {
        ball.y = H - BALL / 2;
        ball.vy = -Math.abs(ball.vy);
        SG.sound.play('tick');
      }
      hitPaddle(left, 24, 1);
      hitPaddle(right, W - 24 - PAD_W, -1);
    }

    if (ball.x < -20) point(1);
    else if (ball.x > W + 20) point(0);
  }

  function hitPaddle(p, x, dir) {
    if (Math.sign(ball.vx) === dir) return;
    if (ball.x + BALL / 2 < x || ball.x - BALL / 2 > x + PAD_W) return;
    if (ball.y + BALL / 2 < p.y || ball.y - BALL / 2 > p.y + PAD_H) return;
    // угол отскока зависит от места удара
    const rel = (ball.y - (p.y + PAD_H / 2)) / (PAD_H / 2);
    const angle = rel * 1.0;
    ball.speed = Math.min(900, ball.speed * 1.06);
    ball.vx = Math.cos(angle) * ball.speed * dir;
    ball.vy = Math.sin(angle) * ball.speed;
    ball.x = dir > 0 ? x + PAD_W + BALL / 2 : x - BALL / 2;
    SG.sound.play('bounce');
  }

  function point(who) {
    score[who]++;
    updateScore();
    SG.sound.play(mode === 'ai' && who === 1 ? 'error' : 'coin');
    if (score[who] >= WIN) return finish(who);
    serve(who === 0 ? 1 : -1);
  }

  function finish(who) {
    state = 'over';
    let title;
    if (mode === 'ai') {
      title = who === 0 ? 'Вы победили! 🎉' : 'Компьютер победил 🤖';
      if (who === 0) SG.store.set('pong-wins', SG.store.get('pong-wins', 0) + 1);
      SG.sound.play(who === 0 ? 'win' : 'lose');
    } else {
      title = 'Победил игрок ' + (who + 1) + '! 🎉';
      SG.sound.play('win');
    }
    $('overlay-title').textContent = title;
    $('overlay-text').textContent = 'Счёт ' + score[0] + ' : ' + score[1] + '.';
    $('start-btn').textContent = 'Ещё раз';
    overlay.hidden = false;
  }

  function draw() {
    if (!ball) return;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = colors.line;
    for (let y = 8; y < H; y += 24) ctx.fillRect(W / 2 - 2, y, 4, 12);
    ctx.fillStyle = colors.text;
    ctx.globalAlpha = 0.25;
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(score[0], W / 2 - 70, 80);
    ctx.fillText(score[1], W / 2 + 70, 80);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.accent;
    ctx.fillRect(24, left.y, PAD_W, PAD_H);
    ctx.fillStyle = colors.accent2;
    ctx.fillRect(W - 24 - PAD_W, right.y, PAD_W, PAD_H);
    ctx.fillStyle = colors.text;
    ctx.fillRect(ball.x - BALL / 2, ball.y - BALL / 2, BALL, BALL);
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  // ---------- управление ----------

  document.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) {
      keys[e.code] = true;
      e.preventDefault();
    } else if ((e.code === 'Space' || e.code === 'Enter') && state !== 'playing') {
      e.preventDefault();
      newGame();
    }
  });
  document.addEventListener('keyup', (e) => (keys[e.code] = false));
  window.addEventListener('blur', () => Object.keys(keys).forEach((k) => (keys[k] = false)));

  // касание или мышь: левая половина — левая ракетка, правая — правая (в режиме «вдвоём»)
  const pointers = new Map();
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }
  function applyPointers() {
    touchY.left = null;
    touchY.right = null;
    pointers.forEach((pos) => {
      if (mode === 'pvp' && pos.x > W / 2) touchY.right = pos.y;
      else touchY.left = pos.y;
    });
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pointerPos(e));
    applyPointers();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && mode === 'ai' && !pointers.has(e.pointerId)) {
      // мышью можно управлять и без нажатия
      touchY.left = pointerPos(e).y;
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, pointerPos(e));
    applyPointers();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    applyPointers();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) touchY.left = null;
  });

  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('pong-mode', v);
    $('difficulty').style.display = mode === 'ai' ? '' : 'none';
    newGame();
  });
  SG.segmented($('difficulty'), difficulty, (v) => {
    difficulty = v;
    SG.store.set('pong-diff', v);
  });
  $('difficulty').style.display = mode === 'ai' ? '' : 'none';
  document.addEventListener('sg:themechange', readColors);
  window.addEventListener('resize', resize);

  readColors();
  left = { y: H / 2 - PAD_H / 2 };
  right = { y: H / 2 - PAD_H / 2 };
  score = [0, 0];
  serve(1);
  state = 'idle';
  resize();
  last = performance.now();
  rafId = requestAnimationFrame(frame);
})();
