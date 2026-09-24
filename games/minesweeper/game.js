/* Сапёр */
(() => {
  'use strict';

  const LEVELS = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 },
  };
  const LONG_PRESS_MS = 380;

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const minesLeftEl = $('mines-left');
  const timeEl = $('time');
  const bestEl = $('best');
  const faceBtn = $('face');
  const flagModeBtn = $('flag-mode');
  const statusEl = $('status');

  let level = SG.store.get('mines-level', 'beginner');
  if (!LEVELS[level]) level = 'beginner';
  let rows, cols, mineCount;
  let cells = []; // { mine, adj, open, flag, el }
  let started = false;
  let over = false;
  let opened = 0;
  let flags = 0;
  let startTime = 0;
  let timer = 0;
  let flagMode = false;

  function neighbors(i) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
      }
    }
    return out;
  }

  function renderBest() {
    const best = SG.store.get('mines-best-' + level, null);
    bestEl.textContent = best === null ? '—' : SG.formatTime(best);
  }

  function updateMinesLeft() {
    minesLeftEl.textContent = mineCount - flags;
  }

  function stopTimer() {
    clearInterval(timer);
    timer = 0;
  }

  function elapsed() {
    return startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  }

  function newGame() {
    stopTimer();
    ({ rows, cols, mines: mineCount } = LEVELS[level]);
    boardEl.style.setProperty('--cols', cols);
    boardEl.innerHTML = '';
    cells = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < rows * cols; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ms-cell';
      el.dataset.i = i;
      el.setAttribute('aria-label', 'Закрытая клетка');
      frag.appendChild(el);
      cells.push({ mine: false, adj: 0, open: false, flag: false, el });
    }
    boardEl.appendChild(frag);
    started = false;
    over = false;
    opened = 0;
    flags = 0;
    startTime = 0;
    timeEl.textContent = '0:00';
    faceBtn.textContent = '🙂';
    statusEl.textContent = '';
    statusEl.className = 'status-line';
    updateMinesLeft();
    renderBest();
  }

  // Мины расставляются после первого клика — вокруг него их не будет.
  function placeMines(safeIndex) {
    const forbidden = new Set([safeIndex, ...neighbors(safeIndex)]);
    const candidates = [];
    for (let i = 0; i < cells.length; i++) if (!forbidden.has(i)) candidates.push(i);
    SG.shuffle(candidates)
      .slice(0, mineCount)
      .forEach((i) => (cells[i].mine = true));
    cells.forEach((cell, i) => {
      cell.adj = neighbors(i).filter((j) => cells[j].mine).length;
    });
  }

  function startGame(i) {
    placeMines(i);
    started = true;
    startTime = Date.now();
    timer = setInterval(() => (timeEl.textContent = SG.formatTime(elapsed())), 250);
  }

  function openCell(i) {
    const cell = cells[i];
    cell.open = true;
    opened++;
    cell.el.classList.add('open');
    cell.el.classList.remove('flag');
    if (cell.adj) {
      cell.el.textContent = cell.adj;
      cell.el.classList.add('n' + cell.adj);
      cell.el.setAttribute('aria-label', 'Мин рядом: ' + cell.adj);
    } else {
      cell.el.setAttribute('aria-label', 'Пусто');
    }
  }

  function reveal(i) {
    if (over) return;
    const cell = cells[i];
    if (cell.open || cell.flag) return;
    if (!started) startGame(i);
    if (cell.mine) {
      lose(i);
      return;
    }
    const openedBefore = opened;
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      const c = cells[j];
      if (c.open || c.flag || c.mine) continue;
      openCell(j);
      if (c.adj === 0) stack.push(...neighbors(j));
    }
    if (!over) SG.sound.play(opened - openedBefore > 1 ? 'reveal' : 'click');
    checkWin();
  }

  // Клик по открытой цифре: если флажков вокруг ровно столько же — открыть остальных соседей.
  function chord(i) {
    const cell = cells[i];
    if (!cell.open || !cell.adj || over) return;
    const around = neighbors(i);
    const flagged = around.filter((j) => cells[j].flag).length;
    if (flagged !== cell.adj) return;
    around.forEach((j) => {
      if (!over && !cells[j].open && !cells[j].flag) reveal(j);
    });
  }

  function toggleFlag(i) {
    const cell = cells[i];
    if (over || cell.open) return;
    cell.flag = !cell.flag;
    SG.sound.play('flag');
    flags += cell.flag ? 1 : -1;
    cell.el.classList.toggle('flag', cell.flag);
    cell.el.setAttribute('aria-label', cell.flag ? 'Флажок' : 'Закрытая клетка');
    updateMinesLeft();
  }

  function checkWin() {
    if (opened !== rows * cols - mineCount) return;
    over = true;
    stopTimer();
    const seconds = elapsed();
    cells.forEach((c) => {
      if (c.mine && !c.flag) {
        c.flag = true;
        c.el.classList.add('flag');
      }
    });
    flags = mineCount;
    updateMinesLeft();
    faceBtn.textContent = '😎';
    SG.sound.play('win');
    const key = 'mines-best-' + level;
    const best = SG.store.get(key, null);
    const record = best === null || seconds < best;
    if (record) SG.store.set(key, seconds);
    renderBest();
    statusEl.className = 'status-line win';
    statusEl.textContent = 'Победа за ' + SG.formatTime(seconds) + '!' + (record ? ' Новый рекорд 🏆' : ' 🎉');
  }

  function lose(i) {
    SG.sound.play('explode');
    over = true;
    stopTimer();
    faceBtn.textContent = '😵';
    cells.forEach((c, j) => {
      if (c.mine && !c.flag) {
        c.el.classList.add('open', 'mine');
      } else if (!c.mine && c.flag) {
        c.el.classList.remove('flag');
        c.el.classList.add('wrong');
      }
      if (j === i) c.el.classList.add('boom');
    });
    statusEl.className = 'status-line lose';
    statusEl.textContent = 'Бум! Попробуйте ещё раз.';
  }

  // ---------- ввод ----------

  let pressTimer = 0;
  let pressStart = null;
  let suppressClick = false;
  let lastLongPress = 0;

  const indexOf = (target) => {
    const el = target.closest('.ms-cell');
    return el ? Number(el.dataset.i) : -1;
  };

  boardEl.addEventListener('click', (e) => {
    const i = indexOf(e.target);
    if (i < 0) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const cell = cells[i];
    if (cell.open) chord(i);
    else if (flagMode) toggleFlag(i);
    else reveal(i);
  });

  boardEl.addEventListener('contextmenu', (e) => {
    const i = indexOf(e.target);
    if (i < 0) return;
    e.preventDefault();
    // На Android долгое нажатие вызывает и наш таймер, и contextmenu — не переключаем дважды.
    if (Date.now() - lastLongPress < 800) return;
    toggleFlag(i);
  });

  boardEl.addEventListener('pointerdown', (e) => {
    suppressClick = false;
    const i = indexOf(e.target);
    if (i < 0 || over) return;
    if (e.button === 0 && !cells[i].open) faceBtn.textContent = '😮';
    if (e.pointerType !== 'touch' || cells[i].open) return;
    pressStart = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      toggleFlag(i);
      lastLongPress = Date.now();
      suppressClick = true;
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  });

  const cancelPress = () => {
    clearTimeout(pressTimer);
    pressStart = null;
    if (!over) faceBtn.textContent = '🙂';
  };
  boardEl.addEventListener('pointerup', cancelPress);
  boardEl.addEventListener('pointercancel', cancelPress);
  boardEl.addEventListener('pointerleave', cancelPress);
  boardEl.addEventListener('pointermove', (e) => {
    if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancelPress();
  });

  faceBtn.addEventListener('click', newGame);

  flagModeBtn.addEventListener('click', () => {
    flagMode = !flagMode;
    flagModeBtn.setAttribute('aria-pressed', String(flagMode));
    flagModeBtn.blur();
  });

  SG.segmented($('level'), level, (v) => {
    level = v;
    SG.store.set('mines-level', v);
    newGame();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) flagModeBtn.click();
    else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) newGame();
  });

  newGame();
})();
