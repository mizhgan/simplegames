/* Дуэль в Вордли: оба угадывают одно и то же слово — кто быстрее */
(() => {
  'use strict';

  const LEN = 5;
  const TRIES = 6;
  const KB_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', '⏎ячсмитьбю⌫'];
  const ANSWERS = window.WORDLE_ANSWERS;
  const ALLOWED = new Set(window.WORDLE_ALLOWED.concat(ANSWERS));
  // как часто «ходит» компьютер (секунды) и насколько он точен
  const AI = { easy: { every: 15, smart: 0.5 }, normal: { every: 10, smart: 0.85 }, hard: { every: 7, smart: 1 } };

  const $ = (id) => document.getElementById(id);
  const myBoard = $('my-board');
  const oppBoard = $('opp-board');
  const kbEl = $('keyboard');
  const statusEl = $('status');
  const toastEl = $('toast');
  const timeEl = $('time');
  const diffEl = $('difficulty');

  let mode = 'ai';
  let level = SG.store.get('wordduel-diff', 'normal');
  let answer = '';
  let me; // { rows: [{word, res}], cur: '', solved, time }
  let opp; // { rows: [{res}], solved, time }
  let started = 0;
  let over = false;
  let aiTimer = 0;
  let aiCands = [];
  let clock = 0;
  const wins = { me: 0, opp: 0 };

  function evaluate(guess, ans) {
    const res = Array(LEN).fill('absent');
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === ans[i]) res[i] = 'correct';
      else left[ans[i]] = (left[ans[i]] || 0) + 1;
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

  // ---------- поля ----------

  function buildBoard(el, small) {
    el.innerHTML = '';
    for (let r = 0; r < TRIES; r++) {
      const row = document.createElement('div');
      row.className = 'wd-row';
      for (let c = 0; c < LEN; c++) {
        const t = document.createElement('div');
        t.className = 'wd-tile' + (small ? ' mini' : '');
        row.appendChild(t);
      }
      el.appendChild(row);
    }
  }
  buildBoard(myBoard, false);
  buildBoard(oppBoard, true);

  const keyEls = {};
  KB_ROWS.forEach((letters) => {
    const row = document.createElement('div');
    row.className = 'wd-kb-row';
    for (const ch of letters) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wd-key' + (ch === '⏎' || ch === '⌫' ? ' wide' : '');
      b.textContent = ch === '⏎' ? 'ввод' : ch;
      b.addEventListener('click', () => press(ch));
      row.appendChild(b);
      keyEls[ch] = b;
    }
    kbEl.appendChild(row);
  });

  function renderMine() {
    const rows = myBoard.children;
    for (let r = 0; r < TRIES; r++) {
      const tiles = rows[r].children;
      const done = me.rows[r];
      const word = done ? done.word : r === me.rows.length ? me.cur : '';
      for (let c = 0; c < LEN; c++) {
        tiles[c].textContent = word[c] || '';
        tiles[c].className = 'wd-tile' + (done ? ' ' + done.res[c] : word[c] ? ' filled' : '');
      }
    }
    const state = {};
    const rank = { absent: 1, present: 2, correct: 3 };
    for (const row of me.rows) row.word.split('').forEach((ch, i) => {
      if (!state[ch] || rank[row.res[i]] > rank[state[ch]]) state[ch] = row.res[i];
    });
    for (const ch in keyEls) keyEls[ch].className = 'wd-key' + (ch === '⏎' || ch === '⌫' ? ' wide' : '') + (state[ch] ? ' ' + state[ch] : '');
  }

  function renderOpp() {
    const rows = oppBoard.children;
    for (let r = 0; r < TRIES; r++) {
      const tiles = rows[r].children;
      const done = opp.rows[r];
      for (let c = 0; c < LEN; c++) tiles[c].className = 'wd-tile mini' + (done ? ' ' + done.res[c] : '');
    }
    $('opp-label').textContent = (mode === 'net' ? 'Соперник' : 'Компьютер') + (opp.solved ? ' — угадал!' : opp.rows.length >= TRIES ? ' — не угадал' : '');
  }

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
  }

  // ---------- ввод ----------

  function press(ch) {
    if (over || me.solved || me.rows.length >= TRIES || (mode === 'net' && !net.active) || !answer) return;
    if (ch === '⏎') return submit();
    if (ch === '⌫') {
      me.cur = me.cur.slice(0, -1);
      return renderMine();
    }
    if (me.cur.length < LEN) {
      me.cur += ch;
      SG.sound.play('key');
      renderMine();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (over) return $('new-btn').click();
      return press('⏎');
    }
    if (e.key === 'Backspace') return press('⌫');
    const k = e.key.toLowerCase().replace('ё', 'е');
    if (k.length === 1 && KB_ROWS.join('').includes(k) && k !== '⏎' && k !== '⌫') press(k);
  });

  function submit() {
    if (me.cur.length < LEN) return toast('Нужно 5 букв');
    if (!ALLOWED.has(me.cur)) {
      SG.sound.play('error');
      const row = myBoard.children[me.rows.length];
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      return toast('Нет такого слова');
    }
    const res = evaluate(me.cur, answer);
    me.rows.push({ word: me.cur, res });
    me.cur = '';
    SG.sound.play('flip');
    if (res.every((x) => x === 'correct')) {
      me.solved = true;
      me.time = Date.now() - started;
    } else if (me.rows.length >= TRIES) me.time = Date.now() - started;
    if (mode === 'net') net.send({ t: 'row', res, solved: me.solved, time: me.time });
    renderMine();
    decide();
  }

  // ---------- итог ----------

  // сколько попыток понадобилось (7 — не угадал); null — ещё играет
  const known = (p) => (p.solved ? p.rows.length : p.rows.length >= TRIES ? TRIES + 1 : null);

  function decide() {
    if (over) return;
    const a = known(me);
    const b = known(opp);
    let res = null;
    if (a !== null && b !== null) {
      if (a === TRIES + 1 && b === TRIES + 1) res = 'draw';
      else if (a !== b) res = a < b ? 'win' : 'lose';
      else res = me.time <= opp.time ? 'win' : 'lose';
    } else if (a !== null && a <= TRIES && opp.rows.length >= a && !opp.solved) res = 'win';
    else if (b !== null && b <= TRIES && me.rows.length >= b && !me.solved) res = 'lose';
    if (!res) {
      updateStatus();
      return;
    }
    over = true;
    clearTimeout(aiTimer);
    clearInterval(clock);
    if (res === 'win') wins.me++;
    if (res === 'lose') wins.opp++;
    if (res === 'win') SG.store.set('wordduel-wins', SG.store.get('wordduel-wins', 0) + 1);
    if (mode === 'net') net.result(res);
    SG.sound.play(res);
    const who = mode === 'net' ? 'Соперник' : 'Компьютер';
    statusEl.textContent = (res === 'win' ? 'Вы победили! 🎉' : res === 'lose' ? who + ' оказался быстрее' : 'Никто не угадал 🤝') + ' Слово: ' + answer.toUpperCase();
    renderScore();
    renderOpp();
  }

  function updateStatus() {
    if (mode === 'net' && !net.active) {
      statusEl.textContent = 'Нет соединения с соперником';
      return;
    }
    if (!answer) {
      statusEl.textContent = 'Ждём слово от соперника…';
      return;
    }
    if (me.solved) statusEl.textContent = 'Угадано за ' + me.rows.length + '! Ждём соперника…';
    else if (me.rows.length >= TRIES) statusEl.textContent = 'Попытки кончились. Ждём соперника…';
    else statusEl.textContent = 'Угадайте слово раньше соперника: попытка ' + (me.rows.length + 1) + ' из ' + TRIES;
  }

  function renderScore() {
    $('score-me').textContent = wins.me;
    $('score-opp').textContent = wins.opp;
    $('label-opp').textContent = mode === 'net' ? 'Соперник' : 'Компьютер';
  }

  // ---------- компьютер ----------

  function aiStep() {
    if (over || mode !== 'ai' || opp.solved || opp.rows.length >= TRIES) return;
    const cfg = AI[level];
    let guess;
    if (!opp.rows.length) guess = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    else if (Math.random() < cfg.smart && aiCands.length) guess = aiCands[Math.floor(Math.random() * aiCands.length)];
    else guess = window.WORDLE_ALLOWED[Math.floor(Math.random() * window.WORDLE_ALLOWED.length)];
    const res = evaluate(guess, answer);
    aiCands = aiCands.filter((w) => evaluate(guess, w).join() === res.join());
    opp.rows.push({ res });
    if (res.every((x) => x === 'correct')) {
      opp.solved = true;
      opp.time = Date.now() - started;
    } else if (opp.rows.length >= TRIES) opp.time = Date.now() - started;
    SG.sound.play('tick');
    renderOpp();
    decide();
    if (!over && !opp.solved && opp.rows.length < TRIES) scheduleAi();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    const s = AI[level].every * (0.7 + Math.random() * 0.6);
    aiTimer = setTimeout(aiStep, s * 1000);
  }

  // ---------- партия ----------

  function start(word) {
    clearTimeout(aiTimer);
    clearInterval(clock);
    answer = word;
    me = { rows: [], cur: '', solved: false, time: 0 };
    opp = { rows: [], solved: false, time: 0 };
    over = false;
    started = Date.now();
    aiCands = ANSWERS.slice();
    renderMine();
    renderOpp();
    updateStatus();
    clock = setInterval(() => {
      if (!over && answer) timeEl.textContent = SG.formatTime(Math.floor((Date.now() - started) / 1000));
    }, 500);
    timeEl.textContent = '0:00';
    if (mode === 'ai' && answer) scheduleAi();
  }

  function newGame() {
    if (mode === 'net') {
      if (!net.active) return;
      const idx = Math.floor(Math.random() * ANSWERS.length);
      net.send({ t: 'new', w: idx });
      start(ANSWERS[idx]);
    } else start(ANSWERS[Math.floor(Math.random() * ANSWERS.length)]);
  }

  const net = SG.net.setup({
    game: 'wordduel',
    // зрители видят цвета попыток, но не буквы
    mirrorMask: (el) => {
      el.querySelectorAll('#my-board .wd-tile').forEach((t) => (t.textContent = ''));
      el.querySelectorAll('#keyboard, #toast').forEach((k) => k.remove());
    },
    modeEl: $('mode'),
    onRematch: () => newGame(),
    onConnect(role) {
      mode = 'net';
      diffEl.style.display = 'none';
      wins.me = wins.opp = 0;
      renderScore();
      net.info('одно слово на двоих');
      if (role === 'host') newGame();
      else start('');
    },
    onMessage(msg) {
      if (msg.t === 'new' && ANSWERS[msg.w]) start(ANSWERS[msg.w]);
      else if (msg.t === 'row' && Array.isArray(msg.res) && !opp.solved && opp.rows.length < TRIES) {
        opp.rows.push({ res: msg.res.slice(0, LEN) });
        opp.solved = !!msg.solved;
        opp.time = +msg.time || 0;
        renderOpp();
        decide();
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        diffEl.style.display = '';
        wins.me = wins.opp = 0;
        renderScore();
        newGame();
      } else {
        over = true;
        clearInterval(clock);
        updateStatus();
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), 'ai', (v) => {
    mode = v;
    diffEl.style.display = '';
    wins.me = wins.opp = 0;
    renderScore();
    newGame();
  });
  SG.segmented(diffEl, level, (v) => {
    level = v;
    SG.store.set('wordduel-diff', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });

  renderScore();
  newGame();
})();
