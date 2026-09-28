/* Преферанс («Сочинка») втроём: торговля, прикуп, вист/пас, мизер, распасы; пуля, гора, висты */
(() => {
  'use strict';

  const C = SG.cards;
  const esc = SG.party.esc;
  const TURN_TIME = 45;
  const RESULT_MS = 7000; // сколько показываем итог раздачи
  const NT = 4; // «без козыря»
  // масти в торговле по старшинству: ♠ ♣ ♦ ♥, выше — без козыря (индексы из SG.cards: 0♠ 1♥ 2♦ 3♣)
  const BID_SUITS = [0, 3, 2, 1, NT];
  const MISERE = 15;
  // заявки 0…25: 6♠ … 8БК, мизер, 9♠ … 10БК
  const BIDS = [];
  for (let l = 6; l <= 10; l++) {
    if (l === 9) BIDS.push({ misere: true });
    BID_SUITS.forEach((s) => BIDS.push({ lvl: l, suit: s }));
  }
  const VALUE = { 6: 2, 7: 4, 8: 6, 9: 8, 10: 10 };
  const OBLIG = { 6: 4, 7: 2, 8: 1, 9: 1, 10: 0 }; // сколько взяток должны взять вистующие
  const suitSign = (s) => (s === NT ? 'БК' : C.SUITS[s]);
  const bidName = (i) => (BIDS[i].misere ? 'мизер' : BIDS[i].lvl + ' ' + suitSign(BIDS[i].suit));
  const valueOf = (i) => (BIDS[i].misere ? 10 : VALUE[BIDS[i].lvl]);
  const tricksWord = (n) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'взятка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'взятки' : 'взяток');
  // порядок мастей в руке: чередуем цвета — ♠ ♦ ♣ ♥
  const HAND_ORDER = { 0: 0, 2: 1, 3: 2, 1: 3 };
  const sortHand = (h) => h.slice().sort((a, b) => HAND_ORDER[a.suit] - HAND_ORDER[b.suit] || b.rank - a.rank);

  // ---------- правила ----------

  const idx = (s, id) => s.ids.indexOf(id);
  const nextOf = (s, id) => s.ids[(idx(s, id) + 1) % 3];
  const say = (s, t, o) => SG.party.log(s, t, o);

  function create(players, opts) {
    const s = { ids: players.map((p) => p.id), names: {}, score: {}, dealer: Math.floor(Math.random() * 3), deal: 0, deals: (opts && +opts.deals) || 9, log: [], now: Date.now(), winner: null, phase: 'bid' };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.score[p.id] = { pulya: 0, gora: 0, vist: 0 };
    });
    newDeal(s, s.now);
    return s;
  }

  function newDeal(s, now) {
    s.deal++;
    s.dealer = (s.dealer + 1) % 3;
    const d = C.deck(7);
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    s.hands = {};
    s.ids.forEach((id, k) => (s.hands[id] = d.slice(k * 10, k * 10 + 10)));
    s.talon = d.slice(30);
    s.first = s.ids[(s.dealer + 1) % 3]; // первая рука
    s.phase = 'bid';
    s.turn = s.first;
    s.words = {}; // последнее слово каждого в торговле: номер заявки или 'pass'
    s.high = -1;
    s.highBy = null;
    s.declarer = null;
    s.contract = null;
    s.whist = {};
    s.trick = [];
    s.lastTrick = null;
    s.tricks = {};
    s.ids.forEach((id) => (s.tricks[id] = 0));
    s.talonOpen = false;
    s.result = null;
    s.deadline = now + TURN_TIME * 1000;
    say(s, 'Раздача ' + s.deal + ' из ' + s.deals + ': сдаёт ' + s.names[s.ids[s.dealer]] + ', первым говорит ' + s.names[s.first], { i: '🃏' });
  }

  const passedAuction = (s) => s.ids.filter((id) => s.words[id] === 'pass');
  const inAuction = (s) => s.ids.filter((id) => s.words[id] !== 'pass');

  // допустимые заявки игрока сейчас
  function legalBids(s, id) {
    if (s.phase !== 'bid' || s.turn !== id) return [];
    if (s.words[id] === MISERE) return []; // заказавший мизер может только пасовать
    const out = [];
    for (let i = s.high + 1; i < BIDS.length; i++) {
      if (i === MISERE && s.words[id] !== undefined) continue; // мизер — только первым словом
      out.push(i);
    }
    return out;
  }

  const trumpOf = (s) => (s.contract === null || s.contract === MISERE || s.contract === 'rasp' || BIDS[s.contract].suit === NT ? null : BIDS[s.contract].suit);

  // какие карты можно положить: масть хода, нет — козырь, нет и козыря — любую
  function playable(s, id) {
    const h = s.hands[id];
    if (!s.trick.length) return h;
    const lead = s.trick[0].card.suit;
    const same = h.filter((c) => c.suit === lead);
    if (same.length) return same;
    const t = trumpOf(s);
    const tr = t === null ? [] : h.filter((c) => c.suit === t);
    return tr.length ? tr : h;
  }

  function trickWinner(trick, trump) {
    const lead = trick[0].card.suit;
    let best = trick[0];
    trick.forEach((p) => {
      const c = p.card;
      const b = best.card;
      if (trump !== null && c.suit === trump && b.suit !== trump) best = p;
      else if (c.suit === b.suit && c.rank > b.rank && (c.suit === lead || c.suit === trump)) best = p;
    });
    return best.id;
  }

  function nextBidder(s, from) {
    let id = from;
    for (let k = 0; k < 3; k++) {
      id = nextOf(s, id);
      if (s.words[id] !== 'pass') return id;
    }
    return null;
  }

  function endAuction(s, now) {
    const live = inAuction(s);
    if (s.high < 0 && live.length === 0) {
      s.contract = 'rasp';
      say(s, 'Все спасовали — распасы: каждый старается взять поменьше взяток', { i: '🔄', big: true });
      startPlay(s, now);
      return true;
    }
    if (s.high >= 0 && live.length === 1) {
      s.declarer = s.highBy;
      s.talonOpen = true;
      s.hands[s.declarer] = s.hands[s.declarer].concat(s.talon);
      say(s, s.names[s.declarer] + ' выигрывает торговлю (' + bidName(s.high) + ') и открывает прикуп: ' + s.talon.map(C.name).join(' '), { w: s.declarer, i: '📥', big: true });
      s.phase = 'discard';
      s.turn = s.declarer;
      s.deadline = now + TURN_TIME * 1000;
      return true;
    }
    return false;
  }

  function startPlay(s, now) {
    s.phase = 'play';
    s.turn = s.first;
    s.trick = [];
    s.deadline = now + TURN_TIME * 1000;
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || s.phase === 'result' || s.turn !== id) return false;
    const name = s.names[id];
    if (s.phase === 'bid') {
      if (a.pass) {
        s.words[id] = 'pass';
        say(s, name + ': пас', { w: id, i: '🙅' });
      } else if (Number.isInteger(a.bid) && legalBids(s, id).includes(a.bid)) {
        s.words[id] = a.bid;
        s.high = a.bid;
        s.highBy = id;
        say(s, name + ': ' + bidName(a.bid), { w: id, i: '🗣' });
      } else return false;
      if (!endAuction(s, now)) {
        s.turn = nextBidder(s, id);
        s.deadline = now + TURN_TIME * 1000;
      }
      return true;
    }
    if (s.phase === 'discard') {
      const ids = Array.isArray(a.discard) ? [...new Set(a.discard.map(Number))] : [];
      const h = s.hands[id];
      if (ids.length !== 2 || !ids.every((cid) => h.some((c) => c.id === cid))) return false;
      s.hands[id] = h.filter((c) => !ids.includes(c.id));
      s.talonOpen = false;
      say(s, name + ' сносит две карты', { w: id, i: '📤' });
      if (s.high === MISERE) {
        s.contract = MISERE;
        say(s, name + ' играет мизер — обязуется не взять ни одной взятки', { w: id, i: '🎯', big: true });
        startPlay(s, now);
      } else {
        s.phase = 'contract';
        s.deadline = now + TURN_TIME * 1000;
      }
      return true;
    }
    if (s.phase === 'contract') {
      if (!Number.isInteger(a.contract) || a.contract < s.high || a.contract === MISERE || a.contract >= BIDS.length) return false;
      s.contract = a.contract;
      say(s, name + ' играет ' + bidName(a.contract), { w: id, i: '🎯', big: true });
      s.phase = 'whist';
      s.turn = nextOf(s, id);
      s.deadline = now + TURN_TIME * 1000;
      return true;
    }
    if (s.phase === 'whist') {
      if (typeof a.whist !== 'boolean') return false;
      s.whist[id] = a.whist;
      say(s, name + ': ' + (a.whist ? 'вист' : 'пас'), { w: id, i: a.whist ? '⚔' : '🙅' });
      const other = nextOf(s, id);
      if (other !== s.declarer && s.whist[other] === undefined) {
        s.turn = other;
        s.deadline = now + TURN_TIME * 1000;
        return true;
      }
      if (!Object.values(s.whist).some(Boolean)) {
        // оба спасовали — игра засчитана без розыгрыша
        const v = valueOf(s.contract);
        s.score[s.declarer].pulya += v;
        s.result = { lines: [s.names[s.declarer] + ': ' + bidName(s.contract) + ' засчитано без розыгрыша, +' + v + ' в пулю'] };
        say(s, 'Оба спасовали — ' + s.result.lines[0], { w: s.declarer, i: '✅', k: 'good', big: true });
        return finishDeal(s, now);
      }
      startPlay(s, now);
      return true;
    }
    if (s.phase === 'play') {
      const card = s.hands[id].find((c) => c.id === +a.card);
      if (!card || !playable(s, id).includes(card)) return false;
      s.hands[id] = s.hands[id].filter((c) => c !== card);
      s.trick.push({ id, card });
      if (s.trick.length < 3) {
        s.turn = nextOf(s, id);
        s.deadline = now + TURN_TIME * 1000;
        return true;
      }
      const w = trickWinner(s.trick, trumpOf(s));
      s.tricks[w]++;
      s.lastTrick = { cards: s.trick, winner: w };
      s.trick = [];
      say(s, s.names[w] + ' берёт взятку (' + s.lastTrick.cards.map((p) => C.name(p.card)).join(' ') + ') — всего ' + tricksWord(s.tricks[w]), { w, i: '🂠' });
      if (!s.hands[w].length) return scoreDeal(s, now);
      s.turn = w;
      s.deadline = now + TURN_TIME * 1000;
      return true;
    }
    return false;
  }

  // ---------- запись ----------

  function scoreDeal(s, now) {
    const lines = [];
    const sc = s.score;
    if (s.contract === 'rasp') {
      s.ids.forEach((id) => {
        const t = s.tricks[id];
        if (t) {
          sc[id].gora += t;
          lines.push(s.names[id] + ': ' + tricksWord(t) + ' — +' + t + ' в гору');
        } else {
          sc[id].pulya += 1;
          lines.push(s.names[id] + ': ни одной взятки — +1 в пулю');
        }
      });
    } else if (s.contract === MISERE) {
      const d = s.declarer;
      const t = s.tricks[d];
      if (!t) {
        sc[d].pulya += 10;
        lines.push(s.names[d] + ': мизер сыгран — +10 в пулю');
      } else {
        sc[d].gora += 10 * t;
        lines.push(s.names[d] + ': мизер пойман, ' + tricksWord(t) + ' — +' + 10 * t + ' в гору');
      }
    } else {
      const d = s.declarer;
      const b = BIDS[s.contract];
      const v = VALUE[b.lvl];
      const dt = s.tricks[d];
      const def = 10 - dt;
      const under = Math.max(0, b.lvl - dt);
      if (!under) {
        sc[d].pulya += v;
        lines.push(s.names[d] + ': ' + bidName(s.contract) + ' сыграно (' + tricksWord(dt) + ') — +' + v + ' в пулю');
      } else {
        sc[d].gora += v * under;
        lines.push(s.names[d] + ': недобор ' + under + ' на ' + bidName(s.contract) + ' — +' + v * under + ' в гору');
      }
      const W = s.ids.filter((id) => s.whist[id]);
      const need = OBLIG[b.lvl];
      W.forEach((w) => {
        const mine = W.length === 1 ? def : s.tricks[w];
        const vists = v * mine + v * under; // за свои взятки и за недобор разыгрывающего
        sc[w].vist += vists;
        const share = W.length === 1 ? need : Math.ceil(need / 2);
        const short = Math.max(0, share - mine);
        let line = s.names[w] + ': висты +' + vists;
        if (short && !under) {
          const pen = Math.ceil(v / 2) * short;
          sc[w].gora += pen;
          line += ', недобор вистов — +' + pen + ' в гору';
        }
        lines.push(line);
      });
    }
    s.result = { lines };
    say(s, 'Итог раздачи: ' + lines.join('; '), { i: '📝', big: true });
    return finishDeal(s, now);
  }

  const total = (sc) => 10 * (sc.pulya - sc.gora) + sc.vist;

  function finishDeal(s, now) {
    if (s.deal >= s.deals) {
      s.phase = 'end';
      let best = s.ids[0];
      s.ids.forEach((id) => {
        if (total(s.score[id]) > total(s.score[best])) best = id;
      });
      s.winner = best;
      say(s, 'Пулька окончена! Побеждает ' + s.names[best] + ' — итог ' + total(s.score[best]), { w: best, i: '🏆', k: 'good', big: true });
      return true;
    }
    s.phase = 'result';
    s.deadline = now + RESULT_MS;
    return true;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'result') {
      newDeal(s, now);
      return true;
    }
    // время вышло — за игрока ходит осторожный бот
    return act(s, s.turn, ai(s, s.turn, 'easy'), now);
  }

  function leave(s, id) {
    if (s.phase !== 'end') say(s, s.names[id] + ' выходит из игры — дальше за этого игрока играет бот', { w: id, i: '🚪' });
  }

  // ---------- бот ----------

  // сколько взяток примерно даст рука при козыре trump (null — без козыря)
  function estimate(hand, trump) {
    let t = 0;
    const by = [0, 1, 2, 3].map((x) => hand.filter((c) => c.suit === x).map((c) => c.rank).sort((a, b) => b - a));
    const tl = trump === null ? 0 : by[trump].length;
    by.forEach((r, x) => {
      const n = r.length;
      if (r.includes(14)) t += 1;
      if (r.includes(13)) t += n >= 2 ? 0.75 : 0.25;
      if (r.includes(12)) t += n >= 3 ? 0.45 : 0.1;
      if (x === trump) {
        t += Math.max(0, n - 2) * 0.75;
        if (r.includes(11) && n >= 4) t += 0.3;
      } else if (trump !== null && tl >= 3) t += n === 0 ? 0.8 : n === 1 ? 0.35 : 0;
      else if (trump === null && r[0] === 14 && r[1] === 13) t += Math.max(0, n - 4) * 0.7;
    });
    return t;
  }

  // рука без опасных карт: в каждой масти карты не выше «7, 9, В, К» по порядку снизу
  function misereSafe(hand) {
    return [0, 1, 2, 3].every((x) =>
      hand
        .filter((c) => c.suit === x)
        .map((c) => c.rank)
        .sort((a, b) => a - b)
        .every((r, i) => r <= 7 + 2 * i)
    );
  }

  const suitOfBid = (i) => (BIDS[i].suit === NT ? null : BIDS[i].suit);
  const TALON = 0.9; // прикуп и снос в среднем добавляют около взятки

  function ai(s, id, level) {
    if (s.phase === 'end' || s.phase === 'result' || s.turn !== id) return null;
    const hand = s.hands[id];
    const skill = { easy: -0.4, normal: 0, hard: 0.25 }[level] || 0;
    if (s.phase === 'bid') {
      const legal = legalBids(s, id);
      if (!legal.length) return { pass: 1 };
      if (legal.includes(MISERE) && level !== 'easy' && misereSafe(hand) && s.high < MISERE) return { bid: MISERE };
      const est = (i) => estimate(hand, suitOfBid(i)) + TALON + skill + (level === 'easy' ? (Math.random() - 0.5) * 0.8 : 0);
      const ok = legal.find((i) => !BIDS[i].misere && est(i) >= BIDS[i].lvl);
      return ok === undefined ? { pass: 1 } : { bid: ok };
    }
    if (s.phase === 'discard') {
      if (s.high === MISERE) {
        // на мизере сносим самые старшие карты
        return { discard: hand.slice().sort((a, b) => b.rank - a.rank).slice(0, 2).map((c) => c.id) };
      }
      // козырь — масть, с которой рука сильнее всего; сносим младшие из коротких немастей, не трогая тузов
      let trump = 0;
      [0, 1, 2, 3].forEach((x) => estimate(hand, x) > estimate(hand, trump) && (trump = x));
      const len = (x) => hand.filter((c) => c.suit === x).length;
      const cands = hand.filter((c) => c.suit !== trump && c.rank !== 14).sort((a, b) => len(a.suit) - len(b.suit) || a.rank - b.rank);
      const pick = (cands.length >= 2 ? cands : hand.slice().sort((a, b) => a.rank - b.rank)).slice(0, 2);
      return { discard: pick.map((c) => c.id) };
    }
    if (s.phase === 'contract') {
      // заказ не ниже заявки: самая «дорогая» игра, которую рука вытягивает
      let best = s.high;
      for (let i = s.high; i < BIDS.length; i++) if (!BIDS[i].misere && estimate(hand, suitOfBid(i)) + skill >= BIDS[i].lvl + 0.3) best = i;
      return { contract: best };
    }
    if (s.phase === 'whist') {
      const b = BIDS[s.contract];
      const mine = estimate(hand, suitOfBid(s.contract));
      const need = OBLIG[b.lvl] / 2;
      if (b.lvl === 6) return { whist: mine + skill >= 1.2 || Math.random() < 0.3 };
      return { whist: mine + skill + (level === 'easy' ? Math.random() - 0.5 : 0) >= need + 0.6 };
    }
    if (s.phase === 'play') return { card: playCard(s, id, level).id };
    return null;
  }

  function playCard(s, id, level) {
    const opts = playable(s, id).slice().sort((a, b) => a.rank - b.rank);
    if (level === 'easy' && Math.random() < 0.35) return opts[Math.floor(Math.random() * opts.length)];
    const trump = trumpOf(s);
    const avoid = s.contract === 'rasp' || (s.contract === MISERE && id === s.declarer);
    const beats = (c, w) => (c.suit === w.suit ? c.rank > w.rank : trump !== null && c.suit === trump);
    const lowest = (list) => list.slice().sort((a, b) => (a.suit === trump) - (b.suit === trump) || a.rank - b.rank)[0];
    const winning = s.trick.length ? s.trick.find((p) => p.id === trickWinner(s.trick, trump)) : null;
    if (avoid) {
      if (!winning) return opts[0]; // заходим с самой младшей
      const under = opts.filter((c) => !beats(c, winning.card));
      if (under.length) return under[under.length - 1]; // старшая из тех, что не берут
      return opts[opts.length - 1]; // взятка всё равно наша — избавляемся от старшей
    }
    if (s.contract === MISERE) return opts[0]; // ловим мизериста: кладём и заходим мелко, чтобы ему было не подлезть
    const team = (x) => (x === s.declarer ? 'd' : 'o');
    if (!winning) {
      // заход
      const aces = opts.filter((c) => c.rank === 14 && c.suit !== trump);
      if (id === s.declarer && trump !== null) {
        const tr = opts.filter((c) => c.suit === trump).sort((a, b) => b.rank - a.rank);
        if (tr.length >= 2) return tr[0].rank === 14 || tr.length >= 4 ? tr[0] : tr[tr.length - 1];
      }
      if (aces.length) return aces[0];
      const len = (x) => opts.filter((c) => c.suit === x).length;
      return opts.slice().sort((a, b) => (a.suit === trump) - (b.suit === trump) || len(b.suit) - len(a.suit) || a.rank - b.rank)[0];
    }
    const last = s.trick.length === 2;
    if (team(winning.id) === team(id) && (last || winning.card.rank >= 13)) return lowest(opts); // партнёр берёт
    const over = opts.filter((c) => beats(c, winning.card)).sort((a, b) => (a.suit === trump) - (b.suit === trump) || a.rank - b.rank);
    if (over.length) return last ? over[0] : over[over.length - 1].rank >= 13 ? over[over.length - 1] : over[0];
    return lowest(opts);
  }

  // ---------- вид ----------

  function view(s, id) {
    const role = (pid) => {
      if (s.contract === 'rasp') return 'распасы';
      if (s.declarer === pid) return s.contract !== null ? 'играет ' + bidName(s.contract) : 'разыгрывает';
      if (s.declarer !== null && s.whist[pid] !== undefined) return s.whist[pid] ? 'вист' : 'пас';
      if (s.phase === 'bid') return s.words[pid] === undefined ? '' : s.words[pid] === 'pass' ? 'пас' : bidName(s.words[pid]);
      return '';
    };
    const me = s.hands[id] ? s.hands[id] : null;
    const v = {
      seats: s.ids.map((pid) => ({ id: pid, name: s.names[pid], n: s.hands[pid].length, tricks: s.tricks[pid], role: role(pid), dealer: s.ids[s.dealer] === pid, score: s.score[pid], total: total(s.score[pid]) })),
      phase: s.phase,
      turn: s.turn,
      deal: s.deal,
      deals: s.deals,
      contract: s.contract === null ? null : s.contract === 'rasp' ? 'распасы' : bidName(s.contract),
      trump: trumpOf(s),
      declarer: s.declarer,
      high: s.high >= 0 ? bidName(s.high) : null,
      talon: s.talonOpen ? s.talon : null,
      trick: s.trick.map((p) => ({ id: p.id, card: p.card })),
      lastTrick: s.lastTrick,
      result: s.phase === 'result' || s.phase === 'end' ? s.result : null,
      log: s.log.slice(-30),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.phase === 'end',
      winner: s.winner,
    };
    if (me && s.phase !== 'end') {
      v.hand = sortHand(me);
      if (s.turn === id) {
        if (s.phase === 'bid') v.bids = legalBids(s, id);
        if (s.phase === 'play') v.ok = playable(s, id).map((c) => c.id);
        if (s.phase === 'contract') v.contracts = BIDS.map((b, i) => i).filter((i) => i >= s.high && !BIDS[i].misere);
      }
    }
    return v;
  }

  // ---------- отрисовка ----------

  let pickDiscard = [];
  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const mine = v.turn === me && !v.over && v.phase !== 'result';
    if (v.phase !== 'discard' || !mine) pickDiscard = [];
    const nameOf = (pid) => esc(ui.name(pid));

    const seats = v.seats
      .map((p) => {
        const cls = 'pt-seat' + (p.id === v.turn && !v.over && v.phase !== 'result' ? ' turn' : '') + (p.id === me ? ' me' : '') + (p.id === v.declarer ? ' pf-decl' : '');
        const info = [p.dealer ? 'сдаёт' : '', p.role, v.phase === 'play' || v.phase === 'result' ? '🂠 ' + tricksWord(p.tricks) : ''].filter(Boolean).join(' · ');
        return `<div class="${cls}" data-seat="${p.id}"><b>${esc(p.name)}${p.id === me ? ' (вы)' : ''}</b><span>${info || '&nbsp;'}</span></div>`;
      })
      .join('');

    let status;
    if (v.over) status = v.winner === me ? 'Вы выиграли пульку! 🏆' : nameOf(v.winner) + ' выигрывает пульку';
    else if (v.phase === 'result') status = 'Итог раздачи';
    else if (v.phase === 'bid') status = mine ? 'Торговля: ваше слово' + (v.high ? ' (сейчас ' + v.high + ')' : '') : 'Торгуется ' + nameOf(v.turn) + (v.high ? ' · сейчас ' + v.high : '');
    else if (v.phase === 'discard') status = mine ? 'Возьмите прикуп: снесите две карты' + (pickDiscard.length ? ` (выбрано ${pickDiscard.length})` : '') : nameOf(v.turn) + ' сносит две карты';
    else if (v.phase === 'contract') status = mine ? 'Назовите игру (не ниже ' + v.high + ')' : nameOf(v.turn) + ' выбирает игру';
    else if (v.phase === 'whist') status = mine ? 'Играется ' + v.contract + ' — вистуете или пас?' : nameOf(v.turn) + ' решает: вист или пас';
    else if (v.phase === 'play') status = (mine ? 'Ваш ход' : 'Ходит ' + nameOf(v.turn)) + ' · ' + v.contract + (v.trump !== null ? ' · козырь ' + C.SUITS[v.trump] : '');

    // стол: текущая взятка (или последняя, пока новую не начали), в фазе прикупа — прикуп
    let table = '';
    if (v.talon) table = `<div class="pf-talon"><span class="tb-pot">прикуп</span>${v.talon.map((c) => C.html(c)).join('')}</div>`;
    else if (v.phase === 'play' || v.phase === 'result') {
      const shown = v.trick.length ? v.trick : v.lastTrick ? v.lastTrick.cards : [];
      const won = !v.trick.length && v.lastTrick ? v.lastTrick.winner : null;
      table = `<div class="pf-trick">${shown.map((p) => `<div class="pf-play${won === p.id ? ' won' : ''}">${C.html(p.card)}<small>${esc(ui.name(p.id))}</small></div>`).join('') || '<span class="pt-muted">стол пуст</span>'}</div>`;
    }

    const result = v.result ? `<div class="pf-result">${v.result.lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : '';

    // запись: пуля, гора, висты, итог
    const sheet =
      `<table class="pf-sheet"><thead><tr><th></th><th>Пуля</th><th>Гора</th><th>Висты</th><th>Итог</th></tr></thead><tbody>` +
      v.seats.map((p) => `<tr${p.id === me ? ' class="me"' : ''}><td>${esc(p.name)}</td><td>${p.score.pulya}</td><td>${p.score.gora}</td><td>${p.score.vist}</td><td><b>${p.total}</b></td></tr>`).join('') +
      `</tbody></table><div class="pf-deal">Раздача ${v.deal} из ${v.deals}</div>`;

    let actions = '';
    if (mine && v.phase === 'bid') {
      const grid = [];
      for (let i = 0; i < BIDS.length; i++) {
        const ok = v.bids.includes(i);
        grid.push(`<button type="button" class="pf-bid${BIDS[i].misere ? ' misere' : ''}${BIDS[i].suit === 1 || BIDS[i].suit === 2 ? ' red' : ''}" data-bid="${i}" ${ok ? '' : 'disabled'}>${bidName(i)}</button>`);
      }
      actions = `<div class="pf-bids">${grid.join('')}</div><div class="tb-actions"><button class="btn btn-ghost" type="button" data-pass>Пас</button></div>`;
    }
    if (mine && v.phase === 'discard') actions = `<div class="tb-actions"><button class="btn btn-primary" type="button" data-discard ${pickDiscard.length === 2 ? '' : 'disabled'}>Снести ${pickDiscard.length}/2</button></div>`;
    if (mine && v.phase === 'contract')
      actions = `<div class="pf-bids">${v.contracts.map((i) => `<button type="button" class="pf-bid${BIDS[i].suit === 1 || BIDS[i].suit === 2 ? ' red' : ''}" data-contract="${i}">${bidName(i)}</button>`).join('')}</div>`;
    if (mine && v.phase === 'whist') actions = '<div class="tb-actions"><button class="btn btn-primary" type="button" data-whist="1">Вист</button><button class="btn btn-ghost" type="button" data-whist="0">Пас</button></div>';

    const handCls = (c) => {
      if (mine && v.phase === 'play') return v.ok.includes(c.id) ? 'playable' : 'dim';
      if (mine && v.phase === 'discard') return 'playable' + (pickDiscard.includes(c.id) ? ' sel' : '');
      return '';
    };
    const hand = v.hand ? `<div class="tb-hand mine">${v.hand.map((c) => C.html(c, handCls(c))).join('')}</div>` : '';

    el.innerHTML =
      `<div class="tb pf"><div class="pt-seats">${seats}</div>` +
      `<div class="tb-center">${table}<div class="tb-msg">${status}${!v.over && v.phase !== 'result' ? ` <span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>` : ''}</div>${result}</div>` +
      hand +
      actions +
      `<details class="pf-sheet-wrap"${v.phase === 'result' || v.over ? ' open' : ''}><summary>Запись: пуля, гора, висты</summary>${sheet}</details></div>`;

    el.querySelectorAll('.tb-hand.mine .sol-card.playable').forEach((node) =>
      node.addEventListener('click', () => {
        const cid = +node.dataset.id;
        if (v.phase === 'discard') {
          pickDiscard = pickDiscard.includes(cid) ? pickDiscard.filter((x) => x !== cid) : pickDiscard.concat(cid).slice(-2);
          return render(v, ui);
        }
        ui.send({ card: cid });
        SG.sound.play('flip');
      })
    );
    el.querySelectorAll('[data-bid]').forEach((b) => b.addEventListener('click', () => ui.send({ bid: +b.dataset.bid })));
    const pass = el.querySelector('[data-pass]');
    if (pass) pass.addEventListener('click', () => ui.send({ pass: 1 }));
    const disc = el.querySelector('[data-discard]');
    if (disc)
      disc.addEventListener('click', () => {
        ui.send({ discard: pickDiscard });
        pickDiscard = [];
      });
    el.querySelectorAll('[data-contract]').forEach((b) => b.addEventListener('click', () => ui.send({ contract: +b.dataset.contract })));
    el.querySelectorAll('[data-whist]').forEach((b) => b.addEventListener('click', () => ui.send({ whist: b.dataset.whist === '1' })));

    const key = v.deal + '/' + v.phase + '/' + v.seats.map((p) => p.tricks).join('') + v.trick.length;
    if (render.key !== key) {
      render.key = key;
      if (v.phase === 'play' && (v.trick.length || v.lastTrick)) SG.sound.play('flip');
      if (v.phase === 'result') SG.sound.play('hint');
    }
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === me ? 'win' : 'lose');
      if (v.winner === me) SG.store.set('preferans-wins', SG.store.get('preferans-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({
    game: 'preferans',
    min: 3,
    max: 3,
    bots: true,
    soloBots: 2,
    aiForGone: true,
    botDelay: () => 800 + Math.random() * 700,
    pace: 1300,
    options: {
      html: '<label>Длина пульки <select data-deals><option value="6">6 раздач</option><option value="9" selected>9 раздач</option><option value="12">12 раздач</option><option value="18">18 раздач</option></select></label>',
      read: (el) => ({ deals: +((el.querySelector('[data-deals]') || {}).value || 9) }),
      show(el, o) {
        if (o && o.deals) el.querySelector('[data-deals]').value = String(o.deals);
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
  window.__preferans = { BIDS, legalBids, playable, trickWinner, estimate, misereSafe, bidName };
})();
