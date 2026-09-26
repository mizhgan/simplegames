/* Танчики — по мотивам Battle City */
(() => {
  'use strict';

  const S = 16; // размер под-клетки: кирпич разрушается кусками 16×16
  const N = 26; // поле 26×26 под-клеток = 13×13 клеток
  const W = N * S;
  const TANK = 32;
  const EMPTY = 0;
  const BRICK = 1;
  const STEEL = 2;
  const WATER = 3;
  const TREES = 4;
  const EAGLE = { x: 12 * S, y: 24 * S, w: 32, h: 32 };
  const RING = [];
  for (let y = 23; y < 26; y++) for (let x = 11; x < 15; x++) if (!(x >= 12 && x <= 13 && y >= 24)) RING.push([x, y]);
  const SPAWNS = [0, 12 * S, 24 * S];
  const PLAYER_SPAWN = { x: 8 * S, y: 24 * S };
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const TYPES = {
    basic: { speed: 45, bullet: 190, hp: 1, pts: 100, color: '#cbd5e1' },
    fast: { speed: 95, bullet: 210, hp: 1, pts: 200, color: '#fca5a5' },
    power: { speed: 55, bullet: 320, hp: 1, pts: 300, color: '#a5b4fc' },
    armor: { speed: 42, bullet: 210, hp: 4, pts: 400, color: '#86efac' },
  };
  const LINEUPS = [
    { basic: 18, fast: 2 },
    { basic: 12, fast: 4, power: 2, armor: 2 },
    { basic: 8, fast: 6, power: 4, armor: 2 },
    { basic: 4, fast: 6, power: 6, armor: 4 },
    { basic: 2, fast: 6, power: 6, armor: 6 },
  ];
  // карты 13×13: B — кирпич, S — сталь, W — вода, T — лес
  const MAPS = [
    ['.............', '.B.B.B.B.B.B.', '.B.B.B.B.B.B.', '.B.B.BSB.B.B.', '.B.B.B.B.B.B.', '.B.B.....B.B.', '.....B.B.....', 'S.BB.....BB.S', '.....B.B.....', '.B.B.BBB.B.B.', '.B.B.B.B.B.B.', '.B.B.....B.B.', '.B.B.....B.B.'],
    ['..S.....S....', '.BB.TTT.BB.S.', '.BB.TTT.BB...', '.....S.......', 'WW..BBB..WWWW', '....B.B......', 'TT..B.B..TTT.', 'TT.......TTT.', '...SS.SS.....', '.B.........B.', '.BBB.BBB.BBB.', '.B.B.....B.B.', '.B.B.....B.B.'],
    ['.............', '.SSS.BBB.SSS.', '.S.........S.', '.S.BBTTTBB.S.', '...B.TTT.B...', 'BBBB.....BBBB', '...W.WWW.W...', '.T.........T.', '.TBBB.S.BBBT.', '.T.........T.', '..B.B...B.B..', 'S.B.......B.S', '..B.......B..'],
    ['...BB...BB...', '.B.BB.B.BB.B.', '.B....B....B.', '.BBBB.B.BBBB.', '......B......', 'TTBBB...BBBTT', 'TT...WWW...TT', '..BBB...BBB..', 'S...B.S.B...S', '.BB.B...B.BB.', '.B...BBB...B.', '.B.B.....B.B.', '...B.....B...'],
    ['.....S.S.....', '.TTT.....TTT.', '.TBB.BBB.BBT.', '.TB.......BT.', '...WW.S.WW...', '.B.WW...WW.B.', '.B...BBB...B.', 'SSB.......BSS', '...B.S.S.B...', '.B.B.....B.B.', '.BBB.BBB.BBB.', '..........B..', '.B.B.....B.B.'],
  ];
  const BONUSES = ['helmet', 'clock', 'grenade', 'shovel', 'star', 'tank'];
  const BONUS_ICON = { helmet: '⛑', clock: '⏱', grenade: '💣', shovel: '🛡', star: '⭐', tank: '❤' };

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();

  let state = 'idle';
  let map, player, enemies, bullets, booms, bonus, queue, spawnTimer, spawnIdx, score, lives, stage, freeze, shovel, clearTimer, stageBanner, killed;
  let best = SG.store.get('tanks-best', 0);
  const keys = {};
  const pressOrder = [];
  let last = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / W, 0, 0);
    draw();
  }

  // ---------- карта ----------

  function loadMap(n) {
    const src = MAPS[(n - 1) % MAPS.length];
    map = Array.from({ length: N }, () => new Array(N).fill(EMPTY));
    src.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        const v = { B: BRICK, S: STEEL, W: WATER, T: TREES }[ch] || EMPTY;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) map[r * 2 + dy][c * 2 + dx] = v;
      })
    );
    RING.forEach(([x, y]) => (map[y][x] = BRICK));
    for (let y = 24; y < 26; y++) for (let x = 12; x < 14; x++) map[y][x] = EMPTY;
  }

  const solidCell = (v) => v === BRICK || v === STEEL || v === WATER;

  function blocked(x, y, self) {
    if (x < 0 || y < 0 || x + TANK > W || y + TANK > W) return true;
    for (let cy = Math.floor(y / S); cy <= Math.floor((y + TANK - 1) / S); cy++)
      for (let cx = Math.floor(x / S); cx <= Math.floor((x + TANK - 1) / S); cx++) if (solidCell(map[cy][cx])) return true;
    if (rectHit(x, y, TANK, TANK, EAGLE.x, EAGLE.y, EAGLE.w, EAGLE.h)) return true;
    for (const t of allTanks()) {
      if (t === self || t.spawning > 0) continue;
      // если уже пересекаемся (например, после появления) — разрешаем разъехаться
      if (rectHit(x, y, TANK, TANK, t.x, t.y, TANK, TANK) && !rectHit(self.x, self.y, TANK, TANK, t.x, t.y, TANK, TANK)) return true;
    }
    return false;
  }

  const rectHit = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  const allTanks = () => (player && player.alive ? [player, ...enemies] : enemies);

  // ---------- танки ----------

  function makePlayer() {
    return { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, dir: 'up', speed: 80, alive: true, shield: 3, spawning: 0.6, stars: 0, cool: 0, isPlayer: true, anim: 0 };
  }

  function move(t, dir, dt) {
    if (t.dir !== dir) {
      const vertical = dir === 'up' || dir === 'down';
      const wasVertical = t.dir === 'up' || t.dir === 'down';
      // при повороте выравниваемся по сетке, чтобы въезжать в проходы
      if (vertical !== wasVertical) {
        if (vertical) {
          const nx = Math.round(t.x / S) * S;
          if (!blocked(nx, t.y, t)) t.x = nx;
        } else {
          const ny = Math.round(t.y / S) * S;
          if (!blocked(t.x, ny, t)) t.y = ny;
        }
      }
      t.dir = dir;
    }
    const [dx, dy] = DIRS[dir];
    const dist = t.speed * dt;
    const nx = t.x + dx * dist;
    const ny = t.y + dy * dist;
    t.anim += dt;
    if (!blocked(nx, ny, t)) {
      t.x = nx;
      t.y = ny;
      return true;
    }
    // подъезжаем вплотную к препятствию
    for (let k = Math.floor(dist); k >= 1; k--) {
      if (!blocked(t.x + dx * k, t.y + dy * k, t)) {
        t.x += dx * k;
        t.y += dy * k;
        break;
      }
    }
    return false;
  }

  function fire(t) {
    const maxB = t.isPlayer && t.stars >= 2 ? 2 : 1;
    if (bullets.filter((b) => b.owner === t).length >= maxB || t.cool > 0) return;
    const [dx, dy] = DIRS[t.dir];
    const speed = t.isPlayer ? (t.stars >= 1 ? 420 : 300) : TYPES[t.type].bullet;
    bullets.push({ x: t.x + TANK / 2 + dx * 14, y: t.y + TANK / 2 + dy * 14, dir: t.dir, speed, owner: t, player: !!t.isPlayer, steel: t.isPlayer && t.stars >= 3 });
    t.cool = t.isPlayer ? 0.12 : 0.4;
    if (t.isPlayer) SG.sound.play('tick');
  }

  function spawnEnemy() {
    if (!queue.length || enemies.length >= 4) return;
    const x = SPAWNS[spawnIdx % 3];
    if (allTanks().some((t) => rectHit(x, 0, TANK, TANK, t.x, t.y, TANK, TANK))) return;
    spawnIdx++;
    const type = queue.shift();
    const n = 20 - queue.length;
    enemies.push({
      x,
      y: 0,
      dir: 'down',
      type,
      speed: TYPES[type].speed * (1 + Math.min(stage - 1, 8) * 0.04),
      hp: TYPES[type].hp,
      spawning: 0.9,
      cool: 0,
      turnT: 1 + Math.random() * 2,
      carrier: n === 4 || n === 11 || n === 18,
      anim: 0,
    });
  }

  // ---------- игра ----------

  function startStage() {
    loadMap(stage);
    const lineup = LINEUPS[Math.min(stage - 1, LINEUPS.length - 1)];
    queue = SG.shuffle(Object.entries(lineup).flatMap(([t, n]) => new Array(n).fill(t)));
    enemies = [];
    bullets = [];
    booms = [];
    bonus = null;
    spawnTimer = 0.5;
    spawnIdx = 1;
    freeze = 0;
    shovel = 0;
    clearTimer = 0;
    stageBanner = 1.6;
    const stars = player ? player.stars : 0;
    player = makePlayer();
    player.stars = stars;
    hud();
  }

  function newGame() {
    score = 0;
    lives = 3;
    stage = 1;
    killed = 0;
    player = null;
    EAGLE.dead = false;
    startStage();
    state = 'playing';
    overlay.hidden = true;
  }

  function hud() {
    $('score').textContent = score;
    $('lives').textContent = lives;
    $('stage').textContent = stage;
    $('enemies').textContent = queue.length + enemies.length;
  }

  function explode(x, y, big) {
    booms.push({ x, y, t: 0, big });
    SG.sound.play(big ? 'explode' : 'hit');
  }

  function destroyEnemy(e) {
    enemies.splice(enemies.indexOf(e), 1);
    score += TYPES[e.type].pts;
    killed++;
    explode(e.x + TANK / 2, e.y + TANK / 2, true);
    hud();
  }

  function placeBonus() {
    let x;
    let y;
    for (let k = 0; k < 50; k++) {
      x = Math.floor(Math.random() * 12) * 2 * S;
      y = Math.floor(Math.random() * 11) * 2 * S;
      if (!blocked(x, y, { x: -99, y: -99 })) break;
    }
    bonus = { x, y, type: BONUSES[Math.floor(Math.random() * BONUSES.length)], t: 15 };
    SG.sound.play('reveal');
  }

  function takeBonus() {
    const b = bonus;
    bonus = null;
    score += 500;
    SG.sound.play('level');
    if (b.type === 'helmet') player.shield = 10;
    else if (b.type === 'clock') freeze = 8;
    else if (b.type === 'grenade') [...enemies].forEach((e) => !e.spawning && destroyEnemy(e));
    else if (b.type === 'shovel') {
      shovel = 15;
      RING.forEach(([x, y]) => (map[y][x] = STEEL));
    } else if (b.type === 'star') player.stars = Math.min(3, player.stars + 1);
    else if (b.type === 'tank') lives++;
    hud();
  }

  function hitCells(b) {
    // клетки под пулей; пробиваем полосу шириной в танк
    const cx = Math.floor(b.x / S);
    const cy = Math.floor(b.y / S);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return 'edge';
    const v = map[cy][cx];
    if (v !== BRICK && v !== STEEL) return null;
    const vertical = b.dir === 'up' || b.dir === 'down';
    const cells = vertical ? [[Math.floor((b.x - 8) / S), cy], [Math.floor((b.x + 7) / S), cy]] : [[cx, Math.floor((b.y - 8) / S)], [cx, Math.floor((b.y + 7) / S)]];
    let hitSteel = false;
    cells.forEach(([x, y]) => {
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      if (map[y][x] === BRICK) map[y][x] = EMPTY;
      else if (map[y][x] === STEEL) {
        hitSteel = true;
        if (b.steel) map[y][x] = EMPTY;
      }
    });
    if (b.player) SG.sound.play(hitSteel && !b.steel ? 'bounce' : 'brick', 2);
    return 'hit';
  }

  function update(dt) {
    booms.forEach((b) => (b.t += dt));
    booms = booms.filter((b) => b.t < 0.4);
    if (state !== 'playing') return;
    if (stageBanner > 0) stageBanner -= dt;

    // игрок
    if (player.alive) {
      if (player.spawning > 0) player.spawning -= dt;
      else {
        const dir = [...pressOrder].reverse().find((d) => keys[d]);
        const map2 = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
        if (dir) move(player, map2[dir], dt);
        player.cool -= dt;
        if (keys.Space || keys.KeyJ) fire(player);
        if (player.shield > 0) player.shield -= dt;
        if (bonus && rectHit(player.x, player.y, TANK, TANK, bonus.x, bonus.y, TANK, TANK)) takeBonus();
      }
    } else {
      player.respawn -= dt;
      if (player.respawn <= 0) {
        const stars = 0;
        player = makePlayer();
        player.stars = stars;
      }
    }

    // враги
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = Math.max(1.2, 3 - stage * 0.15);
    }
    if (freeze > 0) freeze -= dt;
    enemies.forEach((e) => {
      if (e.spawning > 0) {
        e.spawning -= dt;
        return;
      }
      if (freeze > 0) return;
      e.cool -= dt;
      e.turnT -= dt;
      const moved = move(e, e.dir, dt);
      if (!moved || e.turnT <= 0) {
        e.turnT = 0.8 + Math.random() * 2.5;
        const r = Math.random();
        const tx = r < 0.5 ? EAGLE.x : player.x;
        if (r < 0.75 && Math.abs(tx - e.x) > 8 && Math.random() < 0.5) e.dir = tx < e.x ? 'left' : 'right';
        else if (r < 0.55) e.dir = 'down';
        else e.dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
        if (!moved && Math.random() < 0.5) fire(e);
      }
      if (Math.random() < dt * 1.1) fire(e);
    });

    // пули
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      bullets.forEach((b) => {
        if (b.dead) return;
        const [dx, dy] = DIRS[b.dir];
        b.x += (dx * b.speed * dt) / steps;
        b.y += (dy * b.speed * dt) / steps;
        const res = hitCells(b);
        if (res) {
          b.dead = true;
          explode(b.x, b.y, false);
          return;
        }
        if (rectHit(b.x - 3, b.y - 3, 6, 6, EAGLE.x, EAGLE.y, EAGLE.w, EAGLE.h)) {
          b.dead = true;
          explode(EAGLE.x + 16, EAGLE.y + 16, true);
          EAGLE.dead = true;
          return gameOver('Штаб уничтожен');
        }
        if (b.player) {
          for (const e of enemies) {
            if (e.spawning > 0 || !rectHit(b.x - 3, b.y - 3, 6, 6, e.x, e.y, TANK, TANK)) continue;
            b.dead = true;
            if (e.carrier) {
              e.carrier = false;
              placeBonus();
            }
            e.hp--;
            if (e.hp <= 0) destroyEnemy(e);
            else SG.sound.play('bounce');
            break;
          }
        } else if (player.alive && player.spawning <= 0 && rectHit(b.x - 3, b.y - 3, 6, 6, player.x, player.y, TANK, TANK)) {
          b.dead = true;
          if (player.shield <= 0) {
            player.alive = false;
            player.respawn = 1.2;
            lives--;
            explode(player.x + TANK / 2, player.y + TANK / 2, true);
            hud();
            if (lives < 0) {
              lives = 0;
              hud();
              return gameOver('Танки закончились');
            }
          }
        }
      });
      // пули гасят друг друга
      for (const a of bullets) {
        if (a.dead || !a.player) continue;
        for (const b of bullets) if (!b.dead && !b.player && Math.abs(a.x - b.x) < 6 && Math.abs(a.y - b.y) < 6) a.dead = b.dead = true;
      }
      if (state !== 'playing') break;
    }
    bullets = bullets.filter((b) => !b.dead);

    if (shovel > 0) {
      shovel -= dt;
      if (shovel <= 0) RING.forEach(([x, y]) => (map[y][x] = BRICK));
    }
    if (bonus) {
      bonus.t -= dt;
      if (bonus.t <= 0) bonus = null;
    }

    if (!queue.length && !enemies.length && state === 'playing') {
      clearTimer += dt;
      if (clearTimer > 2) {
        stage++;
        SG.sound.play('win');
        if (stage > SG.store.get('tanks-stage', 1)) SG.store.set('tanks-stage', stage);
        startStage();
      }
    }
  }

  function gameOver(reason) {
    state = 'over';
    SG.sound.play('lose');
    const rec = score > best;
    if (rec) {
      best = score;
      SG.store.set('tanks-best', best);
    }
    $('best').textContent = best;
    overlay.title = reason;
    overlay.text = 'Очки: ' + score + ', уровень ' + stage + ', подбито танков: ' + killed + '.' + (rec && score ? ' Новый рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    setTimeout(() => (overlay.hidden = false), 900);
  }

  // ---------- отрисовка ----------

  function drawTank(t, color) {
    ctx.save();
    ctx.translate(t.x + TANK / 2, t.y + TANK / 2);
    ctx.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[t.dir]);
    // гусеницы
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-15, -14, 8, 28);
    ctx.fillRect(7, -14, 8, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    const off = Math.floor(t.anim * 30) % 4;
    for (let y = -14 + off; y < 14; y += 4) {
      ctx.fillRect(-15, y, 8, 1.5);
      ctx.fillRect(7, y, 8, 1.5);
    }
    // корпус и башня
    ctx.fillStyle = color;
    ctx.fillRect(-9, -11, 18, 23);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(0, 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 1, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-2, -16, 4, 15);
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = '#0b0b0f';
    ctx.fillRect(0, 0, W, W);
    if (!map) return;
    const time = performance.now() / 1000;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const v = map[y][x];
        const px = x * S;
        const py = y * S;
        if (v === BRICK) {
          ctx.fillStyle = '#b45309';
          ctx.fillRect(px, py, S, S);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(px, py + 7, S, 2);
          ctx.fillRect(px, py + 15, S, 1);
          ctx.fillRect(px + ((y % 2) * 8 + 4) % 16, py, 2, 7);
          ctx.fillRect(px + ((y % 2) * 8 + 12) % 16, py + 8, 2, 7);
        } else if (v === STEEL) {
          ctx.fillStyle = '#9ca3af';
          ctx.fillRect(px, py, S, S);
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(px + 3, py + 3, S - 6, S - 6);
          ctx.fillStyle = '#6b7280';
          ctx.fillRect(px + 5, py + 5, S - 10, S - 10);
        } else if (v === WATER) {
          ctx.fillStyle = '#1d4ed8';
          ctx.fillRect(px, py, S, S);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          const o = Math.floor(time * 2 + x + y) % 2;
          ctx.fillRect(px + 2 + o * 6, py + 4, 5, 2);
          ctx.fillRect(px + 8 - o * 6, py + 11, 5, 2);
        }
      }
    // штаб
    ctx.save();
    ctx.translate(EAGLE.x + 16, EAGLE.y + 16);
    if (EAGLE.dead) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '26px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✖', 0, 0);
    } else {
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(5, -4);
      ctx.lineTo(14, -6);
      ctx.lineTo(8, 4);
      ctx.lineTo(10, 13);
      ctx.lineTo(0, 8);
      ctx.lineTo(-10, 13);
      ctx.lineTo(-8, 4);
      ctx.lineTo(-14, -6);
      ctx.lineTo(-5, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // танки
    const drawSpawn = (t) => {
      const k = Math.abs(Math.sin(time * 12)) * 12 + 4;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? k / 2.5 : k;
        ctx.lineTo(t.x + 16 + Math.cos(a) * r, t.y + 16 + Math.sin(a) * r);
      }
      ctx.fill();
    };
    enemies.forEach((e) => {
      if (e.spawning > 0) return drawSpawn(e);
      let color = TYPES[e.type].color;
      if (e.type === 'armor') color = ['#86efac', '#86efac', '#fde047', '#fb923c', '#86efac'][e.hp] || color;
      if (e.carrier && Math.floor(time * 6) % 2) color = '#ef4444';
      drawTank(e, color);
    });
    if (player && player.alive && state !== 'idle') {
      if (player.spawning > 0) drawSpawn(player);
      else {
        drawTank(player, ['#facc15', '#fbbf24', '#f59e0b', '#fde68a'][player.stars]);
        if (player.shield > 0) {
          ctx.strokeStyle = `rgba(147,197,253,${0.5 + Math.sin(time * 20) * 0.3})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(player.x + 16, player.y + 16, 20, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    // пули
    ctx.fillStyle = '#f8fafc';
    bullets.forEach((b) => ctx.fillRect(b.x - 3, b.y - 3, 6, 6));
    // лес поверх танков
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (map[y][x] !== TREES) continue;
        ctx.fillStyle = '#166534';
        ctx.fillRect(x * S, y * S, S, S);
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(x * S + 5, y * S + 5, 4, 0, Math.PI * 2);
        ctx.arc(x * S + 11, y * S + 10, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    // бонус
    if (bonus && (bonus.t > 3 || Math.floor(time * 6) % 2)) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.roundRect(bonus.x + 2, bonus.y + 2, 28, 28, 6);
      ctx.fill();
      ctx.font = '20px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(BONUS_ICON[bonus.type], bonus.x + 16, bonus.y + 17);
    }
    // взрывы
    booms.forEach((b) => {
      const r = (b.big ? 26 : 12) * (0.4 + b.t / 0.4);
      ctx.globalAlpha = 1 - b.t / 0.4;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    if (freeze > 0) {
      ctx.fillStyle = 'rgba(147,197,253,0.08)';
      ctx.fillRect(0, 0, W, W);
    }
    if (stageBanner > 0 && state === 'playing') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, W / 2 - 34, W, 68);
      ctx.fillStyle = '#fff';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Уровень ' + stage, W / 2, W / 2);
    }
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = '#fff';
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Пауза', W / 2, W / 2);
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

  const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
  function press(code) {
    if (MOVE_KEYS.includes(code)) {
      const i = pressOrder.indexOf(code);
      if (i >= 0) pressOrder.splice(i, 1);
      pressOrder.push(code);
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MOVE_KEYS.includes(e.code) || e.code === 'Space' || e.code === 'KeyJ') {
      e.preventDefault();
      if ((state === 'idle' || state === 'over') && e.code === 'Space') {
        if (!overlay.hidden) newGame();
        return;
      }
      keys[e.code] = true;
      press(e.code);
    } else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'Enter' && (state === 'idle' || state === 'over')) newGame();
  });
  document.addEventListener('keyup', (e) => (keys[e.code] = false));
  window.addEventListener('blur', () => {
    Object.keys(keys).forEach((k) => (keys[k] = false));
    if (state === 'playing') togglePause();
  });
  SG.touchKeys($('touch'), keys, press);

  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('pause-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    togglePause();
  });
  window.addEventListener('resize', resize);

  stage = 1;
  score = 0;
  lives = 3;
  startStage();
  $('best').textContent = best;
  resize();
  last = performance.now();
  requestAnimationFrame(frame);
})();
