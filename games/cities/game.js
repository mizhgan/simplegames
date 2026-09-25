/* Города: называйте город на последнюю букву предыдущего */
(() => {
  'use strict';

  const TURN_SEC = 60;
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s‐-―-]+/g, '-').trim();
  const CITIES = new Map(window.SG_CITIES.map((c) => [norm(c), c]));
  const SKIP = 'ьъыйё';
  // буква, на которую должен начинаться следующий город
  function lastLetter(name) {
    const n = norm(name).replace(/-/g, '');
    let i = n.length - 1;
    while (i > 0 && SKIP.includes(n[i])) i--;
    return n[i];
  }

  // сколько городов «знает» компьютер
  const KNOW = { easy: 0.25, normal: 0.55, hard: 1 };
  function knows(name, seed, level) {
    let h = seed >>> 0;
    for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 2654435761);
    return ((h >>> 0) % 1000) / 1000 < KNOW[level];
  }

  const create = (seed) => ({ used: [], letter: '', turn: 0, seed, loser: null, why: '' });

  function check(s, text) {
    const key = norm(text);
    if (!key) return 'Напишите название города';
    const city = CITIES.get(key);
    if (!city) return 'Не знаем такого города: «' + text.trim() + '»';
    if (s.letter && key[0] !== s.letter) return 'Нужен город на букву «' + s.letter.toUpperCase() + '»';
    if (s.used.some((u) => norm(u) === key)) return city + ' уже называли';
    return '';
  }

  const legal = (s, m) => !!m && s.loser === null && (m.give ? true : typeof m.c === 'string' && !check(s, m.c));

  function apply(s, m) {
    if (m.give) {
      s.loser = s.turn;
      s.why = m.why || 'give';
      return;
    }
    const city = CITIES.get(norm(m.c));
    s.used.unshift(city);
    s.letter = lastLetter(city);
    s.turn = 1 - s.turn;
  }

  function ai(s, level) {
    const opts = [];
    const used = new Set(s.used.map(norm));
    for (const [key, city] of CITIES) {
      if ((s.letter && key[0] !== s.letter) || used.has(key) || !knows(key, s.seed, level)) continue;
      opts.push(city);
    }
    if (!opts.length) return { give: 1 };
    // на сложном — стараемся оставить сопернику неудобную букву
    if (level === 'hard' && Math.random() < 0.7) {
      const count = {};
      for (const key of CITIES.keys()) if (!used.has(key)) count[key[0]] = (count[key[0]] || 0) + 1;
      opts.sort((a, b) => (count[lastLetter(a)] || 0) - (count[lastLetter(b)] || 0));
      return { c: opts[Math.floor(Math.random() * Math.min(3, opts.length))] };
    }
    return { c: opts[Math.floor(Math.random() * opts.length)] };
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const input = $('city-input');
  const form = $('city-form');
  const errEl = $('city-error');
  const chainEl = $('chain');
  const letterEl = $('letter');
  const timerEl = $('timer');
  const giveBtn = $('give-btn');
  let deadline = 0;
  let timerId = 0;
  let turnKey = '';

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!duel.canMove()) return;
    const err = check(duel.state, input.value);
    if (err) {
      errEl.textContent = err;
      SG.sound.play('error');
      input.select();
      return;
    }
    errEl.textContent = '';
    const text = input.value;
    input.value = '';
    duel.play({ c: text });
  });
  giveBtn.addEventListener('click', () => duel.play({ give: 1 }));
  input.addEventListener('input', () => (errEl.textContent = ''));

  function tick() {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerEl.textContent = left;
    timerEl.classList.toggle('low', left <= 10);
    if (left <= 0) {
      clearInterval(timerId);
      if (duel.canMove()) duel.play({ give: 1, why: 'time' });
    }
  }

  const duel = SG.duel({
    game: 'cities',
    sides: ['Игрок 1', 'Игрок 2'],
    create,
    legal,
    apply,
    over(s) {
      if (s.loser === null) return null;
      const v = duel.view();
      const who = s.loser === v.me ? 'Вы' : duel.mode === 'pvp' ? (s.loser ? 'Игрок 2' : 'Игрок 1') : v.watch ? (s.loser === v.hostSide ? 'Игрок 1' : 'Игрок 2') : duel.mode === 'ai' ? 'Компьютер' : 'Соперник';
      const verb = s.why === 'time' ? 'не успел' + (who === 'Вы' ? 'и' : '') + ' за ' + TURN_SEC + ' секунд' : who === 'Вы' ? 'сдались' : 'сдался';
      return { winner: 1 - s.loser, text: who + ' ' + verb + '. Цепочка: ' + s.used.length + '.' };
    },
    hint: (s) => (s.letter ? 'город на «' + s.letter.toUpperCase() + '»' : 'назовите любой город'),
    ai,
    aiDelay: 1400,
    sound: (s, m) => (m.give ? 'lose' : 'coin'),
    render(s, v) {
      letterEl.textContent = s.letter ? s.letter.toUpperCase() : '?';
      chainEl.innerHTML = s.used
        .slice(0, 40)
        .map((c, k) => `<li class="${k === 0 ? 'new' : ''}">${c}<b>${lastLetter(c).toUpperCase()}</b></li>`)
        .join('');
      $('chain-count').textContent = s.used.length;
      input.disabled = !v.canMove;
      giveBtn.disabled = !v.canMove;
      form.querySelector('button').disabled = !v.canMove;
      // таймер хода: перезапускаем при смене хода
      const key = s.used.length + ':' + s.turn + ':' + (v.over ? 'x' : '');
      if (key !== turnKey) {
        turnKey = key;
        clearInterval(timerId);
        if (!v.over) {
          deadline = Date.now() + TURN_SEC * 1000;
          timerId = setInterval(tick, 250);
          tick();
        }
      }
      if (v.over) {
        clearInterval(timerId);
        timerEl.textContent = '—';
      }
      if (v.canMove && document.activeElement !== input && matchMedia('(hover: hover)').matches) input.focus();
    },
  });
})();
