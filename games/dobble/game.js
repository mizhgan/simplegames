/* Доббль: на любых двух карточках ровно один общий символ — найдите его первым */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const Q = 7; // порядок проективной плоскости: 57 карточек по 8 символов
  const READY_MS = 3000; // отсчёт перед первой карточкой
  const PENALTY_MS = 2000; // пауза за неверный символ
  const SYMBOLS = [
    '🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🥕', '🌽', '🍄', '🌵', '🌻', '🌲', '🍁', '⭐', '🌙', '☀️', '⚡', '❄️', '🔥',
    '💧', '🌈', '☂️', '⚓', '🔑', '🔒', '💡', '⏰', '🎈', '🎁', '🎲', '🎸', '🥁', '⚽', '🏀', '🎯', '🚗', '🚲', '✈️',
    '🚀', '⛵', '🏠', '🐱', '🐶', '🐭', '🐰', '🦊', '🐻', '🐼', '🐸', '🐵', '🐔', '🐧', '🐟', '🐙', '🦋', '🐞', '👑',
  ];
  // названия — для ленты и подсказок
  const NAMES = [
    'яблоко', 'банан', 'виноград', 'арбуз', 'клубника', 'вишня', 'морковь', 'кукуруза', 'гриб', 'кактус', 'подсолнух', 'ёлка', 'клён', 'звезда', 'месяц', 'солнце', 'молния', 'снежинка', 'огонь',
    'капля', 'радуга', 'зонтик', 'якорь', 'ключ', 'замок', 'лампочка', 'будильник', 'шарик', 'подарок', 'кубик', 'гитара', 'барабан', 'мяч', 'баскетбол', 'мишень', 'машина', 'велосипед', 'самолёт',
    'ракета', 'парусник', 'дом', 'кошка', 'собака', 'мышь', 'кролик', 'лиса', 'медведь', 'панда', 'лягушка', 'обезьяна', 'курица', 'пингвин', 'рыба', 'осьминог', 'бабочка', 'божья коровка', 'корона',
  ];

  // колода: прямые конечной проективной плоскости порядка 7 — любые две пересекаются ровно в одной точке
  function buildDeck() {
    const pt = (x, y) => x * Q + y;
    const inf = (m) => Q * Q + m; // точка на бесконечности для наклона m; m = Q — вертикальная
    const cards = [];
    for (let m = 0; m < Q; m++)
      for (let b = 0; b < Q; b++) {
        const c = [inf(m)];
        for (let x = 0; x < Q; x++) c.push(pt(x, (m * x + b) % Q));
        cards.push(c);
      }
    for (let x = 0; x < Q; x++) {
      const c = [inf(Q)];
      for (let y = 0; y < Q; y++) c.push(pt(x, y));
      cards.push(c);
    }
    const line = [];
    for (let m = 0; m <= Q; m++) line.push(inf(m));
    cards.push(line);
    return cards;
  }
  const DECK = buildDeck();

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const common = (a, b) => DECK[a].find((x) => DECK[b].includes(x));
  const cardsWord = (n) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'карточка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'карточки' : 'карточек');
  const say = (s, t, o) => SG.party.log(s, t, o);

  function create(players, opts) {
    const order = shuffle(DECK.map((_, i) => i));
    const size = opts && +opts.size === 31 ? 31 : DECK.length;
    const deck = order.slice(0, Math.max(size, players.length + 5));
    const s = { ids: players.map((p) => p.id), names: {}, own: {}, got: {}, pen: {}, pile: [], phase: 'ready', log: [], now: Date.now(), winner: null, last: null, round: 0 };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.own[p.id] = deck.pop();
      s.got[p.id] = 0;
      s.pen[p.id] = 0;
    });
    s.pile = deck;
    s.changedAt = s.now + READY_MS;
    s.deadline = s.changedAt;
    say(s, 'В стопке ' + cardsWord(s.pile.length) + '. Приготовились…', { i: '👀' });
    return s;
  }

  const top = (s) => s.pile[s.pile.length - 1];

  function act(s, id, a, now) {
    if (!a || s.phase !== 'play' || !Number.isInteger(a.sym) || s.own[id] === undefined) return false;
    if (now < s.pen[id]) return false;
    const want = common(s.own[id], top(s));
    if (a.sym !== want) {
      s.pen[id] = now + PENALTY_MS;
      say(s, s.names[id] + ': мимо (' + SYMBOLS[a.sym] + ') — пауза 2 с', { w: id, i: '⌛', k: 'bad' });
      return true;
    }
    s.own[id] = s.pile.pop();
    s.got[id]++;
    s.round++;
    s.last = { id, sym: want, at: now };
    s.changedAt = now;
    say(s, s.names[id] + ': ' + SYMBOLS[want] + ' ' + NAMES[want] + ' — +1, всего ' + s.got[id], { w: id, i: '⚡', k: 'good' });
    if (!s.pile.length) {
      let best = s.ids[0];
      s.ids.forEach((pid) => s.got[pid] > s.got[best] && (best = pid));
      s.winner = best;
      s.phase = 'end';
      say(s, 'Стопка кончилась! Побеждает ' + s.names[best] + ' — ' + cardsWord(s.got[best]), { w: best, i: '🏆', k: 'good', big: true });
    }
    return true;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'ready' && now >= s.deadline) {
      s.phase = 'play';
      s.changedAt = now;
      return true;
    }
    return false;
  }

  function leave(s, id) {
    if (s.phase !== 'end') say(s, s.names[id] + ' выходит из игры', { w: id, i: '🚪' });
  }

  // бот «ищет» символ: время реакции зависит от силы и немного случайно; иногда ошибается
  const REACT = { easy: [3800, 3200], normal: [2400, 1800], hard: [1500, 1100] };
  function ai(s, id, level) {
    if (s.phase !== 'play' || s.now < s.pen[id]) return null;
    const [base, spread] = REACT[level] || REACT.normal;
    // своя «скорость» на каждый раунд: от номера раунда и игрока, чтобы не менялась между вызовами
    const r = ((s.round * 7919 + id * 104729 + s.pile.length * 31) % 1000) / 1000;
    if (s.now < s.changedAt + base + r * spread) return null; // s.now — время партии, его ведёт tick
    const want = common(s.own[id], top(s));
    if (level === 'easy' && r < 0.12) return { sym: DECK[top(s)].find((x) => x !== want) };
    return { sym: want };
  }

  function view(s, id) {
    return {
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], got: s.got[pid], pen: Math.max(0, s.pen[pid] - Date.now()) })),
      mine: s.own[id] !== undefined ? s.own[id] : null,
      center: s.pile.length ? top(s) : null,
      left: s.pile.length,
      phase: s.phase,
      start: Math.max(0, s.deadline - Date.now()),
      last: s.last,
      round: s.round,
      pen: s.pen[id] ? Math.max(0, s.pen[id] - Date.now()) : 0,
      log: s.log.slice(-30),
      over: s.phase === 'end',
      winner: s.winner,
    };
  }

  // ---------- отрисовка ----------

  // расположение символов на карточке: один в центре, семь по кругу; размер и поворот — свои у каждой карточки
  const SLOTS = [[50, 50]].concat(Array.from({ length: 7 }, (_, k) => [50 + 31 * Math.cos((k / 7) * 2 * Math.PI - Math.PI / 2), 50 + 31 * Math.sin((k / 7) * 2 * Math.PI - Math.PI / 2)]));
  function cardHtml(card, cls, clickable) {
    let seed = card * 2654435761;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const syms = DECK[card].slice().sort(() => rnd() - 0.5);
    return (
      `<div class="db-card ${cls}">` +
      syms
        .map((sym, k) => {
          const [x, y] = SLOTS[k];
          const size = (k === 0 ? 17 : 13) + rnd() * 7; // % ширины карточки
          const rot = Math.round(rnd() * 360);
          return `<button type="button" class="db-sym" data-sym="${sym}" style="left:${x}%;top:${y}%;--s:${size.toFixed(1)};--r:${rot}deg" aria-label="${NAMES[sym]}" ${clickable ? '' : 'tabindex="-1"'}>${SYMBOLS[sym]}</button>`;
        })
        .join('') +
      '</div>'
    );
  }

  let lastRound = -1;
  let tickTimer = 0;
  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const playing = v.phase === 'play' && v.mine !== null;
    const penalized = v.pen > 0;
    const seats = v.players
      .slice()
      .sort((a, b) => b.got - a.got)
      .map((p) => `<div class="pt-seat${p.id === me ? ' me' : ''}${v.last && v.last.id === p.id && Date.now() - v.last.at < 1500 ? ' db-hit' : ''}" data-seat="${p.id}" data-num="${p.got}" data-unit="карточек"><b>${esc(p.name)}</b><span>🃏 ${p.got}${p.pen ? ' · ⌛' : ''}</span></div>`)
      .join('');
    let status;
    if (v.over) status = v.winner === me ? 'Вы собрали больше всех! 🏆' : esc(ui.name(v.winner)) + ' побеждает';
    else if (v.phase === 'ready') status = 'Приготовьтесь… ' + Math.ceil(v.start / 1000);
    else if (penalized) status = 'Мимо! Пауза ' + Math.ceil(v.pen / 1000) + ' с';
    else if (v.mine === null) status = 'Игроки ищут общий символ…';
    else status = 'Найдите общий символ вашей карточки и центральной!';
    const fresh = v.round !== lastRound;
    lastRound = v.round;
    el.innerHTML =
      `<div class="pt-panel db"><div class="pt-seats">${seats}</div>` +
      `<p class="db-status${penalized ? ' pen' : ''}">${status} <span class="db-left">в стопке ${v.left}</span></p>` +
      `<div class="db-table${penalized ? ' frozen' : ''}">` +
      `<div class="db-slot"><span class="db-label">Центр</span>${v.center !== null && v.phase !== 'ready' ? cardHtml(v.center, 'center' + (fresh && v.round ? ' fresh' : ''), playing && !penalized) : '<div class="db-card empty">' + (v.phase === 'ready' ? `<b class="db-count">${Math.ceil(v.start / 1000)}</b>` : '') + '</div>'}</div>` +
      (v.mine !== null ? `<div class="db-slot"><span class="db-label">Ваша карточка</span>${cardHtml(v.mine, 'mine', playing && !penalized)}</div>` : '') +
      '</div></div>';
    if (playing && !penalized)
      el.querySelectorAll('.db-sym').forEach((b) =>
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          ui.send({ sym: +b.dataset.sym });
        })
      );
    // отсчёт и пауза обновляются без нового вида от хозяина
    clearTimeout(tickTimer);
    if ((v.phase === 'ready' && v.start > 0) || penalized) {
      const step = 250;
      tickTimer = setTimeout(() => {
        if (!el.isConnected) return;
        render(Object.assign({}, v, { start: Math.max(0, v.start - step), pen: Math.max(0, v.pen - step) }), ui);
      }, step);
    }
    if (fresh && v.round && v.last) SG.sound.play(v.last.id === me ? 'coin' : 'click');
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === me ? 'win' : 'lose');
      if (v.winner === me) SG.store.set('dobble-wins', SG.store.get('dobble-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({
    game: 'dobble',
    min: 2,
    max: 8,
    bots: true,
    soloBots: 2,
    aiForGone: true,
    botDelay: () => 30,
    pace: 0,
    options: {
      html: '<label>Колода <select data-size><option value="57" selected>Полная — 57 карточек</option><option value="31">Короткая — 31 карточка</option></select></label>',
      read: (el) => ({ size: +((el.querySelector('[data-size]') || {}).value || 57) }),
      show(el, o) {
        if (o && o.size) el.querySelector('[data-size]').value = String(o.size);
      },
    },
    create,
    view,
    act,
    tick,
    ai,
    leave,
    render,
  });
  window.__dobble = { DECK, SYMBOLS, NAMES, common };
})();
