/* Stack — башня из блоков */
(() => {
  'use strict';

  const W = 360;
  const H = 560;
  const BLOCK_H = 26;
  const DEPTH = 12; // «глубина» верхней грани для псевдо-3D
  const BASE_W = 200;
  const PERFECT = 5; // допуск идеальной укладки, px
  const GROW = 8;

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');

  let state = 'ready'; // ready | playing | over
  let stack, moving, debris, camY, targetCamY, combo, hue0, speed, dir, time;
  let best = SG.store.get('stack-best', 0);
  let rafId = 0;
  let last = 0;
  let perfectFlash = 0;

  $('best').textContent = best;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  const colorFor = (i, light = 0) => `hsl(${(hue0 + i * 7) % 360}, 70%, ${55 + light}%)`;
  const score = () => stack.length - 1;

  function reset() {
    hue0 = Math.floor(Math.random() * 360);
    // y — нижняя грань блока в мировых координатах (0 — пол, растёт вверх)
    stack = [{ x: (W - BASE_W) / 2, w: BASE_W, y: 0 }];
    debris = [];
    combo = 0;
    speed = 170;
    camY = 0;
    targetCamY = 0;
    time = 0;
    spawn();
    $('score').textContent = 0;
  }

  function spawn() {
    const top = stack[stack.length - 1];
    dir = stack.length % 2 ? 1 : -1;
    moving = { x: dir > 0 ? -top.w : W, w: top.w, y: top.y + BLOCK_H };
  }

  function drop() {
    if (state === 'ready') {
      state = 'playing';
      overlay.hidden = true;
      return;
    }
    if (state !== 'playing') return;
    const top = stack[stack.length - 1];
    const delta = moving.x - top.x;
    if (Math.abs(delta) >= top.w) {
      // полностью мимо
      debris.push({ ...moving, vy: 0, vx: dir * 40, rot: 0, vr: dir * 0.8, i: stack.length });
      moving = null;
      gameOver();
      return;
    }
    let placed;
    if (Math.abs(delta) <= PERFECT) {
      combo++;
      const w = Math.min(BASE_W, top.w + (combo >= 3 ? GROW : 0));
      placed = { x: top.x - (w - top.w) / 2, w, y: moving.y };
      perfectFlash = 1;
      SG.sound.play('merge', Math.min(12, combo * 2));
    } else {
      combo = 0;
      const x = Math.max(moving.x, top.x);
      const right = Math.min(moving.x + moving.w, top.x + top.w);
      placed = { x, w: right - x, y: moving.y };
      // отрезанная часть падает
      const cutX = delta > 0 ? right : moving.x;
      const cutW = moving.w - placed.w;
      debris.push({ x: cutX, w: cutW, y: moving.y, vy: 0, vx: Math.sign(delta) * 60, rot: 0, vr: Math.sign(delta) * 1.2, i: stack.length });
      SG.sound.play('place', Math.min(12, score() % 13));
    }
    stack.push(placed);
    speed = Math.min(420, speed + 6);
    $('score').textContent = score();
    targetCamY = Math.max(0, placed.y - H * 0.45);
    spawn();
  }

  function gameOver() {
    state = 'over';
    SG.sound.play('lose');
    const s = score();
    if (s > best) {
      best = s;
      SG.store.set('stack-best', best);
      $('best').textContent = best;
    }
    setTimeout(() => {
      overlayTitle.textContent = 'Башня рухнула';
      overlayText.textContent = 'Высота: ' + s + '.' + (s > 0 && s === best ? ' Новый рекорд! 🏆' : '');
      $('start-btn').textContent = 'Ещё раз';
      overlay.hidden = false;
    }, 700);
  }

  function update(dt) {
    time += dt;
    if (state === 'playing' && moving) {
      moving.x += dir * speed * dt;
      // блок ездит туда-сюда над башней
      if (moving.x + moving.w > W + 30 && dir > 0) dir = -1;
      if (moving.x < -30 && dir < 0) dir = 1;
    } else if (state === 'ready' && moving) {
      moving.x = (W - moving.w) / 2 + Math.sin(time * 2) * 60;
    }
    debris.forEach((d) => {
      d.vy += 1400 * dt;
      d.y -= d.vy * dt;
      d.x += d.vx * dt;
      d.rot += d.vr * dt;
    });
    debris = debris.filter((d) => d.y > camY - 400);
    camY += (targetCamY - camY) * Math.min(1, dt * 6);
    perfectFlash = Math.max(0, perfectFlash - dt * 2.5);
  }

  // ---------- отрисовка ----------

  const screenY = (y) => H - 60 - (y - camY);

  function drawBlock(b, i, alpha = 1) {
    const y = screenY(b.y) - BLOCK_H;
    ctx.globalAlpha = alpha;
    // верхняя грань
    ctx.fillStyle = colorFor(i, 14);
    ctx.beginPath();
    ctx.moveTo(b.x, y);
    ctx.lineTo(b.x + DEPTH, y - DEPTH);
    ctx.lineTo(b.x + b.w + DEPTH, y - DEPTH);
    ctx.lineTo(b.x + b.w, y);
    ctx.closePath();
    ctx.fill();
    // боковая грань
    ctx.fillStyle = colorFor(i, -14);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, y);
    ctx.lineTo(b.x + b.w + DEPTH, y - DEPTH);
    ctx.lineTo(b.x + b.w + DEPTH, y + BLOCK_H - DEPTH);
    ctx.lineTo(b.x + b.w, y + BLOCK_H);
    ctx.closePath();
    ctx.fill();
    // лицевая грань
    ctx.fillStyle = colorFor(i);
    ctx.fillRect(b.x, y, b.w, BLOCK_H);
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!stack) return;
    const topHue = (hue0 + stack.length * 7) % 360;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${topHue}, 45%, 22%)`);
    bg.addColorStop(1, `hsl(${(topHue + 40) % 360}, 45%, 12%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    stack.forEach((b, i) => {
      const y = screenY(b.y);
      if (y > -BLOCK_H && y - BLOCK_H < H + 40) drawBlock(b, i);
    });
    // пол под башней
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, screenY(0), W, H);

    if (moving) drawBlock(moving, stack.length);

    debris.forEach((d) => {
      ctx.save();
      const cx = d.x + d.w / 2;
      const cy = screenY(d.y) - BLOCK_H / 2;
      ctx.translate(cx, cy);
      ctx.rotate(d.rot);
      ctx.translate(-cx, -cy);
      drawBlock(d, d.i, 0.9);
      ctx.restore();
    });

    if (perfectFlash > 0 && stack.length > 1) {
      const t = stack[stack.length - 1];
      ctx.strokeStyle = `rgba(255,255,255,${perfectFlash})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(t.x - 4, screenY(t.y) - BLOCK_H - 4, t.w + 8, BLOCK_H + 8);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.font = '800 56px system-ui, sans-serif';
    ctx.fillText(score(), W / 2, 90);
    if (combo >= 2 && state === 'playing') {
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillText('Идеально ×' + combo, W / 2, 118);
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

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'ArrowDown') return;
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'over') {
      if (!overlay.hidden) restart();
    } else drop();
  });
  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (state === 'over') restart();
    else drop();
  });

  function restart() {
    reset();
    state = 'playing';
    overlay.hidden = true;
  }

  window.addEventListener('resize', resize);

  reset();
  resize();
  last = performance.now();
  rafId = requestAnimationFrame(frame);
})();
