/* Астероиды */
(() => {
  'use strict';

  const W = 640;
  const H = 480;
  const SIZES = [
    { r: 44, pts: 20, speed: 45 },
    { r: 24, pts: 50, speed: 80 },
    { r: 12, pts: 100, speed: 125 },
  ];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();

  let state = 'idle';
  let ship, bullets, rocks, particles, score, lives, level, nextLife, levelTimer;
  let best = SG.store.get('asteroids-best', 0);
  const keys = {};
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

  function makeRock(x, y, size) {
    const a = Math.random() * Math.PI * 2;
    const sp = SIZES[size].speed * (0.7 + Math.random() * 0.6) * (1 + (level - 1) * 0.06);
    const n = 10 + Math.floor(Math.random() * 4);
    const shape = Array.from({ length: n }, () => 0.72 + Math.random() * 0.36);
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size, r: SIZES[size].r, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 1.5, shape };
  }

  function spawnLevel() {
    rocks = [];
    const n = Math.min(11, 3 + level);
    for (let k = 0; k < n; k++) {
      let x;
      let y;
      do {
        x = Math.random() * W;
        y = Math.random() * H;
      } while (Math.hypot(x - ship.x, y - ship.y) < 150);
      rocks.push(makeRock(x, y, 0));
    }
  }

  function resetShip() {
    ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2.5, cool: 0, thrust: false, dead: 0 };
  }

  function newGame() {
    score = 0;
    lives = 3;
    level = 1;
    nextLife = 10000;
    bullets = [];
    particles = [];
    resetShip();
    spawnLevel();
    levelTimer = 0;
    state = 'playing';
    overlay.hidden = true;
    hud();
  }

  function hud() {
    $('score').textContent = score;
    $('lives').textContent = lives > 0 ? '▲'.repeat(lives) : '—';
    $('level').textContent = level;
    $('best').textContent = best;
  }

  const wrap = (o) => {
    if (o.x < -o.r) o.x += W + o.r * 2;
    else if (o.x > W + o.r) o.x -= W + o.r * 2;
    if (o.y < -o.r) o.y += H + o.r * 2;
    else if (o.y > H + o.r) o.y -= H + o.r * 2;
  };

  function burst(x, y, n, color, speed = 120) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.6, color });
    }
  }

  function splitRock(k) {
    const r = rocks[k];
    rocks.splice(k, 1);
    score += SIZES[r.size].pts;
    burst(r.x, r.y, 8 + (2 - r.size) * 6, '#cbd5e1');
    SG.sound.play(r.size === 0 ? 'explode' : 'hit');
    if (r.size < 2) for (let j = 0; j < 2; j++) rocks.push(makeRock(r.x, r.y, r.size + 1));
    if (score >= nextLife) {
      lives++;
      nextLife += 10000;
      SG.sound.play('level');
    }
    hud();
  }

  // ---------- обновление ----------

  function update(dt) {
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
    if (rocks)
      rocks.forEach((r) => {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.rot += r.spin * dt;
        wrap(r);
      });
    if (state !== 'playing') return;

    // корабль
    if (ship.dead > 0) {
      ship.dead -= dt;
      if (ship.dead <= 0) {
        // возрождаемся, когда центр свободен
        const clear = rocks.every((r) => Math.hypot(r.x - W / 2, r.y - H / 2) > r.r + 70);
        if (clear) resetShip();
        else ship.dead = 0.1;
      }
    } else {
      const turn = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
      ship.a += turn * 4.4 * dt;
      ship.thrust = !!(keys.ArrowUp || keys.KeyW);
      if (ship.thrust) {
        ship.vx += Math.cos(ship.a) * 300 * dt;
        ship.vy += Math.sin(ship.a) * 300 * dt;
        if (Math.random() < 0.6) {
          particles.push({
            x: ship.x - Math.cos(ship.a) * 12,
            y: ship.y - Math.sin(ship.a) * 12,
            vx: -Math.cos(ship.a + (Math.random() - 0.5) * 0.6) * 140 + ship.vx,
            vy: -Math.sin(ship.a + (Math.random() - 0.5) * 0.6) * 140 + ship.vy,
            life: 0.25,
            color: '#fb923c',
          });
        }
      }
      const drag = Math.pow(0.55, dt);
      ship.vx *= drag;
      ship.vy *= drag;
      const sp = Math.hypot(ship.vx, ship.vy);
      if (sp > 380) {
        ship.vx *= 380 / sp;
        ship.vy *= 380 / sp;
      }
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      ship.r = 10;
      wrap(ship);
      ship.inv -= dt;
      ship.cool -= dt;
      if (keys.Space && ship.cool <= 0 && bullets.length < 6) {
        bullets.push({
          x: ship.x + Math.cos(ship.a) * 14,
          y: ship.y + Math.sin(ship.a) * 14,
          vx: Math.cos(ship.a) * 520 + ship.vx,
          vy: Math.sin(ship.a) * 520 + ship.vy,
          life: 0.95,
          r: 2,
        });
        ship.cool = 0.18;
        SG.sound.play('tick');
      }
      // гиперпрыжок
      if (keys.hyper) {
        keys.hyper = false;
        ship.x = Math.random() * W;
        ship.y = Math.random() * H;
        ship.vx = ship.vy = 0;
        burst(ship.x, ship.y, 12, '#a78bfa');
        SG.sound.play('reveal');
      }
      if (ship.inv <= 0) {
        for (const r of rocks) {
          if (Math.hypot(r.x - ship.x, r.y - ship.y) < r.r * 0.85 + 8) {
            crash();
            break;
          }
        }
      }
    }

    // пули
    bullets.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b);
    });
    bullets = bullets.filter((b) => {
      if (b.life <= 0) return false;
      for (let k = 0; k < rocks.length; k++) {
        const r = rocks[k];
        if (Math.hypot(r.x - b.x, r.y - b.y) < r.r * 0.9) {
          splitRock(k);
          return false;
        }
      }
      return true;
    });

    if (!rocks.length) {
      levelTimer += dt;
      if (levelTimer > 1.5) {
        level++;
        levelTimer = 0;
        spawnLevel();
        SG.sound.play('level');
        hud();
      }
    }
  }

  function crash() {
    lives--;
    burst(ship.x, ship.y, 40, '#60a5fa', 180);
    SG.sound.play('explode');
    hud();
    if (lives <= 0) {
      ship.dead = 99;
      return gameOver();
    }
    ship.dead = 1.5;
  }

  function gameOver() {
    state = 'over';
    SG.sound.play('lose');
    const rec = score > best;
    if (rec) {
      best = score;
      SG.store.set('asteroids-best', best);
    }
    overlay.title = 'Корабль разбит';
    overlay.text = 'Очки: ' + score + ', уровень ' + level + '.' + (rec && score ? ' Новый рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    hud();
    setTimeout(() => (overlay.hidden = false), 700);
  }

  // ---------- отрисовка ----------

  function drawShip(x, y, a, alpha, flame) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.stroke();
    if (flame) {
      ctx.strokeStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(-7, -4);
      ctx.lineTo(-14 - Math.random() * 6, 0);
      ctx.lineTo(-7, 4);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let k = 0; k < 60; k++) ctx.fillRect((k * 131) % W, (k * 211) % H, 1.2, 1.2);
    if (!rocks) return;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    rocks.forEach((r) => {
      ctx.beginPath();
      r.shape.forEach((k, i) => {
        const a = r.rot + (i / r.shape.length) * Math.PI * 2;
        ctx.lineTo(r.x + Math.cos(a) * r.r * k, r.y + Math.sin(a) * r.r * k);
      });
      ctx.closePath();
      ctx.stroke();
    });
    ctx.fillStyle = '#fde68a';
    bullets.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    particles.forEach((p) => {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    });
    ctx.globalAlpha = 1;
    if (ship && ship.dead <= 0 && state !== 'idle') {
      const blink = ship.inv > 0 && Math.floor(ship.inv * 8) % 2 === 0;
      drawShip(ship.x, ship.y, ship.a, blink ? 0.3 : 1, ship.thrust);
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

  document.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      e.preventDefault();
      if (state === 'idle' || state === 'over') {
        if (e.code === 'Space' && overlay.hidden === false) newGame();
        return;
      }
      if (['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        if (!e.repeat) keys.hyper = true;
      } else keys[e.code] = true;
    } else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'Enter' && (state === 'idle' || state === 'over')) newGame();
  });
  document.addEventListener('keyup', (e) => (keys[e.code] = false));
  window.addEventListener('blur', () => {
    Object.keys(keys).forEach((k) => (keys[k] = false));
    if (state === 'playing') togglePause();
  });
  SG.touchKeys($('touch'), keys);

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
  resetShip();
  spawnLevel();
  particles = [];
  bullets = [];
  score = 0;
  lives = 3;
  hud();
  resize();
  last = performance.now();
  requestAnimationFrame(frame);
})();
