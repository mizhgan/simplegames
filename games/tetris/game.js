/* Тетрис */
(() => {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const LOCK_DELAY = 500;
  const MAX_LOCK_RESETS = 15;
  const LINE_POINTS = [0, 100, 300, 500, 800];
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  };
  const COLORS = {
    I: '#22d3ee', J: '#3b82f6', L: '#f97316', O: '#facc15',
    S: '#22c55e', T: '#a855f7', Z: '#ef4444',
  };
  // Смещения при повороте у стены / пола («wall kicks»)
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const nextCanvas = $('next');
  const nextCtx = nextCanvas.getContext('2d');
  const holdCanvas = $('hold');
  const holdCtx = holdCanvas.getContext('2d');
  const overlay = SG.overlay();
  const startBtn = $('start-btn');
  const pauseBtn = $('pause-btn');

  let colors = {};
  let board, piece, queue, bag, hold, canHold;
  let score, lines, level;
  let best = SG.store.get('tetris-best', 0);
  let state = 'idle'; // idle | running | paused | over
  let dropAcc = 0;
  let lockAcc = 0;
  let lockResets = 0;
  let rafId = 0;
  let last = 0;
  let flash = null; // { rows, t } — подсветка удаляемых линий

  $('best').textContent = best;

  // ---------- модель ----------

  const rotate = (m, dir) => {
    const n = m.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (dir > 0) r[x][n - 1 - y] = m[y][x];
        else r[n - 1 - x][y] = m[y][x];
      }
    }
    return r;
  };

  function nextFromBag() {
    if (!bag.length) bag = SG.shuffle(Object.keys(SHAPES));
    return bag.pop();
  }

  function makePiece(type) {
    const m = SHAPES[type].map((row) => row.slice());
    return { type, m, x: Math.floor((COLS - m.length) / 2), y: type === 'I' ? -1 : 0 };
  }

  function collide(m, x, y) {
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m.length; c++) {
        if (!m[r][c]) continue;
        const nx = x + c;
        const ny = y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function spawn(type) {
    piece = makePiece(type || queue.shift());
    if (!type) queue.push(nextFromBag());
    dropAcc = 0;
    lockAcc = 0;
    lockResets = 0;
    if (collide(piece.m, piece.x, piece.y)) gameOver();
    drawSide();
  }

  const onGround = () => collide(piece.m, piece.x, piece.y + 1);

  function touched() {
    // любое успешное действие у земли откладывает фиксацию (ограниченное число раз)
    if (onGround() && lockResets < MAX_LOCK_RESETS) {
      lockAcc = 0;
      lockResets++;
    }
  }

  function move(dx) {
    if (state !== 'running') return;
    if (!collide(piece.m, piece.x + dx, piece.y)) {
      piece.x += dx;
      SG.sound.play('tick');
      touched();
    }
  }

  function turn(dir) {
    if (state !== 'running' || piece.type === 'O') return;
    const m = rotate(piece.m, dir);
    for (const [kx, ky] of KICKS) {
      if (!collide(m, piece.x + kx, piece.y + ky)) {
        piece.m = m;
        SG.sound.play('rotate');
        piece.x += kx;
        piece.y += ky;
        touched();
        return;
      }
    }
  }

  function softDrop() {
    if (state !== 'running') return;
    if (!onGround()) {
      piece.y++;
      score += 1;
      dropAcc = 0;
      updateHud();
    }
  }

  function hardDrop() {
    if (state !== 'running') return;
    let n = 0;
    while (!onGround()) {
      piece.y++;
      n++;
    }
    score += n * 2;
    SG.sound.play('drop');
    lock();
  }

  function holdPiece() {
    if (state !== 'running' || !canHold) return;
    const type = piece.type;
    if (hold) spawn(hold);
    else spawn();
    hold = type;
    canHold = false;
    SG.sound.play('click');
    drawSide();
  }

  function lock() {
    let above = false;
    piece.m.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        const y = piece.y + r;
        if (y < 0) above = true;
        else board[y][piece.x + c] = piece.type;
      })
    );
    if (above) {
      gameOver();
      return;
    }
    const full = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(Boolean)) full.push(y);
    SG.sound.play(full.length ? 'line' : 'place', full.length || -12);
    if (full.length) {
      flash = { rows: full, t: 120 };
      full.forEach((y) => {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
      });
      lines += full.length;
      score += LINE_POINTS[full.length] * level;
      level = Math.floor(lines / 10) + 1;
    }
    canHold = true;
    updateHud();
    spawn();
  }

  const dropInterval = () => Math.max(50, 800 * Math.pow(0.8, level - 1));

  // ---------- игровой цикл ----------

  function frame(t) {
    if (state !== 'running') return;
    const dt = Math.min(100, t - last);
    last = t;
    if (onGround()) {
      lockAcc += dt;
      if (lockAcc >= LOCK_DELAY) lock();
    } else {
      lockAcc = 0;
      dropAcc += dt;
      while (dropAcc >= dropInterval() && !onGround()) {
        dropAcc -= dropInterval();
        piece.y++;
      }
    }
    if (flash) {
      flash.t -= dt;
      if (flash.t <= 0) flash = null;
    }
    draw();
    if (state === 'running') rafId = requestAnimationFrame(frame);
  }

  function run() {
    cancelAnimationFrame(rafId);
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = [];
    queue = [nextFromBag(), nextFromBag(), nextFromBag()];
    hold = null;
    canHold = true;
    score = 0;
    lines = 0;
    level = 1;
    flash = null;
    state = 'running';
    overlay.hidden = true;
    pauseBtn.textContent = 'Пауза';
    updateHud();
    spawn();
    run();
  }

  function togglePause() {
    if (state === 'running') {
      state = 'paused';
      cancelAnimationFrame(rafId);
      pauseBtn.textContent = 'Продолжить';
      showOverlay('Пауза', 'Нажмите P или «Продолжить».', 'Продолжить');
    } else if (state === 'paused') {
      state = 'running';
      overlay.hidden = true;
      pauseBtn.textContent = 'Пауза';
      run();
    }
  }

  function gameOver() {
    SG.sound.play('lose');
    state = 'over';
    cancelAnimationFrame(rafId);
    draw();
    const record = score > 0 && score >= best ? ' Новый рекорд!' : '';
    showOverlay('Игра окончена', 'Счёт: ' + score + ', линий: ' + lines + '.' + record, 'Ещё раз');
  }

  function showOverlay(title, text, btn) {
    overlay.title = title;
    overlay.text = text;
    startBtn.textContent = btn;
    overlay.hidden = false;
  }

  function updateHud() {
    $('score').textContent = score;
    $('lines').textContent = lines;
    $('level').textContent = level;
    if (score > best) {
      best = score;
      SG.store.set('tetris-best', best);
      $('best').textContent = best;
    }
  }

  // ---------- отрисовка ----------

  function readColors() {
    colors = { bg: SG.cssVar('--board-bg'), line: SG.cssVar('--board-line'), text: SG.cssVar('--text') };
  }

  function fitCanvas(cv, c, w, h) {
    const dpr = window.devicePixelRatio || 1;
    const cw = cv.clientWidth;
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(((cw * h) / w) * dpr);
    c.setTransform(cv.width / w, 0, 0, cv.height / h, 0, 0);
  }

  function resize() {
    fitCanvas(canvas, ctx, COLS, ROWS);
    fitCanvas(nextCanvas, nextCtx, 4, 9);
    fitCanvas(holdCanvas, holdCtx, 4, 3);
    draw();
    drawSide();
  }

  function cell(c, x, y, color, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.beginPath();
    if (c.roundRect) c.roundRect(x + 0.05, y + 0.05, 0.9, 0.9, 0.16);
    else c.rect(x + 0.05, y + 0.05, 0.9, 0.9);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(x + 0.16, y + 0.14, 0.68, 0.12);
    c.globalAlpha = 1;
  }

  function draw() {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, COLS, ROWS);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ROWS);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y);
      ctx.lineTo(COLS, y);
    }
    ctx.stroke();

    if (!board) return;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (board[y][x]) cell(ctx, x, y, COLORS[board[y][x]]);
    }

    if (flash) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, flash.t / 120) * 0.5 + ')';
      ctx.fillRect(0, 0, COLS, ROWS);
    }

    if (piece && state !== 'idle') {
      let gy = piece.y;
      while (!collide(piece.m, piece.x, gy + 1)) gy++;
      piece.m.forEach((row, r) =>
        row.forEach((v, c) => {
          if (!v) return;
          if (gy + r >= 0) cell(ctx, piece.x + c, gy + r, COLORS[piece.type], 0.22);
          if (piece.y + r >= 0) cell(ctx, piece.x + c, piece.y + r, COLORS[piece.type]);
        })
      );
    }
  }

  function drawMini(c, type, ox, oy) {
    const m = SHAPES[type];
    const rowsUsed = m.filter((row) => row.some(Boolean));
    const firstRow = m.findIndex((row) => row.some(Boolean));
    const width = m.length === 4 ? 4 : m.length === 2 ? 2 : 3;
    const dx = ox + (4 - width) / 2;
    const dy = oy + (2 - rowsUsed.length) / 2;
    m.forEach((row, r) =>
      row.forEach((v, cc) => {
        if (v) cell(c, dx + cc, dy + r - firstRow, COLORS[type]);
      })
    );
  }

  function drawSide() {
    nextCtx.clearRect(0, 0, 4, 9);
    holdCtx.clearRect(0, 0, 4, 3);
    if (!queue) return;
    queue.slice(0, 3).forEach((t, i) => drawMini(nextCtx, t, 0, 0.5 + i * 3));
    if (hold) {
      holdCtx.globalAlpha = canHold ? 1 : 0.4;
      drawMini(holdCtx, hold, 0, 0.5);
      holdCtx.globalAlpha = 1;
    }
  }

  // ---------- ввод ----------

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const handled = {
      ArrowLeft: () => move(-1),
      KeyA: () => move(-1),
      ArrowRight: () => move(1),
      KeyD: () => move(1),
      ArrowDown: softDrop,
      KeyS: softDrop,
      ArrowUp: () => turn(1),
      KeyX: () => turn(1),
      KeyW: () => turn(1),
      KeyZ: () => turn(-1),
      Space: () => (state === 'running' ? hardDrop() : state === 'paused' ? togglePause() : start()),
      KeyC: holdPiece,
      ShiftLeft: holdPiece,
      KeyP: togglePause,
      Escape: togglePause,
    }[e.code];
    if (!handled) return;
    e.preventDefault();
    handled();
    if (state === 'running') draw();
  });

  // Сенсорное управление: тап — поворот, горизонтальный жест — сдвиг, резкий свайп вниз — сброс.
  let touch = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || state !== 'running') return;
    touch = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touch || state !== 'running') return;
    const cellPx = canvas.clientWidth / COLS;
    while (e.clientX - touch.x > cellPx) {
      move(1);
      touch.x += cellPx;
      touch.moved = true;
    }
    while (touch.x - e.clientX > cellPx) {
      move(-1);
      touch.x -= cellPx;
      touch.moved = true;
    }
    while (e.clientY - touch.y > cellPx) {
      softDrop();
      touch.y += cellPx;
      touch.moved = true;
    }
    draw();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!touch) return;
    const dt = performance.now() - touch.t;
    const dy = e.clientY - touch.sy;
    const dx = e.clientX - touch.sx;
    if (dt < 250 && dy > 60 && Math.abs(dy) > Math.abs(dx) * 2) hardDrop();
    else if (!touch.moved && dt < 300) turn(1);
    touch = null;
    draw();
  });
  canvas.addEventListener('pointercancel', () => (touch = null));

  document.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ({
        left: () => move(-1),
        right: () => move(1),
        rotate: () => turn(1),
        down: softDrop,
        drop: hardDrop,
        hold: holdPiece,
      })[b.dataset.act]();
      draw();
    });
  });

  startBtn.addEventListener('click', () => {
    startBtn.blur();
    if (state === 'paused') togglePause();
    else start();
  });
  pauseBtn.addEventListener('click', () => {
    pauseBtn.blur();
    togglePause();
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
  resize();
})();
