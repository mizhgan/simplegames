/* Техасский холдем один на один: блайнды растут, играем до последней фишки */
(() => {
  'use strict';

  const C = SG.cards;
  const START = 1000;
  const BLINDS = [20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 600, 800, 1000]; // большой блайнд по уровням
  const HANDS_PER_LEVEL = 8;
  const HAND_NAMES = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш', 'Роял-флеш'];

  // ---------- оценка руки ----------

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

  function create(seed) {
    const s = { seed, chips: [START, START], hand: 0, dealer: 1, over: null };
    deal(s);
    return s;
  }

  const blinds = (s) => {
    const lvl = Math.min(BLINDS.length - 1, Math.floor((s.hand - 1) / HANDS_PER_LEVEL));
    return [BLINDS[lvl] / 2, BLINDS[lvl]];
  };

  function deal(s) {
    s.hand++;
    s.dealer = 1 - s.dealer;
    const rand = SG.duel.rng((s.seed + s.hand * 104729) >>> 0);
    const deck = SG.duel.shuffleWith(C.deck(2), rand).map((c) => c.id);
    s.holes = [deck.slice(0, 2), deck.slice(2, 4)];
    s.boardAll = deck.slice(4, 9);
    s.street = 0; // 0 префлоп, 1 флоп, 2 тёрн, 3 ривер
    s.bets = [0, 0];
    s.total = [0, 0];
    s.pot = 0;
    s.phase = 'bet';
    s.result = null;
    s.last = null;
    const [sb, bb] = blinds(s);
    // в игре один на один дилер ставит малый блайнд и первым ходит до флопа
    post(s, s.dealer, sb);
    post(s, 1 - s.dealer, bb);
    s.bb = bb;
    s.minRaise = bb;
    s.acted = [false, false];
    s.turn = s.dealer;
    skipIfAllIn(s);
  }

  function post(s, p, v) {
    const x = Math.min(v, s.chips[p]);
    s.chips[p] -= x;
    s.bets[p] += x;
    s.total[p] += x;
    s.pot += x;
    return x;
  }

  const toCall = (s, p) => Math.max(0, s.bets[1 - p] - s.bets[p]);
  const board = (s) => s.boardAll.slice(0, s.street === 0 ? 0 : s.street + 2);

  function moves(s) {
    if (s.over) return [];
    if (s.phase === 'done') return [{ a: 'next' }];
    const me = s.turn;
    const tc = toCall(s, me);
    const out = [{ a: 'fold' }];
    out.push(tc ? { a: 'call' } : { a: 'check' });
    const maxTo = s.bets[me] + s.chips[me];
    const minTo = Math.min(maxTo, s.bets[1 - me] + s.minRaise);
    if (s.chips[1 - me] > 0 && maxTo > s.bets[1 - me]) out.push({ a: 'raise', min: minTo, max: maxTo });
    return out;
  }

  function legal(s, m) {
    if (!m) return false;
    const ms = moves(s);
    if (m.a === 'raise') {
      const r = ms.find((x) => x.a === 'raise');
      return !!r && Number.isInteger(m.to) && m.to >= r.min && m.to <= r.max;
    }
    return ms.some((x) => x.a === m.a);
  }

  function endHand(s, winner, how) {
    s.phase = 'done';
    const [a, b] = s.total;
    // лишнее сверх ставки соперника возвращается
    if (a > b) {
      s.chips[0] += a - b;
      s.pot -= a - b;
    } else if (b > a) {
      s.chips[1] += b - a;
      s.pot -= b - a;
    }
    if (winner === null) {
      s.chips[0] += Math.floor(s.pot / 2);
      s.chips[1] += Math.ceil(s.pot / 2);
    } else s.chips[winner] += s.pot;
    s.result = { winner, how, pot: s.pot };
    if (how === 'show') {
      s.street = 3;
      s.result.vals = s.holes.map((h) => eval7([...h, ...s.boardAll].map(C.byId)));
    }
    s.pot = 0;
    s.turn = 1 - s.dealer; // следующую раздачу раздаёт другой
    if (!s.chips[0]) s.over = { winner: 1, text: 'У первого игрока кончились фишки.' };
    else if (!s.chips[1]) s.over = { winner: 0, text: 'У второго игрока кончились фишки.' };
  }

  function showdown(s) {
    const [a, b] = s.holes.map((h) => eval7([...h, ...s.boardAll].map(C.byId)));
    endHand(s, a === b ? null : a > b ? 0 : 1, 'show');
  }

  // оба всё поставили (или один в олл-ине и ставки уравнены) — сразу открываем стол
  function skipIfAllIn(s) {
    if (s.phase !== 'bet') return;
    // блайнд забрал все фишки: торговаться не о чем
    if (s.chips[s.turn] === 0 || ((s.chips[0] === 0 || s.chips[1] === 0) && toCall(s, s.turn) === 0)) showdown(s);
  }

  function nextStreet(s) {
    if (s.street === 3) return showdown(s);
    s.street++;
    s.bets = [0, 0];
    s.minRaise = s.bb;
    s.acted = [false, false];
    s.turn = 1 - s.dealer; // после флопа первым ходит большой блайнд
    if (s.chips[0] === 0 || s.chips[1] === 0) return showdown(s);
  }

  function apply(s, m) {
    const me = s.turn;
    if (m.a === 'next') return deal(s);
    s.last = { side: me, a: m.a, v: 0 };
    s.acted[me] = true;
    if (m.a === 'fold') return endHand(s, 1 - me, 'fold');
    if (m.a === 'check') {
      if (s.acted[1 - me]) return nextStreet(s);
      s.turn = 1 - me;
      return;
    }
    if (m.a === 'call') {
      s.last.v = post(s, me, toCall(s, me));
      // уравняли: круг торговли окончен (кроме лимпа малого блайнда до флопа — большой ещё может поднять)
      if (s.street === 0 && !s.acted[1 - me] && s.bets[0] === s.bets[1]) {
        s.turn = 1 - me;
        return;
      }
      if (s.chips[0] === 0 || s.chips[1] === 0) return showdown(s);
      return nextStreet(s);
    }
    // рейз до m.to
    const inc = m.to - s.bets[me];
    const raiseBy = m.to - s.bets[1 - me];
    post(s, me, inc);
    s.last.v = m.to;
    if (raiseBy > s.minRaise) s.minRaise = raiseBy;
    s.acted[1 - me] = false;
    s.turn = 1 - me;
  }

  // ---------- компьютер ----------

  function equity(hole, brd, iters) {
    const known = new Set([...hole, ...brd]);
    const rest = [];
    for (let id = 0; id < 52; id++) if (!known.has(id)) rest.push(id);
    let win = 0;
    for (let k = 0; k < iters; k++) {
      // частичное перемешивание: 2 карты соперника + недостающие карты стола
      const need = 2 + (5 - brd.length);
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(Math.random() * (rest.length - i));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      const opp = rest.slice(0, 2);
      const full = brd.concat(rest.slice(2, need));
      const a = eval7([...hole, ...full].map(C.byId));
      const b = eval7([...opp, ...full].map(C.byId));
      win += a > b ? 1 : a === b ? 0.5 : 0;
    }
    return win / iters;
  }

  function ai(s, level) {
    if (s.phase === 'done') return new Promise((r) => setTimeout(() => r({ a: 'next' }), 2200));
    const me = s.turn;
    const cfg = { easy: { it: 120, bluff: 0.04, noise: 0.15 }, normal: { it: 300, bluff: 0.08, noise: 0.06 }, hard: { it: 600, bluff: 0.12, noise: 0.02 } }[level];
    const eq = Math.min(1, Math.max(0, equity(s.holes[me], board(s), cfg.it) + (Math.random() - 0.5) * cfg.noise));
    const ms = moves(s);
    const tc = toCall(s, me);
    const pot = s.pot;
    const raise = ms.find((x) => x.a === 'raise');
    const raiseTo = (frac) => {
      if (!raise) return null;
      const want = s.bets[1 - me] + Math.round(Math.max(s.bb, (pot + tc) * frac));
      return { a: 'raise', to: Math.max(raise.min, Math.min(raise.max, want)) };
    };
    const odds = tc / (pot + tc);
    const r = Math.random();
    if (eq > 0.8 && raise) return r < 0.3 ? { a: 'raise', to: raise.max } : raiseTo(0.9);
    if (eq > 0.65 && raise && r < 0.6) return raiseTo(0.6);
    if (!tc) {
      if ((eq > 0.55 || r < cfg.bluff) && raise && r < 0.55) return raiseTo(0.5);
      return { a: 'check' };
    }
    if (eq + 0.04 >= odds || (r < cfg.bluff && tc < pot * 0.5)) return { a: 'call' };
    return { a: 'fold' };
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const actEl = $('actions');
  const said = { fold: 'сбросил карты', check: 'чек', call: 'колл', raise: 'рейз до ' };

  const duel = SG.duel({
    game: 'holdem',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over: (s) => s.over || null,
    hint: (s) => (s.phase === 'done' ? 'нажмите «Следующая раздача»' : ''),
    ai,
    aiDelay: 700,
    sound: (s, m) => (m.a === 'next' ? 'card' : m.a === 'fold' ? 'flip' : m.a === 'raise' ? 'coin' : s.result ? 'coin' : 'click'),
    render(s, v) {
      const me = v.watch ? v.hostSide : v.me === null || v.me === undefined ? 0 : v.me;
      const op = 1 - me;
      const oppName = v.mode === 'ai' ? 'Компьютер' : v.watch ? 'Игрок 2' : 'Соперник';
      const reveal = s.phase === 'done' && s.result && s.result.how === 'show';
      const [sb, bb] = blinds(s);
      $('opp-name').textContent = oppName + (s.dealer === op ? ' · дилер' : '');
      $('my-name').textContent = (v.watch ? 'Игрок 1' : 'Вы') + (s.dealer === me ? ' · дилер' : '');
      $('opp-chips').textContent = s.chips[op];
      $('my-chips').textContent = s.chips[me];
      $('opp-bet').textContent = s.bets[op] && s.phase === 'bet' ? 'ставка ' + s.bets[op] : '';
      $('my-bet').textContent = s.bets[me] && s.phase === 'bet' ? 'ставка ' + s.bets[me] : '';
      $('opp-hand').innerHTML = s.holes[op].map((id) => (reveal ? C.html(C.byId(id)) : C.back())).join('');
      $('my-hand').innerHTML = s.holes[me].map((id) => (v.watch && !reveal ? C.back() : C.html(C.byId(id)))).join('');
      const brd = board(s);
      $('board').innerHTML = brd.map((id) => C.html(C.byId(id))).join('') + '<div class="sol-card ph"></div>'.repeat(5 - brd.length);
      $('pot').textContent = 'Банк: ' + (s.phase === 'done' ? s.result.pot : s.pot) + ' · блайнды ' + sb + '/' + bb + ' · раздача ' + s.hand;
      $('label-opp').classList.toggle('turn', s.turn === op && s.phase === 'bet');
      $('label-me').classList.toggle('turn', s.turn === me && s.phase === 'bet');
      $('my-combo').textContent = brd.length >= 3 && !(v.watch && !reveal) ? HAND_NAMES[category(bestOf(s.holes[me], brd))] : '';
      let msg = '';
      if (s.result) {
        const w = s.result.winner;
        if (w === null) msg = 'Ничья: банк делится пополам.';
        else {
          const who = w === me ? 'Вы выиграли' : oppName + ' выиграл';
          msg = who + ' ' + s.result.pot + (s.result.how === 'fold' ? ' — ' + (w === me ? 'соперник сбросил карты' : 'вы сбросили карты') : ' — ' + HAND_NAMES[category(s.result.vals[w])].toLowerCase());
        }
      } else if (s.last && s.last.side === op) msg = oppName + ': ' + said[s.last.a] + (s.last.a === 'raise' ? s.last.v : '');
      $('msg').textContent = v.watch ? C.neutral(msg) : msg;
      renderActions(s, v);
    },
  });

  // лучшая комбинация из доступных карт (5–7)
  function bestOf(hole, brd) {
    const cs = [...hole, ...brd].map(C.byId);
    if (cs.length === 7) return eval7(cs);
    let best = -1;
    const n = cs.length;
    const idx = [];
    const rec = (start) => {
      if (idx.length === 5) {
        best = Math.max(best, eval5(idx.map((i) => cs[i])));
        return;
      }
      for (let i = start; i < n; i++) {
        idx.push(i);
        rec(i + 1);
        idx.pop();
      }
    };
    rec(0);
    return best;
  }

  function renderActions(s, v) {
    actEl.innerHTML = '';
    if (!v.canMove) return;
    const me = s.turn;
    for (const m of moves(s)) {
      if (m.a === 'raise') {
        const wrap = document.createElement('div');
        wrap.className = 'hd-raise';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = m.min;
        range.max = m.max;
        range.step = Math.max(1, Math.round(s.bb / 2));
        const pot = s.pot + toCall(s, me);
        range.value = Math.min(m.max, Math.max(m.min, s.bets[1 - me] + Math.round(pot * 0.5)));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        const upd = () => (btn.textContent = (+range.value === m.max ? 'Ва-банк ' : (s.bets[1 - me] ? 'Рейз до ' : 'Ставка ')) + range.value);
        range.addEventListener('input', upd);
        upd();
        btn.addEventListener('click', () => duel.play({ a: 'raise', to: +range.value }));
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
        wrap.append(range, quick('½', s.bets[1 - me] + Math.round(pot / 2)), quick('Банк', s.bets[1 - me] + pot), quick('Всё', m.max), btn);
        actEl.appendChild(wrap);
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (m.a === 'fold' ? 'btn-ghost' : 'btn-primary');
      b.textContent = m.a === 'fold' ? 'Сбросить' : m.a === 'check' ? 'Чек' : m.a === 'call' ? 'Колл ' + Math.min(toCall(s, me), s.chips[me]) : 'Следующая раздача';
      b.addEventListener('click', () => duel.play({ a: m.a }));
      actEl.appendChild(b);
    }
  }
  window.__holdem = { eval5, eval7, equity };
})();
