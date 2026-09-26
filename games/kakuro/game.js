/* Какуро */
(() => {
  'use strict';

  const SIZES = { easy: [7, 7, 5], medium: [9, 9, 6], hard: [11, 11, 7] };

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const padEl = $('pad');
  const statusEl = $('status');
  const comboEl = $('combos');
  const overlay = SG.overlay();

  let level = SG.store.get('kakuro-level', 'easy');
  let game, cellEls, sel, timerId;
  // game: { R, C, white, solution, givens, runs, vals: {i: d}, elapsed, done, hints }

  // ---------- генерация ----------

  function create() {
    const [R, C, maxRun] = SIZES[level];
    let best = null;
    for (let k = 0; k < 6; k++) {
      const g = window.KakuroGen.generate(R, C, maxRun);
      if (g && (!best || g.givens.length < best.givens.length)) best = g;
    }
    const vals = {};
    best.givens.forEach((i) => (vals[i] = best.solution[best.white.indexOf(i)]));
    return Object.assign(best, { vals, elapsed: 0, done: false, hints: 0, level });
  }

  // ---------- отрисовка ----------

  function build() {
    const { R, C, white, runs } = game;
    boardEl.style.setProperty('--c', C);
    boardEl.innerHTML = '';
    cellEls = {};
    const whiteSet = new Set(white);
    const clues = {};
    runs.forEach((r, k) => ((clues[r.clue] = clues[r.clue] || {})[r.horiz ? 'h' : 'v'] = k));
    for (let i = 0; i < R * C; i++) {
      const el = document.createElement('div');
      if (whiteSet.has(i)) {
        el.className = 'kk-cell';
        if (game.givens.includes(i)) el.classList.add('given');
        el.dataset.i = i;
        cellEls[i] = el;
      } else {
        el.className = 'kk-block';
        const c = clues[i];
        if (c) {
          el.classList.add('clue');
          if (c.h !== undefined) el.innerHTML += `<span class="h" data-run="${c.h}">${runs[c.h].sum}</span>`;
          if (c.v !== undefined) el.innerHTML += `<span class="v" data-run="${c.v}">${runs[c.v].sum}</span>`;
        }
      }
      boardEl.appendChild(el);
    }
  }

  function runsOf(i) {
    return game.runs.map((r, k) => k).filter((k) => game.runs[k].cells.includes(i));
  }

  function render() {
    const { runs, vals } = game;
    const selRuns = sel != null ? runsOf(sel) : [];
    const bad = new Set();
    const badRuns = new Set();
    runs.forEach((r, k) => {
      const ds = r.cells.map((i) => vals[i]).filter(Boolean);
      const seen = {};
      r.cells.forEach((i) => {
        const d = vals[i];
        if (!d) return;
        if (seen[d] !== undefined) {
          bad.add(i);
          bad.add(seen[d]);
        } else seen[d] = i;
      });
      const s = ds.reduce((a, b) => a + b, 0);
      if (s > r.sum || (ds.length === r.cells.length && s !== r.sum)) badRuns.add(k);
    });
    Object.entries(cellEls).forEach(([i, el]) => {
      i = Number(i);
      el.textContent = vals[i] || '';
      el.classList.toggle('sel', i === sel);
      el.classList.toggle('run', selRuns.some((k) => runs[k].cells.includes(i)) && i !== sel);
      el.classList.toggle('bad', bad.has(i));
    });
    boardEl.querySelectorAll('[data-run]').forEach((s) => {
      const k = Number(s.dataset.run);
      s.classList.toggle('bad', badRuns.has(k));
      s.classList.toggle('active', selRuns.includes(k));
      const r = runs[k];
      s.classList.toggle('ok', !badRuns.has(k) && r.cells.every((i) => vals[i]));
    });
    // подсказка: возможные наборы цифр для серий выбранной клетки
    if (sel != null && !game.done) {
      comboEl.innerHTML = selRuns
        .map((k) => {
          const r = runs[k];
          const list = combos(r.cells.length, r.sum);
          const shown = list.slice(0, 6).map((c) => c.join('')).join(', ') + (list.length > 6 ? ' …' : '');
          return `<span><b>${r.horiz ? '→' : '↓'} ${r.sum} в ${r.cells.length}:</b> ${shown}</span>`;
        })
        .join('');
    } else comboEl.innerHTML = '';
    $('solved').textContent = SG.store.get('kakuro-solved', 0);
    const best = SG.store.get('kakuro-best-' + level, null);
    $('best').textContent = best ? SG.formatTime(best) : '—';
  }

  const COMBO_CACHE = {};
  function combos(k, s) {
    const key = k + ':' + s;
    if (COMBO_CACHE[key]) return COMBO_CACHE[key];
    const out = [];
    const rec = (start, left, sum, acc) => {
      if (left === 0) {
        if (sum === 0) out.push(acc.slice());
        return;
      }
      for (let d = start; d <= 9 && d <= sum; d++) {
        acc.push(d);
        rec(d + 1, left - 1, sum - d, acc);
        acc.pop();
      }
    };
    rec(1, k, s, []);
    return (COMBO_CACHE[key] = out);
  }

  // ---------- ввод ----------

  function select(i) {
    sel = i;
    render();
  }

  function input(d) {
    if (sel == null || game.done || game.givens.includes(sel)) return;
    if (d) game.vals[sel] = d;
    else delete game.vals[sel];
    SG.sound.play(d ? 'key' : 'click');
    save();
    render();
    checkWin();
  }

  function checkWin() {
    const { runs, vals } = game;
    const ok = runs.every((r) => {
      const ds = r.cells.map((i) => vals[i]);
      return ds.every(Boolean) && new Set(ds).size === ds.length && ds.reduce((a, b) => a + b, 0) === r.sum;
    });
    if (!ok) return;
    game.done = true;
    stopTimer();
    SG.store.set('kakuro-solved', SG.store.get('kakuro-solved', 0) + 1);
    const key = 'kakuro-best-' + level;
    const best = SG.store.get(key, null);
    const record = !game.hints && (!best || game.elapsed < best);
    if (record) SG.store.set(key, game.elapsed);
    overlay.text =
      'Время: ' + SG.formatTime(game.elapsed) + (game.hints ? ' · подсказок: ' + game.hints : '') + (record ? ' · новый рекорд!' : '');
    statusEl.textContent = 'Решено! 🎉';
    sel = null;
    save();
    render();
    SG.sound.play('win');
    setTimeout(() => (overlay.hidden = false), 300);
  }

  function moveSel(dr, dc) {
    const { R, C } = game;
    if (sel == null) return select(game.white[0]);
    let r = Math.floor(sel / C);
    let c = sel % C;
    for (let k = 0; k < Math.max(R, C); k++) {
      r = (r + dr + R) % R;
      c = (c + dc + C) % C;
      if (cellEls[r * C + c]) return select(r * C + c);
    }
  }

  function hint() {
    if (game.done) return;
    const { white, solution, vals } = game;
    let targets = white.filter((i) => vals[i] && vals[i] !== solution[white.indexOf(i)]);
    if (!targets.length) targets = sel != null && !vals[sel] ? [sel] : white.filter((i) => !vals[i]);
    if (!targets.length) return;
    const i = targets[Math.floor(Math.random() * targets.length)];
    vals[i] = solution[white.indexOf(i)];
    game.hints++;
    sel = i;
    SG.sound.play('hint');
    save();
    render();
    checkWin();
  }

  boardEl.addEventListener('click', (e) => {
    const c = e.target.closest('.kk-cell');
    if (c) select(Number(c.dataset.i));
  });
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d;
    b.addEventListener('click', () => input(d));
    padEl.appendChild(b);
  }
  const erase = document.createElement('button');
  erase.type = 'button';
  erase.textContent = '⌫';
  erase.setAttribute('aria-label', 'Стереть');
  erase.addEventListener('click', () => input(0));
  padEl.appendChild(erase);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !game) return;
    if (/^[1-9]$/.test(e.key)) input(Number(e.key));
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') input(0);
    else if (e.key === 'ArrowUp') moveSel(-1, 0);
    else if (e.key === 'ArrowDown') moveSel(1, 0);
    else if (e.key === 'ArrowLeft') moveSel(0, -1);
    else if (e.key === 'ArrowRight') moveSel(0, 1);
    else if (e.code === 'KeyH') hint();
    else return;
    e.preventDefault();
  });

  // ---------- таймер и сохранение ----------

  function tick() {
    if (document.hidden || game.done) return;
    game.elapsed++;
    $('time').textContent = SG.formatTime(game.elapsed);
    if (game.elapsed % 5 === 0) save();
  }
  function startTimer() {
    stopTimer();
    timerId = setInterval(tick, 1000);
  }
  function stopTimer() {
    clearInterval(timerId);
  }

  function save() {
    SG.store.set('kakuro-state', game);
  }

  function start(g) {
    game = g;
    sel = null;
    overlay.hidden = true;
    build();
    render();
    $('time').textContent = SG.formatTime(game.elapsed);
    statusEl.textContent = game.done
      ? 'Решено! 🎉'
      : game.givens.length
        ? 'Серые цифры уже открыты — они нужны, чтобы решение было единственным.'
        : 'Заполните клетки цифрами 1–9 так, чтобы совпали суммы.';
    save();
    if (!game.done) startTimer();
  }

  function newGame() {
    statusEl.textContent = 'Генерируем головоломку…';
    setTimeout(() => start(create()), 20);
  }

  SG.segmented($('level'), level, (v) => {
    level = v;
    SG.store.set('kakuro-level', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('again-btn').addEventListener('click', newGame);
  $('hint-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    hint();
  });

  const saved = SG.store.get('kakuro-state', null);
  if (saved && saved.level === level && saved.runs && !saved.done) start(saved);
  else newGame();
})();
