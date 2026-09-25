/* Быки и коровы: отгадайте четырёхзначное число соперника раньше, чем он ваше */
(() => {
  'use strict';

  const LEN = 4;
  const ALL = [];
  for (let n = 0; n < 10000; n++) {
    const s = String(n).padStart(LEN, '0');
    if (new Set(s).size === LEN) ALL.push(s);
  }
  const valid = (s) => /^\d{4}$/.test(s) && new Set(s).size === LEN;
  function score(secret, guess) {
    let b = 0;
    let c = 0;
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === secret[i]) b++;
      else if (secret.includes(guess[i])) c++;
    }
    return { b, c };
  }

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const input = $('guess');
  const secretIn = $('secret');
  const diffEl = $('difficulty');

  let mode = 'ai';
  let level = SG.store.get('bulls-diff', 'normal');
  let mySecret = '';
  let oppReady = false;
  let phase = 'setup'; // setup | play | over
  let myTurn = false;
  let firstMe = true;
  let mine = []; // мои попытки { g, b, c }
  let theirs = []; // попытки соперника по моему числу
  let waiting = false; // ждём ответа на свою попытку
  let aiSecret = '';
  let aiCands = [];
  let aiTimer = 0;
  const wins = { me: 0, opp: 0 };

  const oppName = () => (mode === 'net' ? 'Соперник' : 'Компьютер');

  function render() {
    const row = (x) => `<li><b>${x.g}</b><span class="bl">${x.b} Б</span><span class="cw">${x.c} К</span></li>`;
    $('mine').innerHTML = mine.map(row).join('') || '<li class="empty">Попыток пока нет</li>';
    $('theirs').innerHTML = theirs.map(row).join('') || '<li class="empty">Попыток пока нет</li>';
    $('opp-title').textContent = oppName() + ' угадывает ваше число';
    $('my-secret').textContent = mySecret || '????';
    $('setup').hidden = phase !== 'setup' || !!mySecret;
    $('play').hidden = phase === 'setup' && !mySecret ? true : false;
    input.disabled = !(phase === 'play' && myTurn && !waiting);
    $('go').disabled = input.disabled;
    $('score-me').textContent = wins.me;
    $('score-opp').textContent = wins.opp;
    $('label-opp').textContent = oppName();
    if (phase === 'setup') statusEl.textContent = !mySecret ? 'Загадайте число из четырёх разных цифр' : 'Ждём, пока ' + oppName().toLowerCase() + ' загадает число…';
    else if (phase === 'play') statusEl.textContent = myTurn ? (waiting ? 'Проверяем…' : 'Ваш ход — назовите число') : 'Ход: ' + oppName().toLowerCase() + '…';
  }

  // ---------- партия ----------

  function newGame(first) {
    clearTimeout(aiTimer);
    phase = 'setup';
    mySecret = '';
    oppReady = false;
    mine = [];
    theirs = [];
    waiting = false;
    firstMe = first;
    secretIn.value = '';
    input.value = '';
    if (mode === 'ai') {
      aiSecret = ALL[Math.floor(Math.random() * ALL.length)];
      aiCands = ALL.slice();
      oppReady = true;
    }
    render();
  }

  function setSecret() {
    const v = secretIn.value.trim();
    if (!valid(v)) {
      SG.sound.play('error');
      $('secret-err').textContent = 'Нужно 4 разные цифры';
      return;
    }
    $('secret-err').textContent = '';
    mySecret = v;
    SG.sound.play('click');
    if (mode === 'net') net.send({ t: 'ready' });
    maybeStart();
  }

  function maybeStart() {
    if (!mySecret || !oppReady) return render();
    phase = 'play';
    myTurn = firstMe;
    render();
    if (!myTurn) opponentTurn();
    else if (matchMedia('(hover: hover)').matches) input.focus();
  }

  function submit() {
    if (phase !== 'play' || !myTurn || waiting) return;
    const g = input.value.trim();
    if (!valid(g)) {
      SG.sound.play('error');
      return;
    }
    input.value = '';
    if (mode === 'ai') gotReply(g, score(aiSecret, g));
    else {
      waiting = true;
      net.send({ t: 'g', n: mine.length, g });
      render();
    }
  }

  function gotReply(g, r) {
    waiting = false;
    mine.push({ g, b: r.b, c: r.c });
    SG.sound.play(r.b === LEN ? 'win' : r.b ? 'coin' : 'tick');
    myTurn = false;
    check();
    if (phase === 'play') opponentTurn();
    render();
  }

  // ход соперника: у компьютера — сразу, по сети — ждём его попытку
  function opponentTurn() {
    render();
    if (mode !== 'ai') return;
    aiTimer = setTimeout(() => {
      const g = aiGuess();
      answer(g);
    }, 900);
  }

  // соперник назвал число — отвечаем
  function answer(g) {
    const r = score(mySecret, g);
    theirs.push({ g, b: r.b, c: r.c });
    if (mode === 'net') net.send({ t: 'r', n: theirs.length - 1, g, b: r.b, c: r.c });
    if (mode === 'ai') aiCands = aiCands.filter((x) => {
      const t = score(x, g);
      return t.b === r.b && t.c === r.c;
    });
    SG.sound.play('flip');
    myTurn = true;
    check();
    render();
  }

  // конец: кто-то угадал. Если угадал начинавший, у второго есть ещё попытка, чтобы сравнять
  function check() {
    const iWon = mine.some((x) => x.b === LEN);
    const theyWon = theirs.some((x) => x.b === LEN);
    if (!iWon && !theyWon) return;
    const equal = mine.length === theirs.length;
    if (!equal && !(iWon && theyWon)) {
      // у второго игрока ещё есть ход — ждём его
      const secondIsMe = !firstMe;
      if ((theyWon && secondIsMe && mine.length < theirs.length) || (iWon && !secondIsMe && theirs.length < mine.length)) return;
    }
    finish(iWon && theyWon ? 'draw' : iWon ? 'win' : 'lose');
  }

  function finish(res) {
    phase = 'over';
    clearTimeout(aiTimer);
    if (res === 'win') {
      wins.me++;
      SG.store.set('bulls-wins', SG.store.get('bulls-wins', 0) + 1);
    }
    if (res === 'lose') wins.opp++;
    if (mode === 'net') net.result(res);
    SG.sound.play(res);
    render();
    const secret = mode === 'ai' ? aiSecret : oppSecret || '????';
    statusEl.textContent = (res === 'win' ? 'Вы угадали первым! 🎉' : res === 'lose' ? oppName() + ' угадал первым.' : 'Оба угадали — ничья 🤝') + ' Число соперника: ' + secret + '.';
    if (mode === 'net') net.send({ t: 'reveal', s: mySecret });
  }
  let oppSecret = '';

  // ---------- компьютер ----------

  function aiGuess() {
    if (!aiCands.length) aiCands = ALL.slice();
    if (level === 'easy' && Math.random() < 0.35) return ALL[Math.floor(Math.random() * ALL.length)];
    if (level === 'hard' && aiCands.length > 1 && aiCands.length < 400) {
      // выбираем попытку, после которой в худшем случае останется меньше вариантов
      let best = aiCands[0];
      let bestWorst = Infinity;
      const pool = aiCands.length < 60 ? ALL : aiCands;
      for (const g of pool) {
        const buckets = {};
        let worst = 0;
        for (const x of aiCands) {
          const r = score(x, g);
          const k = r.b * 10 + r.c;
          buckets[k] = (buckets[k] || 0) + 1;
          if (buckets[k] > worst) worst = buckets[k];
        }
        if (worst < bestWorst || (worst === bestWorst && aiCands.includes(g))) {
          bestWorst = worst;
          best = g;
        }
      }
      return best;
    }
    return aiCands[Math.floor(Math.random() * aiCands.length)];
  }

  // ---------- сеть ----------

  const net = SG.net.setup({
    game: 'bulls',
    modeEl: $('mode'),
    onRematch: () => $('new-btn').click(),
    // зрителям не показываем загаданное число хозяина
    mirrorMask: (el) => {
      el.querySelectorAll('#my-secret').forEach((x) => (x.textContent = '????'));
      el.querySelectorAll('#setup').forEach((x) => x.remove());
    },
    onConnect(role) {
      mode = 'net';
      diffEl.style.display = 'none';
      wins.me = wins.opp = 0;
      net.info('загадайте число и угадывайте по очереди');
      newGame(role === 'host');
    },
    onMessage(msg) {
      if (msg.t === 'ready') {
        oppReady = true;
        maybeStart();
      } else if (msg.t === 'g' && phase === 'play' && !myTurn && typeof msg.g === 'string' && valid(msg.g) && msg.n === theirs.length) answer(msg.g);
      else if (msg.t === 'r' && waiting && msg.n === mine.length && typeof msg.g === 'string') gotReply(msg.g, { b: msg.b | 0, c: msg.c | 0 });
      else if (msg.t === 'reveal' && typeof msg.s === 'string') {
        oppSecret = msg.s;
        if (phase === 'over') statusEl.textContent = statusEl.textContent.replace('????', msg.s);
      } else if (msg.t === 'new') {
        oppSecret = '';
        newGame(msg.first === 'you');
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        diffEl.style.display = '';
        wins.me = wins.opp = 0;
        newGame(true);
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
    newGame(true);
  });
  SG.segmented(diffEl, level, (v) => {
    level = v;
    SG.store.set('bulls-diff', v);
    newGame(true);
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (!net.active) return;
      oppSecret = '';
      // в новой партии начинает другой
      net.send({ t: 'new', first: firstMe ? 'you' : 'me' });
      newGame(!firstMe);
    } else newGame(!firstMe || true);
  });
  $('secret-btn').addEventListener('click', setSecret);
  $('random-btn').addEventListener('click', () => {
    secretIn.value = ALL[Math.floor(Math.random() * ALL.length)];
    setSecret();
  });
  secretIn.addEventListener('keydown', (e) => e.key === 'Enter' && setSecret());
  $('go').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  // экранные цифры для телефона
  $('pad').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const target = phase === 'setup' && !mySecret ? secretIn : input;
    if (b.dataset.k === 'del') target.value = target.value.slice(0, -1);
    else if (b.dataset.k === 'ok') (target === secretIn ? setSecret : submit)();
    else if (target.value.length < LEN) target.value += b.dataset.k;
  });

  newGame(true);
})();
