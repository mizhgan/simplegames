/* Судоку */
(() => {
  'use strict';

  // Сколько клеток убрать из решённой сетки на каждом уровне
  const LEVELS = { easy: 40, medium: 48, hard: 54 };
  const ALL = 0x3fe; // биты 1..9

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const padEl = $('pad');
  const timeEl = $('time');
  const bestEl = $('best');
  const notesBtn = $('notes-btn');
  const undoBtn = $('undo-btn');
  const overlay = $('overlay');
  const overlayText = $('overlay-text');

  // Соседи клетки: та же строка, столбец и блок 3×3
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const set = new Set();
    for (let k = 0; k < 9; k++) {
      set.add(r * 9 + k);
      set.add(k * 9 + c);
    }
    const br = r - (r % 3);
    const bc = c - (c % 3);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) set.add((br + y) * 9 + bc + x);
    set.delete(i);
    return [...set];
  });

  const popcount = (m) => {
    let n = 0;
    while (m) {
      m &= m - 1;
      n++;
    }
    return n;
  };

  // ---------- генератор ----------

  function candidates(g, i) {
    let used = 0;
    for (const p of PEERS[i]) used |= 1 << g[p];
    return ~used & ALL;
  }

  // Возвращает число решений (не больше limit). При нахождении решения g остаётся заполненной.
  function solve(g, limit, randomize) {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = candidates(g, i);
      const n = popcount(m);
      if (n === 0) return 0;
      if (n < bestCount) {
        best = i;
        bestMask = m;
        bestCount = n;
        if (n === 1) break;
      }
    }
    if (best < 0) return 1;
    const digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (randomize) SG.shuffle(digits);
    let total = 0;
    for (const d of digits) {
      g[best] = d;
      total += solve(g, limit - total, randomize);
      if (total >= limit) return total;
    }
    g[best] = 0;
    return total;
  }

  function generate(level) {
    const solution = Array(81).fill(0);
    solve(solution, 1, true);
    const puzzle = solution.slice();
    let removed = 0;
    for (const i of SG.shuffle([...Array(81).keys()])) {
      if (removed >= LEVELS[level]) break;
      const v = puzzle[i];
      puzzle[i] = 0;
      if (solve(puzzle.slice(), 2, false) === 1) removed++;
      else puzzle[i] = v;
    }
    return { puzzle, solution };
  }

  // ---------- состояние ----------

  let level = SG.store.get('sudoku-level', 'medium');
  if (!LEVELS[level]) level = 'medium';
  let game = null; // { level, puzzle, solution, values, notes, fixed, elapsed, hints, done }
  let selected = -1;
  let notesMode = false;
  let history = [];
  let timer = 0;

  const cellEls = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'sd-cell' + (c === 2 || c === 5 ? ' br' : '') + (r === 2 || r === 5 ? ' bb' : '');
    el.addEventListener('click', () => select(i));
    boardEl.appendChild(el);
    cellEls.push(el);
  }

  const padBtns = [];
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sd-digit';
    b.innerHTML = d + '<small></small>';
    b.addEventListener('click', () => input(d));
    padEl.appendChild(b);
    padBtns.push(b);
  }

  function newGame() {
    overlay.hidden = true;
    const { puzzle, solution } = generate(level);
    game = {
      level,
      puzzle,
      solution,
      values: puzzle.slice(),
      notes: Array(81).fill(0),
      fixed: puzzle.map(Boolean),
      elapsed: 0,
      hints: 0,
      done: false,
    };
    selected = -1;
    history = [];
    startTimer();
    save();
    render();
  }

  function save() {
    SG.store.set('sudoku-state', game);
  }

  function startTimer() {
    clearInterval(timer);
    timeEl.textContent = SG.formatTime(game.elapsed);
    timer = setInterval(() => {
      if (document.hidden || game.done) return;
      game.elapsed++;
      timeEl.textContent = SG.formatTime(game.elapsed);
      if (game.elapsed % 5 === 0) save();
    }, 1000);
  }

  function renderBest() {
    const best = SG.store.get('sudoku-best-' + level, null);
    bestEl.textContent = best === null ? '—' : SG.formatTime(best);
  }

  // ---------- действия ----------

  function select(i) {
    selected = i;
    render();
  }

  function pushHistory() {
    history.push({ values: game.values.slice(), notes: game.notes.slice(), fixed: game.fixed.slice(), hints: game.hints });
    if (history.length > 200) history.shift();
  }

  function input(d) {
    if (!game || game.done || selected < 0 || game.fixed[selected]) return;
    const i = selected;
    if (notesMode) {
      if (game.values[i]) return;
      pushHistory();
      game.notes[i] ^= 1 << d;
    } else {
      if (game.values[i] === d) return;
      pushHistory();
      game.values[i] = d;
      game.notes[i] = 0;
      // убираем цифру из заметок соседей
      for (const p of PEERS[i]) game.notes[p] &= ~(1 << d);
    }
    afterChange();
  }

  function erase() {
    if (!game || game.done || selected < 0 || game.fixed[selected]) return;
    if (!game.values[selected] && !game.notes[selected]) return;
    pushHistory();
    game.values[selected] = 0;
    game.notes[selected] = 0;
    afterChange();
  }

  function undo() {
    if (!history.length || game.done) return;
    const h = history.pop();
    game.values = h.values;
    game.notes = h.notes;
    game.fixed = h.fixed;
    game.hints = h.hints;
    afterChange();
  }

  function hint() {
    if (!game || game.done) return;
    const wrong = (i) => !game.fixed[i] && game.values[i] !== game.solution[i];
    let i = selected >= 0 && wrong(selected) ? selected : -1;
    if (i < 0) {
      const options = [];
      for (let k = 0; k < 81; k++) if (wrong(k)) options.push(k);
      if (!options.length) return;
      i = options[Math.floor(Math.random() * options.length)];
    }
    pushHistory();
    game.values[i] = game.solution[i];
    game.notes[i] = 0;
    game.fixed[i] = true;
    game.hints++;
    selected = i;
    afterChange();
  }

  function afterChange() {
    if (game.values.every((v, i) => v === game.solution[i])) win();
    save();
    render();
  }

  function win() {
    game.done = true;
    clearInterval(timer);
    const key = 'sudoku-best-' + game.level;
    const best = SG.store.get(key, null);
    const record = !game.hints && (best === null || game.elapsed < best);
    if (record) SG.store.set(key, game.elapsed);
    overlayText.textContent =
      'Решено за ' + SG.formatTime(game.elapsed) +
      (game.hints ? ' с подсказками: ' + game.hints + '.' : '.') +
      (record ? ' Новый рекорд! 🏆' : '');
    setTimeout(() => (overlay.hidden = false), 300);
  }

  // ---------- отрисовка ----------

  function render() {
    if (!game) return;
    const { values, notes, fixed } = game;
    const selVal = selected >= 0 ? values[selected] : 0;
    const peers = selected >= 0 ? new Set(PEERS[selected]) : new Set();
    const counts = Array(10).fill(0);
    values.forEach((v) => counts[v]++);

    cellEls.forEach((el, i) => {
      const v = values[i];
      const conflict = v && PEERS[i].some((p) => values[p] === v);
      el.classList.toggle('given', !!game.puzzle[i]);
      el.classList.toggle('hinted', fixed[i] && !game.puzzle[i]);
      el.classList.toggle('selected', i === selected);
      el.classList.toggle('peer', peers.has(i));
      el.classList.toggle('same', !!v && v === selVal && i !== selected);
      el.classList.toggle('conflict', !!conflict && !fixed[i]);
      if (v) {
        el.textContent = v;
      } else if (notes[i]) {
        let html = '<span class="sd-notes">';
        for (let d = 1; d <= 9; d++) html += '<i>' + (notes[i] & (1 << d) ? d : '') + '</i>';
        el.innerHTML = html + '</span>';
      } else {
        el.textContent = '';
      }
      el.setAttribute('aria-label', 'Строка ' + (Math.floor(i / 9) + 1) + ', столбец ' + ((i % 9) + 1) + (v ? ', ' + v : ', пусто'));
    });

    padBtns.forEach((b, k) => {
      const left = 9 - counts[k + 1];
      b.lastChild.textContent = left > 0 ? left : '';
      b.classList.toggle('done', left <= 0);
    });
    undoBtn.disabled = !history.length || game.done;
    renderBest();
  }

  // ---------- ввод ----------

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey) return;
    if ((e.ctrlKey && e.code === 'KeyZ') || (!e.ctrlKey && e.code === 'KeyU')) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey) return;
    const d = Number(e.key);
    if (d >= 1 && d <= 9) {
      input(d);
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      e.preventDefault();
      erase();
    } else if (e.code === 'KeyN') {
      toggleNotes();
    } else if (e.code === 'KeyH') {
      hint();
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (selected < 0) {
        select(40);
        return;
      }
      let r = Math.floor(selected / 9);
      let c = selected % 9;
      if (e.key === 'ArrowUp') r = (r + 8) % 9;
      if (e.key === 'ArrowDown') r = (r + 1) % 9;
      if (e.key === 'ArrowLeft') c = (c + 8) % 9;
      if (e.key === 'ArrowRight') c = (c + 1) % 9;
      select(r * 9 + c);
      cellEls[selected].focus();
    }
  });

  function toggleNotes() {
    notesMode = !notesMode;
    notesBtn.setAttribute('aria-pressed', String(notesMode));
    padEl.classList.toggle('notes', notesMode);
  }

  notesBtn.addEventListener('click', toggleNotes);
  $('erase-btn').addEventListener('click', erase);
  undoBtn.addEventListener('click', undo);
  $('hint-btn').addEventListener('click', hint);
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);

  SG.segmented($('level'), level, (v) => {
    level = v;
    SG.store.set('sudoku-level', v);
    newGame();
  });

  // ---------- старт: продолжаем сохранённую партию ----------

  const saved = SG.store.get('sudoku-state', null);
  if (saved && !saved.done && Array.isArray(saved.values) && saved.values.length === 81 && LEVELS[saved.level]) {
    game = saved;
    level = saved.level;
    document.querySelectorAll('#level button').forEach((b) => b.classList.toggle('active', b.dataset.value === level));
    startTimer();
    render();
  } else {
    newGame();
  }
})();
