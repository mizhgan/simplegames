/* Кросс-ворд батл: один и тот же кроссворд-«расстановка» у обоих — расставьте слова из списка быстрее соперника */
(() => {
  'use strict';

  const S = 13;
  const TIME = 240;
  const AI = { easy: 13, normal: 8, hard: 5 };
  const nouns = Array.isArray(window.SG_NOUNS) ? window.SG_NOUNS : String(window.SG_NOUNS).split(' ');
  const POOL = [...new Set(window.CROC_WORDS.easy.concat(window.CROC_WORDS.hard, nouns))].filter((w) => /^[а-яё]{4,8}$/.test(w));

  // ---------- генератор ----------

  function generate() {
    let best = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const grid = Array(S * S).fill('');
      const words = [];
      const cand = SG.shuffle(POOL.slice()).slice(0, 400);
      const first = cand.find((w) => w.length >= 6) || cand[0];
      const x0 = Math.floor((S - first.length) / 2);
      put(grid, words, first, x0, 6, 0);
      for (const w of cand) {
        if (words.length >= 12) break;
        if (words.some((x) => x.w === w)) continue;
        const opts = [];
        for (let i = 0; i < w.length; i++) {
          for (let c = 0; c < S * S; c++) {
            if (grid[c] !== w[i]) continue;
            const cx = c % S;
            const cy = Math.floor(c / S);
            for (const dir of [0, 1]) {
              const x = dir ? cx : cx - i;
              const y = dir ? cy - i : cy;
              const k = fits(grid, w, x, y, dir);
              if (k > 0) opts.push({ x, y, dir, k });
            }
          }
        }
        if (!opts.length) continue;
        opts.sort((a, b) => b.k - a.k || Math.random() - 0.5);
        put(grid, words, w, opts[0].x, opts[0].y, opts[0].dir);
      }
      if (!best || words.length > best.length) best = words;
      if (words.length >= 11) break;
    }
    return best;
  }

  function put(grid, words, w, x, y, dir) {
    for (let i = 0; i < w.length; i++) grid[(y + (dir ? i : 0)) * S + x + (dir ? 0 : i)] = w[i];
    words.push({ w, x, y, dir });
  }

  // сколько пересечений даёт слово в этом месте (0 — нельзя)
  function fits(grid, w, x, y, dir) {
    const dx = dir ? 0 : 1;
    const dy = dir ? 1 : 0;
    const ex = x + dx * (w.length - 1);
    const ey = y + dy * (w.length - 1);
    if (x < 0 || y < 0 || ex >= S || ey >= S) return 0;
    const get = (cx, cy) => (cx >= 0 && cy >= 0 && cx < S && cy < S ? grid[cy * S + cx] : '');
    if (get(x - dx, y - dy) || get(ex + dx, ey + dy)) return 0;
    let cross = 0;
    for (let i = 0; i < w.length; i++) {
      const cx = x + dx * i;
      const cy = y + dy * i;
      const g = get(cx, cy);
      if (g) {
        if (g !== w[i]) return 0;
        cross++;
      } else if (get(cx + dy, cy + dx) || get(cx - dy, cy - dx)) return 0; // соседи сбоку
    }
    return cross && cross < w.length ? cross : 0;
  }

  // ---------- состояние ----------

  const $ = (id) => document.getElementById(id);
  const gridEl = $('grid');
  const bankEl = $('bank');
  const statusEl = $('status');
  const diffEl = $('difficulty');
  let mode = 'ai';
  let level = SG.store.get('crossduel-diff', 'normal');
  let words = [];
  let done = new Set(); // индексы угаданных слов
  let opp = 0;
  let sel = -1;
  let started = 0;
  let over = true;
  let lock = 0;
  let clock = 0;
  let aiTimer = 0;
  let oppDone = false;
  const wins = { me: 0, opp: 0 };

  function cellsOf(k) {
    const w = words[k];
    return [...w.w].map((_, i) => (w.y + (w.dir ? i : 0)) * S + w.x + (w.dir ? 0 : i));
  }

  function render() {
    const letter = {};
    const slot = {};
    const starts = {};
    words.forEach((w, k) => {
      cellsOf(k).forEach((c, i) => {
        (slot[c] = slot[c] || []).push(k);
        if (done.has(k)) letter[c] = w.w[i];
      });
      starts[cellsOf(k)[0]] = starts[cellsOf(k)[0]] || k + 1;
    });
    const selCells = sel >= 0 ? new Set(cellsOf(sel)) : new Set();
    let html = '';
    for (let c = 0; c < S * S; c++) {
      if (!slot[c]) {
        html += '<div class="cd-x"></div>';
        continue;
      }
      html += `<button type="button" class="cd-c${selCells.has(c) ? ' sel' : ''}${letter[c] ? ' ok' : ''}" data-c="${c}">${starts[c] ? `<small>${starts[c]}</small>` : ''}${letter[c] ? letter[c].toUpperCase() : ''}</button>`;
    }
    gridEl.innerHTML = html;
    // банк слов по длине
    const bank = words.map((w, k) => ({ w: w.w, k })).sort((a, b) => a.w.length - b.w.length || a.w.localeCompare(b.w));
    bankEl.innerHTML = bank.map((x) => `<button type="button" class="cd-word${done.has(x.k) ? ' used' : ''}" data-w="${x.w}" ${done.has(x.k) || over ? 'disabled' : ''}>${x.w}</button>`).join('');
    $('mine').textContent = done.size + ' / ' + words.length;
    $('theirs').textContent = opp + ' / ' + words.length;
    $('opp-name').textContent = mode === 'net' ? 'Соперник' : 'Компьютер';
  }

  gridEl.addEventListener('click', (e) => {
    const b = e.target.closest('.cd-c');
    if (!b || over) return;
    const c = +b.dataset.c;
    const ks = words.map((_, k) => k).filter((k) => cellsOf(k).includes(c) && !done.has(k));
    if (!ks.length) return;
    // повторный клик по пересечению переключает направление
    const i = ks.indexOf(sel);
    sel = ks[(i + 1) % ks.length];
    SG.sound.play('click');
    render();
  });

  bankEl.addEventListener('click', (e) => {
    const b = e.target.closest('.cd-word');
    if (!b || over || sel < 0) {
      if (b && sel < 0) statusEl.textContent = 'Сначала выберите место в сетке.';
      return;
    }
    if (Date.now() < lock) return;
    const w = b.dataset.w;
    if (w === words[sel].w) {
      done.add(sel);
      sel = -1;
      SG.sound.play('match');
      if (mode === 'net') net.send({ t: 'n', n: done.size });
      render();
      check();
    } else {
      lock = Date.now() + 2000;
      SG.sound.play('error');
      statusEl.textContent = w.length !== words[sel].w.length ? 'Не та длина.' : 'Не подходит — 2 секунды штрафа.';
      gridEl.classList.remove('shake');
      void gridEl.offsetWidth;
      gridEl.classList.add('shake');
    }
  });

  function tick() {
    if (over) return;
    const left = Math.max(0, TIME - Math.floor((Date.now() - started) / 1000));
    $('time').textContent = SG.formatTime(left);
    if (!left) finish();
  }

  function check() {
    if (done.size === words.length) finish();
  }

  function finish() {
    if (over) return;
    over = true;
    clearInterval(clock);
    clearTimeout(aiTimer);
    if (mode === 'net') net.send({ t: 'fin', n: done.size, t2: Date.now() - started });
    decide();
  }

  function decide() {
    const me = done.size;
    // побеждает заполнивший всё первым; иначе — у кого больше слов
    let res;
    if (me === words.length && !oppDone) res = 'win';
    else if (opp === words.length && me < words.length) res = 'lose';
    else if (!over) return;
    else if (mode === 'net' && !oppDone && me < words.length) {
      statusEl.textContent = 'Время вышло. Ждём соперника…';
      return;
    } else res = me > opp ? 'win' : me < opp ? 'lose' : 'draw';
    if (decide.done) return;
    decide.done = true;
    over = true;
    clearInterval(clock);
    clearTimeout(aiTimer);
    if (res === 'win') wins.me++;
    if (res === 'lose') wins.opp++;
    if (res === 'win') SG.store.set('crossduel-wins', SG.store.get('crossduel-wins', 0) + 1);
    if (mode === 'net') net.result(res);
    SG.sound.play(res);
    statusEl.textContent = (res === 'win' ? 'Вы победили! 🎉' : res === 'lose' ? (mode === 'net' ? 'Соперник' : 'Компьютер') + ' оказался быстрее.' : 'Ничья 🤝') + ' Слов: ' + me + ' : ' + opp + '.';
    $('score-me').textContent = wins.me;
    $('score-opp').textContent = wins.opp;
    render();
  }

  function aiStep() {
    if (over || mode !== 'ai') return;
    opp++;
    render();
    if (opp >= words.length) {
      oppDone = true;
      over = true;
      clearInterval(clock);
      decide();
      return;
    }
    aiTimer = setTimeout(aiStep, AI[level] * (0.6 + Math.random() * 0.8) * 1000);
  }

  function start(ws) {
    clearInterval(clock);
    clearTimeout(aiTimer);
    words = ws;
    done = new Set();
    opp = 0;
    oppDone = false;
    sel = -1;
    over = false;
    decide.done = false;
    started = Date.now();
    statusEl.textContent = 'Выберите место в сетке, затем слово из списка.';
    clock = setInterval(tick, 250);
    if (mode === 'ai') aiTimer = setTimeout(aiStep, AI[level] * 1000);
    render();
  }

  function newGame() {
    const ws = generate();
    if (mode === 'net') {
      if (!net.active) return;
      net.send({ t: 'new', w: ws });
    }
    start(ws);
  }

  const net = SG.net.setup({
    game: 'crossduel',
    modeEl: $('mode'),
    onRematch: () => newGame(),
    mirrorMask: (el) => el.querySelectorAll('#bank').forEach((b) => (b.innerHTML = '')),
    onConnect(role) {
      mode = 'net';
      diffEl.style.display = 'none';
      wins.me = wins.opp = 0;
      net.info('один кроссворд на двоих');
      if (role === 'host') newGame();
      else {
        words = [];
        render();
        statusEl.textContent = 'Ждём кроссворд от соперника…';
      }
    },
    onMessage(msg) {
      if (msg.t === 'new' && Array.isArray(msg.w)) start(msg.w.filter((x) => x && typeof x.w === 'string').map((x) => ({ w: x.w, x: x.x | 0, y: x.y | 0, dir: x.dir ? 1 : 0 })));
      else if (msg.t === 'n') {
        opp = Math.min(words.length, msg.n | 0);
        render();
        if (opp === words.length) {
          oppDone = true;
          over = true;
          clearInterval(clock);
          decide();
        }
      } else if (msg.t === 'fin') {
        opp = Math.min(words.length, msg.n | 0);
        oppDone = true;
        if (over) decide();
        render();
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        diffEl.style.display = '';
        newGame();
      } else {
        over = true;
        clearInterval(clock);
        statusEl.textContent = 'Нет соединения с соперником';
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), 'ai', (v) => {
    mode = v;
    diffEl.style.display = '';
    newGame();
  });
  SG.segmented(diffEl, level, (v) => {
    level = v;
    SG.store.set('crossduel-diff', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  window.__crossduel = { generate, get words() { return words; } };
  newGame();
})();
