/* Покер на компанию: техасский холдем на 2–6 игроков, до последней фишки */
(() => {
  'use strict';

  const C = SG.cards;
  const esc = SG.party.esc;
  const START = 1000;
  const BLINDS = [20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000];
  const HANDS_PER_LEVEL = 10;
  const TURN_TIME = 40; // секунд на решение
  const NEXT_DELAY = 5000;
  const HAND_NAMES = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш', 'Роял-флеш'];

  // пять карт → число: категория и старшинство карт
  function eval5(cs) {
    const r = cs.map((c) => c.rank).sort((a, b) => b - a);
    const flush = cs.every((c) => c.suit === cs[0].suit);
    let straight = 0;
    const uniq = [...new Set(r)];
    if (uniq.length === 5) {
      if (r[0] - r[4] === 4) straight = r[0];
      else if (r[0] === 14 && r[1] === 5) straight = 5; // A-2-3-4-5
    }
    const cnt = {};
    r.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1));
    const groups = Object.entries(cnt)
      .map(([k, v]) => [v, +k])
      .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const kick = (arr) => arr.reduce((a, x) => a * 15 + x, 0);
    let cat;
    let order;
    if (straight && flush) {
      cat = straight === 14 ? 9 : 8;
      order = [straight];
    } else if (groups[0][0] === 4) {
      cat = 7;
      order = [groups[0][1], groups[1][1]];
    } else if (groups[0][0] === 3 && groups[1][0] === 2) {
      cat = 6;
      order = [groups[0][1], groups[1][1]];
    } else if (flush) {
      cat = 5;
      order = r;
    } else if (straight) {
      cat = 4;
      order = [straight];
    } else if (groups[0][0] === 3) {
      cat = 3;
      order = groups.map((g) => g[1]);
    } else if (groups[0][0] === 2 && groups[1][0] === 2) {
      cat = 2;
      order = groups.map((g) => g[1]);
    } else if (groups[0][0] === 2) {
      cat = 1;
      order = groups.map((g) => g[1]);
    } else {
      cat = 0;
      order = r;
    }
    while (order.length < 5) order.push(0);
    return cat * 759375 + kick(order);
  }

  const COMBOS = [];
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) COMBOS.push([a, b]);
  // лучшая пятёрка из семи карт
  function eval7(cs) {
    let best = -1;
    for (const [a, b] of COMBOS) {
      const five = cs.filter((_, i) => i !== a && i !== b);
      const v = eval5(five);
      if (v > best) best = v;
    }
    return best;
  }
  const category = (v) => Math.floor(v / 759375);

  // ---------- правила ----------

  function create(players) {
    const s = { ids: players.map((p) => p.id), names: {}, chips: {}, hand: 0, dealer: -1, over: false, winner: null, log: [] };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.chips[p.id] = START;
    });
    s.dealer = Math.floor(Math.random() * s.ids.length) - 1;
    deal(s, Date.now());
    return s;
  }

  const blinds = (s) => {
    const lvl = Math.min(BLINDS.length - 1, Math.floor((s.hand - 1) / HANDS_PER_LEVEL));
    return [BLINDS[lvl] / 2, BLINDS[lvl]];
  };
  function nextSeat(s, i, pred) {
    for (let k = 1; k <= s.ids.length; k++) {
      const j = (i + k) % s.ids.length;
      if (pred(s.ids[j])) return j;
    }
    return -1;
  }
  const hasChips = (s) => (id) => s.chips[id] > 0;

  function deal(s, now) {
    s.hand++;
    const seated = s.ids.filter((id) => s.chips[id] > 0);
    s.dealer = nextSeat(s, s.dealer, hasChips(s));
    const deck = SG.shuffle(C.deck(2)).map((c) => c.id);
    s.holes = {};
    s.inHand = seated.slice();
    seated.forEach((id) => (s.holes[id] = deck.splice(0, 2)));
    s.boardAll = deck.splice(0, 5);
    s.street = 0;
    s.bets = {};
    s.total = {};
    s.ids.forEach((id) => {
      s.bets[id] = 0;
      s.total[id] = 0;
    });
    s.done = false;
    s.result = null;
    s.last = null;
    const [sb, bb] = blinds(s);
    s.bb = bb;
    // один на один дилер ставит малый блайнд
    let sbi;
    let bbi;
    if (seated.length === 2) {
      sbi = s.dealer;
      bbi = nextSeat(s, s.dealer, hasChips(s));
    } else {
      sbi = nextSeat(s, s.dealer, hasChips(s));
      bbi = nextSeat(s, sbi, hasChips(s));
    }
    post(s, s.ids[sbi], sb);
    post(s, s.ids[bbi], bb);
    s.cur = bb;
    s.minRaise = bb;
    s.acted = {};
    s.turn = nextSeat(s, bbi, (id) => canAct(s, id));
    s.deadline = now + TURN_TIME * 1000;
    say(s, 'Раздача ' + s.hand + ' · блайнды ' + sb + '/' + bb);
    checkRound(s, now);
  }

  function say(s, t, o) {
    SG.party.log(s, t, o);
  }

  function post(s, id, v) {
    const x = Math.min(v, s.chips[id]);
    s.chips[id] -= x;
    s.bets[id] += x;
    s.total[id] += x;
    return x;
  }

  const inHand = (s, id) => s.inHand.includes(id);
  const canAct = (s, id) => inHand(s, id) && s.chips[id] > 0;
  const pot = (s) => s.ids.reduce((a, id) => a + s.total[id], 0);
  const toCall = (s, id) => Math.max(0, s.cur - s.bets[id]);
  const board = (s) => s.boardAll.slice(0, s.street === 0 ? 0 : s.street + 2);

  function moves(s, id) {
    if (s.done || s.over || s.ids[s.turn] !== id) return [];
    const tc = toCall(s, id);
    const out = [{ a: 'fold' }, tc ? { a: 'call', v: Math.min(tc, s.chips[id]) } : { a: 'check' }];
    const maxTo = s.bets[id] + s.chips[id];
    const others = s.inHand.filter((x) => x !== id && s.chips[x] > 0).length;
    if (maxTo > s.cur && others) out.push({ a: 'raise', min: Math.min(maxTo, s.cur + s.minRaise), max: maxTo });
    return out;
  }

  // круг торговли окончен?
  function checkRound(s, now) {
    if (s.inHand.length === 1) return win(s, now);
    const actors = s.inHand.filter((id) => s.chips[id] > 0);
    const settled = actors.every((id) => s.acted[id] && s.bets[id] === s.cur);
    // никто больше не может торговаться — открываем стол до конца
    if (actors.length === 0 || (actors.length === 1 && s.bets[actors[0]] >= s.cur)) {
      s.street = 3;
      return showdown(s, now);
    }
    if (!settled) {
      if (!canAct(s, s.ids[s.turn]) || (s.acted[s.ids[s.turn]] && s.bets[s.ids[s.turn]] === s.cur)) s.turn = nextSeat(s, s.turn, (id) => canAct(s, id) && !(s.acted[id] && s.bets[id] === s.cur));
      s.deadline = now + TURN_TIME * 1000;
      return;
    }
    if (s.street === 3) return showdown(s, now);
    s.street++;
    s.ids.forEach((id) => (s.bets[id] = 0));
    s.cur = 0;
    s.minRaise = s.bb;
    s.acted = {};
    s.turn = nextSeat(s, s.dealer, (id) => canAct(s, id));
    s.deadline = now + TURN_TIME * 1000;
    // остался один с фишками — дальше без торговли
    if (s.inHand.filter((id) => s.chips[id] > 0).length <= 1) {
      s.street = 3;
      return showdown(s, now);
    }
  }

  function win(s, now) {
    const id = s.inHand[0];
    const p = pot(s);
    s.chips[id] += p;
    s.result = { how: 'fold', pots: [{ amount: p, winners: [id] }] };
    say(s, s.names[id] + ' забирает ' + p);
    finishHand(s, now);
  }

  function showdown(s, now) {
    const vals = {};
    s.inHand.forEach((id) => (vals[id] = eval7([...s.holes[id], ...s.boardAll].map(C.byId))));
    // банки: основной и побочные по уровням вкладов
    const levels = [...new Set(s.ids.map((id) => s.total[id]).filter((x) => x > 0))].sort((a, b) => a - b);
    let prev = 0;
    const pots = [];
    for (const lv of levels) {
      let amount = 0;
      s.ids.forEach((id) => (amount += Math.max(0, Math.min(s.total[id], lv) - prev)));
      const elig = s.inHand.filter((id) => s.total[id] >= lv);
      prev = lv;
      if (!amount) continue;
      if (!elig.length) {
        // остаток сверх всех оставшихся в игре — возвращаем внёсшему
        const back = s.ids.find((id) => s.total[id] >= lv);
        s.chips[back] += amount;
        continue;
      }
      const best = Math.max(...elig.map((id) => vals[id]));
      const winners = elig.filter((id) => vals[id] === best);
      const share = Math.floor(amount / winners.length);
      winners.forEach((id, k) => (s.chips[id] += share + (k === 0 ? amount - share * winners.length : 0)));
      const last = pots[pots.length - 1];
      if (last && last.winners.join() === winners.join()) last.amount += amount;
      else pots.push({ amount, winners, cat: category(best) });
    }
    s.street = 3;
    s.result = { how: 'show', pots, vals };
    pots.forEach((p) => say(s, p.winners.map((id) => s.names[id]).join(' и ') + ' — ' + p.amount + ' (' + HAND_NAMES[p.cat].toLowerCase() + ')'));
    finishHand(s, now);
  }

  function finishHand(s, now) {
    s.done = true;
    s.next = now + NEXT_DELAY + (s.result.how === 'show' ? 2000 : 0);
    const left = s.ids.filter((id) => s.chips[id] > 0);
    if (left.length <= 1) {
      s.over = true;
      s.winner = left[0] ?? null;
      say(s, (s.winner !== null ? s.names[s.winner] : 'Никто') + ' выигрывает турнир! 🏆');
    }
  }

  function act(s, id, m, now) {
    if (!m || s.over || s.done) return false;
    const ms = moves(s, id);
    const mv = ms.find((x) => x.a === m.a);
    if (!mv) return false;
    s.acted[id] = true;
    s.last = { id, a: m.a };
    if (m.a === 'fold') {
      s.inHand = s.inHand.filter((x) => x !== id);
      say(s, s.names[id] + ': пас');
    } else if (m.a === 'check') say(s, s.names[id] + ': чек');
    else if (m.a === 'call') {
      const v = post(s, id, toCall(s, id));
      say(s, s.names[id] + ': колл ' + v + (s.chips[id] ? '' : ' (ва-банк)'));
    } else {
      const to = Math.max(mv.min, Math.min(mv.max, Math.round(+m.to || 0)));
      const raiseBy = to - s.cur;
      post(s, id, to - s.bets[id]);
      if (raiseBy >= s.minRaise) {
        s.minRaise = raiseBy;
        // все должны ответить на повышение
        s.inHand.forEach((x) => x !== id && (s.acted[x] = false));
      }
      s.cur = Math.max(s.cur, to);
      s.last.v = to;
      say(s, s.names[id] + ': ' + (s.chips[id] ? 'рейз до ' + to : 'ва-банк ' + to));
    }
    s.turn = nextSeat(s, s.turn, (x) => canAct(s, x) && !(s.acted[x] && s.bets[x] === s.cur));
    if (s.turn < 0) s.turn = 0;
    checkRound(s, now);
    return true;
  }

  function tick(s, now) {
    if (s.over) return false;
    if (s.done) {
      if (now >= s.next) {
        deal(s, now);
        return true;
      }
      return false;
    }
    // время на ход вышло: чек, если можно, иначе пас
    if (now > s.deadline) {
      const id = s.ids[s.turn];
      return act(s, id, toCall(s, id) ? { a: 'fold' } : { a: 'check' }, now);
    }
    return false;
  }

  // ---------- боты ----------

  function equity(hole, brd, opps, iters) {
    const known = new Set([...hole, ...brd]);
    const rest = [];
    for (let id = 0; id < 52; id++) if (!known.has(id)) rest.push(id);
    let win = 0;
    const need = opps * 2 + (5 - brd.length);
    for (let k = 0; k < iters; k++) {
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(Math.random() * (rest.length - i));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      const full = brd.concat(rest.slice(opps * 2, need));
      const mine = eval7([...hole, ...full].map(C.byId));
      let best = 0;
      for (let o = 0; o < opps; o++) {
        const v = eval7([rest[o * 2], rest[o * 2 + 1], ...full].map(C.byId));
        if (v > best) best = v;
      }
      if (mine > best) win += 1;
      else if (mine === best) win += 0.5;
    }
    return win / iters;
  }

  function ai(s, id, level) {
    if (s.done || s.over || s.ids[s.turn] !== id) return null;
    const cfg = { easy: { it: 80, bluff: 0.05, noise: 0.18 }, normal: { it: 180, bluff: 0.08, noise: 0.07 }, hard: { it: 350, bluff: 0.1, noise: 0.03 } }[level];
    const opps = Math.max(1, s.inHand.length - 1);
    const eq = Math.min(1, Math.max(0, equity(s.holes[id], board(s), Math.min(opps, 4), cfg.it) + (Math.random() - 0.5) * cfg.noise));
    const ms = moves(s, id);
    const tc = toCall(s, id);
    const p = pot(s);
    const raise = ms.find((x) => x.a === 'raise');
    const raiseTo = (frac) => (raise ? { a: 'raise', to: Math.max(raise.min, Math.min(raise.max, s.cur + Math.round(Math.max(s.bb, (p + tc) * frac)))) } : tc ? { a: 'call' } : { a: 'check' });
    const odds = tc / (p + tc);
    // сила относительно числа соперников: 1/(n+1) — «средняя» рука
    const fair = 1 / (opps + 1);
    const rel = eq / fair;
    const r = Math.random();
    if (rel > 2.2 && raise) return r < 0.25 ? { a: 'raise', to: raise.max } : raiseTo(0.8);
    if (rel > 1.6 && raise && r < 0.55) return raiseTo(0.5);
    if (!tc) {
      if ((rel > 1.3 || r < cfg.bluff) && raise && r < 0.5) return raiseTo(0.45);
      return { a: 'check' };
    }
    if (eq + 0.03 >= odds || (r < cfg.bluff && tc < p * 0.4)) return { a: 'call' };
    return { a: 'fold' };
  }

  // ---------- вид ----------

  function view(s, id) {
    const reveal = s.done && s.result && s.result.how === 'show';
    const v = {
      seats: s.ids.map((pid, i) => ({
        id: pid,
        name: s.names[pid],
        chips: s.chips[pid],
        bet: s.bets[pid],
        folded: !s.inHand.includes(pid) && s.holes[pid] !== undefined,
        out: s.chips[pid] === 0 && !s.inHand.includes(pid),
        dealer: i === s.dealer,
        turn: i === s.turn && !s.done && !s.over,
        cards: s.holes[pid] ? (pid === id || (reveal && s.inHand.includes(pid)) ? s.holes[pid] : [-1, -1]) : [],
        allin: s.inHand.includes(pid) && s.chips[pid] === 0,
      })),
      board: board(s),
      pot: pot(s),
      log: s.log.slice(-30),
      done: s.done,
      over: s.over,
      winner: s.winner,
      hand: s.hand,
      blinds: blinds(s),
      left: s.done ? 0 : Math.max(0, (s.deadline - Date.now()) / 1000),
      result: s.result ? { how: s.result.how, pots: s.result.pots.map((p) => ({ amount: p.amount, winners: p.winners, cat: p.cat })) } : null,
    };
    if (s.holes[id] && s.inHand.includes(id) && board(s).length >= 3) v.combo = HAND_NAMES[category(bestOf(s.holes[id], board(s)))];
    v.moves = moves(s, id);
    v.toCall = toCall(s, id);
    v.cur = s.cur;
    v.myBet = s.bets[id] || 0;
    return v;
  }

  function bestOf(hole, brd) {
    const cs = [...hole, ...brd].map(C.byId);
    if (cs.length === 7) return eval7(cs);
    let best = -1;
    const idx = [];
    const rec = (start) => {
      if (idx.length === 5) {
        best = Math.max(best, eval5(idx.map((i) => cs[i])));
        return;
      }
      for (let i = start; i < cs.length; i++) {
        idx.push(i);
        rec(i + 1);
        idx.pop();
      }
    };
    rec(0);
    return best;
  }

  // ---------- отрисовка ----------

  const card = (id, extra = '') => (id < 0 ? C.back(extra) : C.html(C.byId(id), extra));
  function render(v, ui) {
    const el = ui.el;
    const seats = v.seats
      .map((p) => `<div class="pt-seat pk-seat${p.turn ? ' turn' : ''}${p.id === ui.me ? ' me' : ''}${p.folded || p.out ? ' out' : ''}" data-seat="${p.id}" data-num="${p.chips}" data-unit="фишек">` +
        `<b>${p.dealer ? '<span class="pk-d">D</span> ' : ''}${esc(p.name)}</b><span>💰 ${p.chips}${p.allin ? ' · ва-банк' : ''}</span>` +
        `<div class="pk-cards">${p.cards.map((c) => card(c, 'mini')).join('')}</div>` +
        `<span class="pk-bet">${p.bet ? 'ставка ' + p.bet : p.folded ? 'пас' : p.out ? 'выбыл' : '&nbsp;'}</span></div>`)
      .join('');
    const me = v.seats.find((p) => p.id === ui.me);
    let msg = '';
    if (v.over) msg = v.winner === ui.me ? 'Вы выиграли турнир! 🏆' : (v.winner !== null ? esc(ui.name(v.winner)) : 'Никто') + ' выигрывает турнир.';
    else if (v.done && v.result) msg = v.result.pots.map((p) => p.winners.map((w) => (w === ui.me ? 'Вы' : esc(ui.name(w)))).join(' и ') + ' +' + p.amount + (v.result.how === 'show' ? ' (' + HAND_NAMES[p.cat].toLowerCase() + ')' : '')).join(' · ');
    else if (v.moves.length) msg = 'Ваш ход' + (v.toCall ? ': ' + v.toCall + ' чтобы уравнять' : '') + ` · <span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    else {
      const t = v.seats.find((p) => p.turn);
      msg = t ? 'Думает ' + esc(t.name) + ` <span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>` : '';
    }
    el.innerHTML =
      `<div class="tb"><div class="pt-seats">${seats}</div>` +
      `<div class="tb-center"><div class="tb-row">${v.board.map((c) => card(c)).join('')}${'<div class="sol-card ph"></div>'.repeat(5 - v.board.length)}</div>` +
      `<div class="tb-pot">Банк ${v.pot} · блайнды ${v.blinds[0]}/${v.blinds[1]} · раздача ${v.hand}</div>` +
      `<div class="tb-msg">${msg}</div></div>` +
      (me && me.cards.length && me.cards[0] >= 0 ? `<div class="tb-label"><span>Ваши карты${v.combo ? ' · ' + v.combo : ''}</span><span>💰 ${me.chips}</span></div><div class="tb-hand mine">${me.cards.map((c) => card(c)).join('')}</div>` : '') +
      `<div class="tb-actions pk-actions"></div></div>`;
    const actEl = el.querySelector('.pk-actions');
    for (const m of v.moves) {
      if (m.a === 'raise') {
        const wrap = document.createElement('div');
        wrap.className = 'hd-raise';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = m.min;
        range.max = m.max;
        range.step = Math.max(1, Math.round(v.blinds[1] / 2));
        const potNow = v.pot + v.toCall;
        range.value = Math.min(m.max, Math.max(m.min, v.cur + Math.round(potNow * 0.5)));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        const upd = () => (btn.textContent = (+range.value === m.max ? 'Ва-банк ' : v.cur ? 'Рейз до ' : 'Ставка ') + range.value);
        range.addEventListener('input', upd);
        upd();
        btn.addEventListener('click', () => ui.send({ a: 'raise', to: +range.value }));
        const quick = (label, val) => {
          const q = document.createElement('button');
          q.type = 'button';
          q.className = 'btn btn-ghost';
          q.textContent = label;
          q.addEventListener('click', () => {
            range.value = Math.min(m.max, Math.max(m.min, val));
            upd();
          });
          return q;
        };
        wrap.append(range, quick('½', v.cur + Math.round(potNow / 2)), quick('Банк', v.cur + potNow), quick('Всё', m.max), btn);
        actEl.appendChild(wrap);
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (m.a === 'fold' ? 'btn-ghost' : 'btn-primary');
      b.dataset.a = m.a;
      b.textContent = m.a === 'fold' ? 'Сбросить' : m.a === 'check' ? 'Чек' : 'Колл ' + m.v;
      b.addEventListener('click', () => ui.send({ a: m.a }));
      actEl.appendChild(b);
    }
    if (v.moves.length && !render.turnSound) SG.sound.play('hint');
    render.turnSound = v.moves.length > 0;
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === ui.me ? 'win' : 'lose');
      if (v.winner === ui.me) SG.store.set('pokerparty-wins', SG.store.get('pokerparty-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({
    game: 'pokerparty',
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
    render,
  });
  window.__poker = { eval7, equity };
})();
