/* Птичка (в духе Flappy Bird) */
(() => {
  'use strict';

  const W = 360;
  const H = 540;
  const GROUND = 70; // высота земли
  const GRAVITY = 1500;
  const FLAP = -430;
  const SPEED = 150;
  const PIPE_W = 62;
  const GAP = 150;
  const SPACING = 210;
  const BIRD_X = 100;
  const BIRD_R = 15;

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();
  const startBtn = $('start-btn');

  let state = 'ready'; // ready | playing | dying | over
  let bird, pipes, clouds, score, groundX, time;
  let best = SG.store.get('flappy-best', 0);
  let rafId = 0;
  let last = 0;
  let dark = true;

  $('best').textContent = best;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  function reset() {
    bird = { y: H / 2 - 40, vy: 0, rot: 0 };
    pipes = [];
    score = 0;
    groundX = 0;
    time = 0;
    clouds = Array.from({ length: 5 }, (_, i) => ({
      x: i * 90 + Math.random() * 40,
      y: 40 + Math.random() * 180,
      s: 0.6 + Math.random() * 0.7,
    }));
    $('score').textContent = 0;
    state = 'ready';
  }

  function addPipe(x) {
    const minTop = 60;
    const maxTop = H - GROUND - GAP - 60;
    pipes.push({ x, top: minTop + Math.random() * (maxTop - minTop), passed: false });
  }

  function flap() {
    if (state === 'over' || state === 'dying') return;
    if (state === 'ready') {
      state = 'playing';
      overlay.hidden = true;
      addPipe(W + 40);
    }
    bird.vy = FLAP;
    SG.sound.play('flap');
  }

  function die() {
    if (state !== 'playing') return;
    state = 'dying';
    SG.sound.play('hit');
    if (navigator.vibrate) navigator.vibrate(40);
  }

  function finish() {
    state = 'over';
    if (score > best) {
      best = score;
      SG.store.set('flappy-best', best);
      $('best').textContent = best;
    }
    const record = score > 0 && score === best ? ' Новый рекорд! 🏆' : '';
    overlay.title = 'Игра окончена';
    overlay.text = 'Пролетели труб: ' + score + '.' + record;
    startBtn.textContent = 'Ещё раз';
    overlay.hidden = false;
  }

  // Столкновение круга-птички с прямоугольником (с небольшой форой для игрока)
  function circleRect(x, y, w, h) {
    const cx = Math.max(x, Math.min(BIRD_X, x + w));
    const cy = Math.max(y, Math.min(bird.y, y + h));
    return (cx - BIRD_X) ** 2 + (cy - bird.y) ** 2 < (BIRD_R - 2) ** 2;
  }

  const hitsPipe = (p) =>
    circleRect(p.x - 3, -1000, PIPE_W + 6, p.top + 1000) ||
    circleRect(p.x - 3, p.top + GAP, PIPE_W + 6, 1000);

  function update(dt) {
    time += dt;
    const moving = state === 'ready' || state === 'playing';
    if (moving) groundX = (groundX - SPEED * dt) % 24;
    clouds.forEach((c) => {
      if (moving) c.x -= SPEED * 0.15 * c.s * dt;
      if (c.x < -80) {
        c.x = W + 40;
        c.y = 40 + Math.random() * 180;
      }
    });

    if (state === 'ready') {
      bird.y = H / 2 - 40 + Math.sin(time * 4) * 8;
      bird.rot = 0;
      return;
    }
    if (state === 'over') return;

    bird.vy = Math.min(bird.vy + GRAVITY * dt, 700);
    bird.y += bird.vy * dt;
    bird.rot = Math.max(-0.45, Math.min(1.4, bird.vy / 500));
    if (bird.y < BIRD_R) {
      bird.y = BIRD_R;
      bird.vy = 0;
    }

    if (state === 'playing') {
      pipes.forEach((p) => {
        p.x -= SPEED * dt;
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          score++;
          SG.sound.play('coin');
          $('score').textContent = score;
        }
        if (hitsPipe(p)) die();
      });
      if (pipes.length && pipes[pipes.length - 1].x < W - SPACING) addPipe(W + 10);
      pipes = pipes.filter((p) => p.x > -PIPE_W - 10);
    }

    if (bird.y + BIRD_R >= H - GROUND) {
      bird.y = H - GROUND - BIRD_R;
      if (state === 'playing') die();
      finish();
    }
  }

  // ---------- отрисовка ----------

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function draw() {
    if (!bird) return;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (dark) {
      sky.addColorStop(0, '#1e1b4b');
      sky.addColorStop(1, '#4c1d95');
    } else {
      sky.addColorStop(0, '#7dd3fc');
      sky.addColorStop(1, '#e0f2fe');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (dark) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 30; i++) {
        const x = (i * 97) % W;
        const y = (i * 53) % (H - GROUND - 120);
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    ctx.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)';
    clouds.forEach((c) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 20 * c.s, c.y - 8 * c.s, 22 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 42 * c.s, c.y, 17 * c.s, 0, Math.PI * 2);
      ctx.fill();
    });

    pipes.forEach((p) => {
      const g = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
      g.addColorStop(0, '#16a34a');
      g.addColorStop(0.5, '#4ade80');
      g.addColorStop(1, '#15803d');
      ctx.fillStyle = g;
      rr(p.x, -10, PIPE_W, p.top + 10, 6);
      rr(p.x, p.top + GAP, PIPE_W, H - GROUND - p.top - GAP + 10, 6);
      ctx.fillStyle = '#166534';
      rr(p.x - 5, p.top - 24, PIPE_W + 10, 24, 6);
      rr(p.x - 5, p.top + GAP, PIPE_W + 10, 24, 6);
    });

    // земля
    ctx.fillStyle = dark ? '#3f2a1d' : '#ded895';
    ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = dark ? '#15803d' : '#65a30d';
    ctx.fillRect(0, H - GROUND, W, 14);
    ctx.fillStyle = dark ? '#166534' : '#4d7c0f';
    for (let x = groundX; x < W; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, H - GROUND + 14);
      ctx.lineTo(x + 12, H - GROUND + 14);
      ctx.lineTo(x + 6, H - GROUND + 4);
      ctx.fill();
    }

    // птичка
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R + 2, BIRD_R, 0, 0, Math.PI * 2);
    ctx.fill();
    const wing = Math.sin(time * 18) * 4;
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(-5, 2 + (state === 'playing' ? wing : 0), 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(7, -5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(8.5, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(23, 3);
    ctx.lineTo(12, 7);
    ctx.fill();
    ctx.restore();

    if (state === 'playing' || state === 'dying') {
      ctx.font = '800 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(score, W / 2, 80);
      ctx.fillStyle = '#fff';
      ctx.fillText(score, W / 2, 80);
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  // ---------- ввод ----------

  const onPress = (e) => {
    if (state === 'over') return;
    e.preventDefault();
    flap();
  };
  canvas.addEventListener('pointerdown', onPress);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state === 'over') restart();
      else flap();
    }
  });

  function restart() {
    reset();
    overlay.title = 'Птичка';
    overlay.text = 'Нажмите пробел, кликните или коснитесь поля, чтобы взлететь.';
    startBtn.textContent = 'Начать';
    overlay.hidden = false;
  }

  startBtn.addEventListener('click', () => {
    startBtn.blur();
    if (state === 'over') reset();
    flap();
  });

  function readTheme() {
    dark = SG.currentTheme() === 'dark';
  }
  document.addEventListener('sg:themechange', readTheme);
  window.addEventListener('resize', resize);

  readTheme();
  reset();
  resize();
  last = performance.now();
  rafId = requestAnimationFrame(frame);
})();
