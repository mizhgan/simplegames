/* Тысяча вдвоём: торговля, прикуп, марьяжи и взятки до 1000 очков */
(() => {
  'use strict';

  const C = SG.cards;
  // старшинство в масти: 9 < В < Д < К < 10 < Т
  const ORDER = { 9: 0, 11: 1, 12: 2, 13: 3, 10: 4, 14: 5 };
  const PTS = { 9: 0, 11: 2, 12: 3, 13: 4, 10: 10, 14: 11 };
  const MAR = [40, 100, 80, 60]; // ♠ ♥ ♦ ♣
  const GOAL = 1000;
  const DECK = C.deck(9); // 24 карты: 9, 10, В, Д, К, Т

  const card = C.byId;
  const pts = (id) => PTS[card(id).rank];
  const round5 = (x) => Math.round(x / 5) * 5;
  const sortHand = (h) => h.sort((a, b) => card(a).suit - card(b).suit || ORDER[card(b).rank] - ORDER[card(a).rank]);

  function marriages(hand) {
    const out = [];
    for (let s = 0; s < 4; s++) {
      const has = (r) => hand.some((id) => card(id).suit === s && card(id).rank === r);
      if (has(12) && has(13)) out.push(s);
    }
    return out;
  }
  const maxBid = (hand) => 120 + marriages(hand).reduce((a, s) => a + MAR[s], 0);

  // ---------- раздача ----------

  function create(seed) {
    const s = { seed, score: [0, 0], hand: 0, dealer: 1, over: null, history: [] };
    deal(s);
    return s;
  }

  function deal(s) {
    s.hand++;
    s.dealer = 1 - s.dealer;
    const rand = SG.duel.rng((s.seed + s.hand * 15485863) >>> 0);
    const deck = SG.duel.shuffleWith(DECK.slice(), rand).map((c) => c.id);
    s.hands = [sortHand(deck.slice(0, 10)), sortHand(deck.slice(10, 20))];
    s.prikup = deck.slice(20, 24);
    s.phase = 'bid';
    s.bid = 0;
    s.bidder = -1;
    s.turn = 1 - s.dealer;
    s.declarer = -1;
    s.trump = -1;
    s.trick = [];
    s.lastTrick = null;
    s.taken = [0, 0];
    s.tricks = [0, 0];
    s.mars = [0, 0];
    s.marLog = [];
    s.played = [];
    s.result = null;
    s.bidLog = [];
  }

  function legalCards(s) {
    const hand = s.hands[s.turn];
    if (!s.trick.length) return hand.slice();
    const lead = card(s.trick[0].id).suit;
    const follow = hand.filter((id) => card(id).suit === lead);
    if (follow.length) return follow;
    const trumps = s.trump >= 0 ? hand.filter((id) => card(id).suit === s.trump) : [];
    return trumps.length ? trumps : hand.slice();
  }

  function moves(s) {
    if (s.over) return [];
    const me = s.turn;
    if (s.phase === 'done') return [{ a: 'next' }];
    if (s.phase === 'bid') {
      const out = [];
      if (s.bid > 0) out.push({ a: 'pass' });
      const from = s.bid ? s.bid + 10 : 100;
      for (let v = from; v <= maxBid(s.hands[me]); v += 10) out.push({ a: 'bid', v });
      if (!out.length) out.push({ a: 'bid', v: 100 });
      return out;
    }
    if (s.phase === 'discard') return [{ a: 'discard' }];
    const out = [];
    for (const id of legalCards(s)) {
      out.push({ a: 'play', c: id });
      // марьяж объявляют, выходя с короля или дамы, начиная со второй своей взятки
      const c = card(id);
      if (!s.trick.length && s.tricks[me] > 0 && (c.rank === 12 || c.rank === 13) && marriages(s.hands[me]).includes(c.suit)) out.push({ a: 'play', c: id, mar: true });
    }
    return out;
  }

  function legal(s, m) {
    if (!m) return false;
    if (m.a === 'discard') {
      if (s.phase !== 'discard' || !Array.isArray(m.cards) || m.cards.length !== 4 || new Set(m.cards).size !== 4) return false;
      return m.cards.every((id) => s.hands[s.turn].includes(id));
    }
    return moves(s).some((x) => x.a === m.a && x.v === m.v && x.c === m.c && !!x.mar === !!m.mar);
  }

  function apply(s, m) {
    const me = s.turn;
    if (m.a === 'next') return deal(s);
    if (m.a === 'bid') {
      s.bid = m.v;
      s.bidder = me;
      s.bidLog.push({ side: me, v: m.v });
      s.turn = 1 - me;
      return;
    }
    if (m.a === 'pass') {
      s.bidLog.push({ side: me, v: 0 });
      // торговля окончена: заказ за тем, кто назвал последним
      s.declarer = s.bidder;
      s.hands[s.declarer] = sortHand(s.hands[s.declarer].concat(s.prikup));
      s.phase = 'discard';
      s.turn = s.declarer;
      return;
    }
    if (m.a === 'discard') {
      s.hands[me] = s.hands[me].filter((id) => !m.cards.includes(id));
      s.discarded = m.cards.slice();
      s.phase = 'play';
      s.turn = s.declarer;
      return;
    }
    // ход картой
    const c = card(m.c);
    s.hands[me] = s.hands[me].filter((id) => id !== m.c);
    if (m.mar) {
      s.trump = c.suit;
      s.mars[me] += MAR[c.suit];
      s.marLog.push({ side: me, suit: c.suit });
    }
    s.trick.push({ side: me, id: m.c });
    s.played.push(m.c);
    if (s.trick.length < 2) {
      s.turn = 1 - me;
      return;
    }
    // кто взял
    const [a, b] = s.trick.map((t) => card(t.id));
    let win = 0;
    if (b.suit === a.suit) win = ORDER[b.rank] > ORDER[a.rank] ? 1 : 0;
    else if (b.suit === s.trump) win = 1;
    const winner = s.trick[win].side;
    s.taken[winner] += pts(s.trick[0].id) + pts(s.trick[1].id);
    s.tricks[winner]++;
    s.lastTrick = { cards: s.trick.slice(), winner };
    s.trick = [];
    s.turn = winner;
    if (!s.hands[0].length && !s.hands[1].length) finishHand(s);
  }

  function finishHand(s) {
    const d = s.declarer;
    const total = [s.taken[0] + s.mars[0], s.taken[1] + s.mars[1]];
    const made = total[d] >= s.bid;
    const delta = [0, 0];
    delta[d] = made ? s.bid : -s.bid;
    delta[1 - d] = round5(total[1 - d]);
    s.score[0] += delta[0];
    s.score[1] += delta[1];
    s.result = { total, delta, made };
    s.history.push(delta);
    s.phase = 'done';
    s.turn = s.dealer; // следующую раздачу начинает тот, кто будет торговаться первым
    const [x, y] = s.score;
    if (x >= GOAL || y >= GOAL) s.over = { winner: x === y ? null : x > y ? 0 : 1, text: 'Счёт ' + Math.max(x, y) + ':' + Math.min(x, y) + '.' };
  }

  // ---------- компьютер ----------

  function handValue(hand) {
    let v = 0;
    for (let st = 0; st < 4; st++) {
      const suit = hand.filter((id) => card(id).suit === st).map((id) => card(id).rank);
      if (suit.includes(14)) v += 11 + (suit.includes(10) ? 10 : 0);
      else if (suit.includes(10)) v += suit.length >= 3 ? 7 : 3;
      v += suit.length >= 4 ? 5 : 0;
    }
    return v + marriages(hand).reduce((a, st) => a + MAR[st] * 0.9, 0);
  }

  function aiBid(s, level) {
    const hand = s.hands[s.turn];
    const est = handValue(hand) + { easy: 30, normal: 35, hard: 38 }[level];
    const limit = Math.min(maxBid(hand), Math.floor(est / 10) * 10);
    const next = s.bid ? s.bid + 10 : 100;
    if (!s.bid) return { a: 'bid', v: 100 };
    if (next <= limit && (level !== 'easy' || Math.random() < 0.7)) return { a: 'bid', v: next };
    return { a: 'pass' };
  }

  function aiDiscard(s) {
    const hand = s.hands[s.turn];
    const keep = new Set();
    for (const st of marriages(hand)) hand.forEach((id) => card(id).suit === st && (card(id).rank === 12 || card(id).rank === 13) && keep.add(id));
    // сбрасываем самые слабые карты, стараясь оставить тузы и десятки при тузах
    const score = (id) => {
      const c = card(id);
      const suit = hand.filter((x) => card(x).suit === c.suit);
      let v = ORDER[c.rank] * 3 + PTS[c.rank];
      if (c.rank === 10 && !suit.some((x) => card(x).rank === 14)) v -= 8;
      v += suit.length; // короткие масти — в снос, чтобы появились «дыры»
      return keep.has(id) ? 1000 : v;
    };
    return { a: 'discard', cards: hand.slice().sort((a, b) => score(a) - score(b)).slice(0, 4) };
  }

  function aiPlay(s, level) {
    const me = s.turn;
    const ms = moves(s);
    if (level === 'easy' && Math.random() < 0.3) {
      const plain = ms.filter((m) => !m.mar);
      return plain[Math.floor(Math.random() * plain.length)];
    }
    const hand = s.hands[me];
    const gone = new Set(s.played);
    const stronger = (c) => {
      // есть ли ещё не вышедшие старшие карты этой масти (не у меня)
      for (const r of [9, 10, 11, 12, 13, 14]) {
        if (ORDER[r] <= ORDER[c.rank]) continue;
        const id = c.suit * 13 + r - 2;
        if (!gone.has(id) && !hand.includes(id)) return true;
      }
      return false;
    };
    if (!s.trick.length) {
      // объявляем самый дорогой марьяж
      const mar = ms.filter((m) => m.mar).sort((a, b) => MAR[card(b.c).suit] - MAR[card(a.c).suit]);
      if (mar.length) return mar[0];
      // выходим с карты, которую не перебьют
      const safe = ms.filter((m) => !m.mar && !stronger(card(m.c)) && (s.trump < 0 || card(m.c).suit === s.trump || !opponentMayRuff(s, card(m.c).suit)));
      if (safe.length) return safe.sort((a, b) => pts(b.c) - pts(a.c))[0];
      // иначе — дешёвая карта, не разбивая марьяж
      const cheap = ms.filter((m) => !m.mar && !isMarriageCard(hand, m.c)).sort((a, b) => ORDER[card(a.c).rank] - ORDER[card(b.c).rank]);
      return cheap[0] || ms.find((m) => !m.mar) || ms[0];
    }
    const lead = card(s.trick[0].id);
    const beats = (id) => {
      const c = card(id);
      if (c.suit === lead.suit) return ORDER[c.rank] > ORDER[lead.rank];
      return s.trump >= 0 && c.suit === s.trump && lead.suit !== s.trump;
    };
    const winners = ms.filter((m) => beats(m.c)).sort((a, b) => ORDER[card(a.c).rank] - ORDER[card(b.c).rank] || pts(a.c) - pts(b.c));
    const worth = pts(s.trick[0].id);
    if (winners.length && (worth >= 3 || pts(winners[winners.length - 1].c) >= 10)) {
      // берём самой дорогой бьющей картой, если она очковая и её всё равно не сберечь, иначе самой дешёвой
      const top = winners[winners.length - 1];
      return pts(top.c) >= 10 && !stronger(card(top.c)) ? top : winners[0];
    }
    if (winners.length && worth > 0) return winners[0];
    const low = ms.slice().sort((a, b) => pts(a.c) - pts(b.c) || isMarriageCard(hand, a.c) - isMarriageCard(hand, b.c));
    return low[0];
  }

  function isMarriageCard(hand, id) {
    const c = card(id);
    return (c.rank === 12 || c.rank === 13) && marriages(hand).includes(c.suit);
  }

  function opponentMayRuff(s, suit) {
    // грубо: если масть уже ходила дважды, у соперника её может не быть
    return s.played.filter((id) => card(id).suit === suit).length >= 3;
  }

  function ai(s, level) {
    if (s.phase === 'done') return new Promise((r) => setTimeout(() => r({ a: 'next' }), 2500));
    if (s.phase === 'bid') return aiBid(s, level);
    if (s.phase === 'discard') return aiDiscard(s);
    return aiPlay(s, level);
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const actEl = $('actions');
  let sel = new Set(); // выбранные для сноса карты
  let lastPhase = '';

  const SUIT_TXT = ['♠ пики', '♥ черви', '♦ бубны', '♣ трефы'];

  const duel = SG.duel({
    game: 'thousand',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over: (s) => s.over || null,
    hint(s) {
      if (s.phase === 'bid') return s.bid ? 'повысьте заказ или спасуйте' : 'начните торговлю';
      if (s.phase === 'discard') return 'выберите 4 карты в снос';
      if (s.phase === 'play') return s.trick.length ? 'отбивайтесь' : 'ваш заход';
      return 'нажмите «Следующая раздача»';
    },
    ai,
    aiDelay: 650,
    sound: (s, m) => (m.a === 'play' ? (m.mar ? 'win' : 'card') : m.a === 'next' ? 'flip' : 'click'),
    render(s, v) {
      const me = v.me === null || v.me === undefined ? 0 : v.me;
      const op = 1 - me;
      const oppName = v.mode === 'ai' ? 'Компьютер' : 'Соперник';
      if (s.phase !== lastPhase || !v.canMove) sel = new Set();
      lastPhase = s.phase;
      const playable = new Set(v.canMove && s.phase === 'play' ? moves(s).map((m) => m.c) : []);
      const marCards = new Set(v.canMove && s.phase === 'play' ? moves(s).filter((m) => m.mar).map((m) => m.c) : []);
      $('opp-name').textContent = oppName + (s.declarer === op ? ' · заказ ' + s.bid : '');
      $('my-name').textContent = 'Вы' + (s.declarer === me ? ' · заказ ' + s.bid : '');
      $('opp-score').textContent = s.score[op];
      $('my-score').textContent = s.score[me];
      $('opp-hand').innerHTML = s.hands[op].map(() => C.back()).join('');
      $('my-hand').innerHTML = s.hands[me]
        .map((id) => C.html(card(id), (playable.has(id) || (v.canMove && s.phase === 'discard') ? 'playable' : v.canMove && s.phase === 'play' ? 'dim' : '') + (sel.has(id) ? ' sel' : '') + (marCards.has(id) ? ' mar' : '')))
        .join('');
      // центр стола: прикуп во время торговли и сноса, иначе текущая взятка
      let center = '';
      if (s.phase === 'bid') center = s.prikup.map(() => C.back()).join('');
      else if (s.phase === 'discard') center = s.prikup.map((id) => C.html(card(id))).join('');
      else if (s.trick.length) center = s.trick.map((t) => C.html(card(t.id), t.side === op ? 'opp' : '')).join('');
      else if (s.lastTrick) center = s.lastTrick.cards.map((t) => C.html(card(t.id), 'old')).join('');
      $('center').innerHTML = center;
      const bits = [];
      if (s.phase === 'bid') bits.push(s.bid ? 'Заказ: ' + s.bid + ' (' + (s.bidder === me ? 'вы' : oppName.toLowerCase()) + ')' : 'Торговля');
      else bits.push('Заказ ' + s.bid);
      if (s.trump >= 0) bits.push('козырь ' + SUIT_TXT[s.trump]);
      if (s.phase === 'play' || s.phase === 'done') bits.push('очки: вы ' + (s.taken[me] + s.mars[me]) + ', ' + oppName.toLowerCase() + ' ' + (s.taken[op] + s.mars[op]));
      $('info').textContent = bits.join(' · ');
      let msg = '';
      if (s.result) {
        const d = s.declarer;
        const who = d === me ? 'Вы' : oppName;
        msg = who + (s.result.made ? ' сыграл' + (d === me ? 'и' : '') + ' заказ' : ' не добрал' + (d === me ? 'и' : '') + ' заказ') + ': ' + (s.result.delta[d] > 0 ? '+' : '') + s.result.delta[d] + '. ' + (d === me ? oppName : 'Вам') + ': +' + s.result.delta[1 - d] + '.';
      } else if (s.marLog.length && s.trick.length === 1 && s.marLog[s.marLog.length - 1].side === s.trick[0].side && s.trump === card(s.trick[0].id).suit && s.played[s.played.length - 1] === s.trick[0].id) {
        const m = s.marLog[s.marLog.length - 1];
        msg = (m.side === me ? 'Вы объявили' : oppName + ' объявил') + ' марьяж ' + SUIT_TXT[m.suit] + ' (+' + MAR[m.suit] + '), это теперь козырь!';
      } else if (s.phase === 'bid' && s.bidLog.length) {
        const l = s.bidLog[s.bidLog.length - 1];
        if (l.side === op) msg = oppName + ': ' + (l.v ? l.v : 'пас');
      } else if (s.phase === 'play' && s.lastTrick && !s.trick.length) msg = 'Взятку забрал' + (s.lastTrick.winner === me ? 'и вы' : ' ' + oppName.toLowerCase());
      $('msg').textContent = msg;
      renderActions(s, v, me);
    },
  });

  function renderActions(s, v, me) {
    actEl.innerHTML = '';
    if (!v.canMove) return;
    const btn = (text, cls, fn, dis) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls;
      b.textContent = text;
      b.disabled = !!dis;
      b.addEventListener('click', fn);
      actEl.appendChild(b);
      return b;
    };
    if (s.phase === 'bid') {
      const ms = moves(s);
      ms.filter((m) => m.a === 'bid').slice(0, 5).forEach((m) => btn(String(m.v), 'btn-primary', () => duel.play(m)));
      if (ms.some((m) => m.a === 'pass')) btn('Пас', 'btn-ghost', () => duel.play({ a: 'pass' }));
      const mx = maxBid(s.hands[me]);
      const note = document.createElement('small');
      note.className = 'th-note';
      note.textContent = mx > 120 ? 'С марьяжами можно заказать до ' + mx : 'Без марьяжа — не больше 120';
      actEl.appendChild(note);
    } else if (s.phase === 'discard') {
      btn('Снести ' + sel.size + ' из 4', 'btn-primary', () => duel.play({ a: 'discard', cards: [...sel] }), sel.size !== 4);
    } else if (s.phase === 'done') btn('Следующая раздача', 'btn-primary', () => duel.play({ a: 'next' }));
  }

  // клики по своим картам: ход, объявление марьяжа или выбор в снос
  $('my-hand').addEventListener('click', (e) => {
    const el = e.target.closest('.sol-card');
    if (!el || !duel.canMove()) return;
    const id = +el.dataset.id;
    const s = duel.state;
    if (s.phase === 'discard') {
      if (sel.has(id)) sel.delete(id);
      else if (sel.size < 4) sel.add(id);
      SG.sound.play('click');
      return duel.render();
    }
    if (s.phase !== 'play') return;
    const ms = moves(s).filter((m) => m.c === id);
    if (!ms.length) return;
    const mar = ms.find((m) => m.mar);
    if (mar) {
      // спрашиваем, объявлять ли марьяж
      actEl.innerHTML = '';
      const ask = (text, m, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + cls;
        b.textContent = text;
        b.addEventListener('click', () => duel.play(m));
        actEl.appendChild(b);
      };
      ask('Объявить марьяж +' + MAR[card(id).suit], mar, 'btn-primary');
      ask('Просто сходить', ms.find((m) => !m.mar), 'btn-ghost');
      return;
    }
    duel.play(ms[0]);
  });
})();
