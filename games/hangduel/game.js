/* Виселица вдвоём: загадайте слово сопернику и отгадайте его слово — кто меньше ошибётся */
(() => {
  'use strict';

  const MAX = 7;
  const ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];
  const norm = (w) => w.toLowerCase().replace(/ё/g, 'е').trim();
  const NOUNS = window.SG_NOUNS.map(norm).filter((w) => /^[а-я]{4,10}$/.test(w));
  // словарь для проверки загаданного слова
  const DICT = new Set(NOUNS);
  (() => {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    let prev = '';
    window.BALDA_DICT_PACKED.split(' ').forEach((token) => {
      const w = prev.slice(0, digits.indexOf(token[0])) + token.slice(1);
      DICT.add(w);
      prev = w;
    });
  })();

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const diffEl = $('difficulty');
  const parts = [...document.querySelectorAll('#gallows .part')];
  const oppParts = [...document.querySelectorAll('#opp-gallows .part')];

  let mode = 'ai';
  let level = SG.store.get('hangduel-diff', 'normal');
  let phase = 'setup';
  let myWord = ''; // загадано мной для соперника
  let oppLen = 0; // длина слова соперника
  let pattern = []; // что я открыл в слове соперника
  let guessed = new Set();
  let mistakes = 0;
  let solvedAt = 0;
  let started = 0;
  let pending = ''; // буква, ждущая ответа
  let opp = { open: [], mistakes: 0, solved: false, time: 0, letters: new Set() };
  let oppReady = false;
  let aiWord = '';
  let aiTimer = 0;
  let oppWord = '';
  const wins = { me: 0, opp: 0 };
  const oppName = () => (mode === 'net' ? 'Соперник' : 'Компьютер');

  // клавиатура
  const kb = $('keyboard');
  const keys = {};
  ROWS.forEach((row) => {
    const r = document.createElement('div');
    r.className = 'hg-row';
    for (const ch of row) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hg-key';
      b.textContent = ch;
      b.addEventListener('click', () => guess(ch));
      r.appendChild(b);
      keys[ch] = b;
    }
    kb.appendChild(r);
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input')) return;
    const k = norm(e.key);
    if (k.length === 1 && keys[k]) guess(k);
  });

  function render() {
    const done = phase === 'over';
    $('word').innerHTML = pattern.map((ch, i) => `<span class="hg-letter ${ch ? 'shown' : ''} ${done && !ch ? 'missed' : ''}">${ch || (done && oppWord ? oppWord[i] : '')}</span>`).join('');
    parts.forEach((p, k) => p.classList.toggle('on', k < mistakes));
    oppParts.forEach((p, k) => p.classList.toggle('on', k < opp.mistakes));
    for (const ch in keys) {
      keys[ch].className = 'hg-key' + (guessed.has(ch) ? (pattern.includes(ch) ? ' hit' : ' miss') : '');
      keys[ch].disabled = phase !== 'play' || guessed.has(ch) || !!pending || solvedAt > 0 || mistakes >= MAX;
    }
    $('opp-word').innerHTML = myWord ? [...myWord].map((ch, i) => `<span class="${opp.open[i] ? 'on' : ''}">${ch}</span>`).join('') : '';
    $('opp-title').textContent = oppName() + ' отгадывает ваше слово · ошибок ' + opp.mistakes + '/' + MAX;
    $('my-title').textContent = 'Слово соперника · ошибок ' + mistakes + '/' + MAX;
    $('setup').hidden = phase !== 'setup' || !!myWord;
    $('score-me').textContent = wins.me;
    $('score-opp').textContent = wins.opp;
    $('label-opp').textContent = oppName();
    if (phase === 'setup') statusEl.textContent = !myWord ? 'Загадайте слово для соперника' : 'Ждём, пока ' + oppName().toLowerCase() + ' загадает слово…';
    else if (phase === 'play') {
      if (solvedAt) statusEl.textContent = 'Отгадано! Ждём соперника…';
      else if (mistakes >= MAX) statusEl.textContent = 'Вы повешены… Ждём соперника.';
      else statusEl.textContent = 'Отгадывайте слово соперника — быстрее и без ошибок!';
    }
  }

  function newGame() {
    clearTimeout(aiTimer);
    phase = 'setup';
    myWord = '';
    oppLen = 0;
    pattern = [];
    guessed = new Set();
    mistakes = 0;
    solvedAt = 0;
    pending = '';
    oppWord = '';
    opp = { open: [], mistakes: 0, solved: false, time: 0, letters: new Set() };
    oppReady = false;
    $('word-in').value = '';
    $('word-err').textContent = '';
    if (mode === 'ai') {
      aiWord = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      oppReady = true;
      oppLen = aiWord.length;
    }
    render();
  }

  function setWord(w) {
    w = norm(w);
    if (!/^[а-я]{4,12}$/.test(w)) return ($('word-err').textContent = 'Нужно слово из 4–12 русских букв');
    if (!DICT.has(w)) return ($('word-err').textContent = 'Такого существительного нет в словаре');
    $('word-err').textContent = '';
    myWord = w;
    opp.open = new Array(w.length).fill(false);
    if (mode === 'net') net.send({ t: 'ready', len: w.length });
    SG.sound.play('click');
    maybeStart();
  }

  function maybeStart() {
    if (!myWord || !oppReady) return render();
    phase = 'play';
    pattern = new Array(oppLen).fill('');
    started = Date.now();
    render();
    if (mode === 'ai') aiStep();
  }

  function guess(ch) {
    if (phase !== 'play' || guessed.has(ch) || pending || solvedAt || mistakes >= MAX) return;
    guessed.add(ch);
    if (mode === 'ai') {
      const pos = [];
      [...aiWord].forEach((c, i) => c === ch && pos.push(i));
      gotPositions(ch, pos);
    } else {
      pending = ch;
      net.send({ t: 'l', ch });
      render();
    }
  }

  function gotPositions(ch, pos) {
    pending = '';
    if (!pos.length) {
      mistakes++;
      SG.sound.play('error');
    } else {
      pos.forEach((i) => (pattern[i] = ch));
      SG.sound.play('coin');
    }
    if (pattern.every(Boolean)) solvedAt = Date.now() - started;
    if (solvedAt || mistakes >= MAX) {
      if (mode === 'net') net.send({ t: 'done', solved: !!solvedAt, mistakes, time: solvedAt || Date.now() - started });
    }
    decide();
    render();
  }

  // соперник угадывает букву в моём слове
  function oppGuess(ch) {
    if (opp.letters.has(ch)) return [];
    opp.letters.add(ch);
    const pos = [];
    [...myWord].forEach((c, i) => {
      if (c === ch) {
        pos.push(i);
        opp.open[i] = true;
      }
    });
    if (!pos.length) opp.mistakes++;
    if (opp.open.every(Boolean)) {
      opp.solved = true;
      opp.time = Date.now() - started;
    }
    render();
    return pos;
  }

  // кто лучше: отгадал с меньшим числом ошибок (при равенстве — быстрее)
  const known = (solved, m) => (solved ? m : m >= MAX ? MAX + 1 : null);
  function decide() {
    if (phase !== 'play') return;
    const a = known(!!solvedAt, mistakes);
    const b = known(opp.solved, opp.mistakes);
    if (a === null || b === null) return;
    let res;
    if (a === MAX + 1 && b === MAX + 1) res = 'draw';
    else if (a !== b) res = a < b ? 'win' : 'lose';
    else res = (solvedAt || Infinity) <= (opp.time || Infinity) ? 'win' : 'lose';
    phase = 'over';
    clearTimeout(aiTimer);
    if (res === 'win') {
      wins.me++;
      SG.store.set('hangduel-wins', SG.store.get('hangduel-wins', 0) + 1);
    }
    if (res === 'lose') wins.opp++;
    if (mode === 'net') {
      net.result(res);
      net.send({ t: 'reveal', w: myWord });
    }
    if (mode === 'ai') oppWord = aiWord;
    SG.sound.play(res);
    render();
    statusEl.textContent = res === 'win' ? 'Вы победили! 🎉' : res === 'lose' ? oppName() + ' оказался лучше.' : 'Оба повешены — ничья.';
  }

  // ---------- компьютер отгадывает ----------
  function aiStep() {
    if (phase !== 'play' || opp.solved || opp.mistakes >= MAX) return;
    const delay = { easy: 3500, normal: 2600, hard: 1800 }[level] * (0.7 + Math.random() * 0.6);
    aiTimer = setTimeout(() => {
      const ch = aiPick();
      const pos = oppGuess(ch);
      SG.sound.play(pos.length ? 'tick' : 'flip');
      decide();
      aiStep();
    }, delay);
  }
  function aiPick() {
    const len = myWord.length;
    const known = opp.open.map((o, i) => (o ? myWord[i] : ''));
    const cands = NOUNS.filter((w) => w.length === len && [...w].every((c, i) => (known[i] ? c === known[i] : !opp.letters.has(c))));
    const freq = {};
    for (const w of cands) for (const c of new Set(w)) if (!opp.letters.has(c)) freq[c] = (freq[c] || 0) + 1;
    let letters = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    if (!letters.length || (level === 'easy' && Math.random() < 0.35)) letters = [...'оеаинтсрвлкмдпуяыьгзбчйхжшюцщэфъ'].filter((c) => !opp.letters.has(c));
    return level === 'easy' && Math.random() < 0.3 ? letters[Math.min(letters.length - 1, 1 + Math.floor(Math.random() * 3))] : letters[0];
  }

  // ---------- сеть ----------
  const net = SG.net.setup({
    game: 'hangduel',
    modeEl: $('mode'),
    onRematch: () => $('new-btn').click(),
    // зрители не видят слово, загаданное хозяином
    mirrorMask: (el) => {
      el.querySelectorAll('#opp-word span:not(.on)').forEach((x) => (x.textContent = '•'));
      el.querySelectorAll('#setup').forEach((x) => x.remove());
    },
    onConnect() {
      mode = 'net';
      diffEl.style.display = 'none';
      wins.me = wins.opp = 0;
      net.info('загадайте друг другу слова');
      newGame();
    },
    onMessage(msg) {
      if (msg.t === 'ready' && msg.len >= 4 && msg.len <= 12) {
        oppReady = true;
        oppLen = msg.len;
        maybeStart();
      } else if (msg.t === 'l' && phase === 'play' && typeof msg.ch === 'string' && msg.ch.length === 1) {
        net.send({ t: 'lr', ch: msg.ch, pos: oppGuess(msg.ch) });
      } else if (msg.t === 'lr' && pending && msg.ch === pending && Array.isArray(msg.pos)) {
        gotPositions(msg.ch, msg.pos.filter((i) => Number.isInteger(i) && i >= 0 && i < oppLen));
      } else if (msg.t === 'done') {
        opp.solved = !!msg.solved;
        opp.mistakes = msg.mistakes | 0;
        opp.time = +msg.time || 0;
        decide();
        render();
      } else if (msg.t === 'reveal' && typeof msg.w === 'string') {
        oppWord = norm(msg.w).slice(0, 12);
        render();
      } else if (msg.t === 'new') newGame();
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        diffEl.style.display = '';
        wins.me = wins.opp = 0;
        newGame();
      } else {
        phase = 'over';
        statusEl.textContent = 'Нет соединения с соперником';
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), 'ai', () => {
    mode = 'ai';
    diffEl.style.display = '';
    wins.me = wins.opp = 0;
    newGame();
  });
  SG.segmented(diffEl, level, (v) => {
    level = v;
    SG.store.set('hangduel-diff', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (!net.active) return;
      net.send({ t: 'new' });
    }
    newGame();
  });
  $('word-btn').addEventListener('click', () => setWord($('word-in').value));
  $('word-in').addEventListener('keydown', (e) => e.key === 'Enter' && setWord($('word-in').value));
  $('word-random').addEventListener('click', () => setWord(NOUNS[Math.floor(Math.random() * NOUNS.length)]));

  newGame();
})();
