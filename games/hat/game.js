/* Шляпа: объясните слово напарнику, не называя его, — сколько успеете за минуту */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const pretty = (w) => w.replace(/-/g, ' ');
  const norm = (w) => String(w).toLowerCase().replace(/ё/g, 'е').replace(/[\s-]+/g, ' ').replace(/[.!?,]/g, '').trim();
  const PREP = 8;

  function pool(kind) {
    const croc = window.CROC_WORDS.easy.concat(window.CROC_WORDS.hard);
    if (kind === 'easy') return croc;
    const nouns = Array.isArray(window.SG_NOUNS) ? window.SG_NOUNS : String(window.SG_NOUNS).split(' ');
    return croc.concat(nouns.filter((w) => w.length >= 4 && w.length <= 9));
  }

  function create(players, opts) {
    const o = opts || {};
    const words = SG.shuffle([...new Set(pool(o.words))]).slice(0, +o.count || 40);
    const s = { ids: players.map((p) => p.id), names: {}, score: {}, hat: words, total: words.length, turn: 0, lap: 1, phase: 'prep', time: +o.time || 60, word: null, got: [], skipped: 0, now: Date.now(), log: [] };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.score[p.id] = 0;
    });
    s.deadline = s.now + PREP * 1000;
    return s;
  }

  // объясняет ids[turn], угадывает сосед со сдвигом lap (каждый круг — новый напарник)
  const explainer = (s) => s.ids[s.turn % s.ids.length];
  const guesser = (s) => s.ids[(s.turn + s.lap) % s.ids.length];

  function draw(s) {
    s.word = s.hat.length ? s.hat.splice(Math.floor(Math.random() * s.hat.length), 1)[0] : null;
  }

  function startTurn(s, now) {
    s.phase = 'explain';
    s.got = [];
    s.skipped = 0;
    s.deadline = now + s.time * 1000;
    draw(s);
  }

  function endTurn(s, now) {
    // недоугаданное слово возвращается в шляпу
    if (s.word) s.hat.push(s.word);
    s.word = null;
    SG.party.log(s, s.names[explainer(s)] + ' → ' + s.names[guesser(s)] + ': ' + s.got.length + ' сл.', { w: explainer(s), i: '🎩' });
    if (!s.hat.length) {
      s.phase = 'end';
      const best = Math.max(...s.ids.map((id) => s.score[id]));
      s.winners = s.ids.filter((id) => s.score[id] === best);
      return;
    }
    s.turn++;
    if (s.turn % s.ids.length === 0) {
      s.lap++;
      if (s.lap >= s.ids.length) s.lap = 1;
    }
    s.phase = 'prep';
    s.deadline = now + PREP * 1000;
  }

  function guessed(s, now) {
    s.got.push(s.word);
    s.score[explainer(s)]++;
    s.score[guesser(s)]++;
    draw(s);
    if (!s.word) endTurn(s, now);
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end') return false;
    if (s.phase === 'prep' && id === explainer(s) && a.go) {
      startTurn(s, now);
      return true;
    }
    if (s.phase === 'explain' && id === explainer(s)) {
      if (a.ok) {
        guessed(s, now);
        return true;
      }
      if (a.skip) {
        s.hat.push(s.word);
        s.skipped++;
        draw(s);
        return true;
      }
    }
    return false;
  }

  // напарник пишет догадки в чат; объясняющий не может написать само слово
  function chat(s, id, text) {
    if (s.phase !== 'explain' || !s.word) return undefined;
    const w = norm(s.word);
    const t = norm(text);
    if (id === explainer(s)) return t.includes(w) || t.includes(w.slice(0, Math.max(4, w.length - 2))) ? false : undefined;
    if (id === guesser(s) && t === w) {
      guessed(s, s.now);
      return '✅ ' + pretty(s.got[s.got.length - 1]);
    }
    return t.includes(w) ? false : undefined;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'prep') startTurn(s, now);
    else if (s.phase === 'explain') endTurn(s, now);
    return true;
  }

  function leave(s, id) {
    if ((s.phase === 'explain' || s.phase === 'prep') && (explainer(s) === id || guesser(s) === id)) endTurn(s, s.now);
  }

  function view(s, id) {
    return {
      phase: s.phase,
      explainer: explainer(s),
      guesser: guesser(s),
      word: s.phase === 'explain' && id === explainer(s) && s.word ? pretty(s.word) : null,
      got: s.got.map(pretty),
      skipped: s.skipped,
      hat: s.hat.length + (s.word ? 1 : 0),
      total: s.total,
      scores: s.ids.map((pid) => ({ id: pid, name: s.names[pid], score: s.score[pid] })),
      log: s.log.slice(-30),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.phase === 'end',
      winners: s.winners || null,
    };
  }

  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const timer = `<span class="pt-timer ht-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const scores = v.scores
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((p) => `<div class="pt-seat${p.id === v.explainer || p.id === v.guesser ? ' turn' : ''}${p.id === me ? ' me' : ''}"><b>${p.id === v.explainer ? '🗣 ' : p.id === v.guesser ? '👂 ' : ''}${esc(p.name)}</b><span>${p.score}</span></div>`)
      .join('');
    const pair = `<b>${esc(ui.name(v.explainer))}</b> объясняет, <b>${esc(ui.name(v.guesser))}</b> угадывает`;
    let body = '';
    if (v.phase === 'prep') {
      body = `<p>${pair}.</p>` + (v.explainer === me ? `<button class="btn btn-primary ht-go" type="button" data-go>Поехали! ${timer}</button>` : `<p>Сейчас начнут ${timer}</p>`);
    } else if (v.phase === 'explain') {
      if (v.explainer === me)
        body = `<p>Объясняйте голосом или в чате, не называя слово и однокоренные. ${timer}</p><div class="ht-word">${esc(v.word)}</div><div class="pt-choices"><button class="btn btn-primary" type="button" data-ok>✅ Угадано</button><button class="btn btn-ghost" type="button" data-skip>⏭ Пропустить</button></div>`;
      else if (v.guesser === me) body = `<p>Вам объясняет <b>${esc(ui.name(v.explainer))}</b>. Называйте голосом или пишите в поле ниже. ${timer}</p><form class="ht-guess"><input type="text" maxlength="40" placeholder="Это…" autocomplete="off"><button class="btn btn-primary" type="submit">➤</button></form>`;
      else body = `<p>${pair}. ${timer}</p>`;
      body += `<p class="pt-muted">Угадано: ${v.got.length ? v.got.map(esc).join(', ') : '—'}${v.skipped ? ' · пропущено ' + v.skipped : ''}</p>`;
    } else if (v.over) {
      const w = v.winners || [];
      body = `<p class="pt-big">${w.includes(me) ? (w.length > 1 ? 'Вы среди лучших! 🤝' : 'Вы победили! 🏆') : 'Победа: ' + w.map((x) => esc(ui.name(x))).join(', ')}</p>`;
    }
    el.innerHTML = `<div class="pt-panel ht"><div class="ht-hat">🎩 В шляпе ${v.hat} из ${v.total}</div><div class="pt-seats">${scores}</div>${body}</div>`;
    const on = (sel, a) => {
      const b = el.querySelector(sel);
      if (b) b.addEventListener('click', () => ui.send(a));
    };
    on('[data-go]', { go: 1 });
    on('[data-ok]', { ok: 1 });
    on('[data-skip]', { skip: 1 });
    const f = el.querySelector('.ht-guess');
    if (f) {
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const i = f.querySelector('input');
        if (i.value.trim()) ui.say(i.value.trim());
        i.value = '';
      });
      if (render.focusKey !== v.explainer + ':' + v.phase) f.querySelector('input').focus();
    }
    render.focusKey = v.explainer + ':' + v.phase;
    const key = v.phase + v.explainer + v.got.length;
    if (render.key !== key) {
      if (v.got.length && render.key && render.key.startsWith('explain')) SG.sound.play('match');
      else if (v.phase === 'prep' && v.explainer === me) SG.sound.play('hint');
      render.key = key;
    }
    if (v.over && !render.done) {
      render.done = true;
      const won = (v.winners || []).includes(me);
      SG.sound.play(won ? 'win' : 'lose');
      if (won) SG.store.set('hat-wins', SG.store.get('hat-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({
    game: 'hat',
    min: 2,
    max: 12,
    bots: false,
    options: {
      html:
        '<label>Слов в шляпе <select data-count><option value="30">30</option><option value="40" selected>40</option><option value="60">60</option><option value="80">80</option></select></label>' +
        '<label>Слова <select data-words><option value="easy">Простые</option><option value="any">Любые существительные</option></select></label>' +
        '<label>Время на ход <select data-time><option value="45">45 секунд</option><option value="60" selected>60 секунд</option><option value="90">90 секунд</option></select></label>',
      read: (el) => ({ count: +el.querySelector('[data-count]').value, words: el.querySelector('[data-words]').value, time: +el.querySelector('[data-time]').value }),
      show(el, o) {
        if (!o) return;
        if (o.count) el.querySelector('[data-count]').value = String(o.count);
        if (o.words) el.querySelector('[data-words]').value = o.words;
        if (o.time) el.querySelector('[data-time]').value = String(o.time);
      },
    },
    create,
    view,
    act,
    tick,
    chat,
    leave,
    render,
  });
})();
