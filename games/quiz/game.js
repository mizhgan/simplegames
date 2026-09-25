/* Викторина «Своя игра»: табло тем и цен, все отвечают одновременно, быстрый и верный выбирает следующий вопрос */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const CATS = 5;
  const PER = 4;
  const PICK_TIME = 20;
  const Q_TIME = 20;
  const REVEAL = 5000;
  const SKILL = { easy: [0.5, 0.35, 0.25], normal: [0.75, 0.55, 0.4], hard: [0.92, 0.8, 0.65] };

  // свой набор: «Тема | Вопрос | Верный | Неверный | … [| цена]», строка на вопрос
  function parsePack(text) {
    const cats = {};
    String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .forEach((l) => {
        const parts = l.split(/\s*[|;]\s*/).filter((x) => x !== '');
        if (parts.length < 4) return;
        let value = null;
        if (/^\d*00$/.test(parts[parts.length - 1]) && parts.length >= 5) value = +parts.pop();
        const [cat, q, right, ...wrong] = parts;
        (cats[cat] = cats[cat] || []).push({ q, right, wrong: wrong.slice(0, 5), value });
      });
    return cats;
  }

  const count = (text) => Object.values(parsePack(text)).slice(0, 6).reduce((a, x) => a + Math.min(6, x.length), 0);

  function buildBoard(opts) {
    if (opts.pack === 'custom' && count(opts.custom)) {
      const cats = parsePack(opts.custom);
      const names = Object.keys(cats).slice(0, 6);
      if (names.length)
        return names.map((cat) => ({
          cat,
          qs: cats[cat].slice(0, 6).map((x, k) => question(x.q, x.right, x.wrong, x.value || (k + 1) * 100, 2)),
        }));
    }
    const bank = window.QUIZ_BANK;
    const names = SG.shuffle(Object.keys(bank)).slice(0, CATS);
    return names.map((cat) => {
      // по одному вопросу на цену: чем дороже, тем сложнее
      const qs = SG.shuffle(bank[cat].slice())
        .slice(0, PER)
        .sort((a, b) => a[5] - b[5])
        .map((x, k) => question(x[0], x[1], x.slice(2, 5), (k + 1) * 100, x[5]));
      return { cat, qs };
    });
  }

  function question(q, right, wrong, value, diff) {
    const opts = SG.shuffle([right, ...wrong]);
    return { q, opts, right: opts.indexOf(right), value, diff, used: false };
  }

  // ---------- правила ----------

  function create(players, opts) {
    const s = { ids: players.map((p) => p.id), names: {}, score: {}, board: buildBoard(opts || {}), phase: 'pick', chooser: null, cur: null, answers: {}, deadline: 0, now: Date.now(), last: null, botAt: {} };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.score[p.id] = 0;
    });
    s.chooser = s.ids[Math.floor(Math.random() * s.ids.length)];
    s.deadline = s.now + PICK_TIME * 1000;
    return s;
  }

  const q = (s) => (s.cur ? s.board[s.cur.c].qs[s.cur.k] : null);
  const left = (s) => s.board.some((c) => c.qs.some((x) => !x.used));

  function open(s, c, k, now) {
    const x = s.board[c] && s.board[c].qs[k];
    if (!x || x.used) return false;
    x.used = true;
    s.cur = { c, k };
    s.phase = 'q';
    s.answers = {};
    s.started = now;
    s.deadline = now + Q_TIME * 1000;
    // когда ответят боты
    s.ids.forEach((id) => (s.botAt[id] = now + 2500 + Math.random() * 9000));
    return true;
  }

  function reveal(s, now) {
    const x = q(s);
    s.phase = 'reveal';
    s.deadline = now + REVEAL;
    const res = {};
    let fastest = null;
    s.ids.forEach((id) => {
      const a = s.answers[id];
      if (!a) return (res[id] = 0);
      if (a.i === x.right) {
        res[id] = x.value;
        if (!fastest || a.t < fastest.t) fastest = { id, t: a.t };
      } else res[id] = -Math.round(x.value / 2);
      s.score[id] += res[id];
    });
    if (fastest) s.chooser = fastest.id;
    s.last = { res, fastest: fastest && fastest.id };
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end') return false;
    if (a.pick && s.phase === 'pick' && id === s.chooser) return open(s, a.pick[0], a.pick[1], now);
    if (a.answer !== undefined && s.phase === 'q' && !s.answers[id] && q(s).opts[a.answer] !== undefined) {
      s.answers[id] = { i: a.answer, t: now - s.started };
      if (s.ids.every((x) => s.answers[x])) reveal(s, now);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'pick') {
      // хозяин табло задумался — берём первый свободный вопрос
      const c = s.board.findIndex((x) => x.qs.some((y) => !y.used));
      return open(s, c, s.board[c].qs.findIndex((y) => !y.used), now);
    }
    if (s.phase === 'q') {
      reveal(s, now);
      return true;
    }
    if (s.phase === 'reveal') {
      s.cur = null;
      if (!left(s)) {
        s.phase = 'end';
        const best = Math.max(...s.ids.map((id) => s.score[id]));
        s.winners = s.ids.filter((id) => s.score[id] === best);
      } else {
        s.phase = 'pick';
        s.deadline = now + PICK_TIME * 1000;
      }
      return true;
    }
    return false;
  }

  // ---------- боты ----------

  function ai(s, id, level) {
    if (s.phase === 'pick' && s.chooser === id) {
      const free = [];
      s.board.forEach((c, ci) => c.qs.forEach((x, k) => !x.used && free.push([ci, k])));
      return { pick: free[Math.floor(Math.random() * free.length)] };
    }
    if (s.phase === 'q' && !s.answers[id] && s.now >= s.botAt[id]) {
      const x = q(s);
      const p = SKILL[level][Math.max(0, Math.min(2, (x.diff || 2) - 1))];
      if (Math.random() < p) return { answer: x.right };
      const wrong = x.opts.map((_, i) => i).filter((i) => i !== x.right);
      return { answer: wrong[Math.floor(Math.random() * wrong.length)] };
    }
    return null;
  }

  // ---------- вид ----------

  function view(s, id) {
    const x = q(s);
    return {
      board: s.board.map((c) => ({ cat: c.cat, qs: c.qs.map((y) => ({ value: y.value, used: y.used })) })),
      phase: s.phase,
      chooser: s.chooser,
      cur: s.cur,
      q: x ? { q: x.q, opts: x.opts, value: x.value, cat: s.board[s.cur.c].cat, right: s.phase === 'reveal' ? x.right : null } : null,
      mine: s.answers[id] ? s.answers[id].i : null,
      answered: s.ids.filter((pid) => s.answers[pid]),
      answers: s.phase === 'reveal' ? Object.fromEntries(s.ids.map((pid) => [pid, s.answers[pid] ? s.answers[pid].i : null])) : null,
      last: s.phase === 'reveal' ? s.last : null,
      scores: s.ids.map((pid) => ({ id: pid, name: s.names[pid], score: s.score[pid] })),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.phase === 'end',
      winners: s.winners || null,
    };
  }

  // ---------- отрисовка ----------

  function render(v, ui) {
    const el = ui.el;
    const scores = v.scores
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((p) => {
        const d = v.last ? v.last.res[p.id] : 0;
        const mark = v.phase === 'q' && v.answered.includes(p.id) ? ' ✓' : '';
        return `<div class="pt-seat${p.id === v.chooser && v.phase === 'pick' ? ' turn' : ''}${p.id === ui.me ? ' me' : ''}"><b>${esc(p.name)}${mark}</b><span>${p.score}${d ? ` <em class="${d > 0 ? 'qz-plus' : 'qz-minus'}">${d > 0 ? '+' : ''}${d}</em>` : ''}</span></div>`;
      })
      .join('');
    let body = '';
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    if (v.phase === 'pick') {
      const mine = v.chooser === ui.me;
      body =
        `<p class="qz-status">${mine ? 'Выберите вопрос' : 'Вопрос выбирает ' + esc(ui.name(v.chooser))} ${timer}</p>` +
        `<div class="qz-board">${v.board
          .map((c, ci) => `<div class="qz-cat">${esc(c.cat)}</div>` + c.qs.map((x, k) => `<button type="button" class="qz-cell" data-c="${ci}" data-k="${k}" ${x.used || !mine ? 'disabled' : ''}>${x.used ? '' : x.value}</button>`).join(''))
          .join('')}</div>`;
    } else if (v.phase === 'q' || v.phase === 'reveal') {
      const x = v.q;
      body =
        `<p class="qz-status">${esc(x.cat)} · ${x.value} ${v.phase === 'q' ? timer : ''}</p>` +
        `<div class="qz-q">${esc(x.q)}</div>` +
        `<div class="qz-opts">${x.opts
          .map((o, i) => {
            let cls = '';
            if (v.phase === 'reveal') cls = i === x.right ? 'right' : i === v.mine ? 'wrong' : '';
            else if (i === v.mine) cls = 'sel';
            const who = v.answers ? v.scores.filter((p) => v.answers[p.id] === i).map((p) => esc(p.name)).join(', ') : '';
            return `<button type="button" class="qz-opt ${cls}" data-i="${i}" ${v.phase !== 'q' || v.mine !== null || ui.watcher ? 'disabled' : ''}><span>${esc(o)}</span>${who ? `<small>${who}</small>` : ''}</button>`;
          })
          .join('')}</div>` +
        (v.phase === 'reveal' ? `<p class="qz-status">${v.last.fastest !== null && v.last.fastest !== undefined ? 'Быстрее всех верно ответил(а) ' + esc(ui.name(v.last.fastest)) + ' — выбирает следующий вопрос.' : 'Никто не ответил верно.'}</p>` : v.mine !== null ? '<p class="pt-muted">Ответ принят — ждём остальных.</p>' : '');
    } else if (v.over) {
      const w = v.winners || [];
      body = `<div class="pt-big">${w.includes(ui.me) ? (w.length > 1 ? 'Ничья — вы среди лучших! 🤝' : 'Вы победили! 🏆') : 'Победа: ' + w.map((x) => esc(ui.name(x))).join(', ')}</div><p class="pt-muted">Все вопросы сыграны.</p>`;
    }
    el.innerHTML = `<div class="pt-panel qz"><div class="pt-seats qz-scores">${scores}</div>${body}</div>`;
    el.querySelectorAll('.qz-cell:not(:disabled)').forEach((b) => b.addEventListener('click', () => ui.send({ pick: [+b.dataset.c, +b.dataset.k] })));
    el.querySelectorAll('.qz-opt:not(:disabled)').forEach((b) =>
      b.addEventListener('click', () => {
        ui.send({ answer: +b.dataset.i });
        SG.sound.play('click');
      })
    );
    if (v.phase === 'reveal' && render.revealed !== v.cur.c + ':' + v.cur.k) {
      render.revealed = v.cur.c + ':' + v.cur.k;
      if (v.mine !== null) SG.sound.play(v.mine === v.q.right ? 'match' : 'error');
    }
    if (v.over && !render.done) {
      render.done = true;
      const won = (v.winners || []).includes(ui.me);
      SG.sound.play(won ? 'win' : 'lose');
      if (won) SG.store.set('quiz-wins', SG.store.get('quiz-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  const OPTIONS = `
    <label>Вопросы <select data-pack><option value="builtin">Встроенные (случайные темы)</option><option value="custom">Свой набор</option></select></label>
    <div class="qz-custom" hidden>
      <textarea rows="6" data-text placeholder="Тема | Вопрос | Верный ответ | Неверный | Неверный | Неверный | цена"></textarea>
      <label class="qz-file">Загрузить из файла <input type="file" accept=".txt,.csv,text/plain"></label>
      <p class="pt-muted">По вопросу в строке: тема, вопрос, верный ответ и 1–5 неверных через «|» или «;». Цена в конце (100, 200, …) — необязательно. До 6 тем по 6 вопросов.</p>
      <p class="pt-muted" data-count></p>
    </div>`;

  SG.party({
    game: 'quiz',
    min: 2,
    max: 8,
    bots: true,
    soloBots: 2,
    chatSolo: false,
    aiForGone: false,
    options: {
      html: OPTIONS,
      read(el) {
        const pack = el.querySelector('[data-pack]');
        const custom = pack && pack.value === 'custom' ? el.querySelector('[data-text]').value : '';
        const n = count(custom);
        const cnt = el.querySelector('[data-count]');
        if (cnt) cnt.textContent = custom ? 'Распознано вопросов: ' + n : '';
        const box = el.querySelector('.qz-custom');
        if (box && pack) box.hidden = pack.value !== 'custom';
        return { pack: pack ? pack.value : 'builtin', custom };
      },
      show(el, o) {
        if (o.pack !== 'custom') return;
        el.querySelector('[data-pack]').value = 'custom';
        el.querySelector('.qz-custom').hidden = false;
        el.querySelector('[data-text]').value = o.custom !== undefined ? o.custom : '(хозяин загрузил свой набор)';
        el.querySelector('[data-count]').textContent = 'Вопросов в наборе: ' + (o.customCount !== undefined ? o.customCount : count(o.custom));
      },
      bind(el, upd) {
        el.querySelector('input[type=file]').addEventListener('change', (e) => {
          const f = e.target.files[0];
          if (!f) return;
          f.text().then((t) => {
            el.querySelector('[data-text]').value = t;
            upd();
          });
        });
      },
      // гостям — только сколько вопросов, без самих вопросов
      public: (o) => (o && o.pack === 'custom' ? { pack: 'custom', customCount: count(o.custom) } : o),
    },
    create,
    view,
    act,
    tick,
    ai,
    render,
  });
  window.__quiz = { parsePack };
})();
