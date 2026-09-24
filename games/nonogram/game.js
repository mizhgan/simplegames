/* Японские кроссворды (нонограммы) */
(() => {
  'use strict';

  // Картинки: # — закрашено, . — пусто
  const PICTURES = [
    { name: 'Сердце', rows: ['.##....##.', '####..####', '##########', '##########', '##########', '.########.', '..######..', '...####...', '....##....', '..........'] },
    { name: 'Домик', rows: ['....##....', '...####...', '..######..', '.########.', '##########', '.#......#.', '.#.##.#.#.', '.#.##...#.', '.#.##...#.', '.########.'] },
    { name: 'Кошка', rows: ['#........#', '##......##', '###....###', '##########', '#.##..##.#', '#.##..##.#', '##########', '###.##.###', '.########.', '..######..'] },
    { name: 'Ёлка', rows: ['....##....', '...####...', '..######..', '....##....', '..######..', '.########.', '....##....', '.########.', '##########', '....##....'] },
    { name: 'Рыбка', rows: ['..........', '...####...', '.#######.#', '###.######', '##########', '.#######.#', '...####...', '..........', '..........', '..........'] },
    { name: 'Гриб', rows: ['...####...', '.########.', '###.##.###', '##########', '##.####.##', '..######..', '....##....', '....##....', '...####...', '..........'] },
    { name: 'Смайлик', rows: ['..######..', '.########.', '##.####.##', '##.####.##', '##########', '#.######.#', '##.####.##', '###....###', '.########.', '..######..'] },
    { name: 'Кораблик', rows: ['....#.....', '....##....', '....###...', '....####..', '....#.....', '##########', '.########.', '..######..', '..........', '..........'] },
    { name: 'Звезда', rows: ['....##....', '....##....', '...####...', '##########', '.########.', '..######..', '..######..', '.###..###.', '.##....##.', '##......##'] },
    {
      name: 'Ракета',
      rows: ['.......#.......', '......###......', '.....#####.....', '.....##.##.....', '.....#...#.....', '.....##.##.....', '.....#####.....', '.....#####.....', '....#######....', '...#########...', '..###.###.###..', '..##..###..##..', '.......#.......', '......###......', '.....#####.....'],
    },
    {
      name: 'Якорь',
      rows: ['......###......', '.....##.##.....', '......###......', '.......#.......', '...#########...', '.......#.......', '.......#.......', '.......#.......', '##.....#.....##', '###....#....###', '.##....#....##.', '.###...#...###.', '..###..#..###..', '...#########...', '.....#####.....'],
    },
    {
      name: 'Кружка',
      rows: ['...............', '....#..#..#....', '...#..#..#.....', '....#..#..#....', '...............', '.###########...', '.#.........####', '.#.........#..#', '.#.........#..#', '.#.........####', '.#.........#...', '..#.......#....', '...#######.....', '.#############.', '...............'],
    },
  ];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const statusEl = $('status');
  const overlay = $('overlay');

  let mode = SG.store.get('nonogram-mode', 'pic'); // pic | r5 | r10 | r15
  let picIndex = SG.store.get('nonogram-pic', 0);
  let solution; // массив 0/1
  let n;
  let rowClues, colClues;
  let marks; // 0 — пусто, 1 — закрашено, 2 — крестик
  let cellEls = [];
  let rowClueEls = [];
  let colClueEls = [];
  let crossMode = false;
  let solved = false;
  let startTime = 0;
  let timer = 0;
  let title = '';

  // ---------- подсказки и логический решатель ----------

  function lineClue(line) {
    const out = [];
    let run = 0;
    line.forEach((v) => {
      if (v === 1) run++;
      else if (run) {
        out.push(run);
        run = 0;
      }
    });
    if (run) out.push(run);
    return out.length ? out : [0];
  }

  // Все расстановки блоков в линии, совместимые с уже известными клетками (-1 — неизвестно)
  function arrangements(clue, known) {
    const len = known.length;
    const blocks = clue[0] === 0 ? [] : clue;
    const out = [];
    const cur = Array(len).fill(0);
    function place(b, start) {
      if (b === blocks.length) {
        for (let i = start; i < len; i++) if (known[i] === 1) return;
        out.push(cur.slice());
        return;
      }
      const need = blocks.slice(b).reduce((s, x) => s + x, 0) + (blocks.length - b - 1);
      for (let s = start; s + need <= len; s++) {
        // перед блоком не должно быть закрашенных клеток
        if (s > start && known[s - 1] === 1) break;
        let ok = true;
        for (let k = s; k < s + blocks[b]; k++) if (known[k] === 0) ok = false;
        if (s + blocks[b] < len && known[s + blocks[b]] === 1) ok = false;
        if (ok) {
          for (let k = s; k < s + blocks[b]; k++) cur[k] = 1;
          place(b + 1, s + blocks[b] + 1);
          for (let k = s; k < s + blocks[b]; k++) cur[k] = 0;
        }
        if (known[s] === 1) break;
      }
    }
    place(0, 0);
    return out;
  }

  function lineSolvable(rc, cc, size) {
    const g = Array(size * size).fill(-1);
    let changed = true;
    while (changed) {
      changed = false;
      for (let line = 0; line < size * 2; line++) {
        const isRow = line < size;
        const k = isRow ? line : line - size;
        const idx = Array.from({ length: size }, (_, j) => (isRow ? k * size + j : j * size + k));
        const known = idx.map((i) => g[i]);
        if (!known.includes(-1)) continue;
        const arr = arrangements(isRow ? rc[k] : cc[k], known);
        if (!arr.length) return false;
        idx.forEach((cell, j) => {
          if (g[cell] !== -1) return;
          const v = arr[0][j];
          if (arr.every((a) => a[j] === v)) {
            g[cell] = v;
            changed = true;
          }
        });
      }
    }
    return !g.includes(-1);
  }

  function computeClues(sol, size) {
    const rc = [];
    const cc = [];
    for (let r = 0; r < size; r++) rc.push(lineClue(sol.slice(r * size, r * size + size)));
    for (let c = 0; c < size; c++) cc.push(lineClue(Array.from({ length: size }, (_, r) => sol[r * size + c])));
    return { rc, cc };
  }

  function randomPuzzle(size) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const sol = Array(size * size).fill(0);
      const half = Math.ceil(size / 2);
      // зеркальная картинка выглядит приятнее случайного шума
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < half; c++) {
          const v = Math.random() < 0.58 ? 1 : 0;
          sol[r * size + c] = v;
          sol[r * size + (size - 1 - c)] = v;
        }
      }
      const { rc, cc } = computeClues(sol, size);
      if (lineSolvable(rc, cc, size)) return sol;
    }
    return null;
  }

  // ---------- построение поля ----------

  function load() {
    clearInterval(timer);
    overlay.hidden = true;
    solved = false;
    startTime = 0;
    $('time').textContent = '0:00';
    if (mode === 'pic') {
      picIndex = ((picIndex % PICTURES.length) + PICTURES.length) % PICTURES.length;
      const pic = PICTURES[picIndex];
      n = pic.rows.length;
      solution = pic.rows.join('').split('').map((ch) => (ch === '#' ? 1 : 0));
      title = pic.name;
      $('pic-label').textContent = 'Картинка ' + (picIndex + 1) + ' из ' + PICTURES.length + (SG.store.get('nonogram-done-' + picIndex, false) ? ' ✓' : '');
    } else {
      n = Number(mode.slice(1));
      solution = randomPuzzle(n);
      title = 'Узор ' + n + '×' + n;
    }
    $('pic-nav').hidden = mode !== 'pic';
    ({ rc: rowClues, cc: colClues } = computeClues(solution, n));
    marks = Array(n * n).fill(0);
    build();
    renderBest();
    statusEl.textContent = '';
  }

  function build() {
    boardEl.innerHTML = '';
    boardEl.style.setProperty('--n', n);
    const maxRow = Math.max(...rowClues.map((c) => c.length));
    const maxCol = Math.max(...colClues.map((c) => c.length));
    boardEl.style.setProperty('--rc', maxRow);
    boardEl.style.setProperty('--cc', maxCol);

    const corner = document.createElement('div');
    corner.className = 'ng-corner';
    boardEl.appendChild(corner);
    colClueEls = colClues.map((clue, c) => {
      const el = document.createElement('div');
      el.className = 'ng-clue col' + (c % 5 === 4 && c < n - 1 ? ' sep' : '');
      el.innerHTML = clue.map((x) => `<span>${x}</span>`).join('');
      boardEl.appendChild(el);
      return el;
    });
    cellEls = [];
    rowClueEls = [];
    for (let r = 0; r < n; r++) {
      const rcEl = document.createElement('div');
      rcEl.className = 'ng-clue row' + (r % 5 === 4 && r < n - 1 ? ' sep' : '');
      rcEl.innerHTML = rowClues[r].map((x) => `<span>${x}</span>`).join('');
      boardEl.appendChild(rcEl);
      rowClueEls.push(rcEl);
      for (let c = 0; c < n; c++) {
        const el = document.createElement('div');
        el.className = 'ng-cell' + (c % 5 === 4 && c < n - 1 ? ' sep-r' : '') + (r % 5 === 4 && r < n - 1 ? ' sep-b' : '');
        el.dataset.i = r * n + c;
        boardEl.appendChild(el);
        cellEls.push(el);
      }
    }
    render();
  }

  function render() {
    cellEls.forEach((el, i) => {
      el.classList.toggle('fill', marks[i] === 1);
      el.classList.toggle('cross', marks[i] === 2);
    });
    const filled = marks.map((m) => (m === 1 ? 1 : 0));
    for (let r = 0; r < n; r++) {
      const ok = lineClue(filled.slice(r * n, r * n + n)).join() === rowClues[r].join();
      rowClueEls[r].classList.toggle('done', ok);
    }
    for (let c = 0; c < n; c++) {
      const ok = lineClue(Array.from({ length: n }, (_, r) => filled[r * n + c])).join() === colClues[c].join();
      colClueEls[c].classList.toggle('done', ok);
    }
  }

  function renderBest() {
    const key = 'nonogram-best-' + (mode === 'pic' ? 'pic' + picIndex : mode);
    const best = SG.store.get(key, null);
    $('best').textContent = best === null ? '—' : SG.formatTime(best);
  }

  function checkWin() {
    if (!rowClueEls.every((el) => el.classList.contains('done')) || !colClueEls.every((el) => el.classList.contains('done'))) return;
    solved = true;
    clearInterval(timer);
    const seconds = Math.round((Date.now() - startTime) / 1000);
    const key = 'nonogram-best-' + (mode === 'pic' ? 'pic' + picIndex : mode);
    const best = SG.store.get(key, null);
    if (best === null || seconds < best) SG.store.set(key, seconds);
    if (mode === 'pic') SG.store.set('nonogram-done-' + picIndex, true);
    SG.store.set('nonogram-solved', SG.store.get('nonogram-solved', 0) + 1);
    renderBest();
    marks = marks.map((m) => (m === 1 ? 1 : 0));
    render();
    boardEl.classList.add('solved');
    SG.sound.play('win');
    $('overlay-title').textContent = mode === 'pic' ? 'Это «' + title + '»! 🎉' : 'Решено! 🎉';
    $('overlay-text').textContent = 'Время: ' + SG.formatTime(seconds) + '.';
    setTimeout(() => {
      boardEl.classList.remove('solved');
      overlay.hidden = false;
    }, 1200);
  }

  // ---------- рисование ----------

  let paint = null; // { value, axis, origin }

  function cellIndexAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest('.ng-cell');
    return cell && boardEl.contains(cell) ? Number(cell.dataset.i) : -1;
  }

  function apply(i) {
    if (marks[i] === paint.value) return;
    // закрашивание не стирает крестики и наоборот — только своё
    if (paint.value !== 0 && marks[i] !== 0 && marks[i] !== paint.value) return;
    marks[i] = paint.value;
    SG.sound.play(paint.value === 1 ? 'tick' : 'key');
  }

  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
  boardEl.addEventListener('pointerdown', (e) => {
    if (solved) return;
    const i = cellIndexAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => ($('time').textContent = SG.formatTime((Date.now() - startTime) / 1000)), 500);
    }
    const want = e.button === 2 || crossMode ? 2 : 1;
    paint = { value: marks[i] === want ? 0 : want, origin: i, axis: null };
    apply(i);
    boardEl.setPointerCapture(e.pointerId);
    render();
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!paint) return;
    let i = cellIndexAt(e.clientX, e.clientY);
    if (i < 0 || i === paint.origin) return;
    // протягивание идёт строго по строке или столбцу
    const or = Math.floor(paint.origin / n);
    const oc = paint.origin % n;
    if (!paint.axis) paint.axis = Math.floor(i / n) === or ? 'row' : 'col';
    i = paint.axis === 'row' ? or * n + (i % n) : Math.floor(i / n) * n + oc;
    const from = paint.axis === 'row' ? oc : or;
    const to = paint.axis === 'row' ? i % n : Math.floor(i / n);
    for (let k = Math.min(from, to); k <= Math.max(from, to); k++) apply(paint.axis === 'row' ? or * n + k : k * n + oc);
    render();
  });
  const endPaint = () => {
    if (!paint) return;
    paint = null;
    checkWin();
  };
  boardEl.addEventListener('pointerup', endPaint);
  boardEl.addEventListener('pointercancel', endPaint);

  // ---------- кнопки ----------

  $('cross-btn').addEventListener('click', (e) => {
    crossMode = !crossMode;
    e.currentTarget.setAttribute('aria-pressed', String(crossMode));
    e.currentTarget.blur();
  });
  $('clear-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (solved) return;
    marks = Array(n * n).fill(0);
    render();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    load();
  });
  $('again-btn').addEventListener('click', () => {
    if (mode === 'pic') {
      picIndex++;
      SG.store.set('nonogram-pic', picIndex);
    }
    load();
  });
  $('prev-btn').addEventListener('click', () => {
    picIndex--;
    SG.store.set('nonogram-pic', ((picIndex % PICTURES.length) + PICTURES.length) % PICTURES.length);
    load();
  });
  $('next-btn').addEventListener('click', () => {
    picIndex++;
    SG.store.set('nonogram-pic', picIndex % PICTURES.length);
    load();
  });
  SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('nonogram-mode', v);
    load();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyX' && !e.ctrlKey && !e.metaKey) $('cross-btn').click();
  });

  load();
})();
