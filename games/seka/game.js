/* Сека: три карты, очки по масти, торговля фишками вдвоём */
(() => {
  'use strict';

  const C = SG.cards;
  const START = 100;
  const ANTE = 2;
  const RAISES = [2, 5, 10, 20];
  const JOKER = C.deck(6).find((c) => c.rank === 7 && c.suit === 3).id; // семёрка треф — «шаха»
  const VAL = (r) => (r === 14 ? 11 : r >= 10 ? 10 : r);

  // очки руки
  function points(ids) {
    const cards = ids.map(C.byId);
    const joker = ids.includes(JOKER);
    const rest = cards.filter((c) => c.id !== JOKER);
    let best = 0;
    // три одинаковых (шаха дополняет пару)
    const ranks = {};
    rest.forEach((c) => (ranks[c.rank] = (ranks[c.rank] || 0) + 1));
    for (const r in ranks) {
      if (ranks[r] + (joker ? 1 : 0) >= 3) best = Math.max(best, +r === 6 ? 34 : +r === 14 ? 37 : VAL(+r) * 3);
    }
    if ((ranks[14] || 0) + (joker ? 1 : 0) >= 2) best = Math.max(best, 22);
    // сумма по масти; шаха — как туз любой масти
    for (let s = 0; s < 4; s++) {
      const sum = rest.filter((c) => c.suit === s).reduce((a, c) => a + VAL(c.rank), 0) + (joker ? 11 : 0);
      best = Math.max(best, sum);
    }
    return best;
  }

  function create(seed) {
    const s = { seed, chips: [START, START], pot: 0, carry: 0, hand: 0, dealer: 1, turn: 0, over: null };
    deal(s);
    return s;
  }

  function deal(s) {
    s.hand++;
    s.dealer = 1 - s.dealer;
    const rand = SG.duel.rng((s.seed + s.hand * 7919) >>> 0);
    const deck = SG.duel.shuffleWith(C.deck(6), rand).map((c) => c.id);
    s.cards = [deck.slice(0, 3), deck.slice(3, 6)];
    s.bets = [0, 0];
    s.pot = s.carry;
    s.carry = 0;
    for (const p of [0, 1]) {
      const a = Math.min(ANTE, s.chips[p]);
      s.chips[p] -= a;
      s.pot += a;
    }
    s.toCall = 0;
    s.checks = 0;
    s.phase = 'bet';
    s.turn = 1 - s.dealer;
    s.result = null;
    s.log = [];
  }

  function pay(s, p, v) {
    const x = Math.min(v, s.chips[p]);
    s.chips[p] -= x;
    s.bets[p] += x;
    s.pot += x;
    return x;
  }

  function moves(s) {
    if (s.over) return [];
    if (s.phase === 'done') return [{ a: 'next' }];
    const me = s.turn;
    const out = [{ a: 'fold' }];
    if (s.toCall === 0) out.push({ a: 'check' });
    else out.push({ a: 'call' });
    const opp = s.chips[1 - me];
    if (s.chips[me] > s.toCall && opp > 0) for (const v of RAISES) if (s.toCall + v <= s.chips[me]) out.push({ a: 'raise', v });
    return out;
  }

  const legal = (s, m) => !!m && moves(s).some((x) => x.a === m.a && (x.a !== 'raise' || x.v === m.v));

  function finishHand(s, winner, how) {
    s.phase = 'done';
    if (winner === null) {
      // свара: банк переходит в следующую раздачу
      s.carry = s.pot;
      s.result = { winner: null, how, pts: [points(s.cards[0]), points(s.cards[1])] };
    } else {
      s.chips[winner] += s.pot;
      s.result = { winner, how, pot: s.pot, pts: [points(s.cards[0]), points(s.cards[1])] };
    }
    s.pot = 0;
    // следующую раздачу начинает тот, кто будет ходить первым
    s.turn = s.dealer;
    if (s.chips[0] < ANTE && !s.carry) s.over = { winner: 1, text: 'У первого игрока кончились фишки.' };
    else if (s.chips[1] < ANTE && !s.carry) s.over = { winner: 0, text: 'У второго игрока кончились фишки.' };
  }

  function showdown(s) {
    const a = points(s.cards[0]);
    const b = points(s.cards[1]);
    // равные ставки: лишнее (если кто-то не смог уравнять) возвращаем
    const diff = s.bets[0] - s.bets[1];
    if (diff > 0) {
      s.chips[0] += diff;
      s.pot -= diff;
    } else if (diff < 0) {
      s.chips[1] -= diff;
      s.pot += diff;
    }
    finishHand(s, a === b ? null : a > b ? 0 : 1, 'show');
  }

  function apply(s, m) {
    const me = s.turn;
    if (m.a === 'next') return deal(s);
    s.last = { side: me, a: m.a, v: m.v };
    if (m.a === 'fold') return finishHand(s, 1 - me, 'fold');
    if (m.a === 'check') {
      s.checks++;
      if (s.checks >= 2) return showdown(s);
      s.turn = 1 - me;
      return;
    }
    if (m.a === 'call') {
      pay(s, me, s.toCall);
      return showdown(s);
    }
    pay(s, me, s.toCall + m.v);
    s.toCall = m.v;
    s.turn = 1 - me;
    // соперник не может ответить — вскрываемся
    if (!s.chips[1 - me]) showdown(s);
  }

  // ---------- компьютер ----------

  function ai(s, level) {
    const me = s.turn;
    if (s.phase === 'done') return new Promise((r) => setTimeout(() => r({ a: 'next' }), 1800));
    const p = points(s.cards[me]);
    const ms = moves(s);
    const bluff = { easy: 0.05, normal: 0.12, hard: 0.18 }[level];
    const r = Math.random();
    const raise = (v) => ms.find((x) => x.a === 'raise' && x.v === v) || ms.find((x) => x.a === 'raise') || null;
    // сила руки от 0 до 1
    const str = Math.min(1, Math.max(0, (p - 14) / 20));
    const fear = s.toCall / Math.max(1, s.pot);
    if (level === 'easy') {
      if (s.toCall && str < 0.25 && r < 0.5) return { a: 'fold' };
      if (r < 0.3 && str > 0.5) return raise(5) || { a: s.toCall ? 'call' : 'check' };
      return { a: s.toCall ? 'call' : 'check' };
    }
    if (str > 0.75 || r < bluff) {
      const v = str > 0.9 ? 20 : str > 0.8 ? 10 : 5;
      if (s.bets[me] < 40 || str > 0.85) return raise(v) || { a: s.toCall ? 'call' : 'check' };
    }
    if (s.toCall) {
      if (str + (level === 'hard' ? 0.05 : 0) < fear * 0.9 && str < 0.55) return { a: 'fold' };
      if (str > 0.55 && r < 0.35 && s.bets[me] < 30) return raise(5) || { a: 'call' };
      return { a: 'call' };
    }
    if (str > 0.5 && r < 0.5) return raise(2) || { a: 'check' };
    return { a: 'check' };
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const actEl = $('actions');

  function actionLabel(m, s) {
    if (m.a === 'fold') return 'Пас';
    if (m.a === 'check') return 'Не повышать';
    if (m.a === 'call') return 'Уравнять ' + Math.min(s.toCall, s.chips[s.turn]) + ' и вскрыться';
    if (m.a === 'raise') return '+' + m.v;
    return 'Следующая раздача';
  }
  const said = { fold: 'пас', check: 'не повышает', call: 'уравнял и вскрылся', raise: 'поднял на ' };

  const duel = SG.duel({
    game: 'seka',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over: (s) => s.over || null,
    hint: (s) => (s.phase === 'done' ? 'нажмите «Следующая раздача»' : s.toCall ? 'соперник поднял ставку' : ''),
    ai,
    aiDelay: 700,
    sound: (s, m) => (m.a === 'next' ? 'card' : m.a === 'fold' ? 'flip' : s.result ? (s.result.winner === null ? 'draw' : 'coin') : m.a === 'raise' ? 'coin' : 'click'),
    render(s, v) {
      const me = v.watch ? v.hostSide : v.me === null || v.me === undefined ? 0 : v.me;
      const op = 1 - me;
      const oppName = v.mode === 'ai' ? 'Компьютер' : v.watch ? 'Игрок 2' : 'Соперник';
      const reveal = s.phase === 'done' && s.result && s.result.how === 'show';
      $('opp-name').textContent = oppName;
      $('my-name').textContent = v.watch ? 'Игрок 1' : 'Вы';
      $('opp-chips').textContent = s.chips[op] + ' фишек';
      $('my-chips').textContent = s.chips[me] + ' фишек';
      $('opp-hand').innerHTML = s.cards[op].map((id) => (reveal ? C.html(C.byId(id), id === JOKER ? 'joker' : '') : C.back())).join('');
      // зритель не видит карт, пока их не вскроют
      $('my-hand').innerHTML = s.cards[me].map((id) => (v.watch && !reveal ? C.back() : C.html(C.byId(id), id === JOKER ? 'joker' : ''))).join('');
      $('my-points').textContent = v.watch && !reveal ? '' : points(s.cards[me]) + ' очков';
      $('opp-points').textContent = reveal ? points(s.cards[op]) + ' очков' : '';
      $('pot').textContent = 'Банк: ' + (s.pot || (s.result ? s.result.pot || s.carry : 0)) + (s.carry && s.phase === 'done' ? ' (свара — переходит дальше)' : '');
      $('label-opp').classList.toggle('turn', s.turn === op && s.phase === 'bet');
      $('label-me').classList.toggle('turn', s.turn === me && s.phase === 'bet');
      let msg = '';
      if (s.result) {
        const w = s.result.winner;
        if (w === null) msg = 'Свара: очков поровну (' + s.result.pts[0] + ')! Банк переходит в следующую раздачу.';
        else {
          const who = w === me ? 'Вы выиграли' : oppName + ' выиграл';
          msg = who + ' банк ' + s.result.pot + (s.result.how === 'fold' ? ' — ' + (w === me ? 'соперник спасовал' : 'вы спасовали') : ': ' + s.result.pts[w] + ' против ' + s.result.pts[1 - w]);
        }
      } else if (s.last && s.last.side === op) msg = oppName + ' ' + said[s.last.a] + (s.last.a === 'raise' ? s.last.v : '');
      $('msg').textContent = v.watch ? C.neutral(msg) : msg;
      actEl.innerHTML = '';
      if (v.canMove) {
        for (const m of moves(s)) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn ' + (m.a === 'raise' ? 'btn-ghost' : m.a === 'fold' ? 'btn-ghost' : 'btn-primary');
          b.textContent = actionLabel(m, s);
          b.addEventListener('click', () => duel.play(m));
          actEl.appendChild(b);
        }
      }
    },
  });
  window.__seka = { points };
})();
