/* Перудо — кости лжеца: ставки на то, сколько одинаковых граней под всеми стаканчиками, и «Не верю!» */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const DICE = 5;
  const TURN_TIME = 40;
  const REVEAL_MS = 5500; // сколько показываем открытые кости после «Не верю!»
  const ROLL_MS = 800; // бросок в начале раунда
  const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  // «Троек с единицами: 5» — родительный падеж граней
  const OF = ['', 'единиц', 'двоек', 'троек', 'четвёрок', 'пятёрок', 'шестёрок'];
  const bidText = (b) => b.q + ' × ' + FACES[b.f];
  const dice = (n) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'кость' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'кости' : 'костей');
  const countLabel = (f) => (f === 1 ? 'Единиц' : OF[f][0].toUpperCase() + OF[f].slice(1) + ' с единицами');

  // ---------- правила ----------

  // можно ли поставить b после prev (prev = null — первая ставка раунда)
  function legal(b, prev, total) {
    if (!b || !Number.isInteger(b.q) || !Number.isInteger(b.f) || b.f < 1 || b.f > 6 || b.q < 1 || b.q > total) return false;
    if (!prev) return b.f !== 1; // раунд не начинают с единиц
    if (prev.f !== 1 && b.f !== 1) return b.q > prev.q || (b.q === prev.q && b.f > prev.f);
    if (prev.f !== 1 && b.f === 1) return b.q >= Math.ceil(prev.q / 2); // на единицы — вдвое меньше
    if (prev.f === 1 && b.f === 1) return b.q > prev.q;
    return b.q >= prev.q * 2 + 1; // с единиц — вдвое больше плюс одна
  }

  // самая маленькая допустимая ставка на грань f (или null)
  function minFor(f, prev, total) {
    for (let q = 1; q <= total; q++) if (legal({ q, f }, prev, total)) return { q, f };
    return null;
  }

  // подходит ли кость под грань f: сама грань или единица-джокер
  const matches = (d, f) => d === f || (f !== 1 && d === 1);
  const countOf = (all, f) => all.filter((d) => matches(d, f)).length;

  const roll = (n) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
  const alive = (s) => s.ids.filter((id) => s.left[id] > 0);
  const total = (s) => alive(s).reduce((a, id) => a + s.left[id], 0);
  const cur = (s) => s.ids[s.turn];
  const say = (s, t, o) => SG.party.log(s, t, o);

  function create(players) {
    const s = { ids: players.map((p) => p.id), names: {}, left: {}, dice: {}, turn: 0, bid: null, bids: [], phase: 'bid', round: 0, reveal: null, log: [], now: Date.now(), winner: null };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.left[p.id] = DICE;
    });
    newRound(s, s.ids[Math.floor(Math.random() * s.ids.length)], s.now);
    return s;
  }

  function newRound(s, starter, now) {
    s.round++;
    s.ids.forEach((id) => (s.dice[id] = s.left[id] ? roll(s.left[id]).sort() : []));
    s.turn = s.ids.indexOf(starter);
    s.bid = null;
    s.bids = [];
    s.reveal = null;
    s.phase = 'bid';
    s.deadline = now + TURN_TIME * 1000;
    say(s, 'Раунд ' + s.round + ': на столе ' + dice(total(s)) + ', начинает ' + s.names[starter], { i: '🎲' });
  }

  // следующий игрок с костями после id
  function nextAlive(s, id) {
    let k = s.ids.indexOf(id);
    do k = (k + 1) % s.ids.length;
    while (!s.left[s.ids[k]]);
    return s.ids[k];
  }

  function finishIfLast(s) {
    const rest = alive(s);
    if (rest.length !== 1) return false;
    s.winner = rest[0];
    s.phase = 'end';
    say(s, s.names[s.winner] + ' — последний с костями!', { w: s.winner, i: '🏆', k: 'good', big: true });
    return true;
  }

  function act(s, id, a, now) {
    if (!a || s.winner !== null || s.phase !== 'bid' || cur(s) !== id) return false;
    if (a.bid) {
      const b = { q: +a.bid.q, f: +a.bid.f };
      if (!legal(b, s.bid, total(s))) return false;
      s.bid = { q: b.q, f: b.f, by: id };
      s.bids.push(s.bid);
      say(s, s.names[id] + ': ' + bidText(b), { w: id, i: '🗣' });
      s.turn = s.ids.indexOf(nextAlive(s, id));
      s.deadline = now + TURN_TIME * 1000;
      return true;
    }
    if (a.call && s.bid) {
      const b = s.bid;
      const open = {};
      alive(s).forEach((pid) => (open[pid] = s.dice[pid]));
      const n = countOf([].concat(...Object.values(open)), b.f);
      const ok = n >= b.q; // ставка верна
      const loser = ok ? id : b.by;
      say(s, s.names[id] + ': «Не верю!» — ставке ' + s.names[b.by] + ' ' + bidText(b), { w: id, i: '✋', big: true });
      s.left[loser]--;
      say(s, countLabel(b.f) + ': ' + n + ' — ставка ' + (ok ? 'верна' : 'не сыграла') + ', ' + s.names[loser] + ' теряет кость (осталось ' + s.left[loser] + ')', { w: loser, i: '🎲', k: 'bad', big: true });
      s.reveal = { bid: b, caller: id, n, ok, loser, dice: open };
      if (!s.left[loser]) say(s, s.names[loser] + ' остаётся без костей и выбывает', { w: loser, i: '💥', k: 'bad', big: true });
      if (finishIfLast(s)) return true;
      s.phase = 'reveal';
      s.deadline = now + REVEAL_MS;
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.winner !== null || now < s.deadline) return false;
    if (s.phase === 'reveal') {
      // начинает проигравший, а если он выбыл — следующий за ним
      const l = s.reveal.loser;
      newRound(s, s.left[l] ? l : nextAlive(s, l), now);
      return true;
    }
    // время вышло — ход за игрока, осторожно
    return act(s, cur(s), ai(s, cur(s), 'easy') || { call: 1 }, now);
  }

  function leave(s, id) {
    if (s.winner !== null || !s.left[id]) return;
    const inPlay = s.phase === 'bid' && (cur(s) === id || (s.bid && s.bid.by === id));
    s.left[id] = 0;
    s.dice[id] = [];
    say(s, s.names[id] + ' выходит из игры', { w: id, i: '🚪' });
    if (!finishIfLast(s) && inPlay) newRound(s, nextAlive(s, id), s.now);
  }

  // ---------- бот: считает вероятность, что ставка сыграет ----------

  // P(X ≥ k), X ~ Bin(n, p) — сколько подходящих костей у остальных
  function atLeast(k, n, p) {
    if (k <= 0) return 1;
    if (k > n) return 0;
    let sum = 0;
    let c = 1; // C(n, i)
    for (let i = 0; i <= n; i++) {
      if (i >= k) sum += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
      c = (c * (n - i)) / (i + 1);
    }
    return sum;
  }

  function ai(s, id, level) {
    if (s.winner !== null || s.phase !== 'bid' || cur(s) !== id) return null;
    const mine = s.dice[id];
    const all = total(s);
    const unknown = all - mine.length;
    // вероятность, что на столе наберётся b.q подходящих костей; у слабых ботов оценка «плывёт»
    const noise = { easy: 0.3, normal: 0.12, hard: 0 }[level] || 0.12;
    const chance = (b) => {
      const p = atLeast(b.q - countOf(mine, b.f), unknown, b.f === 1 ? 1 / 6 : 1 / 3);
      return Math.min(1, Math.max(0, p + (Math.random() - 0.5) * 2 * noise));
    };
    // самая надёжная из минимальных ставок на каждую грань
    let best = null;
    for (let f = 1; f <= 6; f++) {
      const b = minFor(f, s.bid, all);
      if (!b) continue;
      const p = chance(b);
      if (!best || p > best.p) best = { q: b.q, f: b.f, p };
    }
    if (s.bid) {
      // «Не верю!», если текущая ставка скорее ложна, чем провалится наша лучшая
      const pNow = chance(s.bid);
      if (!best || pNow < 1 - best.p || pNow < 0.2) return { call: 1 };
    }
    if (!best) return null;
    // первая ставка раунда: побольше костей, пока шанс остаётся приличным
    if (!s.bid) {
      const want = { easy: 0.45, normal: 0.55, hard: 0.6 }[level] || 0.55;
      while (best.q < all && chance({ q: best.q + 1, f: best.f }) >= want) best.q++;
    }
    return { bid: { q: best.q, f: best.f } };
  }

  function view(s, id) {
    const open = s.phase !== 'bid' && s.reveal ? s.reveal.dice : {};
    return {
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], left: s.left[pid], dice: open[pid] || null })),
      mine: id >= 0 && s.left[id] ? s.dice[id] : (open[id] || []),
      total: total(s),
      turn: cur(s),
      bid: s.bid,
      bids: s.bids.slice(-6),
      phase: s.phase,
      round: s.round,
      reveal: s.reveal && s.phase !== 'bid' ? { bid: s.reveal.bid, caller: s.reveal.caller, n: s.reveal.n, ok: s.reveal.ok, loser: s.reveal.loser } : null,
      log: s.log.slice(-30),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.winner !== null,
      winner: s.winner,
    };
  }

  // ---------- отрисовка ----------

  let pick = null; // выбранная ставка { q, f }
  let pickFor = ''; // для какой ставки на столе она выбрана
  const spin = { round: 0, until: 0 };

  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    // новый раунд — свои кости «катятся», боты ждут
    if (v.round !== spin.round) {
      const fresh = spin.round !== 0 && v.mine.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      spin.round = v.round;
      if (fresh) {
        spin.until = Date.now() + ROLL_MS;
        if (ui.hold) ui.hold(0, ROLL_MS + 150);
        setTimeout(() => {
          const m = el.isConnected && el.querySelector('.pr-mine.rolling');
          if (m) m.classList.remove('rolling');
        }, ROLL_MS);
        SG.sound.play('drop');
      }
    }
    const rolling = Date.now() < spin.until;
    const mine = v.turn === me && v.phase === 'bid' && !v.over;
    const bidKey = v.round + '/' + (v.bid ? v.bid.q + ':' + v.bid.f : '-');
    if (pickFor !== bidKey || !pick) {
      pickFor = bidKey;
      // по умолчанию — наименьшая ставка на грань, которой у нас больше всего
      let best = null;
      for (let f = 1; f <= 6; f++) {
        const b = minFor(f, v.bid, v.total);
        if (b && (!best || countOf(v.mine, f) > countOf(v.mine, best.f))) best = b;
      }
      pick = best || { q: 1, f: 2 };
    }
    const ok = legal(pick, v.bid, v.total);
    const hit = v.reveal ? v.reveal.bid.f : 0;

    const seats = v.players
      .map((p) => {
        const cls = 'pt-seat' + (p.id === v.turn && v.phase === 'bid' && !v.over ? ' turn' : '') + (p.id === me ? ' me' : '') + (!p.left && !p.dice ? ' out' : '') + (v.reveal && v.reveal.loser === p.id ? ' pr-lost' : '');
        const inner = p.dice
          ? `<span class="pr-open">${p.dice.map((d) => `<i class="${matches(d, hit) ? 'hit' : ''}">${FACES[d]}</i>`).join('')}</span>`
          : `<span class="pr-cups">${p.left ? '🥤 ' + dice(p.left) : 'выбыл'}</span>`;
        return `<div class="${cls}" data-seat="${p.id}" data-num="${p.left}" data-unit="костей"><b>${esc(p.name)}</b>${inner}</div>`;
      })
      .join('');

    let status;
    if (v.over) status = v.winner === me ? 'Вы остались последним с костями! 🏆' : esc(ui.name(v.winner)) + ' побеждает';
    else if (v.reveal) {
      const r = v.reveal;
      status = `${countLabel(r.bid.f)}: <b>${r.n}</b> — ставка ${bidText(r.bid)} ${r.ok ? 'верна' : 'не сыграла'}. ${r.loser === me ? 'Вы теряете кость.' : esc(ui.name(r.loser)) + ' теряет кость.'}`;
    } else if (mine) status = v.bid ? 'Ваш ход: повысьте ставку или скажите «Не верю!»' : 'Вы начинаете раунд: сделайте ставку';
    else status = 'Ходит ' + esc(ui.name(v.turn));

    const bidBox = v.bid
      ? `<div class="pr-bid"><span class="pr-bid-who">${esc(ui.name(v.bid.by))} ставит, что на столе не меньше</span><span class="pr-bid-val">${v.bid.q} × ${FACES[v.bid.f]}</span></div>`
      : `<div class="pr-bid empty">${v.phase === 'bid' && !v.over ? 'Ставок ещё нет · на столе ' + dice(v.total) : ''}</div>`;
    const history = v.bids.length > 1 ? `<div class="pr-hist">${v.bids.slice(0, -1).map((b) => bidText(b)).join(' → ')} →</div>` : '';

    let actions = '';
    if (mine) {
      const faces = [1, 2, 3, 4, 5, 6]
        .map((f) => `<button type="button" class="pr-face${pick.f === f ? ' sel' : ''}" data-f="${f}" aria-label="Грань ${f}" ${!v.bid && f === 1 ? 'disabled' : ''}>${FACES[f]}</button>`)
        .join('');
      actions =
        `<div class="pr-pick"><div class="pr-qty"><button type="button" class="btn btn-ghost" data-q="-1" aria-label="Меньше">−</button><b>${pick.q}</b><button type="button" class="btn btn-ghost" data-q="1" aria-label="Больше">+</button></div><span class="pr-x">×</span><div class="pr-faces">${faces}</div></div>` +
        `<div class="tb-actions"><button class="btn btn-primary" type="button" data-bid ${ok ? '' : 'disabled'}>Ставлю ${pick.q} × ${FACES[pick.f]}</button>` +
        (v.bid ? '<button class="btn pr-call" type="button" data-call>✋ Не верю!</button>' : '') +
        `</div><p class="pr-hint">${ok ? `У вас подходит ${countOf(v.mine, pick.f)} из ${v.mine.length}${pick.f !== 1 ? ' (вместе с единицами)' : ''}, всего на столе ${dice(v.total)}.` : 'Так поставить нельзя: нужно больше костей или грань выше.'}</p>`;
    }

    el.innerHTML =
      `<div class="pt-panel pr"><div class="pt-seats">${seats}</div>` +
      `<p class="pr-status">${status} ${v.phase === 'bid' && !v.over ? `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>` : ''}</p>` +
      history +
      bidBox +
      (v.mine.length && !v.over ? `<div class="pr-mine-wrap"><span class="pr-label">Ваши кости</span><div class="pr-mine${rolling ? ' rolling' : ''}">${v.mine.map((d) => `<span class="dk-die${hit && matches(d, hit) ? ' hit' : ''}">${FACES[d]}</span>`).join('')}</div></div>` : '') +
      actions +
      '</div>';

    el.querySelectorAll('[data-f]').forEach((b) =>
      b.addEventListener('click', () => {
        const f = +b.dataset.f;
        // при смене грани количество подстраиваем до наименьшего допустимого
        const q = legal({ q: pick.q, f }, v.bid, v.total) ? pick.q : (minFor(f, v.bid, v.total) || { q: pick.q }).q;
        pick = { q, f };
        render(v, ui);
      })
    );
    el.querySelectorAll('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        pick = { q: Math.max(1, Math.min(v.total, pick.q + +b.dataset.q)), f: pick.f };
        render(v, ui);
      })
    );
    const bb = el.querySelector('[data-bid]');
    if (bb) bb.addEventListener('click', () => ui.send({ bid: pick }));
    const cb = el.querySelector('[data-call]');
    if (cb) cb.addEventListener('click', () => ui.send({ call: 1 }));

    const key = v.round + '/' + v.bids.length + '/' + v.phase;
    if (render.key !== key) {
      render.key = key;
      if (v.phase === 'reveal') SG.sound.play(v.reveal && v.reveal.loser === me ? 'error' : 'hint');
      else if (v.bids.length) SG.sound.play('click');
    }
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === me ? 'win' : 'lose');
      if (v.winner === me) SG.store.set('perudo-wins', SG.store.get('perudo-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({ game: 'perudo', min: 2, max: 6, bots: true, soloBots: 3, aiForGone: true, botDelay: () => 1100 + Math.random() * 900, pace: 1600, create, view, act, tick, ai, leave, render });
  window.__perudo = { legal, minFor, countOf };
})();
