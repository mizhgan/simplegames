/* Бинго: ведущий достаёт номера, вы отмечаете их на карточке 5×5 — кто первым соберёт линию */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const LET = 'BINGO';

  function card() {
    // столбец B — 1…15, I — 16…30, N — 31…45, G — 46…60, O — 61…75; центр свободен
    const cols = [0, 1, 2, 3, 4].map((c) => SG.shuffle([...Array(15)].map((_, k) => c * 15 + k + 1)).slice(0, 5));
    const cells = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push(r === 2 && c === 2 ? 0 : cols[c][r]);
    return cells;
  }

  const LINES = [];
  for (let r = 0; r < 5; r++) LINES.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) LINES.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  LINES.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);

  function create(players, opts) {
    const s = { ids: players.map((p) => p.id), names: {}, cards: {}, marks: {}, bag: SG.shuffle([...Array(75)].map((_, k) => k + 1)), called: [], every: ((opts && +opts.every) || 5) * 1000, now: Date.now(), winner: null, block: {}, log: [] };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.cards[p.id] = card();
      s.marks[p.id] = [12];
    });
    s.next = s.now + 3000;
    return s;
  }

  const hasLine = (s, id) => LINES.some((l) => l.every((i) => s.marks[id].includes(i) && (s.cards[id][i] === 0 || s.called.includes(s.cards[id][i]))));

  function act(s, id, a, now) {
    if (!a || s.winner !== null || !s.cards[id]) return false;
    if (a.mark !== undefined) {
      const i = a.mark;
      if (!(i >= 0 && i < 25)) return false;
      const m = s.marks[id];
      if (m.includes(i) || !s.called.includes(s.cards[id][i])) return false;
      m.push(i);
      return true;
    }
    if (a.unmark !== undefined) {
      if (a.unmark === 12 || !s.marks[id].includes(a.unmark)) return false;
      s.marks[id] = s.marks[id].filter((x) => x !== a.unmark);
      return true;
    }
    if (a.bingo) {
      if ((s.block[id] || 0) > now) return false;
      if (hasLine(s, id)) {
        s.winner = id;
        SG.party.log(s, s.names[id] + ': БИНГО!', { w: id, i: '🎉', k: 'good', big: true });
      } else {
        s.block[id] = now + 10000;
        SG.party.log(s, s.names[id] + ' поспешил(а) — штраф 10 секунд', { w: id, i: '✗', k: 'bad' });
      }
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.winner !== null || now < s.next) return false;
    if (!s.bag.length) {
      s.winner = -1;
      return true;
    }
    s.called.push(s.bag.pop());
    s.next = now + s.every;
    // авто-отметка у ушедших и у тех, кто включил её
    return true;
  }

  function ai(s, id, level) {
    if (s.winner !== null) return null;
    const cells = s.cards[id];
    const miss = cells.findIndex((n, i) => n && s.called.includes(n) && !s.marks[id].includes(i));
    if (miss >= 0 && Math.random() < (level === 'easy' ? 0.4 : level === 'normal' ? 0.7 : 1)) return { mark: miss };
    if (hasLine(s, id)) return { bingo: 1 };
    return null;
  }

  function view(s, id) {
    return {
      card: s.cards[id] || null,
      marks: s.marks[id] || [],
      called: s.called.slice(-12).reverse(),
      all: s.called,
      last: s.called[s.called.length - 1] || null,
      count: s.called.length,
      next: Math.max(0, (s.next - Date.now()) / 1000),
      blocked: Math.max(0, ((s.block[id] || 0) - Date.now()) / 1000),
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], n: s.marks[pid].length - 1 })),
      log: s.log.slice(-30),
      over: s.winner !== null,
      winner: s.winner,
    };
  }

  const letter = (n) => LET[Math.floor((n - 1) / 15)];
  let auto = SG.store.get('bingo-auto', true);
  let sent = new Set();

  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    // авто-отметка: отмечаем за игрока всё, что назвали
    if (auto && v.card && !v.over) {
      const todo = [];
      v.card.forEach((n, i) => {
        if (n && v.all.includes(n) && !v.marks.includes(i) && !sent.has(n)) {
          sent.add(n);
          todo.push(i);
        }
      });
      // отправляем после отрисовки, чтобы не перерисовать поверх свежего вида
      if (todo.length) setTimeout(() => todo.forEach((i) => ui.send({ mark: i })), 0);
    }
    const grid = v.card
      ? `<div class="bg-card"><div class="bg-head">${[...LET].map((c) => `<span>${c}</span>`).join('')}</div><div class="bg-grid">${v.card
          .map((n, i) => `<button type="button" class="bg-cell${v.marks.includes(i) ? ' on' : ''}${n && v.all.includes(n) && !v.marks.includes(i) ? ' can' : ''}" data-i="${i}">${n || '★'}</button>`)
          .join('')}</div></div>`
      : '';
    const seats = v.players.map((p) => `<div class="pt-seat${p.id === me ? ' me' : ''}${p.id === v.winner ? ' turn' : ''}"><b>${esc(p.name)}</b><span>отмечено ${p.n}</span></div>`).join('');
    let status;
    if (v.over) status = v.winner === me ? 'БИНГО! Вы победили! 🎉' : v.winner === -1 ? 'Номера кончились — никто не собрал линию.' : 'БИНГО у ' + esc(ui.name(v.winner));
    else status = v.last ? `Номер: <b class="bg-ball">${letter(v.last)}-${v.last}</b>` : 'Сейчас начнём…';
    el.innerHTML =
      `<div class="pt-panel bg"><div class="pt-seats">${seats}</div><p class="bg-status">${status}</p>` +
      `<div class="bg-called">${v.called.map((n, k) => `<span class="${k ? '' : 'new'}">${letter(n)}${n}</span>`).join('')}</div>` +
      grid +
      (v.card && !v.over ? `<div class="pt-choices"><button class="btn btn-primary bg-shout" type="button" data-bingo ${v.blocked ? 'disabled' : ''}>БИНГО!${v.blocked ? ' (' + Math.ceil(v.blocked) + ')' : ''}</button><label class="bg-auto"><input type="checkbox" ${auto ? 'checked' : ''}> Отмечать самому компьютеру</label></div>` : '') +
      `<p class="pt-muted">Вызвано ${v.count} из 75. Соберите линию — строку, столбец или диагональ — и жмите «БИНГО!». Ошибка — 10 секунд штрафа.</p>` +
      `</div>`;
    el.querySelectorAll('.bg-cell').forEach((b) => b.addEventListener('click', () => ui.send(v.marks.includes(+b.dataset.i) ? { unmark: +b.dataset.i } : { mark: +b.dataset.i })));
    const bb = el.querySelector('[data-bingo]');
    if (bb) bb.addEventListener('click', () => ui.send({ bingo: 1 }));
    const ch = el.querySelector('.bg-auto input');
    if (ch)
      ch.addEventListener('change', () => {
        auto = ch.checked;
        SG.store.set('bingo-auto', auto);
        render(v, ui);
      });
    if (render.last !== v.last) {
      render.last = v.last;
      if (v.last && !v.over) SG.sound.play('tick');
    }
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === me ? 'win' : 'lose');
      if (v.winner === me) SG.store.set('bingo-wins', SG.store.get('bingo-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
    if (!v.count) sent = new Set();
  }

  SG.party({
    game: 'bingo',
    min: 2,
    max: 20,
    bots: true,
    soloBots: 3,
    aiForGone: true,
    botDelay: () => 600 + Math.random() * 1600,
    options: {
      html: '<label>Номер каждые <select data-every><option value="3">3 секунды</option><option value="5" selected>5 секунд</option><option value="8">8 секунд</option></select></label>',
      read: (el) => ({ every: +((el.querySelector('[data-every]') || {}).value || 5) }),
      show(el, o) {
        if (o && o.every) el.querySelector('[data-every]').value = String(o.every);
      },
    },
    create,
    view,
    act,
    tick,
    ai,
    render,
  });
})();
