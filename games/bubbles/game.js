/* Шарики (Bubble Shooter) */
(() => {
  'use strict';

  const W = 400;
  const H = 600;
  const COLS = 11;
  const R = W / (COLS * 2 + 1); // радиус шара: чётные ряды — 11 шаров, нечётные — 10 со сдвигом
  const ROW_H = R * Math.sqrt(3);
  const SHOOTER_Y = H - 50;
  const DEAD_ROW = Math.floor((SHOOTER_Y - 2 * R - R) / ROW_H); // ряд, до которого нельзя дорастать
  const SPEED = 900;
  const SHOTS_PER_ROW = 6;
  const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  const LIGHT = ['#fecaca', '#fde68a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8'];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const overlay = $('overlay');

  let grid; // grid[row][col] = индекс цвета или -1
  let parity; // сдвинут ли нулевой ряд
  let current, next, shot, aim, falling, popping, score, missCounter, state, colorCount;
  let best = SG.store.get('bubbles-best', 0);
  let colors = {};
  let rafId = 0;
  let last = 0;
  $('best').textContent = best;

  const rowCols = (r) => ((r + parity) % 2 ? COLS - 1 : COLS);
  const cellX = (r, c) => R + c * 2 * R + ((r + parity) % 2 ? R : 0);
  const cellY = (r) => R + r * ROW_H;

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

  // ---------- поле ----------

  function emptyRow() {
    return Array(COLS).fill(-1);
  }

  function presentColors() {
    const set = new Set();
    grid.forEach((row) => row.forEach((v) => v >= 0 && set.add(v)));
    return [...set];
  }

  function randomColor() {
    const present = presentColors();
    const pool = present.length ? present : [...Array(colorCount).keys()];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function neighbors(r, c) {
    const odd = (r + parity) % 2;
    const d = odd
      ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
      : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    return d
      .map(([dr, dc]) => [r + dr, c + dc])
      .filter(([rr, cc]) => rr >= 0 && rr < grid.length && cc >= 0 && cc < rowCols(rr));
  }

  function addTopRow() {
    parity = 1 - parity;
    const row = emptyRow();
    for (let c = 0; c < rowCols(0); c++) row[c] = Math.floor(Math.random() * colorCount);
    grid.unshift(row);
    // последний ряд за пределами поля больше не нужен, если он пуст
    while (grid.length > DEAD_ROW + 2 && grid[grid.length - 1].every((v) => v < 0)) grid.pop();
    SG.sound.play('drop');
  }

  // ---------- выстрел ----------

  function fire() {
    if (state !== 'playing' || shot) return;
    const angle = aim;
    shot = { x: W / 2, y: SHOOTER_Y, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED, color: current };
    current = next;
    next = randomColor();
    SG.sound.play('flap');
  }

  function snap(x, y) {
    // ближайшая свободная клетка к точке касания
    let bestCell = null;
    let bestD = Infinity;
    const rowGuess = Math.max(0, Math.round((y - R) / ROW_H));
    for (let r = Math.max(0, rowGuess - 1); r <= rowGuess + 1; r++) {
      while (grid.length <= r) grid.push(emptyRow());
      for (let c = 0; c < rowCols(r); c++) {
        if (grid[r][c] >= 0) continue;
        const d = (cellX(r, c) - x) ** 2 + (cellY(r) - y) ** 2;
        if (d < bestD) {
          bestD = d;
          bestCell = [r, c];
        }
      }
    }
    return bestCell;
  }

  function land(x, y, color) {
    const cell = snap(x, y);
    if (!cell) return;
    const [r, c] = cell;
    grid[r][c] = color;

    // одинаковый цвет, связанные соседи
    const cluster = [[r, c]];
    const seen = new Set([r * 100 + c]);
    for (let k = 0; k < cluster.length; k++) {
      for (const [nr, nc] of neighbors(...cluster[k])) {
        if (seen.has(nr * 100 + nc) || grid[nr][nc] !== color) continue;
        seen.add(nr * 100 + nc);
        cluster.push([nr, nc]);
      }
    }

    if (cluster.length >= 3) {
      cluster.forEach(([cr, cc]) => {
        popping.push({ x: cellX(cr, cc), y: cellY(cr), color: grid[cr][cc], t: 0 });
        grid[cr][cc] = -1;
      });
      score += cluster.length * 10;
      SG.sound.play('merge', Math.min(12, cluster.length));
      dropFloating();
    } else {
      SG.sound.play('place', -5);
      missCounter++;
      if (missCounter >= SHOTS_PER_ROW) {
        missCounter = 0;
        addTopRow();
      }
    }
    updateHud();
    checkEnd();
  }

  // Шары, не связанные с потолком, падают
  function dropFloating() {
    const attached = new Set();
    const queue = [];
    for (let c = 0; c < rowCols(0); c++) {
      if (grid[0] && grid[0][c] >= 0) {
        attached.add(c);
        queue.push([0, c]);
      }
    }
    for (let k = 0; k < queue.length; k++) {
      for (const [nr, nc] of neighbors(...queue[k])) {
        if (attached.has(nr * 100 + nc) || grid[nr][nc] < 0) continue;
        attached.add(nr * 100 + nc);
        queue.push([nr, nc]);
      }
    }
    let dropped = 0;
    grid.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v >= 0 && !attached.has(r * 100 + c)) {
          falling.push({ x: cellX(r, c), y: cellY(r), vy: -80 - Math.random() * 120, vx: (Math.random() - 0.5) * 120, color: v });
          grid[r][c] = -1;
          dropped++;
        }
      })
    );
    if (dropped) {
      score += dropped * 20;
      setTimeout(() => SG.sound.play('coin'), 120);
    }
  }

  function checkEnd() {
    const lowest = grid.reduce((m, row, r) => (row.some((v) => v >= 0) ? r : m), -1);
    if (lowest < 0) {
      // поле очищено — бонус и новая волна
      score += 500;
      updateHud();
      SG.sound.play('level');
      colorCount = Math.min(COLORS.length, colorCount + 1);
      fillStart();
      return;
    }
    if (lowest > DEAD_ROW) gameOver();
  }

  function gameOver() {
    state = 'over';
    SG.sound.play('lose');
    if (score > best) {
      best = score;
      SG.store.set('bubbles-best', best);
    }
    $('best').textContent = best;
    $('overlay-title').textContent = 'Шары дошли до низа';
    $('overlay-text').textContent = 'Счёт: ' + score + '.' + (score > 0 && score === best ? ' Новый рекорд! 🏆' : '');
    $('start-btn').textContent = 'Ещё раз';
    overlay.hidden = false;
  }

  function updateHud() {
    $('score').textContent = score;
    $('shots').textContent = SHOTS_PER_ROW - missCounter;
    if (score > best) {
      best = score;
      SG.store.set('bubbles-best', best);
      $('best').textContent = best;
    }
  }

  function fillStart() {
    grid = [];
    parity = 0;
    for (let r = 0; r < 6; r++) {
      const row = emptyRow();
      for (let c = 0; c < rowCols(r); c++) row[c] = Math.floor(Math.random() * colorCount);
      grid.push(row);
    }
  }

  function newGame() {
    colorCount = 5;
    fillStart();
    score = 0;
    missCounter = 0;
    shot = null;
    falling = [];
    popping = [];
    aim = -Math.PI / 2;
    current = randomColor();
    next = randomColor();
    state = 'playing';
    overlay.hidden = true;
    updateHud();
  }

  // ---------- цикл ----------

  function update(dt) {
    if (shot) {
      const steps = 4;
      for (let s = 0; s < steps && shot; s++) {
        shot.x += (shot.vx * dt) / steps;
        shot.y += (shot.vy * dt) / steps;
        if (shot.x < R) {
          shot.x = R;
          shot.vx = Math.abs(shot.vx);
          SG.sound.play('tick');
        } else if (shot.x > W - R) {
          shot.x = W - R;
          shot.vx = -Math.abs(shot.vx);
          SG.sound.play('tick');
        }
        let hit = shot.y <= R;
        if (!hit) {
          outer: for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < rowCols(r); c++) {
              if (grid[r][c] < 0) continue;
              if ((cellX(r, c) - shot.x) ** 2 + (cellY(r) - shot.y) ** 2 < (2 * R * 0.85) ** 2) {
                hit = true;
                break outer;
              }
            }
          }
        }
        if (hit) {
          const s2 = shot;
          shot = null;
          land(s2.x, s2.y, s2.color);
        }
      }
    }
    falling.forEach((f) => {
      f.vy += 1400 * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
    });
    falling = falling.filter((f) => f.y < H + R);
    popping.forEach((p) => (p.t += dt * 4));
    popping = popping.filter((p) => p.t < 1);
  }

  function ball(x, y, color, scale = 1, alpha = 1) {
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R * scale);
    g.addColorStop(0, LIGHT[color]);
    g.addColorStop(0.6, COLORS[color]);
    g.addColorStop(1, COLORS[color]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.94 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!grid) return;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // граница проигрыша
    const deadY = cellY(DEAD_ROW) + R;
    ctx.strokeStyle = colors.line;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, deadY);
    ctx.lineTo(W, deadY);
    ctx.stroke();
    ctx.setLineDash([]);

    grid.forEach((row, r) => row.forEach((v, c) => v >= 0 && ball(cellX(r, c), cellY(r), v)));
    popping.forEach((p) => ball(p.x, p.y, p.color, 1 + p.t * 0.5, 1 - p.t));
    falling.forEach((f) => ball(f.x, f.y, f.color, 1, 0.9));

    // прицельная линия с отражением от стен
    if (state === 'playing' && !shot) {
      ctx.strokeStyle = colors.muted;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([2, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let x = W / 2;
      let y = SHOOTER_Y;
      let vx = Math.cos(aim);
      const vy = Math.sin(aim);
      ctx.moveTo(x, y);
      for (let len = 0; len < 420 && y > R; len += 4) {
        x += vx * 4;
        y += vy * 4;
        if (x < R || x > W - R) vx = -vx;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    if (shot) ball(shot.x, shot.y, shot.color);
    else if (current !== undefined) ball(W / 2, SHOOTER_Y, current);
    if (next !== undefined) {
      ball(W / 2 + 60, SHOOTER_Y + 12, next, 0.7);
      ctx.fillStyle = colors.muted;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('далее', W / 2 + 60, SHOOTER_Y + 38);
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  // ---------- прицел и выстрел ----------

  function aimAt(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    let a = Math.atan2(y - SHOOTER_Y, x - W / 2);
    // не даём стрелять вниз и почти горизонтально
    if (a > 0) a = x < W / 2 ? -Math.PI + 0.12 : -0.12;
    aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, a));
  }

  function swap() {
    if (state !== 'playing' || shot) return;
    [current, next] = [next, current];
    SG.sound.play('click');
  }

  let pressed = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    // клик по «следующему» шару меняет их местами
    if (Math.hypot(x - (W / 2 + 60), y - (SHOOTER_Y + 12)) < R * 1.5) {
      swap();
      return;
    }
    pressed = true;
    canvas.setPointerCapture(e.pointerId);
    aimAt(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || pressed) aimAt(e);
  });
  canvas.addEventListener('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    fire();
  });

  document.addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    if (e.code === 'ArrowLeft') aim = Math.max(-Math.PI + 0.12, aim - 0.06);
    else if (e.code === 'ArrowRight') aim = Math.min(-0.12, aim + 0.06);
    else if (e.code === 'Space' || e.code === 'ArrowUp') fire();
    else if (e.code === 'KeyX' || e.code === 'ShiftLeft') swap();
    else return;
    e.preventDefault();
  });

  $('start-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  document.addEventListener('sg:themechange', readColors);
  window.addEventListener('resize', resize);

  readColors();
  newGame();
  state = 'ready';
  overlay.hidden = false;
  resize();
  last = performance.now();
  rafId = requestAnimationFrame(frame);
})();
