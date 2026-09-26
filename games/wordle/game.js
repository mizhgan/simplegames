/* Вордли — угадай слово из пяти букв */
(() => {
  'use strict';

  const LEN = 5;
  const TRIES = 6;
  const EPOCH = new Date(2026, 0, 1);
  const ANSWERS = window.WORDLE_ANSWERS;
  const ALLOWED = new Set(window.WORDLE_ALLOWED);
  const KB_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', '⏎ячсмитьбю⌫'];
  // Раскладка ЙЦУКЕН по физическим клавишам — чтобы можно было играть и с английской раскладкой
  const CODE_TO_RU = {
    KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyT: 'е', KeyY: 'н', KeyU: 'г', KeyI: 'ш', KeyO: 'щ', KeyP: 'з',
    BracketLeft: 'х', BracketRight: 'ъ', KeyA: 'ф', KeyS: 'ы', KeyD: 'в', KeyF: 'а', KeyG: 'п', KeyH: 'р',
    KeyJ: 'о', KeyK: 'л', KeyL: 'д', Semicolon: 'ж', Quote: 'э', KeyZ: 'я', KeyX: 'ч', KeyC: 'с', KeyV: 'м',
    KeyB: 'и', KeyN: 'т', KeyM: 'ь', Comma: 'б', Period: 'ю', Backquote: 'е',
  };
  const RANK = { absent: 1, present: 2, correct: 3 };

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const kbEl = $('keyboard');
  const toastEl = $('toast');
  const overlay = SG.overlay();

  let mode = SG.store.get('wordle-mode', 'daily');
  let game; // { mode, day?, answer, guesses: [], done, won }
  let current = '';
  let busy = false;

  // ---------- поле и клавиатура ----------

  const tiles = [];
  for (let r = 0; r < TRIES; r++) {
    const row = document.createElement('div');
    row.className = 'wd-row';
    const rowTiles = [];
    for (let c = 0; c < LEN; c++) {
      const t = document.createElement('div');
      t.className = 'wd-tile';
      row.appendChild(t);
      rowTiles.push(t);
    }
    boardEl.appendChild(row);
    tiles.push(rowTiles);
  }

  const keyEls = {};
  KB_ROWS.forEach((letters) => {
    const row = document.createElement('div');
    row.className = 'wd-kb-row';
    [...letters].forEach((ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wd-key';
      if (ch === '⏎') {
        b.classList.add('wide');
        b.textContent = 'Ввод';
        b.addEventListener('click', submit);
      } else if (ch === '⌫') {
        b.classList.add('wide');
        b.textContent = '⌫';
        b.setAttribute('aria-label', 'Стереть');
        b.addEventListener('click', backspace);
      } else {
        b.textContent = ch;
        b.addEventListener('click', () => type(ch));
        keyEls[ch] = b;
      }
      row.appendChild(b);
    });
    kbEl.appendChild(row);
  });

  // ---------- логика ----------

  const today = () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d - EPOCH) / 86400000);
  };

  // Оценка попытки с учётом повторяющихся букв
  function evaluate(guess, answer) {
    const res = Array(LEN).fill('absent');
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) res[i] = 'correct';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (res[i] === 'correct') continue;
      if (left[guess[i]]) {
        res[i] = 'present';
        left[guess[i]]--;
      }
    }
    return res;
  }

  function load() {
    if (mode === 'daily') {
      const day = today();
      const saved = SG.store.get('wordle-daily', null);
      game =
        saved && saved.day === day
          ? saved
          : { mode, day, answer: ANSWERS[((day % ANSWERS.length) + ANSWERS.length) % ANSWERS.length], guesses: [], done: false, won: false };
    } else {
      const saved = SG.store.get('wordle-free', null);
      game = saved && !saved.done ? saved : newFree();
    }
    current = '';
    renderAll();
    if (game.done) setTimeout(showResult, 300);
  }

  function newFree() {
    let answer;
    do answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    while (game && answer === game.answer);
    return { mode: 'free', answer, guesses: [], done: false, won: false };
  }

  function save() {
    SG.store.set(game.mode === 'daily' ? 'wordle-daily' : 'wordle-free', game);
  }

  function type(ch) {
    if (busy || game.done || current.length >= LEN) return;
    current += ch === 'ё' ? 'е' : ch;
    SG.sound.play('key');
    const t = tiles[game.guesses.length][current.length - 1];
    t.textContent = current[current.length - 1];
    t.classList.add('filled');
  }

  function backspace() {
    if (busy || game.done || !current.length) return;
    const t = tiles[game.guesses.length][current.length - 1];
    t.textContent = '';
    t.classList.remove('filled');
    current = current.slice(0, -1);
  }

  function submit() {
    if (busy || game.done) return;
    const row = tiles[game.guesses.length];
    if (current.length < LEN) return reject(row, 'В слове должно быть 5 букв');
    if (!ALLOWED.has(current)) return reject(row, 'Такого слова нет в словаре');

    const guess = current;
    const res = evaluate(guess, game.answer);
    game.guesses.push(guess);
    current = '';
    busy = true;
    row.forEach((t, i) => {
      setTimeout(() => {
        t.classList.add('flip');
        SG.sound.play('flip');
        setTimeout(() => t.classList.add(res[i]), 250);
      }, i * 280);
    });
    const won = guess === game.answer;
    const lost = !won && game.guesses.length === TRIES;
    if (won || lost) finish(won);
    save();
    setTimeout(() => {
      busy = false;
      renderKeyboard();
      if (won) {
        SG.sound.play('win');
        row.forEach((t, i) => setTimeout(() => t.classList.add('bounce'), i * 90));
        toast(['Гениально!', 'Великолепно!', 'Отлично!', 'Здорово!', 'Хорошо!', 'Фух!'][game.guesses.length - 1]);
      } else if (lost) {
        SG.sound.play('lose');
        toast(game.answer.toUpperCase(), 2500);
      }
      if (won || lost) setTimeout(showResult, 1600);
    }, LEN * 280 + 300);
  }

  function reject(row, msg) {
    SG.sound.play('error');
    toast(msg);
    const el = row[0].parentElement;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function finish(won) {
    game.done = true;
    game.won = won;
    const stats = getStats();
    stats.played++;
    if (won) {
      stats.wins++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.dist[game.guesses.length - 1]++;
      SG.store.set('wordle-wins', stats.wins);
    } else {
      stats.streak = 0;
    }
    SG.store.set('wordle-stats', stats);
  }

  function getStats() {
    const s = SG.store.get('wordle-stats', null);
    return s && Array.isArray(s.dist) ? s : { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] };
  }

  // ---------- отрисовка ----------

  function renderAll() {
    tiles.forEach((row, r) => {
      const guess = game.guesses[r];
      const res = guess ? evaluate(guess, game.answer) : null;
      row.forEach((t, i) => {
        t.className = 'wd-tile';
        t.textContent = guess ? guess[i] : '';
        if (guess) t.classList.add('filled', 'revealed', res[i]);
      });
      row[0].parentElement.classList.remove('shake');
    });
    renderKeyboard();
  }

  function renderKeyboard() {
    const best = {};
    game.guesses.forEach((g) => {
      evaluate(g, game.answer).forEach((r, i) => {
        if (!best[g[i]] || RANK[r] > RANK[best[g[i]]]) best[g[i]] = r;
      });
    });
    Object.entries(keyEls).forEach(([ch, el]) => {
      el.classList.remove('correct', 'present', 'absent');
      if (best[ch]) el.classList.add(best[ch]);
    });
  }

  let toastTimer = 0;
  function toast(msg, ms = 1400) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function showResult() {
    const stats = getStats();
    overlay.title = game.won ? 'Победа! 🎉' : 'Не угадали 😔';
    $('overlay-word').textContent = game.done ? 'Загаданное слово: ' + game.answer.toUpperCase() : '';
    $('st-played').textContent = stats.played;
    $('st-winrate').textContent = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    $('st-streak').textContent = stats.streak;
    $('st-max').textContent = stats.maxStreak;
    const maxDist = Math.max(1, ...stats.dist);
    $('dist').innerHTML = stats.dist
      .map((n, i) => {
        const hl = game.won && game.guesses.length === i + 1 ? ' hl' : '';
        return `<div class="wd-dist-row"><span>${i + 1}</span><div class="wd-dist-bar${hl}" style="width:${Math.max(8, (n / maxDist) * 100)}%">${n}</div></div>`;
      })
      .join('');
    $('next-btn').hidden = game.mode === 'daily' || !game.done;
    $('share-btn').hidden = !game.done;
    $('countdown').hidden = game.mode !== 'daily';
    overlay.hidden = false;
    tickCountdown();
  }

  function tickCountdown() {
    if (overlay.hidden || game.mode !== 'daily') return;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('countdown').textContent = 'Новое слово дня через ' + hh + ':' + mm + ':' + ss;
    setTimeout(tickCountdown, 1000);
  }

  function shareText() {
    const EMOJI = { correct: '🟩', present: '🟨', absent: '⬜' };
    const title =
      (game.mode === 'daily' ? 'Вордли #' + (game.day + 1) : 'Вордли') +
      ' ' + (game.won ? game.guesses.length : 'X') + '/' + TRIES;
    const grid = game.guesses.map((g) => evaluate(g, game.answer).map((r) => EMOJI[r]).join('')).join('\n');
    return title + '\n\n' + grid;
  }

  // ---------- ввод ----------

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !overlay.hidden) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else {
      const k = e.key.toLowerCase();
      const ch = /^[а-яё]$/.test(k) ? k : CODE_TO_RU[e.code];
      if (ch) {
        e.preventDefault();
        type(ch);
      }
    }
  });

  $('share-btn').addEventListener('click', async () => {
    const text = shareText();
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Результат скопирован');
      }
    } catch (e) {
      /* пользователь отменил */
    }
  });
  $('close-btn').addEventListener('click', () => (overlay.hidden = true));
  $('next-btn').addEventListener('click', () => {
    overlay.hidden = true;
    game = newFree();
    save();
    current = '';
    renderAll();
  });
  $('stats-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    showResult();
    if (!game.done) {
      overlay.title = 'Статистика';
    }
  });

  SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('wordle-mode', v);
    overlay.hidden = true;
    load();
  });

  load();
})();
