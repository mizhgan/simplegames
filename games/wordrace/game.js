/* Слова из слова: дуэль — одно длинное слово на двоих, три минуты, кто наберёт больше очков */
(() => {
  'use strict';

  const DICT = [];
  (() => {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    let prev = '';
    window.BALDA_DICT_PACKED.split(' ').forEach((token) => {
      const w = prev.slice(0, digits.indexOf(token[0])) + token.slice(1);
      DICT.push(w);
      prev = w;
    });
  })();
  const COMMON = new Set(window.BALDA_AI);
  const BASES = window.BALDA_AI.filter((w) => w.length >= 8 && w.length <= 11 && new Set(w).size >= 6);
  const TIME = 180;
  // пауза между словами компьютера (секунды) и доля «редких» слов, которые он знает
  const AI = { easy: { every: 11, rare: 0 }, normal: { every: 7, rare: 0.15 }, hard: { every: 4.5, rare: 0.4 } };

  const $ = (id) => document.getElementById(id);
  const tilesEl = $('tiles');
  const inputEl = $('input');
  const statusEl = $('status');
  const listEl = $('found');
  const diffEl = $('difficulty');

  let mode = 'ai';
  let level = SG.store.get('wordrace-diff', 'normal');
  let base = '';
  let order = [];
  let all = [];
  let found = [];
  let picked = [];
  let opp = { count: 0, score: 0, words: null };
  let mineSent = false;
  let started = 0;
  let over = true;
  let clock = 0;
  let aiTimer = 0;
  let aiPool = [];
  const wins = { me: 0, opp: 0 };

  const score = (list) => list.reduce((s, w) => s + w.length, 0);

  function subwords(b) {
    const have = {};
    for (const ch of b) have[ch] = (have[ch] || 0) + 1;
    return DICT.filter((w) => {
      if (w.length < 3 || w.length >= b.length) return false;
      const need = {};
      for (const ch of w) {
        need[ch] = (need[ch] || 0) + 1;
        if (need[ch] > (have[ch] || 0)) return false;
      }
      return true;
    });
  }

  function pickBase() {
    for (;;) {
      const b = BASES[Math.floor(Math.random() * BASES.length)];
      if (subwords(b).filter((w) => COMMON.has(w)).length >= 18) return b;
    }
  }

  // ---------- отрисовка ----------

  const oppName = () => (mode === 'net' ? 'Соперник' : 'Компьютер');

  function groups(list, cls, mark) {
    const byLen = {};
    list.slice().sort().forEach((w) => (byLen[w.length] = byLen[w.length] || []).push(w));
    return Object.keys(byLen)
      .sort((a, b) => b - a)
      .map((L) => `<div class="ws-group ${cls}"><b>${L} букв</b>${byLen[L].map((w) => `<span class="${mark && mark.has(w) ? 'both' : ''}">${w}</span>`).join('')}</div>`)
      .join('');
  }

  function render() {
    tilesEl.innerHTML = order.map((i) => `<button type="button" class="ws-tile ${picked.includes(i) ? 'used' : ''}" data-i="${i}" ${over ? 'disabled' : ''}>${base[i]}</button>`).join('');
    inputEl.textContent = picked.map((i) => base[i]).join('').toUpperCase() || ' ';
    $('my-count').textContent = found.length + ' сл. · ' + score(found);
    $('opp-count').textContent = opp.count + ' сл. · ' + opp.score;
    $('opp-label').textContent = oppName();
    if (over && opp.words) {
      const mine = new Set(found);
      const theirs = new Set(opp.words);
      listEl.innerHTML =
        `<h3>Ваши слова</h3>${groups(found, '', theirs) || '<p class="wr-none">—</p>'}` +
        `<h3>${oppName()}</h3>${groups(opp.words, '', mine) || '<p class="wr-none">—</p>'}` +
        `<p class="wr-note">Подчёркнутые слова нашли оба.</p>`;
    } else listEl.innerHTML = groups(found, '');
  }

  function renderScore() {
    $('score-me').textContent = wins.me;
    $('score-opp').textContent = wins.opp;
    $('label-opp').textContent = oppName();
  }

  function tick() {
    if (over || !started) return;
    const left = Math.max(0, TIME - Math.floor((Date.now() - started) / 1000));
    $('time').textContent = SG.formatTime(left);
    $('time').classList.toggle('low', left <= 15);
    if (left <= 0) finish();
  }

  // ---------- ввод ----------

  function pick(i) {
    if (over || picked.includes(i)) return;
    picked.push(i);
    SG.sound.play('key');
    render();
  }

  function submit() {
    if (over) return;
    const w = picked.map((i) => base[i]).join('');
    picked = [];
    let msg;
    if (w.length < 3) msg = 'Нужно хотя бы 3 буквы.';
    else if (found.includes(w)) msg = 'Слово «' + w + '» уже есть.';
    else if (!all.includes(w)) msg = 'Слова «' + w + '» нет в словаре.';
    if (msg) {
      statusEl.textContent = msg;
      SG.sound.play('error');
      inputEl.classList.remove('shake');
      void inputEl.offsetWidth;
      inputEl.classList.add('shake');
      render();
      return;
    }
    found.push(w);
    statusEl.textContent = '+' + w.length + ' — «' + w + '»';
    SG.sound.play('match');
    if (mode === 'net') net.send({ t: 'cnt', n: found.length, s: score(found) });
    render();
  }

  tilesEl.addEventListener('click', (e) => {
    const t = e.target.closest('.ws-tile');
    if (t) pick(Number(t.dataset.i));
  });
  $('submit-btn').addEventListener('click', submit);
  $('back-btn').addEventListener('click', () => {
    picked.pop();
    render();
  });
  $('shuffle-btn').addEventListener('click', () => {
    order = SG.shuffle(order);
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input, textarea'))) return;
    if (e.key === 'Enter') return submit();
    if (e.key === 'Backspace') {
      e.preventDefault();
      picked.pop();
      return render();
    }
    const k = e.key.toLowerCase().replace('ё', 'е');
    if (!/^[а-я]$/.test(k)) return;
    const i = order.find((j) => base[j] === k && !picked.includes(j));
    if (i !== undefined) pick(i);
  });

  // ---------- компьютер ----------

  function aiStep() {
    if (over || mode !== 'ai') return;
    const w = aiPool.shift();
    if (w) {
      opp.words.push(w);
      opp.count++;
      opp.score += w.length;
      render();
    }
    const s = AI[level].every * (0.6 + Math.random() * 0.8) * (w && w.length > 6 ? 1.5 : 1);
    aiTimer = setTimeout(aiStep, s * 1000);
  }

  // ---------- партия ----------

  function start(b) {
    clearTimeout(aiTimer);
    clearInterval(clock);
    base = b;
    all = subwords(b);
    order = SG.shuffle([...b].map((_, i) => i));
    found = [];
    picked = [];
    opp = { count: 0, score: 0, words: mode === 'ai' ? [] : null };
    mineSent = false;
    over = false;
    started = Date.now();
    statusEl.textContent = 'Составляйте слова из букв «' + b.toUpperCase() + '» — у вас 3 минуты.';
    if (mode === 'ai') {
      const cfg = AI[level];
      aiPool = SG.shuffle(all.filter((w) => COMMON.has(w) || Math.random() < cfg.rare));
      // сначала короткие и частые слова — как у человека
      aiPool.sort((x, y) => x.length - y.length + (Math.random() - 0.5) * 4);
      aiTimer = setTimeout(aiStep, AI[level].every * 1000);
    }
    clock = setInterval(tick, 250);
    tick();
    render();
  }

  function waitBase() {
    clearTimeout(aiTimer);
    clearInterval(clock);
    base = '';
    order = [];
    found = [];
    over = true;
    opp = { count: 0, score: 0, words: null };
    statusEl.textContent = 'Ждём слово от соперника…';
    $('time').textContent = SG.formatTime(TIME);
    render();
  }

  function finish() {
    if (over) return;
    over = true;
    picked = [];
    clearInterval(clock);
    clearTimeout(aiTimer);
    $('time').textContent = '0:00';
    SG.sound.play('tick');
    if (mode === 'net' && !mineSent) {
      mineSent = true;
      net.send({ t: 'fin', words: found });
    }
    decide();
  }

  function decide() {
    render();
    if (!over || !opp.words) {
      if (over) statusEl.textContent = 'Время вышло! Ждём список соперника…';
      return;
    }
    const a = score(found);
    const b = score(opp.words);
    const res = a > b ? 'win' : a < b ? 'lose' : 'draw';
    if (res === 'win') wins.me++;
    if (res === 'lose') wins.opp++;
    if (res === 'win') SG.store.set('wordrace-wins', SG.store.get('wordrace-wins', 0) + 1);
    const best = SG.store.get('wordrace-best', 0);
    if (a > best) SG.store.set('wordrace-best', a);
    if (mode === 'net') net.result(res);
    SG.sound.play(res);
    statusEl.textContent =
      (res === 'win' ? 'Вы победили! 🎉' : res === 'lose' ? oppName() + ' набрал больше.' : 'Ничья 🤝') + ' Счёт ' + a + ' : ' + b + '.';
    renderScore();
  }

  function newGame() {
    if (mode === 'net') {
      if (!net.active) return;
      const b = pickBase();
      net.send({ t: 'new', b });
      start(b);
    } else start(pickBase());
  }

  const net = SG.net.setup({
    game: 'wordrace',
    // зрители видят счёт, но не слова, пока идёт время
    mirrorMask: (el) => {
      if (!over) el.querySelectorAll('#found, #input').forEach((k) => (k.innerHTML = ''));
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
      else waitBase();
    },
    onMessage(msg) {
      if (msg.t === 'new' && typeof msg.b === 'string' && BASES.includes(msg.b)) start(msg.b);
      else if (msg.t === 'cnt' && !over) {
        opp.count = +msg.n || 0;
        opp.score = +msg.s || 0;
        render();
      } else if (msg.t === 'fin' && Array.isArray(msg.words) && !opp.words) {
        // проверяем чужие слова тем же словарём
        opp.words = [...new Set(msg.words.filter((w) => typeof w === 'string' && all.includes(w)))];
        opp.count = opp.words.length;
        opp.score = score(opp.words);
        if (over) decide();
        else render();
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
        statusEl.textContent = 'Нет соединения с соперником';
        render();
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
    SG.store.set('wordrace-diff', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    newGame();
  });
  $('stop-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    finish();
  });

  window.__wordrace = { get all() { return all; }, get base() { return base; }, finish, get over() { return over; } };
  renderScore();
  newGame();
})();
