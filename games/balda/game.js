/* Балда: игрок против компьютера на поле 5×5 */
(() => {
  'use strict';

  const N = 5;
  const LETTERS = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';
  const MAX_SKIPS = 4; // по два пропуска подряд у каждого — конец игры

  // ---------- словари ----------

  const DICT = new Set();
  (() => {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    let prev = '';
    window.BALDA_DICT_PACKED.split(' ').forEach((token) => {
      const w = prev.slice(0, digits.indexOf(token[0])) + token.slice(1);
      DICT.add(w);
      prev = w;
    });
  })();
  const AI_WORDS = window.BALDA_AI;
  const TRIE = {};
  AI_WORDS.forEach((w) => {
    let node = TRIE;
    for (const ch of w) node = node[ch] || (node[ch] = {});
    node.$ = true;
  });
  const START_WORDS = AI_WORDS.filter((w) => w.length === N);

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const kbEl = $('keyboard');
  const statusEl = $('status');
  const wordEl = $('word');

  let difficulty = SG.store.get('balda-diff', 'normal');
  let grid, used, scores, words, turn, skips, over, firstPlayer = 'ai';
  // в сетевой игре соперник занимает место компьютера («ai»)
  let mode = 'ai';
  const OPP = () => (mode === 'net' ? 'Соперник' : 'Компьютер');
  let pendingCell = -1; // куда игрок поставил новую букву
  let pendingLetter = '';
  let path = [];

  const neighbors = (i) => {
    const r = Math.floor(i / N);
    const c = i % N;
    const out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  };

  const canPlace = (i) => !grid[i] && neighbors(i).some((n) => grid[n]);

  // ---------- поле ----------

  const cellEls = [];
  for (let i = 0; i < N * N; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bd-cell';
    el.addEventListener('click', () => onCell(i));
    boardEl.appendChild(el);
    cellEls.push(el);
  }

  [...LETTERS].forEach((ch) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bd-key';
    b.textContent = ch;
    b.addEventListener('click', () => chooseLetter(ch));
    kbEl.appendChild(b);
  });

  function render() {
    cellEls.forEach((el, i) => {
      const ch = i === pendingCell ? pendingLetter : grid[i];
      el.textContent = ch || '';
      el.classList.toggle('filled', !!grid[i]);
      el.classList.toggle('pending', i === pendingCell);
      el.classList.toggle('placeable', turn === 'me' && !over && pendingCell < 0 && canPlace(i));
      el.classList.toggle('in-path', path.includes(i));
      el.dataset.order = path.includes(i) ? path.indexOf(i) + 1 : '';
    });
    kbEl.hidden = !(turn === 'me' && pendingCell >= 0 && !pendingLetter);
    wordEl.textContent = path.map((i) => (i === pendingCell ? pendingLetter : grid[i])).join('').toUpperCase();
    $('score-me').textContent = scores.me;
    $('score-ai').textContent = scores.ai;
    $('words-me').innerHTML = words.me.map((w) => `<li>${w} <b>${w.length}</b></li>`).join('');
    $('words-ai').innerHTML = words.ai.map((w) => `<li>${w} <b>${w.length}</b></li>`).join('');
    $('submit-btn').disabled = !(turn === 'me' && pendingLetter && path.length >= 2);
    $('cancel-btn').disabled = !(turn === 'me' && pendingCell >= 0);
    $('skip-btn').disabled = turn !== 'me' || over;
  }

  // ---------- ход игрока ----------

  function onCell(i) {
    if (turn !== 'me' || over) return;
    if (pendingCell < 0) {
      if (!canPlace(i)) return;
      pendingCell = i;
      SG.sound.play('click');
      statusEl.textContent = 'Выберите букву.';
      render();
      return;
    }
    if (!pendingLetter) {
      if (canPlace(i)) {
        pendingCell = i;
        render();
      }
      return;
    }
    // собираем слово: клетки по порядку, каждая следующая — соседняя
    const hasLetter = grid[i] || i === pendingCell;
    if (!hasLetter) return;
    if (path.length && path[path.length - 1] === i) {
      path.pop();
    } else if (!path.includes(i) && (!path.length || neighbors(path[path.length - 1]).includes(i))) {
      path.push(i);
      SG.sound.play('key');
    } else if (path.includes(i)) {
      path = path.slice(0, path.indexOf(i) + 1);
    }
    render();
  }

  function chooseLetter(ch) {
    if (pendingCell < 0 || pendingLetter) return;
    pendingLetter = ch;
    path = [];
    SG.sound.play('place');
    statusEl.textContent = 'Составьте слово: кликайте по буквам по порядку (новая буква обязательна), затем «Готово».';
    render();
  }

  function submit() {
    if (turn !== 'me' || !pendingLetter) return;
    const word = path.map((i) => (i === pendingCell ? pendingLetter : grid[i])).join('');
    let err = '';
    if (!path.includes(pendingCell)) err = 'В слове должна быть новая буква.';
    else if (used.has(word)) err = 'Это слово уже было.';
    else if (!DICT.has(word)) err = 'Слова «' + word + '» нет в словаре.';
    if (err) {
      statusEl.textContent = err;
      SG.sound.play('error');
      boardEl.classList.remove('shake');
      void boardEl.offsetWidth;
      boardEl.classList.add('shake');
      return;
    }
    if (mode === 'net') net.send({ t: 'word', cell: pendingCell, letter: pendingLetter, word, path });
    commit('me', pendingCell, pendingLetter, word);
  }

  function cancel() {
    if (turn !== 'me') return;
    pendingCell = -1;
    pendingLetter = '';
    path = [];
    statusEl.textContent = 'Ваш ход: выберите пустую клетку рядом с буквами.';
    render();
  }

  function skip() {
    if (turn !== 'me' || over) return;
    cancel();
    if (mode === 'net') net.send({ t: 'skip' });
    turn = null;
    skips++;
    SG.sound.play('slide');
    nextTurn('ai');
  }

  function commit(who, cell, letter, word) {
    grid[cell] = letter;
    used.add(word);
    scores[who] += word.length;
    words[who].push(word);
    skips = 0;
    pendingCell = -1;
    pendingLetter = '';
    path = [];
    SG.sound.play(who === 'me' ? 'match' : 'place', 5);
    cellEls[cell].classList.remove('new');
    void cellEls[cell].offsetWidth;
    cellEls[cell].classList.add('new');
    nextTurn(who === 'me' ? 'ai' : 'me');
  }

  function nextTurn(who) {
    if (grid.every(Boolean) || skips >= MAX_SKIPS) return finish();
    turn = who;
    render();
    if (who === 'ai' && mode === 'net') {
      statusEl.textContent = net.active ? 'Соперник думает…' : 'Нет соединения с соперником';
    } else if (who === 'ai') {
      statusEl.textContent = 'Компьютер думает…';
      setTimeout(aiMove, 600);
    } else {
      statusEl.textContent = 'Ваш ход: выберите пустую клетку рядом с буквами.';
    }
  }

  // ---------- ИИ ----------

  function aiCandidates() {
    const found = [];
    for (let e = 0; e < N * N; e++) {
      if (!canPlace(e)) continue;
      const visit = (cell, node, trail, letter) => {
        const choices = cell === e ? (letter ? [letter] : Object.keys(node).filter((k) => k !== '$')) : [grid[cell]];
        for (const ch of choices) {
          const child = node[ch];
          if (!child) continue;
          const nextLetter = cell === e ? ch : letter;
          trail.push(cell);
          const hasE = cell === e || letter;
          if (child.$ && hasE && trail.length >= 3) {
            const word = trail.map((i) => (i === e ? nextLetter : grid[i])).join('');
            if (!used.has(word)) found.push({ cell: e, letter: nextLetter, word, path: trail.slice() });
          }
          for (const n of neighbors(cell)) {
            if (trail.includes(n)) continue;
            if (n === e || grid[n]) visit(n, child, trail, nextLetter);
          }
          trail.pop();
        }
      };
      for (let s = 0; s < N * N; s++) if (grid[s] || s === e) visit(s, TRIE, [], '');
    }
    return found;
  }

  function aiMove() {
    if (over || mode !== 'ai') return;
    const list = aiCandidates();
    if (!list.length) {
      skips++;
      statusEl.textContent = 'Компьютер пропускает ход.';
      setTimeout(() => mode === 'ai' && nextTurn('me'), 900);
      return;
    }
    list.sort((a, b) => b.word.length - a.word.length);
    let pick;
    if (difficulty === 'hard') {
      const bestLen = list[0].word.length;
      const top = list.filter((x) => x.word.length === bestLen);
      pick = top[Math.floor(Math.random() * top.length)];
    } else if (difficulty === 'normal') {
      const half = list.slice(0, Math.max(1, Math.ceil(list.length / 3)));
      pick = half[Math.floor(Math.random() * half.length)];
    } else {
      const short = list.filter((x) => x.word.length <= 4);
      const pool = short.length ? short : list.slice(-5);
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    // показываем слово компьютера на поле
    path = pick.path;
    pendingCell = pick.cell;
    pendingLetter = pick.letter;
    render();
    statusEl.textContent = 'Компьютер: «' + pick.word + '» (+' + pick.word.length + ')';
    setTimeout(() => {
      if (mode !== 'ai') return;
      const msg = statusEl.textContent;
      commit('ai', pick.cell, pick.letter, pick.word);
      if (!over) statusEl.textContent = msg + '. Ваш ход.';
    }, 1100);
  }

  // ---------- конец ----------

  function finish() {
    over = true;
    turn = null;
    render();
    const me = scores.me;
    const ai = scores.ai;
    if (mode === 'net') net.result(me > ai ? 'win' : me < ai ? 'lose' : 'draw');
    $('label-ai').textContent = OPP();
    if (me > ai) {
      statusEl.textContent = 'Вы победили ' + me + ':' + ai + '! 🎉';
      SG.store.set('balda-wins', SG.store.get('balda-wins', 0) + 1);
      SG.sound.play('win');
    } else if (me < ai) {
      statusEl.textContent = OPP() + ' победил ' + ai + ':' + me + (mode === 'net' ? '' : ' 🤖');
      SG.sound.play('lose');
    } else {
      statusEl.textContent = 'Ничья ' + me + ':' + ai + ' 🤝';
      SG.sound.play('draw');
    }
  }

  function newGame(net_) {
    grid = Array(N * N).fill('');
    let start = START_WORDS[Math.floor(Math.random() * START_WORDS.length)];
    if (net_) {
      start = net_.start;
      firstPlayer = net_.first === 'me' ? 'ai' : 'me'; // ниже переключится обратно
    }
    [...start].forEach((ch, k) => (grid[2 * N + k] = ch));
    used = new Set([start]);
    scores = { me: 0, ai: 0 };
    words = { me: [], ai: [] };
    skips = 0;
    over = false;
    pendingCell = -1;
    pendingLetter = '';
    path = [];
    firstPlayer = firstPlayer === 'me' ? 'ai' : 'me';
    $('label-ai').textContent = OPP();
    // сопернику сообщаем стартовое слово и кто ходит первым — с его стороны
    if (mode === 'net' && !net_) net.send({ t: 'new', start, first: firstPlayer === 'me' ? 'ai' : 'me' });
    nextTurn(firstPlayer);
  }

  // ---------- ввод ----------

  $('submit-btn').addEventListener('click', submit);
  $('cancel-btn').addEventListener('click', cancel);
  $('skip-btn').addEventListener('click', skip);
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net' && !net.active) return;
    newGame();
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase().replace('ё', 'е');
    if (LETTERS.includes(k) && k.length === 1 && pendingCell >= 0 && !pendingLetter) chooseLetter(k);
    else if (e.key === 'Enter' && pendingLetter) submit();
    else if (e.key === 'Escape') cancel();
  });
  // ---------- игра по сети ----------

  const net = SG.net.setup({
    game: 'balda',
    onRematch: () => $('new-btn').click(),
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      $('difficulty').style.display = 'none';
      net.info('вы против друга');
      if (role === 'host') newGame();
      else {
        turn = null;
        render();
        statusEl.textContent = 'Соперник начинает игру…';
      }
    },
    onMessage(msg) {
      if (msg.t === 'new' && START_WORDS.includes(msg.start)) return newGame({ start: msg.start, first: msg.first });
      if (turn !== 'ai' || over) return;
      if (msg.t === 'skip') {
        skips++;
        statusEl.textContent = 'Соперник пропускает ход.';
        nextTurn('me');
        if (!over) statusEl.textContent = 'Соперник пропустил ход. Ваш ход.';
      } else if (msg.t === 'word' && Array.isArray(msg.path) && canPlace(msg.cell) && DICT.has(msg.word) && !used.has(msg.word)) {
        path = msg.path;
        pendingCell = msg.cell;
        pendingLetter = msg.letter;
        render();
        const text = 'Соперник: «' + msg.word + '» (+' + msg.word.length + ')';
        statusEl.textContent = text;
        commit('ai', msg.cell, msg.letter, msg.word);
        if (!over) statusEl.textContent = text + '. Ваш ход.';
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        $('difficulty').style.display = '';
        newGame();
      } else {
        turn = null;
        render();
        statusEl.textContent = 'Нет соединения с соперником';
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), 'ai', () => {
    if (mode !== 'ai') {
      mode = 'ai';
      $('difficulty').style.display = '';
      newGame();
    }
  });

  SG.segmented($('difficulty'), difficulty, (v) => {
    difficulty = v;
    SG.store.set('balda-diff', v);
  });

  newGame();
})();
