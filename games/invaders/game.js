/* Космические захватчики */
(() => {
  'use strict';

  const W = 480;
  const H = 560;
  const PX = 2.4; // размер «пикселя» спрайта

  const SPRITES = {
    squid: [
      ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
      ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'],
    ],
    crab: [
      ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
      ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'],
    ],
    octo: [
      ['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##'],
      ['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..'],
    ],
    ship: [['......#......', '.....###.....', '.....###.....', '.###########.', '#############', '#############', '#############', '#############']],
    ufo: [['.....######.....', '...##########...', '..############..', '.##.##.##.##.##.', '################', '..###..##..###..', '...#........#...']],
  };
  const ROWS = [
    { type: 'squid', color: '#f472b6', pts: 30 },
    { type: 'crab', color: '#22d3ee', pts: 20 },
    { type: 'crab', color: '#22d3ee', pts: 20 },
    { type: 'octo', color: '#4ade80', pts: 10 },
    { type: 'octo', color: '#4ade80', pts: 10 },
  ];
  const COLS = 11;
  const GAP_X = 36;
  const GAP_Y = 32;
  const BUNKER = ['....############....', '..################..', '.##################.', '####################', '####################', '####################', '######........######', '#####..........#####', '####............####'];
  const BK = 3; // размер блока укрытия
  const BY = H - 140; // верх укрытий

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();

  let state = 'idle';
  let player, bullet, bombs, invaders, dir, stepTimer, frameFlip, bunkers, ufo, ufoTimer, score, lives, wave, particles, flash;
  let best = SG.store.get('invaders-best', 0);
  const keys = {};
  let last = 0;
  let colors;

  function readColors() {
    colors = { bg: SG.cssVar('--board-bg'), text: SG.cssVar('--text'), accent: SG.cssVar('--accent') };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }

  // ---------- мир ----------

  function spawnWave() {
    invaders = [];
    const top = 70 + Math.min(wave - 1, 5) * 12;
    ROWS.forEach((row, r) => {
      for (let c = 0; c < COLS; c++) {
        invaders.push({ x: 40 + c * GAP_X, y: top + r * GAP_Y, row, alive: true });
      }
    });
    dir = 1;
    stepTimer = 0;
    bombs = [];
    bullet = null;
  }

  function makeBunkers() {
    bunkers = [];
    for (let k = 0; k < 4; k++) {
      const x0 = 48 + k * 112;
      const y0 = BY;
      const cells = BUNKER.map((row) => [...row].map((ch) => ch === '#'));
      bunkers.push({ x0, y0, cells });
    }
  }

  function newGame() {
    score = 0;
    lives = 3;
    wave = 1;
    player = { x: W / 2, y: H - 40, cool: 0, inv: 0 };
    particles = [];
    ufo = null;
    ufoTimer = 15 + Math.random() * 10;
    makeBunkers();
    spawnWave();
    state = 'playing';
    overlay.hidden = true;
    hud();
  }

  function hud() {
    $('score').textContent = score;
    $('lives').textContent = '♥'.repeat(Math.max(0, lives)) || '—';
    $('wave').textContent = wave;
    $('best').textContent = best;
  }

  const sprW = (name) => SPRITES[name][0][0].length * PX;
  const sprH = (name) => SPRITES[name][0].length * PX;

  // ---------- обновление ----------

  function stepInvaders() {
    const alive = invaders.filter((v) => v.alive);
    let edge = false;
    for (const v of alive) {
      const w = sprW(v.row.type);
      if ((dir > 0 && v.x + w / 2 + 8 > W - 10) || (dir < 0 && v.x - w / 2 - 8 < 10)) edge = true;
    }
    if (edge) {
      alive.forEach((v) => (v.y += 14));
      dir = -dir;
    } else alive.forEach((v) => (v.x += 8 * dir));
    frameFlip = !frameFlip;
    SG.sound.play('tick');
  }

  function hitBunker(x, y, radius) {
    for (const b of bunkers) {
      const cx = Math.floor((x - b.x0) / BK);
      const cy = Math.floor((y - b.y0) / BK);
      if (cy < 0 || cy >= b.cells.length || cx < 0 || cx >= b.cells[0].length) continue;
      if (!b.cells[cy][cx]) continue;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = cy + dy;
          const xx = cx + dx;
          if (yy >= 0 && yy < b.cells.length && xx >= 0 && xx < b.cells[0].length && Math.random() < 0.75 - (Math.abs(dx) + Math.abs(dy)) * 0.1) b.cells[yy][xx] = false;
        }
      b.cells[cy][cx] = false;
      return true;
    }
    return false;
  }

  function boom(x, y, color, n = 14) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 140;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, color });
    }
  }

  function update(dt) {
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
    if (flash > 0) flash -= dt;
    if (state !== 'playing') return;

    // игрок
    const mv = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    player.x = Math.max(24, Math.min(W - 24, player.x + mv * 240 * dt));
    player.cool -= dt;
    player.inv -= dt;
    if ((keys.Space || keys.ArrowUp || keys.KeyW) && !bullet && player.cool <= 0) {
      bullet = { x: player.x, y: player.y - 14 };
      player.cool = 0.25;
      SG.sound.play('flap');
    }

    // снаряд игрока
    if (bullet) {
      bullet.y -= 560 * dt;
      if (bullet.y < 0) bullet = null;
      else if (hitBunker(bullet.x, bullet.y, 1)) bullet = null;
      else {
        for (const v of invaders) {
          if (!v.alive) continue;
          const w = sprW(v.row.type);
          const h = sprH(v.row.type);
          if (Math.abs(bullet.x - v.x) < w / 2 && Math.abs(bullet.y - v.y) < h / 2) {
            v.alive = false;
            bullet = null;
            score += v.row.pts;
            boom(v.x, v.y, v.row.color);
            SG.sound.play('brick', 3);
            hud();
            break;
          }
        }
        if (bullet && ufo && Math.abs(bullet.x - ufo.x) < 20 && Math.abs(bullet.y - ufo.y) < 10) {
          const pts = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
          score += pts;
          particles.push({ x: ufo.x, y: ufo.y, vx: 0, vy: -20, life: 1.2, text: '+' + pts, color: '#f87171' });
          boom(ufo.x, ufo.y, '#f87171', 20);
          ufo = null;
          bullet = null;
          SG.sound.play('coin');
          hud();
        }
      }
    }

    // пришельцы
    const alive = invaders.filter((v) => v.alive);
    if (!alive.length) {
      wave++;
      spawnWave();
      SG.sound.play('level');
      hud();
      return;
    }
    const interval = Math.max(0.045, 0.05 + (alive.length / 55) * 0.6 - (wave - 1) * 0.04);
    stepTimer += dt;
    if (stepTimer >= interval) {
      stepTimer = 0;
      stepInvaders();
    }
    // пришельцы сносят укрытия и побеждают, дойдя до низа
    for (const v of alive) {
      const h = sprH(v.row.type);
      if (v.y + h / 2 > BY) {
        const w = sprW(v.row.type);
        for (let x = v.x - w / 2; x < v.x + w / 2; x += BK) for (let y = v.y - h / 2; y < v.y + h / 2; y += BK) hitBunker(x, y, 0);
      }
      if (v.y + h / 2 >= player.y - 8) {
        lives = 0;
        return gameOver();
      }
    }

    // бомбы пришельцев
    const maxBombs = Math.min(5, 2 + Math.floor(wave / 2));
    if (bombs.length < maxBombs && Math.random() < dt * (1.2 + wave * 0.25)) {
      // стреляет нижний в случайной колонке
      const cols = {};
      alive.forEach((v) => {
        const k = Math.round(v.x);
        if (!cols[k] || cols[k].y < v.y) cols[k] = v;
      });
      const list = Object.values(cols);
      const shooter = Math.random() < 0.5 ? list.reduce((a, b) => (Math.abs(a.x - player.x) < Math.abs(b.x - player.x) ? a : b)) : list[Math.floor(Math.random() * list.length)];
      bombs.push({ x: shooter.x, y: shooter.y + 10, t: 0 });
    }
    bombs.forEach((b) => {
      b.y += (170 + wave * 12) * dt;
      b.t += dt;
    });
    bombs = bombs.filter((b) => {
      if (b.y > H) return false;
      if (hitBunker(b.x, b.y + 4, 1)) return false;
      if (player.inv <= 0 && Math.abs(b.x - player.x) < 15 && b.y > player.y - 10 && b.y < player.y + 12) {
        playerHit();
        return false;
      }
      if (bullet && Math.abs(b.x - bullet.x) < 5 && Math.abs(b.y - bullet.y) < 10) {
        bullet = null;
        return false;
      }
      return true;
    });

    // НЛО
    ufoTimer -= dt;
    if (!ufo && ufoTimer <= 0) {
      const from = Math.random() < 0.5 ? -1 : 1;
      ufo = { x: from < 0 ? -20 : W + 20, y: 40, vx: -from * 110 };
      ufoTimer = 18 + Math.random() * 12;
    }
    if (ufo) {
      ufo.x += ufo.vx * dt;
      if (ufo.x < -30 || ufo.x > W + 30) ufo = null;
    }
  }

  function playerHit() {
    lives--;
    boom(player.x, player.y, colors.accent, 30);
    flash = 0.25;
    SG.sound.play('explode');
    hud();
    if (lives <= 0) return gameOver();
    player.inv = 2;
    bombs = [];
  }

  function gameOver() {
    state = 'over';
    hud();
    SG.sound.play('lose');
    const rec = score > best;
    if (rec) {
      best = score;
      SG.store.set('invaders-best', best);
    }
    overlay.title = 'Игра окончена';
    overlay.text = 'Очки: ' + score + ', волна ' + wave + '.' + (rec && score ? ' Новый рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    hud();
    overlay.hidden = false;
  }

  // ---------- отрисовка ----------

  function sprite(name, frame, x, y, color) {
    const rows = SPRITES[name][frame % SPRITES[name].length];
    const w = rows[0].length * PX;
    const h = rows.length * PX;
    ctx.fillStyle = color;
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(x - w / 2 + c * PX, y - h / 2 + r * PX, PX + 0.3, PX + 0.3);
    });
  }

  function draw() {
    if (!colors) return;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);
    // звёзды
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 40; k++) ctx.fillRect((k * 97) % W, (k * 173) % (H - 80), 1.5, 1.5);
    if (!invaders) return;
    if (flash > 0) {
      ctx.fillStyle = 'rgba(239,68,68,0.18)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, H - 18, W, 2);
    bunkers.forEach((b) => {
      ctx.fillStyle = '#4ade80';
      b.cells.forEach((row, r) => row.forEach((on, c) => on && ctx.fillRect(b.x0 + c * BK, b.y0 + r * BK, BK, BK)));
    });
    invaders.forEach((v) => v.alive && sprite(v.row.type, frameFlip ? 1 : 0, v.x, v.y, v.row.color));
    if (ufo) sprite('ufo', 0, ufo.x, ufo.y, '#f87171');
    if (state !== 'over' && (player.inv <= 0 || Math.floor(player.inv * 10) % 2 === 0)) sprite('ship', 0, player.x, player.y, '#60a5fa');
    if (bullet) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(bullet.x - 1.5, bullet.y - 8, 3, 12);
    }
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    bombs.forEach((b) => {
      ctx.beginPath();
      for (let k = 0; k <= 4; k++) ctx.lineTo(b.x + (k % 2 ? 3 : -3) * Math.sign(Math.sin(b.t * 20) + 0.01), b.y - 8 + k * 3);
      ctx.stroke();
    });
    particles.forEach((p) => {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = '700 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;
    // запасные жизни
    for (let k = 0; k < lives - 1; k++) sprite('ship', 0, 26 + k * 38, H - 8 + 0.5, 'rgba(96,165,250,0.6)');
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
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(e.code)) {
      e.preventDefault();
      if (state === 'idle' || state === 'over') {
        if (e.code === 'Space') newGame();
        return;
      }
      keys[e.code] = true;
    } else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'Enter' && state !== 'playing' && state !== 'paused') newGame();
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
  document.addEventListener('sg:themechange', readColors);
  window.addEventListener('resize', resize);

  readColors();
  wave = 1;
  lives = 3;
  score = 0;
  player = { x: W / 2, y: H - 40, cool: 0, inv: 0 };
  particles = [];
  makeBunkers();
  spawnWave();
  hud();
  resize();
  last = performance.now();
  requestAnimationFrame(frame);
})();
