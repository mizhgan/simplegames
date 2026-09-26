/* Филворд — поле целиком заполнено словами, которые идут «змейкой» */
(() => {
  'use strict';

  const WORDS = window.SG_NOUNS;
  const BY_LEN = {};
  WORDS.forEach((w) => (BY_LEN[w.length] = BY_LEN[w.length] || []).push(w));
  const SIZES = { 5: { min: 3, max: 6 }, 6: { min: 3, max: 7 }, 7: { min: 4, max: 8 }, 8: { min: 4, max: 8 } };
  const HUES = [4, 28, 48, 90, 150, 175, 200, 225, 262, 290, 320, 340];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const listEl = $('words');
  const foundEl = $('found');
  const timeEl = $('time');
  const bestEl = $('best');
  const overlay = SG.overlay();

  let size = SG.store.get('fillword-size', 6);
  if (!SIZES[size]) size = 6;
  let letters = []; // буква в каждой клетке
  let segments = []; // { word, cells: [], found, hue }
  let cellEls = [];
  let path = [];
  let dragging = false;
  let startTime = 0;
  let timer = 0;
  let done = false;

  // ---------- генерация ----------

  const neighbors = (i) => {
    const r = Math.floor(i / size);
    const c = i % size;
    const out = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  };

  // Случайный гамильтонов путь по сетке: «змейка» + много шагов алгоритма backbite
  function randomPath() {
    let p = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) p.push(r * size + (r % 2 ? size - 1 - c : c));
    }
    const steps = size * size * 40;
    for (let s = 0; s < steps; s++) {
      if (Math.random() < 0.5) p.reverse();
      const end = p[p.length - 1];
      const opts = neighbors(end).filter((n) => n !== p[p.length - 2]);
      const n = opts[Math.floor(Math.random() * opts.length)];
      const k = p.indexOf(n);
      p = p.slice(0, k + 1).concat(p.slice(k + 1).reverse());
    }
    return p;
  }

  // Разбиваем путь на отрезки допустимой длины
  function splitLengths(total, min, max) {
    for (;;) {
      const out = [];
      let left = total;
      while (left > 0) {
        const choices = [];
        for (let L = min; L <= Math.min(max, left); L++) {
          const rest = left - L;
          if (rest === 0 || rest >= min) choices.push(L);
        }
        if (!choices.length) break;
        out.push(choices[Math.floor(Math.random() * choices.length)]);
        left -= out[out.length - 1];
      }
      if (left === 0) return out;
    }
  }

  function generate() {
    const { min, max } = SIZES[size];
    const p = randomPath();
    const lens = splitLengths(size * size, min, max);
    const used = new Set();
    let pos = 0;
    segments = lens.map((L, k) => {
      let word;
      do word = BY_LEN[L][Math.floor(Math.random() * BY_LEN[L].length)];
      while (used.has(word));
      used.add(word);
      const cells = p.slice(pos, pos + L);
      pos += L;
      return { word, cells, found: false, hue: HUES[k % HUES.length] };
    });
    letters = Array(size * size);
    segments.forEach((s) => s.cells.forEach((cell, j) => (letters[cell] = s.word[j])));
  }

  // ---------- отрисовка ----------

  function build() {
    boardEl.style.setProperty('--n', size);
    boardEl.innerHTML = '';
    cellEls = letters.map((ch, i) => {
      const el = document.createElement('div');
      el.className = 'fw-cell';
      el.dataset.i = i;
      el.textContent = ch;
      boardEl.appendChild(el);
      return el;
    });
    renderList();
  }

  function renderList() {
    const sorted = segments.slice().sort((a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word));
    listEl.innerHTML = sorted
      .map((s) =>
        s.found
          ? `<li class="found" style="--h:${s.hue}">${s.word}</li>`
          : `<li>${'<i></i>'.repeat(s.word.length)}</li>`
      )
      .join('');
    const n = segments.filter((s) => s.found).length;
    foundEl.textContent = n + '/' + segments.length;
  }

  function paintPath() {
    cellEls.forEach((el) => el.classList.remove('sel'));
    path.forEach((i) => cellEls[i].classList.add('sel'));
    $('current').textContent = path.map((i) => letters[i]).join('').toUpperCase();
  }

  function renderBest() {
    const best = SG.store.get('fillword-best-' + size, null);
    bestEl.textContent = best === null ? '—' : SG.formatTime(best);
  }

  // ---------- выделение ----------

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest('.fw-cell');
    return cell && boardEl.contains(cell) ? Number(cell.dataset.i) : -1;
  }

  const isFound = (i) => segments.some((s) => s.found && s.cells.includes(i));

  function extend(i) {
    if (i < 0 || isFound(i)) return;
    const last = path[path.length - 1];
    if (path.length > 1 && i === path[path.length - 2]) {
      path.pop(); // шаг назад
    } else if (!path.includes(i) && neighbors(last).includes(i)) {
      path.push(i);
      SG.sound.play('tick');
    } else return;
    paintPath();
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (done) return;
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i < 0 || isFound(i)) return;
    e.preventDefault();
    if (!startTime) {
      startTime = Date.now();
      timer = setInterval(() => (timeEl.textContent = SG.formatTime((Date.now() - startTime) / 1000)), 500);
    }
    dragging = true;
    path = [i];
    boardEl.setPointerCapture(e.pointerId);
    SG.sound.play('key');
    paintPath();
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // берём клетку, только если палец достаточно близко к её центру — так проще вести по диагонали
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i < 0) return;
    const rect = cellEls[i].getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) > rect.width * 0.42) return;
    extend(i);
  });

  const finishSelect = () => {
    if (!dragging) return;
    dragging = false;
    const seg = segments.find((s) => !s.found && s.cells.length === path.length && s.cells.every((c, k) => c === path[k]));
    if (seg) {
      seg.found = true;
      seg.cells.forEach((c) => {
        cellEls[c].classList.add('done');
        cellEls[c].style.setProperty('--h', seg.hue);
      });
      SG.sound.play('match');
      renderList();
      checkWin();
    } else if (path.length > 1) {
      const word = path.map((i) => letters[i]).join('');
      // слово из словаря, но не на своём месте — подскажем
      $('current').textContent = segments.some((s) => !s.found && s.word === word) ? 'Слово есть, но оно лежит не так' : word.toUpperCase();
      boardEl.classList.remove('shake');
      void boardEl.offsetWidth;
      boardEl.classList.add('shake');
      SG.sound.play('error');
    }
    path = [];
    cellEls.forEach((el) => el.classList.remove('sel'));
    setTimeout(() => {
      if (!dragging) $('current').textContent = '';
    }, 1200);
  };
  boardEl.addEventListener('pointerup', finishSelect);
  boardEl.addEventListener('pointercancel', finishSelect);

  function hint() {
    if (done) return;
    const left = segments.filter((s) => !s.found);
    if (!left.length) return;
    const s = left[Math.floor(Math.random() * left.length)];
    SG.sound.play('hint');
    cellEls.forEach((el) => el.classList.remove('hint'));
    s.cells.slice(0, 2).forEach((c, k) => {
      const el = cellEls[c];
      el.classList.remove('hint');
      void el.offsetWidth;
      el.classList.add('hint');
      el.style.setProperty('--delay', k * 0.25 + 's');
    });
  }

  function checkWin() {
    if (!segments.every((s) => s.found)) return;
    done = true;
    clearInterval(timer);
    const seconds = Math.round((Date.now() - startTime) / 1000);
    const key = 'fillword-best-' + size;
    const best = SG.store.get(key, null);
    const record = best === null || seconds < best;
    if (record) SG.store.set(key, seconds);
    SG.store.set('fillword-wins', SG.store.get('fillword-wins', 0) + 1);
    renderBest();
    SG.sound.play('win');
    overlay.text =
      'Все ' + segments.length + ' слов найдены за ' + SG.formatTime(seconds) + '.' + (record ? ' Новый рекорд! 🏆' : '');
    setTimeout(() => (overlay.hidden = false), 500);
  }

  function newGame() {
    clearInterval(timer);
    overlay.hidden = true;
    done = false;
    startTime = 0;
    path = [];
    timeEl.textContent = '0:00';
    generate();
    build();
    renderBest();
  }

  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('hint-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    hint();
  });
  $('again-btn').addEventListener('click', newGame);
  SG.segmented($('size'), String(size), (v) => {
    size = Number(v);
    SG.store.set('fillword-size', size);
    newGame();
  });

  newGame();
})();
