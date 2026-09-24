/* Прыгун — прыжки по платформам (в духе Doodle Jump) */
(() => {
  'use strict';

  const W = 360;
  const H = 600;
  const GRAVITY = 1500;
  const JUMP_V = -720;
  const SPRING_V = -1150;
  const MOVE_SPEED = 330;
  const PW = 58;
  const PH = 12;
  const HERO_W = 34;
  const HERO_H = 34;

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');

  let state = 'ready';
  let hero, platforms, camY, maxHeight, time, particles;
  let input = { left: false, right: false, tilt: 0 };
  let best = SG.store.get('jumper-best', 0);
  let colors = {};
  let rafId = 0;
  let last = 0;
  $('best').textContent = best;

  function readColors() {
    colors = { bg: SG.cssVar('--board-bg'), line: SG.cssVar('--board-line'), text: SG.cssVar('--text'), muted: SG.cssVar('--muted') };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  const score = () => Math.floor(maxHeight / 10);

  // ---------- платформы ----------

  function makePlatform(y) {
    const h = -y; // высота над стартом
    const r = Math.random();
    let type = 'normal';
    if (h > 800 && r < 0.18) type = 'moving';
    else if (h > 1500 && r < 0.3) type = 'breaking';
    const p = { x: Math.random() * (W - PW), y, type, vx: type === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * (60 + Math.min(120, h / 60)) : 0, broken: false, spring: false };
    if (type === 'normal' && Math.random() < 0.07) p.spring = true;
    return p;
  }

  function reset() {
    hero = { x: W / 2 - HERO_W / 2, y: H - 120, vx: 0, vy: JUMP_V, face: 1 };
    platforms = [{ x: W / 2 - PW / 2, y: H - 60, type: 'normal', vx: 0, broken: false, spring: false }];
    let y = H - 60;
    while (y > -H) {
      y -= 55 + Math.random() * 35;
      platforms.push(makePlatform(y));
    }
    camY = 0;
    maxHeight = 0;
    time = 0;
    particles = [];
    $('score').textContent = 0;
  }

  // ---------- цикл ----------

  function update(dt) {
    time += dt;
    if (state === 'ready') {
      hero.y = H - 120 + Math.sin(time * 4) * 10;
      return;
    }
    if (state !== 'playing') return;

    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!dir && Math.abs(input.tilt) > 3) dir = Math.max(-1, Math.min(1, input.tilt / 20));
    hero.vx = dir * MOVE_SPEED;
    if (dir) hero.face = Math.sign(dir);
    hero.x += hero.vx * dt;
    // выход за край — появление с другой стороны
    if (hero.x > W) hero.x = -HERO_W;
    if (hero.x < -HERO_W) hero.x = W;

    const prevBottom = hero.y + HERO_H;
    hero.vy += GRAVITY * dt;
    hero.y += hero.vy * dt;

    platforms.forEach((p) => {
      if (p.type === 'moving') {
        p.x += p.vx * dt;
        if (p.x < 0 || p.x > W - PW) p.vx = -p.vx;
      }
      if (p.broken) p.y += 400 * dt;
    });

    // приземление только при падении
    if (hero.vy > 0) {
      for (const p of platforms) {
        if (p.broken) continue;
        const bottom = hero.y + HERO_H;
        if (prevBottom <= p.y + 2 && bottom >= p.y && hero.x + HERO_W - 8 > p.x && hero.x + 8 < p.x + PW) {
          if (p.type === 'breaking') {
            p.broken = true;
            SG.sound.play('hit');
            continue;
          }
          hero.y = p.y - HERO_H;
          if (p.spring && hero.x + HERO_W / 2 > p.x + PW / 2 - 14 && hero.x + HERO_W / 2 < p.x + PW / 2 + 14) {
            hero.vy = SPRING_V;
            SG.sound.play('level');
          } else {
            hero.vy = JUMP_V;
            SG.sound.play('jump');
          }
          for (let k = 0; k < 6; k++) particles.push({ x: hero.x + HERO_W / 2, y: p.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, life: 0.4 });
          break;
        }
      }
    }

    // камера следует за героем вверх
    const heroScreen = hero.y - camY;
    if (heroScreen < H * 0.4) camY = hero.y - H * 0.4;
    maxHeight = Math.max(maxHeight, -camY);
    $('score').textContent = score();

    // новые платформы сверху, старые исчезают снизу
    let topY = Math.min(...platforms.map((p) => p.y));
    const gapMax = Math.min(150, 90 + maxHeight / 80);
    while (topY > camY - 100) {
      topY -= 50 + Math.random() * (gapMax - 50);
      platforms.push(makePlatform(topY));
    }
    platforms = platforms.filter((p) => p.y < camY + H + 40);

    particles.forEach((q) => {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 600 * dt;
      q.life -= dt;
    });
    particles = particles.filter((q) => q.life > 0);

    if (hero.y - camY > H + 60) gameOver();
  }

  function gameOver() {
    state = 'over';
    SG.sound.play('lose');
    const s = score();
    if (s > best) {
      best = s;
      SG.store.set('jumper-best', best);
      $('best').textContent = best;
    }
    $('overlay-title').textContent = 'Упал!';
    $('overlay-text').textContent = 'Высота: ' + s + '.' + (s > 0 && s === best ? ' Новый рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    overlay.hidden = false;
  }

  // ---------- отрисовка ----------

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function draw() {
    if (!hero) return;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);
    // клетчатая «тетрадная» бумага
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const off = ((-camY % 24) + 24) % 24;
    for (let y = off; y < H; y += 24) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    for (let x = 0; x < W; x += 24) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    platforms.forEach((p) => {
      const y = p.y - camY;
      if (y < -20 || y > H + 20) return;
      ctx.fillStyle = p.type === 'moving' ? '#3b82f6' : p.type === 'breaking' ? '#a16207' : '#22c55e';
      ctx.globalAlpha = p.broken ? 0.5 : 1;
      rr(p.x, y, PW, PH, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      rr(p.x + 4, y + 2, PW - 8, 3, 2);
      if (p.type === 'breaking') {
        ctx.strokeStyle = '#422006';
        ctx.beginPath();
        ctx.moveTo(p.x + PW / 2 - 4, y);
        ctx.lineTo(p.x + PW / 2 + 2, y + PH / 2);
        ctx.lineTo(p.x + PW / 2 - 2, y + PH);
        ctx.stroke();
      }
      if (p.spring) {
        ctx.fillStyle = '#94a3b8';
        rr(p.x + PW / 2 - 7, y - 10, 14, 10, 2);
        ctx.fillStyle = '#e2e8f0';
        rr(p.x + PW / 2 - 9, y - 12, 18, 4, 2);
      }
      ctx.globalAlpha = 1;
    });

    particles.forEach((q) => {
      ctx.globalAlpha = q.life / 0.4;
      ctx.fillStyle = colors.muted;
      ctx.fillRect(q.x - 2, q.y - camY - 2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // герой
    const hx = hero.x;
    const hy = hero.y - camY;
    ctx.fillStyle = '#facc15';
    rr(hx + 3, hy + 6, HERO_W - 6, HERO_H - 10, 10);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(hx + 6, hy + HERO_H - 10, 7, 10);
    ctx.fillRect(hx + HERO_W - 13, hy + HERO_H - 10, 7, 10);
    // нос в сторону движения
    ctx.fillStyle = '#facc15';
    rr(hero.face > 0 ? hx + HERO_W - 6 : hx - 6, hy + 12, 12, 8, 4);
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(hx + HERO_W / 2 + hero.face * 5, hy + 14, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.text;
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(score(), 12, 30);
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  // ---------- управление ----------

  function start() {
    reset();
    state = 'playing';
    overlay.hidden = true;
    requestTilt();
  }

  // Наклон телефона (на iOS нужно разрешение, спрашиваем по нажатию «Играть»)
  let tiltAsked = false;
  function requestTilt() {
    if (tiltAsked || typeof DeviceOrientationEvent === 'undefined') return;
    tiltAsked = true;
    const listen = () =>
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma !== null) input.tilt = e.gamma;
      });
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then((r) => r === 'granted' && listen())
        .catch(() => {});
    } else listen();
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
    else if ((e.code === 'Space' || e.code === 'Enter') && state !== 'playing') start();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
  });

  // касание левой / правой половины поля
  const touches = new Map();
  const updateTouch = () => {
    const xs = [...touches.values()];
    input.left = xs.some((x) => x < 0.5);
    input.right = xs.some((x) => x >= 0.5);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    touches.set(e.pointerId, (e.clientX - rect.left) / rect.width);
    canvas.setPointerCapture(e.pointerId);
    updateTouch();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    touches.set(e.pointerId, (e.clientX - rect.left) / rect.width);
    updateTouch();
  });
  const release = (e) => {
    touches.delete(e.pointerId);
    updateTouch();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    start();
  });
  window.addEventListener('blur', () => {
    input.left = input.right = false;
  });
  document.addEventListener('sg:themechange', readColors);
  window.addEventListener('resize', resize);

  readColors();
  reset();
  resize();
  last = performance.now();
  rafId = requestAnimationFrame(frame);
})();
