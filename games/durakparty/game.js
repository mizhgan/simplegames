/* Дурак на компанию: подкидной на 2–6 игроков, подкидывают все */
(() => {
  'use strict';

  const C = SG.cards;
  const esc = SG.party.esc;
  const HAND = 6;
  const IDLE = 15000; // через сколько молчания все «пасуют» сами

  function create(players) {
    const deck = SG.shuffle(C.deck(6));
    const s = { ids: players.map((p) => p.id), names: {}, hands: {}, deck, trump: null, table: [], att: 0, def: 1, limit: 6, phase: 'attack', passed: [], out: [], loser: null, over: false, log: [], last: Date.now(), bouts: 0 };
    players.forEach((p) => (s.names[p.id] = p.name));
    s.ids.forEach((id) => (s.hands[id] = s.deck.splice(0, HAND)));
    // нижняя карта колоды — козырь (при шестерых колода роздана — козырь по последней карте раздачи)
    s.trumpCard = s.deck.length ? s.deck[0] : s.hands[s.ids[s.ids.length - 1]][HAND - 1];
    s.trump = s.trumpCard.suit;
    // первым ходит тот, у кого младший козырь
    let best = null;
    s.ids.forEach((id, i) => s.hands[id].forEach((c) => c.suit === s.trump && (!best || c.rank < best.r) && (best = { i, r: c.rank })));
    s.att = best ? best.i : 0;
    s.def = nextActive(s, s.att);
    startBout(s);
    say(s, 'Козырь ' + C.SUITS[s.trump] + '. Первым ходит ' + s.names[s.ids[s.att]] + '.');
    return s;
  }

  function say(s, t) {
    s.log.push(t);
    if (s.log.length > 5) s.log.shift();
  }

  const active = (s, i) => !s.out.includes(s.ids[i]);
  function nextActive(s, i) {
    for (let k = 1; k <= s.ids.length; k++) {
      const j = (i + k) % s.ids.length;
      if (active(s, j)) return j;
    }
    return i;
  }

  function startBout(s) {
    s.table = [];
    s.phase = 'attack';
    s.passed = [];
    s.limit = Math.min(s.bouts === 0 ? 5 : 6, s.hands[s.ids[s.def]].length);
    s.last = Date.now();
  }

  const beats = (s, a, d) => (d.suit === a.suit && d.rank > a.rank) || (d.suit === s.trump && a.suit !== s.trump);
  const ranksOnTable = (s) => new Set(s.table.flatMap((p) => (p.d ? [p.a.rank, p.d.rank] : [p.a.rank])));
  const defId = (s) => s.ids[s.def];
  const attackers = (s) => s.ids.filter((id, i) => i !== s.def && active(s, i));

  // может ли игрок подкинуть карту c
  function canAdd(s, id, c) {
    if (id === defId(s) || s.out.includes(id) || s.over) return false;
    const unbeaten = s.table.filter((p) => !p.d).length;
    if (s.table.length >= s.limit) return false;
    if (s.phase === 'attack' && unbeaten >= s.hands[defId(s)].length) return false;
    if (!s.table.length) return id === s.ids[s.att];
    return ranksOnTable(s).has(c.rank);
  }

  function canBeat(s, c) {
    return s.phase === 'attack' && s.table.some((p) => !p.d && beats(s, p.a, c));
  }

  function refill(s) {
    // добирают: сначала ходивший, потом остальные по кругу, защитник последним
    const order = [];
    for (let k = 0; k < s.ids.length; k++) {
      const i = (s.att + k) % s.ids.length;
      if (i !== s.def) order.push(s.ids[i]);
    }
    order.push(defId(s));
    order.forEach((id) => {
      while (s.hands[id].length < HAND && s.deck.length) s.hands[id].push(s.deck.pop());
    });
  }

  function checkOut(s) {
    if (s.deck.length || s.over) return;
    s.ids.forEach((id) => {
      if (!s.hands[id].length && !s.out.includes(id)) {
        s.out.push(id);
        say(s, s.names[id] + ' выходит из игры');
      }
    });
    const left = s.ids.filter((id) => !s.out.includes(id));
    if (left.length <= 1) {
      s.over = true;
      s.loser = left[0] ?? null;
      say(s, s.loser === null ? 'Ничья — все вышли одновременно!' : s.names[s.loser] + ' — дурак! 🃏');
    }
  }

  function endBout(s, took) {
    const d = defId(s);
    if (took) {
      s.table.forEach((p) => {
        s.hands[d].push(p.a);
        if (p.d) s.hands[d].push(p.d);
      });
      say(s, s.names[d] + ' берёт карты');
    } else say(s, 'Бито');
    refill(s);
    s.bouts++;
    checkOut(s);
    if (s.over) return;
    // следующий ход: при «беру» — через защитника, иначе — сам защитник
    const di = s.def;
    s.att = took ? nextActive(s, di) : active(s, di) ? di : nextActive(s, di);
    s.def = nextActive(s, s.att);
    if (s.def === s.att) {
      s.over = true;
      s.loser = s.ids[s.att];
      return;
    }
    startBout(s);
  }

  // всё ли решено: все атакующие спасовали
  function maybeFinish(s) {
    const all = attackers(s).every((id) => s.passed.includes(id) || !s.hands[id].some((c) => canAdd(s, id, c)));
    if (!s.table.length) return;
    if (s.phase === 'take' && all) return endBout(s, true);
    const allBeaten = s.table.every((p) => p.d);
    if (s.phase === 'attack' && allBeaten && (all || s.table.length >= s.limit || !s.hands[defId(s)].length)) endBout(s, false);
  }

  function act(s, id, a, now) {
    if (s.over || !a) return false;
    const hand = s.hands[id];
    if (!hand) return false;
    if (a.card !== undefined) {
      const i = hand.findIndex((c) => c.id === a.card);
      if (i < 0) return false;
      const c = hand[i];
      if (id === defId(s)) {
        if (!canBeat(s, c)) return false;
        // бьём выбранную карту или первую подходящую (самую старшую из тех, что можем побить)
        let pi = Number.isInteger(a.on) && s.table[a.on] && !s.table[a.on].d && beats(s, s.table[a.on].a, c) ? a.on : -1;
        if (pi < 0) {
          let bestRank = -1;
          s.table.forEach((p, k) => {
            if (p.d || !beats(s, p.a, c)) return;
            const r = p.a.rank + (p.a.suit === s.trump ? 20 : 0);
            if (r > bestRank) {
              bestRank = r;
              pi = k;
            }
          });
        }
        s.table[pi].d = c;
        hand.splice(i, 1);
        s.passed = [];
      } else {
        if (!canAdd(s, id, c)) return false;
        s.table.push({ a: c, d: null, by: id });
        hand.splice(i, 1);
        s.passed = s.passed.filter((x) => x !== id);
      }
      s.last = now;
      maybeFinish(s);
      checkOut(s);
      return true;
    }
    if (a.take && id === defId(s) && s.phase === 'attack' && s.table.some((p) => !p.d)) {
      s.phase = 'take';
      s.passed = [];
      s.last = now;
      say(s, s.names[id] + ': «Беру»');
      maybeFinish(s);
      return true;
    }
    if (a.pass && id !== defId(s) && s.table.length && !s.passed.includes(id)) {
      if (s.phase === 'attack' && !s.table.every((p) => p.d)) {
        // пока не всё отбито, «пас» значит «больше не подкидываю»
      }
      s.passed.push(id);
      s.last = now;
      maybeFinish(s);
      return true;
    }
    return false;
  }

  // долгое молчание: все атакующие пасуют сами
  function tick(s, now) {
    if (s.over || !s.table.length) return false;
    const waitingAttackers = s.phase === 'take' || s.table.every((p) => p.d);
    if (waitingAttackers && now - s.last > IDLE) {
      attackers(s).forEach((id) => !s.passed.includes(id) && s.passed.push(id));
      maybeFinish(s);
      return true;
    }
    return false;
  }

  function leave(s, id) {
    // ушедший игрок сбрасывает карты и выбывает (его место не держим)
    void s;
    void id;
  }

  // ---------- боты ----------

  const weight = (s, c) => c.rank + (c.suit === s.trump ? 20 : 0);

  function ai(s, id, level) {
    if (s.over || s.out.includes(id)) return null;
    const hand = s.hands[id];
    if (id === defId(s)) {
      if (s.phase !== 'attack') return null;
      const open = s.table.map((p, k) => [p, k]).filter(([p]) => !p.d);
      if (!open.length) return null;
      // проверяем, отобьёмся ли от всех открытых карт
      const used = new Set();
      let cost = 0;
      let plan = null;
      for (const [p, k] of open) {
        const opts = hand.filter((c) => !used.has(c.id) && beats(s, p.a, c)).sort((x, y) => weight(s, x) - weight(s, y));
        if (!opts.length) return { take: 1 };
        used.add(opts[0].id);
        cost += weight(s, opts[0]);
        if (!plan) plan = { card: opts[0].id, on: k };
      }
      const early = s.deck.length > 8;
      const limit = level === 'easy' ? 99 : level === 'hard' ? 32 : 30;
      if (early && cost / open.length > limit && level !== 'easy') return { take: 1 };
      return plan;
    }
    // атакующий
    const addable = hand.filter((c) => canAdd(s, id, c)).sort((x, y) => weight(s, x) - weight(s, y));
    if (!s.table.length) {
      if (id !== s.ids[s.att]) return null;
      if (level === 'easy') return { card: hand[Math.floor(Math.random() * hand.length)].id };
      // младшая карта, лучше парная
      const cnt = {};
      hand.forEach((c) => c.suit !== s.trump && (cnt[c.rank] = (cnt[c.rank] || 0) + 1));
      const sorted = hand.slice().sort((x, y) => weight(s, x) - weight(s, y) - ((cnt[x.rank] || 0) - (cnt[y.rank] || 0)) * 2);
      return { card: sorted[0].id };
    }
    if (s.passed.includes(id)) return null;
    const waiting = s.phase === 'take' || s.table.every((p) => p.d) || addable.length;
    if (!waiting) return null;
    const cheap = addable.filter((c) => c.suit !== s.trump && (c.rank <= 11 || !s.deck.length || level === 'easy'));
    if (cheap.length && (level !== 'easy' || Math.random() < 0.7)) return { card: cheap[0].id };
    if (s.phase === 'take' || s.table.every((p) => p.d)) return { pass: 1 };
    return null;
  }

  // ---------- вид ----------

  function view(s, id) {
    const hand = s.hands[id];
    const isDef = id === defId(s);
    const v = {
      seats: s.ids.map((pid, i) => ({ id: pid, name: s.names[pid], n: s.hands[pid].length, def: i === s.def, att: i === s.att, out: s.out.includes(pid), passed: s.passed.includes(pid) })),
      table: s.table.map((p) => ({ a: p.a, d: p.d })),
      trump: s.trumpCard,
      deck: s.deck.length,
      phase: s.phase,
      log: s.log.slice(-3),
      over: s.over,
      loser: s.loser,
      limit: s.limit,
    };
    if (hand && !s.out.includes(id) && !s.over) {
      v.hand = hand.slice().sort((a, b) => (a.suit === s.trump) - (b.suit === s.trump) || a.suit - b.suit || a.rank - b.rank);
      v.isDef = isDef;
      v.ok = hand.filter((c) => (isDef ? canBeat(s, c) : canAdd(s, id, c))).map((c) => c.id);
      v.canTake = isDef && s.phase === 'attack' && s.table.some((p) => !p.d);
      v.canPass = !isDef && s.table.length > 0 && !s.passed.includes(id) && (s.phase === 'take' || s.table.every((p) => p.d));
      v.myFirst = !s.table.length && s.ids[s.att] === id;
    }
    return v;
  }

  // ---------- отрисовка ----------

  let sel = null;
  function render(v, ui) {
    const el = ui.el;
    const def = v.seats.find((p) => p.def);
    const seats = v.seats
      .map((p) => `<div class="pt-seat${p.def ? ' turn' : ''}${p.id === ui.me ? ' me' : ''}${p.out ? ' out' : ''}"><b>${esc(p.name)}${p.id === ui.me ? ' (вы)' : ''}</b><span>${p.out ? 'вышел' : '🂠 ' + p.n}${p.def ? ' · 🛡' : p.att ? ' · ⚔' : ''}${p.passed ? ' · пас' : ''}</span></div>`)
      .join('');
    let status;
    if (v.over) status = v.loser === null ? 'Ничья!' : v.loser === ui.me ? 'Вы остались в дураках 🃏' : esc(ui.name(v.loser)) + ' — дурак!';
    else if (!v.hand && !v.over) status = ui.watcher ? 'Отбивается ' + esc(def.name) : 'Вы вышли из игры — ждём остальных.';
    else if (v.isDef) status = v.phase === 'take' ? 'Вы берёте — остальные подкидывают…' : v.table.some((p) => !p.d) ? 'Отбивайтесь или берите.' : 'Ждём, подкинут ли ещё…';
    else if (v.myFirst) status = 'Ваш ход: атакуйте ' + esc(def.name) + '.';
    else if (v.table.length) status = v.ok.length ? 'Можно подкинуть карту' + (v.canPass ? ' или сказать «Пас».' : '.') : 'Отбивается ' + esc(def.name) + '…';
    else status = 'Ходит ' + esc(ui.name(v.seats.find((p) => p.att).id)) + '…';
    const table = v.table.map((p, k) => `<div class="dp-pair" data-k="${k}">${C.html(p.a, !p.d && v.isDef && sel !== null ? 'target' : '')}${p.d ? C.html(p.d, 'dp-beat') : ''}</div>`).join('');
    el.innerHTML =
      `<div class="tb"><div class="pt-seats">${seats}</div>` +
      `<div class="tb-center"><div class="tb-row dp-table">${table || '<span class="pt-muted">стол пуст</span>'}</div>` +
      `<div class="tb-row"><span class="tb-pot">колода ${v.deck}</span>${v.deck ? C.html(v.trump, 'dp-trump') : `<span class="tb-pot">козырь ${C.SUITS[v.trump.suit]}</span>`}</div>` +
      `<div class="tb-msg">${status}</div><div class="mm-log">${v.log.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>` +
      (v.hand ? `<div class="tb-hand mine">${v.hand.map((c) => C.html(c, (v.ok.includes(c.id) ? 'playable' : 'dim') + (sel === c.id ? ' sel' : ''))).join('')}</div>` : '') +
      `<div class="tb-actions">${v.canTake ? '<button class="btn btn-primary" type="button" data-take>Беру</button>' : ''}${v.canPass ? `<button class="btn btn-ghost" type="button" data-pass>${v.phase === 'take' ? 'Больше не подкидываю' : 'Бито / пас'}</button>` : ''}</div></div>`;
    el.querySelectorAll('.tb-hand.mine .sol-card.playable').forEach((c) =>
      c.addEventListener('click', () => {
        const id = +c.dataset.id;
        // защитник: если карту можно положить на разные карты — даём выбрать
        if (v.isDef) {
          const card = C.byId(id);
          const targets = v.table.map((p, k) => [p, k]).filter(([p]) => !p.d && beatsV(v, p.a, card));
          if (targets.length > 1) {
            sel = sel === id ? null : id;
            return render(v, ui);
          }
        }
        sel = null;
        ui.send({ card: id });
        SG.sound.play('flip');
      })
    );
    el.querySelectorAll('.dp-pair').forEach((p) =>
      p.addEventListener('click', () => {
        if (sel === null) return;
        ui.send({ card: sel, on: +p.dataset.k });
        sel = null;
        SG.sound.play('flip');
      })
    );
    const t = el.querySelector('[data-take]');
    if (t) t.addEventListener('click', () => ui.send({ take: 1 }));
    const ps = el.querySelector('[data-pass]');
    if (ps) ps.addEventListener('click', () => ui.send({ pass: 1 }));
    if (v.over && !render.done) {
      render.done = true;
      const lost = v.loser === ui.me;
      SG.sound.play(lost ? 'lose' : 'win');
      if (!lost && v.seats.some((p) => p.id === ui.me)) SG.store.set('durakparty-wins', SG.store.get('durakparty-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }
  const beatsV = (v, a, d) => (d.suit === a.suit && d.rank > a.rank) || (d.suit === v.trump.suit && a.suit !== v.trump.suit);

  SG.party({
    game: 'durakparty',
    min: 2,
    max: 6,
    bots: true,
    soloBots: 3,
    aiForGone: true,
    create,
    view,
    act,
    tick,
    ai,
    leave,
    render,
  });
})();
