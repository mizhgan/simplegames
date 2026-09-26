/* Пакман */
(() => {
  'use strict';

  // # стена, . точка, o энергайзер, - дверь домика привидений, пробел — пусто
  const MAP = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......  .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################',
  ];
  const COLS = 28;
  const ROWS = 31;
  const T = 16; // размер клетки на холсте
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const ORDER = ['up', 'left', 'down', 'right']; // порядок при равенстве, как в оригинале
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const MODES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // разбег / погоня
  const DOOR = { x: 13.5, y: 11.5 }; // клетка над дверью домика (центры клеток — на .5)
  const GHOSTS = [
    { name: 'blinky', color: '#ef4444', start: [13.5, 11.5], corner: [25, -3], dots: 0 },
    { name: 'pinky', color: '#f9a8d4', start: [13.5, 14.5], corner: [2, -3], dots: 0 },
    { name: 'inky', color: '#22d3ee', start: [11.5, 14.5], corner: [27, 31], dots: 30 },
    { name: 'clyde', color: '#fb923c', start: [15.5, 14.5], corner: [0, 31], dots: 60 },
  ];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = SG.overlay();

  let grid, dotsLeft, dotsEaten, pac, ghosts, score, lives, level;
  let modeIndex, modeTime, frightTime, eatCombo, state, stateTime, time;
  let best = SG.store.get('pacman-best', 0);
  let rafId = 0;
  let last = 0;
  let popups = [];
  $('best').textContent = best;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * ROWS) / COLS) * dpr);
    const s = canvas.width / (COLS * T);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    draw();
  }

  // ---------- карта ----------

  const tileAt = (cx, cy) => {
    if (cy === 14 && (cx < 0 || cx >= COLS)) return ' '; // туннель
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return '#';
    return grid[cy][cx];
  };
  const walkable = (cx, cy, allowDoor) => {
    const t = tileAt(cx, cy);
    return t !== '#' && (t !== '-' || allowDoor);
  };

  function resetLevel() {
    grid = MAP.map((row) => row.split(''));
    dotsLeft = grid.flat().filter((t) => t === '.' || t === 'o').length;
    dotsEaten = 0;
  }

  function resetActors() {
    pac = { x: 13.5, y: 23.5, dir: 'left', want: 'left', mouth: 0 };
    ghosts = GHOSTS.map((g, k) => ({
      ...g,
      x: g.start[0],
      y: g.start[1],
      dir: k === 0 ? 'left' : 'up',
      mode: k === 0 ? 'active' : 'house',
      bob: 0,
    }));
    modeIndex = 0;
    modeTime = 0;
    frightTime = 0;
    popups = [];
  }

  // ---------- движение по сетке ----------

  const center = (v) => Math.floor(v) + 0.5;
  const speedScale = () => 1 + Math.min(0.3, (level - 1) * 0.05);

  // Двигает актора на dist клеток; в центре клетки вызывает choose(), чтобы выбрать направление
  function stepActor(a, dist, choose, allowDoor) {
    let guard = 0;
    while (dist > 0 && guard++ < 10) {
      const [dx, dy] = DIRS[a.dir];
      const cx = center(a.x);
      const cy = center(a.y);
      // расстояние до центра текущей клетки по направлению движения
      let toCenter = dx ? (cx - a.x) * dx : (cy - a.y) * dy;
      if (toCenter < 0) toCenter += 1; // центр уже позади — едем к следующему
      if (toCenter > dist) {
        a.x += dx * dist;
        a.y += dy * dist;
        dist = 0;
        break;
      }
      a.x += dx * toCenter;
      a.y += dy * toCenter;
      a.x = Math.round(a.x * 2) / 2;
      a.y = Math.round(a.y * 2) / 2;
      dist -= toCenter;
      choose(a);
      const [nx, ny] = DIRS[a.dir];
      if (!walkable(Math.floor(a.x) + nx, Math.floor(a.y) + ny, allowDoor)) {
        dist = 0; // упёрлись в стену
        a.stopped = true;
        break;
      }
      a.stopped = false;
      // сдвиг с центра, чтобы следующий цикл искал следующий центр
      const shift = Math.min(dist, 0.001);
      a.x += nx * shift;
      a.y += ny * shift;
      dist -= shift;
    }
    // туннель
    if (a.x < -0.5) a.x += COLS;
    if (a.x > COLS - 0.5) a.x -= COLS;
  }

  function pacChoose(a) {
    const [wx, wy] = DIRS[a.want];
    if (walkable(Math.floor(a.x) + wx, Math.floor(a.y) + wy, false)) a.dir = a.want;
    const cx = Math.floor(a.x);
    const cy = Math.floor(a.y);
    const t = tileAt(cx, cy);
    if (t === '.' || t === 'o') {
      grid[cy][cx] = ' ';
      dotsLeft--;
      dotsEaten++;
      if (t === '.') {
        score += 10;
        if (dotsEaten % 2) SG.sound.play('tick');
      } else {
        score += 50;
        frighten();
      }
      updateHud();
    }
  }

  function ghostTarget(g) {
    const px = Math.floor(pac.x);
    const py = Math.floor(pac.y);
    const [dx, dy] = DIRS[pac.dir];
    if (isScatter()) return g.corner;
    switch (g.name) {
      case 'blinky':
        return [px, py];
      case 'pinky':
        return [px + dx * 4, py + dy * 4];
      case 'inky': {
        const b = ghosts[0];
        const ax = px + dx * 2;
        const ay = py + dy * 2;
        return [ax * 2 - Math.floor(b.x), ay * 2 - Math.floor(b.y)];
      }
      default: {
        const d = Math.hypot(Math.floor(g.x) - px, Math.floor(g.y) - py);
        return d > 8 ? [px, py] : g.corner;
      }
    }
  }

  function ghostChoose(g) {
    const cx = Math.floor(g.x);
    const cy = Math.floor(g.y);
    const options = ORDER.filter((d) => d !== OPP[g.dir] && walkable(cx + DIRS[d][0], cy + DIRS[d][1], false));
    if (!options.length) {
      g.dir = OPP[g.dir];
      return;
    }
    if (g.mode === 'fright') {
      g.dir = options[Math.floor(Math.random() * options.length)];
      return;
    }
    const target = g.mode === 'eaten' ? [Math.floor(DOOR.x), Math.floor(DOOR.y)] : ghostTarget(g);
    let bestD = Infinity;
    options.forEach((d) => {
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      const dist = (nx - target[0]) ** 2 + (ny - target[1]) ** 2;
      if (dist < bestD) {
        bestD = dist;
        g.dir = d;
      }
    });
  }

  const isScatter = () => modeIndex % 2 === 0;

  function frighten() {
    frightTime = Math.max(2, 7 - level);
    eatCombo = 0;
    SG.sound.play('level');
    ghosts.forEach((g) => {
      if (g.mode === 'active' || g.mode === 'fright') {
        if (g.mode === 'active') g.dir = OPP[g.dir];
        g.mode = 'fright';
      }
    });
  }

  // Прямолинейное движение (выход из домика / возвращение в него)
  function moveTo(g, tx, ty, dist) {
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    if (d <= dist) {
      g.x = tx;
      g.y = ty;
      return true;
    }
    g.x += (dx / d) * dist;
    g.y += (dy / d) * dist;
    g.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    return false;
  }

  function updateGhost(g, dt) {
    const base = 7 * speedScale() * dt;
    const inTunnel = Math.floor(g.y) === 14 && (g.x < 5 || g.x > COLS - 5);
    switch (g.mode) {
      case 'house':
        g.bob += dt * 6;
        g.y = g.start[1] + Math.sin(g.bob) * 0.25;
        if (dotsEaten >= g.dots / Math.min(level, 3) && (g.name === 'pinky' || time > 1.5)) g.mode = 'leaving';
        break;
      case 'leaving':
        if (Math.abs(g.x - DOOR.x) > 0.01) moveTo(g, DOOR.x, 14.5, base * 0.6);
        else if (moveTo(g, DOOR.x, DOOR.y, base * 0.6)) {
          g.mode = frightTime > 0 ? 'fright' : 'active';
          g.dir = 'left';
        }
        break;
      case 'eaten':
        if (Math.abs(g.x - DOOR.x) < 0.3 && Math.abs(g.y - DOOR.y) < 0.3) {
          g.x = DOOR.x;
          g.y = DOOR.y;
          g.mode = 'entering';
        } else stepActor(g, base * 2, ghostChoose, false);
        break;
      case 'entering':
        if (moveTo(g, DOOR.x, 14.5, base * 1.5)) g.mode = 'leaving';
        break;
      default: {
        const mul = g.mode === 'fright' ? 0.55 : inTunnel ? 0.5 : 1;
        stepActor(g, base * mul, ghostChoose, false);
      }
    }
  }

  // ---------- игровой цикл ----------

  function update(dt) {
    time += dt;
    stateTime += dt;
    popups.forEach((p) => (p.t -= dt));
    popups = popups.filter((p) => p.t > 0);

    if (state === 'ready') {
      if (stateTime > 1.8) state = 'play';
      return;
    }
    if (state === 'dying') {
      if (stateTime > 1.6) {
        if (lives <= 0) gameOver();
        else {
          resetActors();
          state = 'ready';
          stateTime = 0;
        }
      }
      return;
    }
    if (state === 'cleared') {
      if (stateTime > 2) {
        level++;
        resetLevel();
        resetActors();
        updateHud();
        state = 'ready';
        stateTime = 0;
      }
      return;
    }
    if (state !== 'play') return;

    // режимы разбега и погони (время не идёт, пока привидения синие)
    if (frightTime > 0) {
      frightTime -= dt;
      if (frightTime <= 0) ghosts.forEach((g) => g.mode === 'fright' && (g.mode = 'active'));
    } else {
      modeTime += dt;
      if (modeTime > MODES[modeIndex]) {
        modeTime = 0;
        modeIndex = Math.min(modeIndex + 1, MODES.length - 1);
        ghosts.forEach((g) => g.mode === 'active' && (g.dir = OPP[g.dir]));
      }
    }

    // разворот на месте разрешён сразу
    if (pac.want === OPP[pac.dir]) pac.dir = pac.want;
    stepActor(pac, 7.6 * speedScale() * dt, pacChoose, false);
    if (!pac.stopped) pac.mouth += dt * 14;

    ghosts.forEach((g) => updateGhost(g, dt));

    // столкновения
    for (const g of ghosts) {
      if (Math.hypot(g.x - pac.x, g.y - pac.y) > 0.7) continue;
      if (g.mode === 'fright') {
        g.mode = 'eaten';
        const pts = 200 * Math.pow(2, eatCombo++);
        score += pts;
        popups.push({ x: g.x, y: g.y, text: pts, t: 1 });
        SG.sound.play('capture');
        updateHud();
      } else if (g.mode === 'active') {
        lives--;
        state = 'dying';
        stateTime = 0;
        SG.sound.play('lose');
        updateHud();
        return;
      }
    }

    if (dotsLeft === 0) {
      state = 'cleared';
      stateTime = 0;
      SG.sound.play('win');
    }
  }

  function updateHud() {
    $('score').textContent = score;
    $('lives').textContent = lives > 0 ? '●'.repeat(lives) : '—';
    $('level').textContent = level;
    if (score > best) {
      best = score;
      SG.store.set('pacman-best', best);
      $('best').textContent = best;
    }
  }

  function gameOver() {
    state = 'over';
    overlay.title = 'Игра окончена';
    overlay.text = 'Счёт: ' + score + ', уровень ' + level + '.' + (score > 0 && score >= best ? ' Новый рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    overlay.hidden = false;
  }

  // ---------- отрисовка ----------

  function drawMaze() {
    ctx.fillStyle = '#05061a';
    ctx.fillRect(0, 0, COLS * T, ROWS * T);
    const flash = state === 'cleared' && Math.floor(stateTime * 5) % 2;
    ctx.strokeStyle = flash ? '#ffffff' : '#3b5bdb';
    ctx.lineWidth = 2;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = grid[y][x];
        if (t === '#') {
          // рисуем только границы стен со стороны прохода
          const px = x * T;
          const py = y * T;
          const open = (dx, dy) => tileAt(x + dx, y + dy) !== '#';
          ctx.beginPath();
          if (open(0, -1)) {
            ctx.moveTo(px, py + 3);
            ctx.lineTo(px + T, py + 3);
          }
          if (open(0, 1)) {
            ctx.moveTo(px, py + T - 3);
            ctx.lineTo(px + T, py + T - 3);
          }
          if (open(-1, 0)) {
            ctx.moveTo(px + 3, py);
            ctx.lineTo(px + 3, py + T);
          }
          if (open(1, 0)) {
            ctx.moveTo(px + T - 3, py);
            ctx.lineTo(px + T - 3, py + T);
          }
          ctx.stroke();
        } else if (t === '-') {
          ctx.fillStyle = '#f9a8d4';
          ctx.fillRect(x * T, y * T + T / 2 - 1, T, 3);
        } else if (t === '.') {
          ctx.fillStyle = '#fde68a';
          ctx.fillRect(x * T + T / 2 - 1.5, y * T + T / 2 - 1.5, 3, 3);
        } else if (t === 'o' && Math.floor(time * 4) % 2 === 0) {
          ctx.fillStyle = '#fde68a';
          ctx.beginPath();
          ctx.arc(x * T + T / 2, y * T + T / 2, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPac() {
    const x = pac.x * T;
    const y = pac.y * T;
    let open = (Math.sin(pac.mouth) + 1) * 0.35 + 0.05;
    if (state === 'dying') open = Math.min(Math.PI, 0.1 + stateTime * 2.2);
    const angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[pac.dir];
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, T * 0.72, angle + open, angle + Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(g) {
    const x = g.x * T;
    const y = g.y * T;
    const r = T * 0.72;
    const eyesOnly = g.mode === 'eaten' || g.mode === 'entering';
    if (!eyesOnly) {
      let color = g.color;
      if (g.mode === 'fright') color = frightTime < 2 && Math.floor(time * 6) % 2 ? '#f8fafc' : '#1d4ed8';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - 1, r, Math.PI, 0);
      ctx.lineTo(x + r, y + r);
      const waves = 3;
      const shift = Math.floor(time * 8) % 2 ? 0 : 1;
      for (let k = 0; k < waves * 2; k++) {
        const wx = x + r - ((k + 1) * (2 * r)) / (waves * 2);
        ctx.lineTo(wx, y + r - ((k + shift) % 2 ? 4 : 0));
      }
      ctx.closePath();
      ctx.fill();
    }
    if (g.mode === 'fright') {
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(x - 5, y - 3, 3, 3);
      ctx.fillRect(x + 2, y - 3, 3, 3);
      return;
    }
    const [dx, dy] = DIRS[g.dir] || [0, 0];
    [-4.5, 4.5].forEach((ox) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x + ox, y - 3, 3.6, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(x + ox + dx * 1.8, y - 3 + dy * 2, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function draw() {
    if (!grid) return;
    drawMaze();
    if (state !== 'over') {
      if (state !== 'dying' || stateTime < 0.3) ghosts.forEach(drawGhost);
      if (!(state === 'dying' && stateTime > 1.3)) drawPac();
    }
    ctx.textAlign = 'center';
    ctx.font = '800 11px system-ui, sans-serif';
    popups.forEach((p) => {
      ctx.fillStyle = '#22d3ee';
      ctx.fillText(p.text, p.x * T, p.y * T);
    });
    if (state === 'ready') {
      ctx.fillStyle = '#facc15';
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.fillText(level > 1 ? 'Уровень ' + level : 'Готовься!', 14 * T, 17.8 * T);
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  // ---------- управление ----------

  function newGame() {
    score = 0;
    lives = 3;
    level = 1;
    time = 0;
    resetLevel();
    resetActors();
    state = 'ready';
    stateTime = 0;
    overlay.hidden = true;
    updateHud();
    SG.sound.play('level');
  }

  function steer(d) {
    if (state === 'over' || !pac) return;
    pac.want = d;
  }

  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  document.addEventListener('keydown', (e) => {
    const d = KEYS[e.code];
    if (d) {
      e.preventDefault();
      steer(d);
    } else if ((e.code === 'Space' || e.code === 'Enter') && state === 'over') {
      e.preventDefault();
      newGame();
    }
  });
  SG.onSwipe(canvas, steer, 18);
  document.querySelectorAll('.dpad [data-dir]').forEach((b) =>
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      steer(b.dataset.dir);
    })
  );
  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  window.addEventListener('resize', resize);

  // стартовый экран: лабиринт виден под оверлеем
  resetLevel();
  resetActors();
  score = 0;
  lives = 3;
  level = 1;
  time = 0;
  state = 'over';
  stateTime = 0;
  resize();
  last = performance.now();
  rafId = requestAnimationFrame(frame);
})();
