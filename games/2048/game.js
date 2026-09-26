/* 2048 */
(() => {
  'use strict';

  const SIZE = 4;
  const ANIM_MS = 110;
  const VECTORS = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
  };
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  const $ = (id) => document.getElementById(id);
  const board = $('board');
  const tilesLayer = $('tiles');
  const scoreEl = $('score');
  const bestEl = $('best');
  const overlay = SG.overlay();
  const continueBtn = $('continue-btn');
  const undoBtn = $('undo-btn');

  let tiles = []; // { id, value, r, c, el }
  let score = 0;
  let best = SG.store.get('2048-best', 0);
  let won = false; // уже показывали экран победы
  let over = false;
  let pending = null; // отложенная часть хода (после анимации сдвига)
  let history = null;
  let nextId = 1;

  const cells = $('cells');
  for (let i = 0; i < SIZE * SIZE; i++) cells.appendChild(document.createElement('div'));

  // ---------- работа с плитками ----------

  function makeTile(r, c, value, isNew) {
    const t = { id: nextId++, value, r, c, el: document.createElement('div') };
    t.el.className = 'tile' + (isNew ? ' new' : '');
    t.el.innerHTML = '<div class="tile-inner"></div>';
    placeEl(t);
    paintEl(t);
    tilesLayer.appendChild(t.el);
    tiles.push(t);
    return t;
  }

  function placeEl(t) {
    t.el.style.setProperty('--r', t.r);
    t.el.style.setProperty('--c', t.c);
  }

  function paintEl(t) {
    t.el.dataset.v = t.value > 2048 ? 'super' : t.value;
    t.el.dataset.len = String(t.value).length;
    t.el.firstChild.textContent = t.value;
  }

  function grid() {
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    tiles.forEach((t) => (g[t.r][t.c] = t));
    return g;
  }

  function addRandomTile() {
    const g = grid();
    const empty = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!g[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    makeTile(r, c, Math.random() < 0.9 ? 2 : 4, true);
  }

  function canMove() {
    if (tiles.length < SIZE * SIZE) return true;
    const g = grid();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = g[r][c].value;
        if ((c + 1 < SIZE && g[r][c + 1].value === v) || (r + 1 < SIZE && g[r + 1][c].value === v)) return true;
      }
    }
    return false;
  }

  // ---------- состояние ----------

  function snapshot() {
    return { tiles: tiles.map((t) => [t.r, t.c, t.value]), score, won };
  }

  function restore(snap, animateNew) {
    tilesLayer.innerHTML = '';
    tiles = [];
    snap.tiles.forEach(([r, c, v]) => makeTile(r, c, v, animateNew));
    score = snap.score;
    won = snap.won;
    over = false;
    updateScore();
  }

  function save() {
    if (over) SG.store.remove('2048-state');
    else SG.store.set('2048-state', snapshot());
  }

  function updateScore() {
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      SG.store.set('2048-best', best);
    }
    bestEl.textContent = best;
  }

  function newGame() {
    flush();
    overlay.hidden = true;
    tilesLayer.innerHTML = '';
    tiles = [];
    score = 0;
    won = false;
    over = false;
    history = null;
    undoBtn.disabled = true;
    addRandomTile();
    addRandomTile();
    updateScore();
    save();
  }

  // ---------- ход ----------

  function move(dir) {
    if (over || !overlay.hidden) return;
    flush();
    const [dr, dc] = VECTORS[dir];
    const before = snapshot();
    const g = grid();
    const rows = [...Array(SIZE).keys()];
    const cols = [...Array(SIZE).keys()];
    if (dr === 1) rows.reverse();
    if (dc === 1) cols.reverse();

    const merged = new Set();
    const removed = [];
    let moved = false;
    let gained = 0;

    for (const r of rows) {
      for (const c of cols) {
        const t = g[r][c];
        if (!t) continue;
        let nr = r;
        let nc = c;
        let target = null;
        for (;;) {
          const rr = nr + dr;
          const cc = nc + dc;
          if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) break;
          const other = g[rr][cc];
          if (!other) {
            nr = rr;
            nc = cc;
            continue;
          }
          if (other.value === t.value && !merged.has(other)) target = other;
          break;
        }
        g[r][c] = null;
        if (target) {
          t.r = target.r;
          t.c = target.c;
          target.value *= 2;
          gained += target.value;
          merged.add(target);
          removed.push(t);
          moved = true;
        } else {
          g[nr][nc] = t;
          if (nr !== r || nc !== c) moved = true;
          t.r = nr;
          t.c = nc;
        }
      }
    }

    if (!moved) return;

    history = before;
    undoBtn.disabled = false;
    tiles = tiles.filter((t) => !removed.includes(t));
    [...tiles, ...removed].forEach((t) => {
      t.el.classList.remove('new', 'merged');
      placeEl(t);
    });
    score += gained;
    updateScore();

    pending = { removed, merged: [...merged], timer: 0 };
    if (merged.size) SG.sound.play('merge', Math.min(12, Math.log2(Math.max(...[...merged].map((t) => t.value))) - 2));
    else SG.sound.play('move');
    addRandomTile();
    pending.timer = setTimeout(flush, ANIM_MS);
    afterMove();
  }

  // Завершение анимации: убираем поглощённые плитки и обновляем числа.
  function flush() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.removed.forEach((t) => t.el.remove());
    pending.merged.forEach((t) => {
      paintEl(t);
      t.el.classList.remove('merged');
      void t.el.offsetWidth; // перезапуск анимации
      t.el.classList.add('merged');
    });
    pending = null;
  }

  function afterMove() {
    if (!won && tiles.some((t) => t.value >= 2048)) {
      won = true;
      save();
      setTimeout(() => {
        SG.sound.play('win');
        showOverlay('Победа! 🎉', 'Вы собрали плитку 2048. Можно продолжить и побить собственный рекорд.', true);
      }, ANIM_MS + 150);
      return;
    }
    if (!canMove()) {
      over = true;
      save();
      setTimeout(() => {
        SG.sound.play('lose');
        showOverlay('Ходов больше нет', 'Ваш счёт: ' + score + '. Попробуйте ещё раз!', false);
      }, ANIM_MS + 250);
      return;
    }
    save();
  }

  function showOverlay(title, text, canContinue) {
    overlay.title = title;
    overlay.text = text;
    continueBtn.hidden = !canContinue;
    overlay.hidden = false;
  }

  function undo() {
    if (!history) return;
    flush();
    overlay.hidden = true;
    restore(history, false);
    history = null;
    undoBtn.disabled = true;
    save();
  }

  // ---------- ввод ----------

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const d = KEYS[e.code];
    if (d) {
      e.preventDefault();
      move(d);
    } else if (e.code === 'KeyZ') {
      undo();
    }
  });

  SG.onSwipe(board, move);

  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('retry-btn').addEventListener('click', newGame);
  continueBtn.addEventListener('click', () => (overlay.hidden = true));
  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undo();
  });

  // ---------- старт: восстанавливаем незаконченную партию ----------

  const saved = SG.store.get('2048-state', null);
  if (saved && Array.isArray(saved.tiles) && saved.tiles.length) {
    restore(saved, false);
    if (!canMove()) newGame();
  } else {
    newGame();
  }
})();
