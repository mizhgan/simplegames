/* Домино: классическое «до 100» вдвоём, с базаром и «рыбой» */
(() => {
  'use strict';

  const TILES = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) TILES.push([a, b]);
  const GOAL = 100;
  const pips = (id) => TILES[id][0] + TILES[id][1];
  const handSum = (h) => h.reduce((x, id) => x + pips(id), 0);

  function create(seed) {
    const s = { seed, score: [0, 0], round: 0, over: null };
    deal(s);
    return s;
  }

  function deal(s) {
    s.round++;
    const rand = SG.duel.rng((s.seed + s.round * 7907) >>> 0);
    const ids = SG.duel.shuffleWith(TILES.map((_, i) => i), rand);
    s.hands = [ids.slice(0, 7), ids.slice(7, 14)];
    s.bone = ids.slice(14);
    s.chain = []; // [{ a, b, id }] слева направо
    s.passes = 0;
    s.phase = 'play';
    s.result = null;
    // начинает тот, у кого старший дубль (или старшая кость)
    const rank = (id) => (TILES[id][0] === TILES[id][1] ? 100 + TILES[id][0] : pips(id));
    const best = [0, 1].map((p) => Math.max(...s.hands[p].map(rank)));
    s.turn = best[0] >= best[1] ? 0 : 1;
  }

  const ends = (s) => (s.chain.length ? [s.chain[0].a, s.chain[s.chain.length - 1].b] : null);

  function fitsEnd(s, id, e) {
    const en = ends(s);
    if (!en) return true;
    const v = e === 'L' ? en[0] : en[1];
    return TILES[id][0] === v || TILES[id][1] === v;
  }

  function moves(s) {
    if (s.over) return [];
    if (s.phase === 'done') return [{ next: 1 }];
    const out = [];
    for (const id of s.hands[s.turn]) {
      if (!s.chain.length) out.push({ t: id, e: 'R' });
      else for (const e of ['L', 'R']) if (fitsEnd(s, id, e)) out.push({ t: id, e });
    }
    if (!out.length) out.push(s.bone.length ? { draw: 1 } : { pass: 1 });
    return out;
  }

  const legal = (s, m) => !!m && moves(s).some((x) => x.t === m.t && x.e === m.e && !!x.draw === !!m.draw && !!x.pass === !!m.pass && !!x.next === !!m.next);

  function finishRound(s, winner, fish) {
    s.phase = 'done';
    const sums = [handSum(s.hands[0]), handSum(s.hands[1])];
    let pts = 0;
    if (winner !== null) pts = sums[1 - winner];
    if (winner !== null) s.score[winner] += pts;
    s.result = { winner, pts, fish, sums };
    s.turn = winner === null ? s.turn : winner;
    const [a, b] = s.score;
    if (a >= GOAL || b >= GOAL) s.over = { winner: a === b ? null : a > b ? 0 : 1, text: 'Счёт ' + Math.max(a, b) + ':' + Math.min(a, b) + '.' };
  }

  function apply(s, m) {
    const me = s.turn;
    s.lastMove = { side: me, m };
    if (m.next) return deal(s);
    if (m.draw) {
      s.hands[me].push(s.bone.pop());
      return; // тянет, пока не найдёт подходящую
    }
    if (m.pass) {
      s.passes++;
      s.turn = 1 - me;
      if (s.passes >= 2) {
        // «рыба»: выигрывает тот, у кого меньше очков на руках
        const [x, y] = [handSum(s.hands[0]), handSum(s.hands[1])];
        finishRound(s, x === y ? null : x < y ? 0 : 1, true);
      }
      return;
    }
    s.passes = 0;
    const [p, q] = TILES[m.t];
    s.hands[me] = s.hands[me].filter((id) => id !== m.t);
    if (!s.chain.length) s.chain.push({ a: p, b: q, id: m.t });
    else if (m.e === 'L') {
      const v = s.chain[0].a;
      s.chain.unshift(q === v ? { a: p, b: q, id: m.t } : { a: q, b: p, id: m.t });
    } else {
      const v = s.chain[s.chain.length - 1].b;
      s.chain.push(p === v ? { a: p, b: q, id: m.t } : { a: q, b: p, id: m.t });
    }
    if (!s.hands[me].length) return finishRound(s, me, false);
    s.turn = 1 - me;
  }

  // ---------- компьютер ----------

  function ai(s, level) {
    if (s.phase === 'done') return new Promise((r) => setTimeout(() => r({ next: 1 }), 2000));
    const ms = moves(s);
    if (ms[0].draw || ms[0].pass) return ms[0];
    if (level === 'easy' && Math.random() < 0.4) return ms[Math.floor(Math.random() * ms.length)];
    const hand = s.hands[s.turn];
    let best = ms[0];
    let bv = -Infinity;
    for (const m of ms) {
      const [a, b] = TILES[m.t];
      let v = a + b + (a === b ? 4 : 0);
      if (level === 'hard') {
        // оставляем на руках разнообразие чисел
        const rest = hand.filter((id) => id !== m.t);
        const nums = new Set(rest.flatMap((id) => TILES[id]));
        v += nums.size * 1.5;
      }
      if (v > bv) {
        bv = v;
        best = m;
      }
    }
    return best;
  }

  // ---------- отрисовка ----------

  const PIP = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const half = (n) => `<span class="dm-half">${Array.from({ length: 9 }, (_, k) => `<i class="${PIP[n].includes(k) ? 'on' : ''}"></i>`).join('')}</span>`;
  const tileHtml = (a, b, cls = '', attrs = '') => `<div class="dm-tile ${a === b ? 'dbl' : ''} ${cls}" ${attrs}>${half(a)}${half(b)}</div>`;
  const backHtml = '<div class="dm-tile back"></div>';

  const $ = (id) => document.getElementById(id);
  let pending = null; // кость, которая подходит к обоим концам: ждём выбора стороны

  const duel = SG.duel({
    game: 'domino',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over: (s) => s.over || null,
    hint(s) {
      if (s.phase === 'done') return 'нажмите «Следующий кон»';
      const ms = moves(s);
      if (ms[0].draw) return 'подходящей кости нет — берите из базара';
      if (ms[0].pass) return 'ходов нет — пас';
      return pending !== null ? 'к какому концу приставить?' : 'выберите кость';
    },
    ai,
    aiDelay: 600,
    sound: (s, m) => (m.draw ? 'card' : m.pass ? 'click' : m.next ? 'flip' : 'place'),
    onNew() {
      pending = null;
    },
    render(s, v) {
      if (!v.canMove) pending = null;
      const me = v.watch ? v.hostSide : v.mode === 'pvp' ? s.turn : v.me === null || v.me === undefined ? 0 : v.me;
      const op = 1 - me;
      const oppName = v.mode === 'ai' ? 'Компьютер' : v.mode === 'pvp' ? 'Другой игрок' : v.watch ? 'Игрок 2' : 'Соперник';
      const showMine = !v.watch;
      const reveal = s.phase === 'done';
      $('opp-name').textContent = oppName;
      $('my-name').textContent = v.watch ? 'Игрок 1' : v.mode === 'pvp' ? 'Ходит: ' + (s.turn ? 'второй' : 'первый') : 'Вы';
      $('opp-score').textContent = s.score[op];
      $('my-score').textContent = s.score[me];
      $('opp-hand').innerHTML = s.hands[op].map((id) => (reveal ? tileHtml(...TILES[id]) : backHtml)).join('');
      const ms = v.canMove ? moves(s) : [];
      const playable = new Set(ms.filter((m) => m.t !== undefined).map((m) => m.t));
      $('my-hand').innerHTML = s.hands[me]
        .map((id) => (showMine || reveal ? tileHtml(...TILES[id], (playable.has(id) ? 'playable' : v.canMove ? 'dim' : '') + (pending === id ? ' sel' : ''), `data-id="${id}"`) : backHtml))
        .join('');
      const en = ends(s);
      let chain = s.chain.map((t, k) => tileHtml(t.a, t.b, (s.lastMove && s.lastMove.m.t === t.id ? 'last' : '') + (k === 0 ? ' end-l' : '') + (k === s.chain.length - 1 ? ' end-r' : ''))).join('');
      if (pending !== null) {
        chain = `<button class="dm-end" type="button" data-e="L">◀ ${en[0]}</button>` + chain + `<button class="dm-end" type="button" data-e="R">${en[1]} ▶</button>`;
      }
      $('chain').innerHTML = chain || '<span class="dm-empty">Первый ход — любой костью</span>';
      $('bone').textContent = 'Базар: ' + s.bone.length;
      let msg = '';
      if (s.result) {
        const r = s.result;
        const who = r.winner === null ? '' : r.winner === me ? (v.watch ? 'Игрок 1' : 'Вы') : oppName;
        msg = (r.fish ? 'Рыба! ' : '') + (r.winner === null ? 'Ничья в коне.' : who + ' ' + (r.winner === me && !v.watch ? 'получаете' : 'получает') + ' ' + r.pts + ' очков.');
      } else if (s.lastMove && s.lastMove.side === op) {
        const m = s.lastMove.m;
        msg = m.draw ? oppName + ' берёт из базара' : m.pass ? oppName + ': пас' : '';
      }
      $('msg').textContent = msg;
      const act = $('actions');
      act.innerHTML = '';
      if (v.canMove && (ms[0].draw || ms[0].pass || ms[0].next)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-primary';
        b.textContent = ms[0].draw ? 'Взять из базара' : ms[0].pass ? 'Пас' : 'Следующий кон';
        b.addEventListener('click', () => duel.play(ms[0]));
        act.appendChild(b);
      }
    },
  });

  $('my-hand').addEventListener('click', (e) => {
    const el = e.target.closest('.dm-tile[data-id]');
    if (!el || !duel.canMove()) return;
    const id = +el.dataset.id;
    const opts = moves(duel.state).filter((m) => m.t === id);
    if (!opts.length) return SG.sound.play('error');
    const sides = new Set(opts.map((m) => m.e));
    // подходит к обоим концам (и концы разные) — спрашиваем, куда
    const en = ends(duel.state);
    if (sides.size > 1 && en && en[0] !== en[1]) {
      pending = pending === id ? null : id;
      return duel.render();
    }
    pending = null;
    duel.play(opts[0]);
  });
  $('chain').addEventListener('click', (e) => {
    const b = e.target.closest('.dm-end');
    if (!b || pending === null) return;
    const id = pending;
    pending = null;
    duel.play({ t: id, e: b.dataset.e });
  });
})();
