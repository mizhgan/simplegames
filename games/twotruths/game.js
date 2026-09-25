/* Правда или ложь: две правды и одна выдумка о себе — найдите, где соврали друзья */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const T = { write: 180, vote: 40, reveal: 8 };

  function create(players) {
    const s = { ids: players.map((p) => p.id), names: {}, score: {}, facts: {}, order: [], cur: -1, phase: 'write', votes: {}, now: Date.now() };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.score[p.id] = 0;
    });
    s.deadline = s.now + T.write * 1000;
    return s;
  }

  const author = (s) => s.order[s.cur];

  function startRounds(s, now) {
    s.order = SG.shuffle(s.ids.filter((id) => s.facts[id]));
    s.cur = -1;
    next(s, now);
  }

  function next(s, now) {
    s.cur++;
    if (s.cur >= s.order.length) {
      s.phase = 'end';
      const best = Math.max(...s.ids.map((id) => s.score[id]));
      s.winners = s.ids.filter((id) => s.score[id] === best);
      return;
    }
    s.phase = 'vote';
    s.votes = {};
    s.deadline = now + T.vote * 1000;
  }

  function reveal(s, now) {
    const a = author(s);
    const f = s.facts[a];
    s.gain = {};
    Object.entries(s.votes).forEach(([id, k]) => {
      if (k === f.lie) {
        s.score[id] += 2;
        s.gain[id] = 2;
      } else {
        s.score[a] += 1;
        s.gain[a] = (s.gain[a] || 0) + 1;
      }
    });
    s.phase = 'reveal';
    s.deadline = now + T.reveal * 1000;
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || s.names[id] === undefined) return false;
    if (s.phase === 'write' && Array.isArray(a.facts) && a.facts.length === 3 && [0, 1, 2].includes(a.lie)) {
      const facts = a.facts.map((x) => String(x).trim().slice(0, 140));
      if (facts.some((x) => !x)) return false;
      // порядок перемешиваем, чтобы ложь не была всегда на одном месте
      const order = SG.shuffle([0, 1, 2]);
      s.facts[id] = { list: order.map((k) => facts[k]), lie: order.indexOf(a.lie) };
      if (s.ids.every((x) => s.facts[x])) startRounds(s, now);
      return true;
    }
    if (s.phase === 'vote' && id !== author(s) && [0, 1, 2].includes(a.vote)) {
      s.votes[id] = a.vote;
      if (s.ids.every((x) => x === author(s) || s.votes[x] !== undefined)) reveal(s, now);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'write') {
      if (!Object.keys(s.facts).length) {
        s.phase = 'end';
        s.winners = [];
        return true;
      }
      startRounds(s, now);
    } else if (s.phase === 'vote') reveal(s, now);
    else if (s.phase === 'reveal') next(s, now);
    return true;
  }

  function view(s, id) {
    const a = author(s);
    const f = a !== undefined ? s.facts[a] : null;
    return {
      phase: s.phase,
      wrote: s.ids.filter((x) => s.facts[x]),
      iWrote: !!s.facts[id],
      author: a,
      round: s.cur + 1,
      rounds: s.order.length,
      facts: f && (s.phase === 'vote' || s.phase === 'reveal') ? f.list : null,
      lie: f && (s.phase === 'reveal' || a === id) ? f.lie : null,
      votes: s.phase === 'reveal' ? s.votes : null,
      voted: Object.keys(s.votes).map(Number),
      myVote: s.votes[id],
      gain: s.phase === 'reveal' ? s.gain : null,
      scores: s.ids.map((pid) => ({ id: pid, name: s.names[pid], score: s.score[pid] })),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.phase === 'end',
      winners: s.winners || null,
    };
  }

  let draft = { facts: ['', '', ''], lie: 2 };
  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const scores = v.scores
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((p) => `<div class="pt-seat${p.id === v.author ? ' turn' : ''}${p.id === me ? ' me' : ''}"><b>${esc(p.name)}${v.phase === 'write' && v.wrote.includes(p.id) ? ' ✓' : v.phase === 'vote' && v.voted.includes(p.id) ? ' ✓' : ''}</b><span>${p.score}${v.gain && v.gain[p.id] ? ` <em class="qz-plus">+${v.gain[p.id]}</em>` : ''}</span></div>`)
      .join('');
    let body = '';
    if (v.phase === 'write') {
      if (v.iWrote || ui.watcher) body = `<p>Ждём остальных: написали ${v.wrote.length} из ${v.scores.length}. ${timer}</p>`;
      else
        body =
          `<p>Напишите о себе три утверждения: два правдивых и одно выдуманное. Отметьте, какое — ложь. ${timer}</p>` +
          `<form class="tt-form">${[0, 1, 2].map((k) => `<label class="tt-row"><input type="radio" name="lie" value="${k}" ${draft.lie === k ? 'checked' : ''} title="Это ложь"><input type="text" maxlength="140" data-k="${k}" value="${esc(draft.facts[k])}" placeholder="${['Я был(а) на Северном полюсе', 'Я умею жонглировать', 'Я ни разу не ел(а) суши'][k]}" required></label>`).join('')}<p class="pt-muted">Кружок слева — отметка лжи.</p><button class="btn btn-primary" type="submit">Готово</button></form>`;
    } else if (v.phase === 'vote' || v.phase === 'reveal') {
      const mine = v.author === me;
      body =
        `<p>${v.round} из ${v.rounds} · <b>${esc(ui.name(v.author))}</b> утверждает: ${v.phase === 'vote' ? timer : ''}</p>` +
        `<div class="tt-facts">${v.facts
          .map((f, k) => {
            const who = v.votes ? v.scores.filter((p) => v.votes[p.id] === k).map((p) => esc(p.name)).join(', ') : '';
            const cls = v.lie === k && (v.phase === 'reveal' || mine) ? 'lie' : v.phase === 'reveal' ? 'truth' : v.myVote === k ? 'sel' : '';
            return `<button type="button" class="tt-fact ${cls}" data-k="${k}" ${v.phase !== 'vote' || mine || ui.watcher ? 'disabled' : ''}><span>${esc(f)}</span>${v.phase === 'reveal' ? `<small>${v.lie === k ? '🤥 ложь' : '✅ правда'}${who ? ' · ' + who : ''}</small>` : ''}</button>`;
          })
          .join('')}</div>` +
        (v.phase === 'vote' ? (mine ? '<p class="pt-muted">Это ваши утверждения — смотрите, как гадают.</p>' : '<p>Где ложь?</p>') : '');
    } else if (v.over) {
      const w = v.winners || [];
      body = `<p class="pt-big">${w.includes(me) ? (w.length > 1 ? 'Ничья — вы среди лучших! 🤝' : 'Вы победили! 🏆') : w.length ? 'Победа: ' + w.map((x) => esc(ui.name(x))).join(', ') : 'Никто не написал утверждений.'}</p>`;
    }
    el.innerHTML = `<div class="pt-panel tt"><div class="pt-seats">${scores}</div>${body}</div>`;
    const f = el.querySelector('.tt-form');
    if (f) {
      f.addEventListener('input', () => {
        f.querySelectorAll('[data-k]').forEach((i) => (draft.facts[+i.dataset.k] = i.value));
        draft.lie = +(f.querySelector('[name=lie]:checked') || { value: 2 }).value;
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        ui.send({ facts: draft.facts, lie: draft.lie });
      });
    }
    el.querySelectorAll('.tt-fact:not(:disabled)').forEach((b) => b.addEventListener('click', () => ui.send({ vote: +b.dataset.k })));
    if (v.over && !render.done) {
      render.done = true;
      const won = (v.winners || []).includes(me);
      SG.sound.play(won ? 'win' : 'lose');
      if (won) SG.store.set('twotruths-wins', SG.store.get('twotruths-wins', 0) + 1);
      draft = { facts: ['', '', ''], lie: 2 };
    }
    if (!v.over) render.done = false;
  }

  SG.party({ game: 'twotruths', min: 3, max: 12, bots: false, create, view, act, tick, render });
})();
