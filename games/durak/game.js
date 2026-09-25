/* Подкидной дурак: игрок против компьютера, колода 36 карт */
(() => {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANK_NAMES = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
  const AI_DELAY = 650;

  const $ = (id) => document.getElementById(id);
  const aiHandEl = $('ai-hand');
  const myHandEl = $('my-hand');
  const tableEl = $('table');
  const deckEl = $('deck');
  const statusEl = $('status');
  const actionBtn = $('action-btn');

  let deck, trump, trumpCard, me, ai, table, attacker, taking, limit, discard, busy, over;
  // сетевая игра: соперник занимает место компьютера («ai»), обе стороны ведут одинаковую партию
  let mode = 'ai';
  let bout = 0; // номер раунда — чтобы не применить запоздавшее сообщение
  const OPP = () => (mode === 'net' ? 'Соперник' : 'Компьютер');

  const isRed = (c) => c.suit === 1 || c.suit === 2;
  const value = (c) => c.rank + (c.suit === trump ? 100 : 0);
  const beats = (d, a) => (d.suit === a.suit && d.rank > a.rank) || (d.suit === trump && a.suit !== trump);
  const defender = () => (attacker === 'me' ? 'ai' : 'me');
  const hand = (who) => (who === 'me' ? me : ai);
  const unbeaten = () => table.filter((p) => !p.d);
  const ranksOnTable = () => new Set(table.flatMap((p) => (p.d ? [p.a.rank, p.d.rank] : [p.a.rank])));

  // ---------- карты ----------

  function cardHTML(c, extra = '') {
    const r = RANK_NAMES[c.rank];
    const s = SUITS[c.suit];
    return (
      `<div class="sol-card up ${isRed(c) ? 'red' : ''} ${extra}" data-id="${c.id}">` +
      `<div class="sol-face"><span class="tl">${r}<br>${s}</span><span class="mid">${s}</span><span class="br">${r}<br>${s}</span></div></div>`
    );
  }

  const BACK = '<div class="sol-card"><div class="sol-back"></div></div>';

  // ---------- правила ----------

  function canAdd(card) {
    if (table.length >= limit) return false;
    // неотбитых карт не может быть больше, чем карт у защищающегося
    if (!taking && unbeaten().length >= hand(defender()).length) return false;
    return !table.length || ranksOnTable().has(card.rank);
  }

  function draw(who) {
    const h = hand(who);
    while (h.length < 6 && deck.length) h.push(deck.pop());
  }

  function sortHand(h) {
    h.sort((a, b) => (a.suit === trump) - (b.suit === trump) || a.suit - b.suit || a.rank - b.rank);
  }

  // ---------- ИИ ----------

  function aiAttackCard() {
    const opts = ai.filter((c) => canAdd(c));
    if (!opts.length) return null;
    const pool = deck.length ? opts.filter((c) => c.suit !== trump) : opts;
    const list = (pool.length ? pool : opts).slice().sort((a, b) => value(a) - value(b));
    if (!table.length) {
      // первый ход: младшая карта, лучше та, которой есть пара
      const pairRank = list.find((c) => list.filter((x) => x.rank === c.rank).length > 1 && c.rank <= 10);
      return pairRank || list[0];
    }
    // подкидываем только недорогие карты, пока в колоде ещё много карт
    const cheap = list.filter((c) => !deck.length || (c.suit !== trump && c.rank <= (deck.length > 10 ? 10 : 12)));
    return cheap[0] || null;
  }

  function aiDefend() {
    const pending = unbeaten();
    const used = new Set();
    const plan = [];
    let cost = 0;
    for (const p of pending) {
      const options = ai
        .filter((c) => !used.has(c) && beats(c, p.a))
        .sort((a, b) => value(a) - value(b));
      if (!options.length) return null;
      used.add(options[0]);
      plan.push([p, options[0]]);
      cost += options[0].suit === trump ? 20 + options[0].rank : 0;
    }
    // жалко отдавать старшие козыри на мелочь в начале игры
    if (deck.length > 8 && cost > 32) return null;
    return plan;
  }

  // ---------- ход партии ----------

  function startBout() {
    table = [];
    taking = false;
    bout++;
    limit = Math.min(6, hand(defender()).length);
    busy = false;
    render();
    if (attacker === 'ai' && mode === 'net') {
      statusEl.textContent = net.active ? 'Ходит соперник…' : 'Нет соединения с соперником';
    } else if (attacker === 'ai') {
      statusEl.textContent = 'Компьютер ходит…';
      busy = true;
      setTimeout(aiAttack, AI_DELAY);
    } else {
      statusEl.textContent = 'Ваш ход: выберите карту.';
    }
  }

  function aiAttack() {
    if (mode !== 'ai') return;
    const card = aiAttackCard();
    if (!card) {
      endBout();
      return;
    }
    ai.splice(ai.indexOf(card), 1);
    table.push({ a: card, d: null });
    SG.sound.play('card');
    busy = false;
    statusEl.textContent = taking ? 'Компьютер подкидывает…' : 'Отбивайтесь или берите.';
    render();
    if (taking) {
      busy = true;
      setTimeout(aiThrowMore, 350);
    }
  }

  function aiThrowMore() {
    if (mode !== 'ai') return;
    const card = aiAttackCard();
    if (card && table.length < limit) {
      ai.splice(ai.indexOf(card), 1);
      table.push({ a: card, d: null });
      SG.sound.play('card');
      render();
      setTimeout(aiThrowMore, 350);
    } else {
      endBout();
    }
  }

  function aiRespond() {
    if (mode !== 'ai') return;
    // компьютер защищается
    if (taking) {
      finishIfDone();
      return;
    }
    const plan = aiDefend();
    if (!plan) {
      taking = true;
      statusEl.textContent = 'Компьютер берёт. Можете подкинуть ещё или нажмите «Пусть берёт».';
      SG.sound.play('error');
    } else {
      plan.forEach(([p, c]) => {
        ai.splice(ai.indexOf(c), 1);
        p.d = c;
      });
      SG.sound.play('card');
      statusEl.textContent = 'Компьютер отбился. Подкиньте карту или нажмите «Бито».';
    }
    busy = false;
    render();
    finishIfDone();
  }

  // Раунд заканчивается сам, если добавить больше нечего
  function finishIfDone() {
    if (attacker !== 'me') return;
    const canMore = me.some((c) => canAdd(c));
    if (!canMore && (taking || !unbeaten().length)) {
      busy = true;
      const b = bout;
      setTimeout(() => {
        if (b !== bout) return;
        if (mode === 'net') net.send({ t: 'done', b, taking });
        endBout();
      }, 500);
    }
  }

  function playerCard(card) {
    if (busy || over) return;
    if (attacker === 'me') {
      if (!canAdd(card)) return reject(card);
      me.splice(me.indexOf(card), 1);
      table.push({ a: card, d: null });
      SG.sound.play('card');
      if (mode === 'net') {
        net.send({ t: 'attack', b: bout, id: card.id });
        statusEl.textContent = taking ? 'Соперник берёт. Подкиньте ещё или нажмите «Пусть берёт».' : 'Соперник отбивается…';
        render();
        finishIfDone();
        return;
      }
      render();
      busy = true;
      setTimeout(aiRespond, AI_DELAY);
    } else {
      if (taking) return reject(card);
      const target = unbeaten().find((p) => beats(card, p.a));
      if (!target) return reject(card);
      me.splice(me.indexOf(card), 1);
      target.d = card;
      SG.sound.play('card');
      render();
      if (mode === 'net') {
        net.send({ t: 'defend', b: bout, id: card.id, a: target.a.id });
        if (!unbeaten().length) statusEl.textContent = 'Отбились! Соперник решает, подкинуть ли ещё…';
        return;
      }
      if (!unbeaten().length) {
        busy = true;
        statusEl.textContent = 'Отбились! Компьютер думает, подкинуть ли ещё…';
        setTimeout(aiAfterBeaten, AI_DELAY);
      }
    }
  }

  function aiAfterBeaten() {
    if (mode !== 'ai') return;
    const card = me.length ? aiAttackCard() : null;
    if (card) {
      ai.splice(ai.indexOf(card), 1);
      table.push({ a: card, d: null });
      SG.sound.play('card');
      busy = false;
      statusEl.textContent = 'Компьютер подкинул. Отбивайтесь или берите.';
      render();
    } else {
      endBout();
    }
  }

  function reject(card) {
    const el = myHandEl.querySelector(`[data-id="${card.id}"]`);
    if (el) {
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope');
    }
    SG.sound.play('error');
  }

  function onAction() {
    if (over) return;
    if (attacker === 'me') {
      if (busy || !table.length || (!taking && unbeaten().length)) return;
      if (mode === 'net') net.send({ t: 'done', b: bout, taking });
      endBout();
    } else {
      if (busy || taking || !table.length) return;
      if (mode === 'net') {
        net.send({ t: 'take', b: bout });
        taking = true;
        statusEl.textContent = 'Вы берёте. Соперник может подкинуть ещё…';
        render();
        return;
      }
      taking = true;
      busy = true;
      statusEl.textContent = 'Вы берёте. Компьютер подкидывает…';
      render();
      setTimeout(aiThrowMore, 400);
    }
  }

  function endBout() {
    const def = defender();
    const cardsOnTable = table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a]));
    if (taking) {
      hand(def).push(...cardsOnTable);
      SG.sound.play('slide');
    } else {
      discard += cardsOnTable.length;
      SG.sound.play('flip');
    }
    table = [];
    draw(attacker);
    draw(def);
    if (!taking) attacker = def;
    sortHand(me);
    if (checkEnd()) return;
    startBout();
  }

  function checkEnd() {
    if (deck.length) return false;
    if (me.length && ai.length) return false;
    over = true;
    busy = true;
    let text;
    if (mode === 'net') net.result(!me.length && !ai.length ? 'draw' : !me.length ? 'win' : 'lose');
    if (!me.length && !ai.length) {
      text = 'Ничья — карты кончились одновременно 🤝';
      SG.sound.play('draw');
    } else if (!me.length) {
      text = 'Вы победили! ' + OPP() + ' остался в дураках 🎉';
      SG.store.set('durak-wins', SG.store.get('durak-wins', 0) + 1);
      SG.sound.play('win');
    } else {
      text = 'Вы остались в дураках 🃏';
      SG.store.set('durak-losses', SG.store.get('durak-losses', 0) + 1);
      SG.sound.play('lose');
    }
    statusEl.textContent = text;
    renderScore();
    render();
    return true;
  }

  // ---------- отрисовка ----------

  function render() {
    aiHandEl.innerHTML = ai.map(() => BACK).join('');
    $('ai-count').textContent = ai.length;

    deckEl.innerHTML =
      (deck.length ? `<div class="dk-trump">${cardHTML(trumpCard)}</div>` : `<div class="dk-trump-suit ${isRed(trumpCard) ? 'red' : ''}">${SUITS[trump]}</div>`) +
      (deck.length > 1 ? `<div class="dk-pile">${BACK}<span>${deck.length}</span></div>` : '');
    $('discard').textContent = discard;

    tableEl.innerHTML = table
      .map((p) => `<div class="dk-pair">${cardHTML(p.a)}${p.d ? cardHTML(p.d, 'def') : ''}</div>`)
      .join('');

    const myTurnAttack = attacker === 'me' && !busy && !over;
    const myTurnDefend = attacker === 'ai' && !busy && !over && !taking && unbeaten().length;
    myHandEl.innerHTML = me
      .map((c) => {
        const ok = (myTurnAttack && canAdd(c)) || (myTurnDefend && unbeaten().some((p) => beats(c, p.a)));
        return cardHTML(c, (ok ? 'playable' : '') + (c.suit === trump ? ' trump' : ''));
      })
      .join('');

    fitHand(aiHandEl, -0.42);
    fitHand(myHandEl, -0.3);

    if (attacker === 'me') {
      actionBtn.textContent = taking ? 'Пусть берёт' : 'Бито';
      actionBtn.disabled = busy || over || !table.length || (!taking && unbeaten().length > 0);
    } else {
      actionBtn.textContent = 'Беру';
      actionBtn.disabled = busy || over || taking || !table.length;
    }
  }

  // много карт на руке — сдвигаем их плотнее, чтобы ряд помещался в ширину стола
  function fitHand(el, base) {
    const n = el.children.length;
    const first = el.firstElementChild;
    if (n < 2 || !first) return el.style.removeProperty('--ov');
    const cw = first.offsetWidth;
    const avail = el.clientWidth - cw * 0.6 - 4;
    const need = 1 - (avail / cw - 1) / (n - 1);
    el.style.setProperty('--ov', Math.min(base, -need).toFixed(3));
  }

  function renderScore() {
    $('wins').textContent = SG.store.get('durak-wins', 0);
    $('losses').textContent = SG.store.get('durak-losses', 0);
  }

  function newGame(order) {
    deck = [];
    let id = 0;
    for (let s = 0; s < 4; s++) for (let r = 6; r <= 14; r++) deck.push({ id: id++, suit: s, rank: r });
    if (order) deck = order.map((i) => deck[i]);
    else SG.shuffle(deck);
    // по сети колоду тасует тот, кто начал партию, и отправляет её порядок
    if (mode === 'net' && !order) net.send({ t: 'new', deck: deck.map((c) => c.id) });
    $('opp-name').textContent = OPP();
    bout = 0;
    // нижняя карта колоды — козырь, её возьмут последней
    trumpCard = deck[0];
    trump = trumpCard.suit;
    me = [];
    ai = [];
    // первым сдаются карты тому, кто тасовал: так раздача одинакова у обоих игроков
    if (order) {
      draw('ai');
      draw('me');
    } else {
      draw('me');
      draw('ai');
    }
    sortHand(me);
    discard = 0;
    over = false;
    // первым ходит тот, у кого младший козырь
    const low = (h) => Math.min(...h.filter((c) => c.suit === trump).map((c) => c.rank), 99);
    attacker = low(ai) < low(me) ? 'ai' : 'me';
    $('trump-name').textContent = SUITS[trump];
    $('trump-name').className = isRed(trumpCard) ? 'red' : '';
    startBout();
  }

  myHandEl.addEventListener('click', (e) => {
    const el = e.target.closest('.sol-card');
    if (!el) return;
    const card = me.find((c) => c.id === Number(el.dataset.id));
    if (card) playerCard(card);
  });
  actionBtn.addEventListener('click', () => {
    actionBtn.blur();
    onAction();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net' && !net.active) return;
    newGame();
  });

  // ---------- игра по сети ----------

  const byId = (h, id) => h.find((c) => c.id === id);

  const net = SG.net.setup({
    game: 'durak',
    // зрителям не показываем карты хозяина
    mirrorMask: (el) => el.querySelectorAll('#my-hand .sol-card').forEach((c) => {
      c.className = 'sol-card';
      c.innerHTML = '<div class="sol-back"></div>';
    }),
    onRematch: () => $('new-btn').click(),
    modeEl: $('mode'),
    onConnect(role) {
      mode = 'net';
      net.info('карты соперника скрыты');
      if (role === 'host') newGame();
      else {
        $('opp-name').textContent = OPP();
        busy = true;
        statusEl.textContent = 'Соперник раздаёт карты…';
      }
    },
    onMessage(msg) {
      if (msg.t === 'new' && Array.isArray(msg.deck) && msg.deck.length === 36) return newGame(msg.deck);
      if (over || msg.b !== bout) return;
      if (msg.t === 'attack' && attacker === 'ai') {
        const card = byId(ai, msg.id);
        if (!card || !canAdd(card)) return;
        ai.splice(ai.indexOf(card), 1);
        table.push({ a: card, d: null });
        SG.sound.play('card');
        busy = false;
        statusEl.textContent = taking ? 'Соперник подкидывает…' : 'Отбивайтесь или берите.';
        render();
      } else if (msg.t === 'defend' && attacker === 'me') {
        const card = byId(ai, msg.id);
        const pair = table.find((p) => p.a.id === msg.a && !p.d);
        if (!card || !pair || !beats(card, pair.a)) return;
        ai.splice(ai.indexOf(card), 1);
        pair.d = card;
        SG.sound.play('card');
        statusEl.textContent = unbeaten().length ? 'Соперник отбивается…' : 'Соперник отбился. Подкиньте карту или нажмите «Бито».';
        render();
        finishIfDone();
      } else if (msg.t === 'take' && attacker === 'me' && !taking) {
        taking = true;
        SG.sound.play('error');
        statusEl.textContent = 'Соперник берёт. Можете подкинуть ещё или нажмите «Пусть берёт».';
        render();
        finishIfDone();
      } else if (msg.t === 'done' && attacker === 'ai') {
        // конец раунда определяет атакующий
        taking = !!msg.taking;
        endBout();
      }
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        newGame();
      } else {
        busy = true;
        render();
        statusEl.textContent = 'Нет соединения с соперником';
      }
    },
  });

  const modeSeg = SG.segmented($('mode'), 'ai', () => {
    if (mode !== 'ai') {
      mode = 'ai';
      newGame();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      onAction();
    }
  });

  renderScore();
  newGame();
})();
