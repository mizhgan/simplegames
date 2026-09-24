/* Киллер-судоку: судоку с клетками-«клетками», у которых задана сумма */
(() => {
  'use strict';

  // Размеры клеток-сумм на каждом уровне: [мин, макс]
  const LEVELS = { easy: [2, 3], medium: [2, 4], hard: [2, 5] };
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

  // COMBOS[k][s] — маски наборов из k разных цифр с суммой s
  const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
  for (let m = 0; m < 1 << 10; m += 2) {
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) sum += d;
    COMBOS[popcount(m)][sum].push(m);
  }

  function makeCages(solution, [lo, hi]) {
    const cageOf = Array(81).fill(-1);
    const cages = [];
    for (const start of SG.shuffle([...Array(81).keys()])) {
      if (cageOf[start] >= 0) continue;
      const id = cages.length;
      const cells = [start];
      cageOf[start] = id;
      const target = lo + Math.floor(Math.random() * (hi - lo + 1));
      while (cells.length < target) {
        const opts = [];
        for (const c of cells) {
          const r = Math.floor(c / 9);
          const col = c % 9;
          for (const n of [r > 0 && c - 9, r < 8 && c + 9, col > 0 && c - 1, col < 8 && c + 1]) {
            if (n === false || cageOf[n] >= 0) continue;
            if (cells.some((x) => solution[x] === solution[n])) continue;
            opts.push(n);
          }
        }
        if (!opts.length) break;
        const n = opts[Math.floor(Math.random() * opts.length)];
        cageOf[n] = id;
        cells.push(n);
      }
      cages.push(cells);
    }
    // одиночные клетки пытаемся присоединить к соседней клетке-сумме
    cages.forEach((cells, id) => {
      if (cells.length !== 1) return;
      const c = cells[0];
      const r = Math.floor(c / 9);
      const col = c % 9;
      for (const n of [r > 0 && c - 9, r < 8 && c + 9, col > 0 && c - 1, col < 8 && c + 1]) {
        if (n === false) continue;
        const other = cages[cageOf[n]];
        if (other.length >= hi + 1 || other.some((x) => solution[x] === solution[c])) continue;
        other.push(c);
        cageOf[c] = cageOf[n];
        cells.length = 0;
        break;
      }
    });
    const list = cages.filter((c) => c.length).map((cells) => ({ cells: cells.sort((a, b) => a - b), sum: cells.reduce((t, i) => t + solution[i], 0) }));
    const map = Array(81).fill(-1);
    list.forEach((cg, k) => cg.cells.forEach((i) => (map[i] = k)));
    return { cages: list, cageOf: map };
  }

  // Решатель с учётом сумм: собирает до двух решений
  function solveKiller(g, cages, cageOf, budget) {
    const sols = [];
    let nodes = 0;
    const cand = (i) => {
      let m = candidates(g, i);
      const cg = cages[cageOf[i]];
      let used = 0;
      let rest = cg.sum;
      let free = 0;
      for (const j of cg.cells) {
        if (g[j]) {
          used |= 1 << g[j];
          rest -= g[j];
        } else free++;
      }
      let allowed = 0;
      if (rest > 0 && rest <= 45) for (const cm of COMBOS[free][rest]) if (!(cm & used)) allowed |= cm;
      return m & allowed;
    };
    const rec = () => {
      if (sols.length >= 2 || ++nodes > budget) return;
      let best = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = cand(i);
        const n = popcount(m);
        if (n === 0) return;
        if (n < bestCount) {
          best = i;
          bestMask = m;
          bestCount = n;
          if (n === 1) break;
        }
      }
      if (best < 0) {
        sols.push(g.slice());
        return;
      }
      for (let d = 1; d <= 9; d++) {
        if (!(bestMask & (1 << d))) continue;
        g[best] = d;
        rec();
        if (sols.length >= 2 || nodes > budget) break;
      }
      g[best] = 0;
    };
    rec();
    return nodes > budget ? null : sols;
  }

  function generate(level) {
    let best = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const solution = Array(81).fill(0);
      solve(solution, 1, true);
      const { cages, cageOf } = makeCages(solution, LEVELS[level]);
      // если решений несколько — открываем цифры там, где решения расходятся
      const puzzle = Array(81).fill(0);
      for (let k = 0; k < 30; k++) {
        const sols = solveKiller(puzzle.slice(), cages, cageOf, 6000);
        let pick;
        if (sols && sols.length === 1) break;
        if (sols) {
          const diff = [];
          for (let i = 0; i < 81; i++) if (sols[0][i] !== sols[1][i]) diff.push(i);
          pick = diff[Math.floor(Math.random() * diff.length)];
        } else {
          const free = [];
          for (let i = 0; i < 81; i++) if (!puzzle[i]) free.push(i);
          pick = free[Math.floor(Math.random() * free.length)];
        }
        puzzle[pick] = solution[pick];
      }
      const givens = puzzle.filter(Boolean).length;
      if (!best || givens < best.givens) best = { puzzle, solution, cages, cageOf, givens };
      if (givens <= 2) break;
    }
    return best;
  }

  // ---------- состояние ----------

  let level = SG.store.get('killer-level', 'easy');
  if (!LEVELS[level]) level = 'easy';
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
    el.className = 'sd-cell kl-cell' + (c === 2 || c === 5 ? ' br' : '') + (r === 2 || r === 5 ? ' bb' : '');
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
    const { puzzle, solution, cages, cageOf } = generate(level);
    game = {
      level,
      puzzle,
      solution,
      cages,
      cageOf,
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
    SG.store.set('killer-state', game);
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
    const best = SG.store.get('killer-best-' + level, null);
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
      SG.sound.play('key');
    } else {
      if (game.values[i] === d) return;
      pushHistory();
      game.values[i] = d;
      SG.sound.play(PEERS[i].some((p) => game.values[p] === d) ? 'error' : 'place', 3);
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
    SG.sound.play('slide');
    game.notes[selected] = 0;
    afterChange();
  }

  function undo() {
    if (!history.length || game.done) return;
    const h = history.pop();
    SG.sound.play('click');
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
    SG.sound.play('hint');
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
    SG.sound.play('win');
    clearInterval(timer);
    const key = 'killer-best-' + game.level;
    SG.store.set('killer-solved', SG.store.get('killer-solved', 0) + 1);
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

  // рамки клеток-сумм: пунктир по тем сторонам, где сосед из другой клетки
  let cageDeco = [];
  function buildCages() {
    const { cages, cageOf } = game;
    cageDeco = Array.from({ length: 81 }, (_, i) => {
      const r = Math.floor(i / 9);
      const c = i % 9;
      const id = cageOf[i];
      const t = r === 0 || cageOf[i - 9] !== id;
      const b = r === 8 || cageOf[i + 9] !== id;
      const l = c === 0 || cageOf[i - 1] !== id;
      const rt = c === 8 || cageOf[i + 1] !== id;
      const cls = (t ? ' t' : '') + (b ? ' b' : '') + (l ? ' l' : '') + (rt ? ' r' : '');
      const label = cages[id].cells[0] === i ? '<b class="kl-sum">' + cages[id].sum + '</b>' : '';
      return '<span class="kl-cage' + cls + '"></span>' + label;
    });
  }

  function cageOver(cg) {
    const vals = cg.cells.map((j) => game.values[j]);
    const s = vals.reduce((a, b) => a + b, 0);
    return s > cg.sum || (vals.every(Boolean) && s !== cg.sum);
  }

  const COMBO_TXT = {};
  function comboText(cg) {
    const key = cg.cells.length + ':' + cg.sum;
    if (!COMBO_TXT[key]) {
      const list = COMBOS[cg.cells.length][cg.sum].map((m) => {
        let t = '';
        for (let d = 1; d <= 9; d++) if (m & (1 << d)) t += d;
        return t;
      });
      COMBO_TXT[key] = list.slice(0, 8).join(', ') + (list.length > 8 ? ' …' : '');
    }
    return COMBO_TXT[key];
  }

  function render() {
    if (!game) return;
    if (cageDeco.length !== 81 || cageDeco.game !== game) {
      buildCages();
      cageDeco.game = game;
    }
    const combosEl = $('combos');
    if (selected >= 0 && !game.done) {
      const cg = game.cages[game.cageOf[selected]];
      combosEl.innerHTML = '<b>Сумма ' + cg.sum + ' в ' + cg.cells.length + ':</b> ' + comboText(cg);
    } else combosEl.textContent = '';
    const { values, notes, fixed } = game;
    const selVal = selected >= 0 ? values[selected] : 0;
    const peers = selected >= 0 ? new Set(PEERS[selected]) : new Set();
    const counts = Array(10).fill(0);
    values.forEach((v) => counts[v]++);

    cellEls.forEach((el, i) => {
      const v = values[i];
      const cg = game.cages[game.cageOf[i]];
      const conflict = v && (PEERS[i].some((p) => values[p] === v) || cg.cells.some((p) => p !== i && values[p] === v) || cageOver(cg));
      el.classList.toggle('given', !!game.puzzle[i]);
      el.classList.toggle('hinted', fixed[i] && !game.puzzle[i]);
      el.classList.toggle('selected', i === selected);
      el.classList.toggle('peer', peers.has(i));
      el.classList.toggle('same', !!v && v === selVal && i !== selected);
      el.classList.toggle('conflict', !!conflict && !fixed[i]);
      let html = cageDeco[i];
      if (v) {
        html += '<span class="kl-val">' + v + '</span>';
      } else if (notes[i]) {
        html += '<span class="sd-notes">';
        for (let d = 1; d <= 9; d++) html += '<i>' + (notes[i] & (1 << d) ? d : '') + '</i>';
        html += '</span>';
      }
      el.innerHTML = html;
      el.classList.toggle('in-cage', selected >= 0 && game.cageOf[selected] === game.cageOf[i]);
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
    SG.store.set('killer-level', v);
    newGame();
  });

  // ---------- старт: продолжаем сохранённую партию ----------

  const saved = SG.store.get('killer-state', null);
  if (saved && !saved.done && Array.isArray(saved.values) && saved.values.length === 81 && Array.isArray(saved.cages) && LEVELS[saved.level]) {
    game = saved;
    level = saved.level;
    document.querySelectorAll('#level button').forEach((b) => b.classList.toggle('active', b.dataset.value === level));
    startTimer();
    render();
  } else {
    newGame();
  }
})();
