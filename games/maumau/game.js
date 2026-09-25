/* Мау-мау: сбросьте все карты первым — в масть или в достоинство */
(() => {
  'use strict';

  const C = SG.cards;
  const HAND = 5;
  const esc = SG.party.esc;

  // ---------- правила ----------

  function create(players) {
    const deck = SG.shuffle(C.deck(6));
    const s = { ids: players.map((p) => p.id), names: {}, hands: {}, draw: deck, pile: [], turn: 0, dir: 1, suit: null, penalty: 0, drew: false, log: [], winner: null, said: {} };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.hands[p.id] = s.draw.splice(0, HAND);
    });
    // первая карта — не валет и не «особая», чтобы начать спокойно
    let i = s.draw.findIndex((c) => c.rank >= 9 && c.rank !== 11 && c.rank !== 14);
    if (i < 0) i = 0;
    s.pile.push(s.draw.splice(i, 1)[0]);
    s.turn = Math.floor(Math.random() * s.ids.length);
    say(s, 'Первым ходит ' + s.names[s.ids[s.turn]] + '.');
    return s;
  }

  function say(s, text) {
    s.log.push(text);
    if (s.log.length > 6) s.log.shift();
  }

  const top = (s) => s.pile[s.pile.length - 1];
  const cur = (s) => s.ids[s.turn];
  const nextIdx = (s, k = 1) => (((s.turn + s.dir * k) % s.ids.length) + s.ids.length) % s.ids.length;

  function canPlay(s, c) {
    if (s.penalty) return c.rank === 7;
    if (c.rank === 11) return true;
    const t = top(s);
    const suit = s.suit !== null ? s.suit : t.suit;
    return c.suit === suit || (s.suit === null && c.rank === t.rank) || (s.suit !== null && c.rank === t.rank && t.rank !== 11);
  }

  function takeCards(s, id, n) {
    for (let k = 0; k < n; k++) {
      if (!s.draw.length) {
        // перемешиваем сброс, оставив верхнюю карту
        const t = s.pile.pop();
        s.draw = SG.shuffle(s.pile);
        s.pile = [t];
      }
      if (!s.draw.length) return;
      s.hands[id].push(s.draw.pop());
    }
  }

  function advance(s, k = 1) {
    s.turn = nextIdx(s, k);
    s.drew = false;
  }

  function act(s, id, a) {
    if (s.winner !== null || !a || cur(s) !== id) return false;
    const hand = s.hands[id];
    const name = s.names[id];
    if (a.play !== undefined) {
      const i = hand.findIndex((c) => c.id === a.play);
      if (i < 0 || !canPlay(s, hand[i])) return false;
      const c = hand[i];
      if (c.rank === 11 && !(a.suit >= 0 && a.suit < 4)) return false;
      hand.splice(i, 1);
      s.pile.push(c);
      s.suit = c.rank === 11 ? a.suit : null;
      let text = name + ': ' + C.name(c);
      if (!hand.length) {
        s.winner = id;
        say(s, text + ' — последняя карта! ' + name + ' побеждает 🎉');
        return true;
      }
      if (hand.length === 1) text += ' — «Мау!»';
      let skip = 1;
      if (c.rank === 7) {
        s.penalty += 2;
        text += ' (+2 следующему)';
      } else if (c.rank === 8) {
        skip = 2;
        text += ' (пропуск хода)';
      } else if (c.rank === 14) {
        s.dir = -s.dir;
        text += ' (разворот)';
        if (s.ids.length === 2) skip = 2;
      } else if (c.rank === 11) text += ' — заказана масть ' + C.SUITS[a.suit];
      say(s, text);
      advance(s, skip);
      return true;
    }
    if (a.draw) {
      if (s.penalty) {
        const n = s.penalty;
        takeCards(s, id, n);
        s.penalty = 0;
        say(s, name + ' берёт ' + n + ' карты');
        advance(s);
        return true;
      }
      if (s.drew) return false;
      takeCards(s, id, 1);
      s.drew = true;
      // взятую карту можно сразу сыграть, иначе ход переходит
      if (!hand.some((c) => canPlay(s, c))) {
        say(s, name + ' берёт карту и пропускает ход');
        advance(s);
      }
      return true;
    }
    if (a.pass && s.drew) {
      say(s, name + ' пасует');
      advance(s);
      return true;
    }
    return false;
  }

  // ---------- боты ----------

  function ai(s, id, level) {
    if (s.winner !== null || cur(s) !== id) return null;
    const hand = s.hands[id];
    const ok = hand.filter((c) => canPlay(s, c));
    if (!ok.length) return s.drew ? { pass: 1 } : { draw: 1 };
    const count = [0, 0, 0, 0];
    hand.forEach((c) => c.rank !== 11 && count[c.suit]++);
    const bestSuit = count.indexOf(Math.max(...count));
    if (level === 'easy') {
      const c = ok[Math.floor(Math.random() * ok.length)];
      return { play: c.id, suit: bestSuit };
    }
    const nextCards = s.hands[s.ids[nextIdx(s)]].length;
    const score = (c) => {
      let v = count[c.suit] * 2;
      if (c.rank === 11) v -= hand.length > 2 ? 12 : -5; // валета бережём
      if ((c.rank === 7 || c.rank === 8) && nextCards <= 2) v += 10;
      if (c.rank === 7 || c.rank === 8) v += level === 'hard' ? 3 : 1;
      return v;
    };
    ok.sort((a, b) => score(b) - score(a));
    const c = ok[0];
    let suit = bestSuit;
    if (c.rank === 11 && level === 'hard') {
      const rest = hand.filter((x) => x !== c && x.rank !== 11);
      const cnt = [0, 0, 0, 0];
      rest.forEach((x) => cnt[x.suit]++);
      suit = cnt.indexOf(Math.max(...cnt));
    }
    return { play: c.id, suit };
  }

  // ---------- вид ----------

  function view(s, id) {
    const v = {
      seats: s.ids.map((pid, i) => ({ id: pid, name: s.names[pid], n: s.hands[pid].length, turn: i === s.turn && s.winner === null })),
      top: top(s),
      suit: s.suit,
      penalty: s.penalty,
      deck: s.draw.length,
      dir: s.dir,
      log: s.log.slice(-4),
      winner: s.winner,
      over: s.winner !== null,
      myTurn: cur(s) === id && s.winner === null,
      drew: s.drew,
    };
    if (s.hands[id]) {
      v.hand = s.hands[id].slice().sort((a, b) => a.suit - b.suit || a.rank - b.rank);
      v.ok = v.myTurn ? v.hand.filter((c) => canPlay(s, c)).map((c) => c.id) : [];
    }
    if (s.winner !== null) v.hands = s.ids.map((pid) => s.hands[pid]);
    return v;
  }

  // ---------- отрисовка ----------

  let picking = null; // валет ждёт выбора масти
  function render(v, ui) {
    const el = ui.el;
    const seats = v.seats
      .map((p) => `<div class="pt-seat${p.turn ? ' turn' : ''}${p.id === ui.me ? ' me' : ''}"><b>${esc(p.name)}${p.id === ui.me ? ' (вы)' : ''}</b><span>🂠 ${p.n}${p.n === 1 ? ' · Мау!' : ''}</span></div>`)
      .join('');
    let status;
    if (v.over) status = v.winner === ui.me ? 'Вы победили! 🎉' : esc(ui.name(v.winner)) + ' побеждает.';
    else if (v.myTurn) status = v.penalty ? 'Вам +' + v.penalty + ': отбейтесь семёркой или возьмите карты.' : v.drew ? 'Сыграйте взятую карту или пасуйте.' : 'Ваш ход: карта в масть или в достоинство.';
    else status = 'Ходит ' + esc(ui.name(v.seats.find((p) => p.turn).id)) + '…';
    const suitNote = v.suit !== null ? `<span class="mm-suit ${v.suit === 1 || v.suit === 2 ? 'red' : ''}">заказано: ${C.SUITS[v.suit]}</span>` : '';
    const hand = v.hand
      ? v.hand.map((c) => C.html(c, v.ok.includes(c.id) ? 'playable' : v.myTurn ? 'dim' : '')).join('')
      : '';
    el.innerHTML =
      `<div class="tb"><div class="pt-seats">${seats}</div>` +
      `<div class="tb-center"><div class="tb-row">${C.back('mm-deck')}<span class="tb-pot">колода ${v.deck}</span>${C.html(v.top)}${suitNote}</div>` +
      `<div class="tb-msg">${status}</div>` +
      `<div class="mm-log">${v.log.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` +
      (v.penalty ? `<div class="tb-pot">Штраф: +${v.penalty}</div>` : '') +
      `</div>` +
      (v.hand ? `<div class="tb-hand mine">${hand}</div>` : '') +
      `<div class="tb-actions">` +
      (v.myTurn && !v.drew ? `<button class="btn btn-primary" type="button" data-draw>${v.penalty ? 'Взять ' + v.penalty : 'Взять карту'}</button>` : '') +
      (v.myTurn && v.drew && !v.penalty ? '<button class="btn btn-ghost" type="button" data-pass>Пас</button>' : '') +
      `</div><div class="mm-pick" hidden><p>Какую масть заказать?</p><div class="pt-choices">${C.SUITS.map((x, i) => `<button class="btn btn-ghost mm-s${i === 1 || i === 2 ? ' red' : ''}" type="button" data-suit="${i}">${x}</button>`).join('')}</div></div>` +
      (v.over && v.hands ? `<div class="mm-reveal">${v.seats.map((p, i) => `<div><b>${esc(p.name)}</b>: ${v.hands[i].map((c) => C.name(c)).join(' ') || '—'}</div>`).join('')}</div>` : '') +
      `</div>`;
    const pick = el.querySelector('.mm-pick');
    el.querySelectorAll('.tb-hand.mine .sol-card.playable').forEach((cardEl) =>
      cardEl.addEventListener('click', () => {
        const id = +cardEl.dataset.id;
        if (C.byId(id).rank === 11) {
          picking = id;
          pick.hidden = false;
          return;
        }
        ui.send({ play: id });
        SG.sound.play('flip');
      })
    );
    pick.querySelectorAll('[data-suit]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.send({ play: picking, suit: +b.dataset.suit });
        SG.sound.play('flip');
      })
    );
    const d = el.querySelector('[data-draw]');
    if (d) d.addEventListener('click', () => ui.send({ draw: 1 }));
    const p = el.querySelector('[data-pass]');
    if (p) p.addEventListener('click', () => ui.send({ pass: 1 }));
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === ui.me ? 'win' : 'lose');
      if (v.winner === ui.me) SG.store.set('maumau-wins', SG.store.get('maumau-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({
    game: 'maumau',
    min: 2,
    max: 6,
    bots: true,
    soloBots: 3,
    aiForGone: true,
    create,
    view,
    act,
    ai,
    render,
  });
})();
