/* Тысяча на костях: бросайте пять кубиков, откладывайте очки и вовремя остановитесь — до 1000 */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const GOAL = 1000;
  const TURN_TIME = 30;
  const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  // очки за набор отложенных кубиков; null — в наборе есть «пустой» кубик
  function score(dice) {
    if (!dice.length) return null;
    const sorted = dice.slice().sort().join('');
    if (sorted === '12345') return 125;
    if (sorted === '23456') return 250;
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach((d) => cnt[d]++);
    let total = 0;
    for (let f = 1; f <= 6; f++) {
      let c = cnt[f];
      if (c >= 3) {
        const base = f === 1 ? 100 : f * 10;
        total += base * (c === 3 ? 1 : c === 4 ? 2 : 10);
        c = 0;
      }
      if (f === 1) total += c * 10;
      else if (f === 5) total += c * 5;
      else if (c) return null;
    }
    return total;
  }

  // лучший набор из броска (для подсказки и ботов)
  function best(roll) {
    let top = { v: 0, idx: [] };
    const n = roll.length;
    for (let m = 1; m < 1 << n; m++) {
      const idx = [];
      for (let i = 0; i < n; i++) if (m & (1 << i)) idx.push(i);
      const v = score(idx.map((i) => roll[i]));
      if (v && (v > top.v || (v === top.v && idx.length < top.idx.length))) top = { v, idx };
    }
    return top;
  }

  function create(players) {
    const s = { ids: players.map((p) => p.id), names: {}, score: {}, turn: 0, roll: [], kept: [], turnPts: 0, phase: 'roll', log: [], now: Date.now(), winner: null };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.score[p.id] = 0;
    });
    s.turn = Math.floor(Math.random() * s.ids.length);
    s.deadline = s.now + TURN_TIME * 1000;
    return s;
  }

  const cur = (s) => s.ids[s.turn];
  const say = (s, t, o) => {
    SG.party.log(s, t, o);
  };
  const rollDice = (n) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));

  function nextTurn(s, now) {
    s.turn = (s.turn + 1) % s.ids.length;
    s.roll = [];
    s.kept = [];
    s.turnPts = 0;
    s.phase = 'roll';
    s.deadline = now + TURN_TIME * 1000;
  }

  function doRoll(s, now) {
    // все пять отложены — снова бросаем все («горячие кости»)
    const n = s.kept.length >= 5 ? 5 : 5 - s.kept.length;
    if (s.kept.length >= 5) s.kept = [];
    s.roll = rollDice(n);
    s.deadline = now + TURN_TIME * 1000;
    if (!best(s.roll).v) {
      say(s, '💥 ' + s.names[cur(s)] + ': ' + s.roll.map((d) => FACES[d]).join('') + ' — пусто, очки хода сгорают');
      s.phase = 'bust';
      s.deadline = now + 2500;
    } else s.phase = 'pick';
  }

  function act(s, id, a, now) {
    if (!a || s.winner !== null || cur(s) !== id) return false;
    if (s.phase === 'roll' && a.roll) {
      doRoll(s, now);
      return true;
    }
    if (s.phase === 'pick' && Array.isArray(a.take) && (a.then === 'roll' || a.then === 'bank')) {
      const idx = [...new Set(a.take)].filter((i) => i >= 0 && i < s.roll.length);
      const v = score(idx.map((i) => s.roll[i]));
      if (!v) return false;
      s.turnPts += v;
      s.kept = s.kept.concat(idx.map((i) => s.roll[i]));
      s.roll = s.roll.filter((_, i) => !idx.includes(i));
      if (a.then === 'bank') {
        s.score[id] += s.turnPts;
        say(s, s.names[id] + ' записывает +' + s.turnPts + ' (всего ' + s.score[id] + ')');
        if (s.score[id] >= GOAL) {
          s.winner = id;
          say(s, '🏆 ' + s.names[id] + ' набирает ' + GOAL + '!');
          return true;
        }
        nextTurn(s, now);
      } else doRoll(s, now);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.winner !== null || now < s.deadline) return false;
    if (s.phase === 'bust') {
      nextTurn(s, now);
      return true;
    }
    const id = cur(s);
    if (s.phase === 'roll') return act(s, id, { roll: 1 }, now);
    // время вышло — берём лучшее и записываем
    return act(s, id, { take: best(s.roll).idx, then: 'bank' }, now);
  }

  function ai(s, id, level) {
    if (s.winner !== null || cur(s) !== id) return null;
    if (s.phase === 'roll') return { roll: 1 };
    if (s.phase !== 'pick') return null;
    const b = best(s.roll);
    const pts = s.turnPts + b.v;
    const left = s.roll.length - b.idx.length;
    const need = GOAL - s.score[id];
    const stop = { easy: 150, normal: 300, hard: 350 }[level];
    let bank = pts >= need || (left > 0 && left <= 2 && pts >= (level === 'hard' ? 150 : 100)) || pts >= stop;
    if (left === 0) bank = pts >= need; // горячие кости — рискуем
    return { take: b.idx, then: bank ? 'bank' : 'roll' };
  }

  function view(s, id) {
    return {
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], score: s.score[pid] })),
      turn: cur(s),
      phase: s.phase,
      roll: s.roll,
      kept: s.kept,
      turnPts: s.turnPts,
      hint: s.phase === 'pick' ? best(s.roll).v : 0,
      log: s.log.slice(-30),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.winner !== null,
      winner: s.winner,
    };
  }

  let sel = [];
  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const mine = v.turn === me && !v.over;
    if (v.phase !== 'pick' || !mine) sel = [];
    const selV = score(sel.map((i) => v.roll[i]));
    const seats = v.players
      .map((p) => `<div class="pt-seat${p.id === v.turn && !v.over ? ' turn' : ''}${p.id === me ? ' me' : ''}" data-seat="${p.id}" data-num="${p.score}" data-unit="очков"><b>${esc(p.name)}</b><span>${p.score} / ${GOAL}</span><i class="dk-bar" style="width:${Math.min(100, (p.score / GOAL) * 100)}%"></i></div>`)
      .join('');
    const dice = v.roll.map((d, i) => `<button type="button" class="dk-die${sel.includes(i) ? ' sel' : ''}" data-i="${i}" ${mine && v.phase === 'pick' ? '' : 'disabled'}>${FACES[d]}</button>`).join('');
    let status;
    if (v.over) status = v.winner === me ? 'Вы набрали тысячу! 🏆' : esc(ui.name(v.winner)) + ' побеждает';
    else if (!mine) status = 'Бросает ' + esc(ui.name(v.turn)) + (v.turnPts ? ' · в ходе ' + v.turnPts : '');
    else if (v.phase === 'roll') status = 'Ваш ход — бросайте!';
    else if (v.phase === 'pick') status = 'Отметьте кубики с очками' + (selV ? ': +' + selV : selV === null && sel.length ? ' — в наборе лишний кубик' : '') + ' · в ходе ' + v.turnPts;
    else status = 'Пусто — ход переходит.';
    let actions = '';
    if (mine && v.phase === 'roll') actions = '<button class="btn btn-primary" type="button" data-roll>🎲 Бросить</button>';
    if (mine && v.phase === 'pick') {
      const leftN = v.roll.length - sel.length;
      actions =
        `<button class="btn btn-primary" type="button" data-then="roll" ${selV ? '' : 'disabled'}>Отложить и бросить ${leftN || 5}</button>` +
        `<button class="btn btn-ghost" type="button" data-then="bank" ${selV ? '' : 'disabled'}>Записать ${selV ? v.turnPts + selV : ''}</button>` +
        `<button class="btn btn-ghost" type="button" data-best>Лучшее: +${v.hint}</button>`;
    }
    el.innerHTML =
      `<div class="pt-panel dk"><div class="pt-seats">${seats}</div><p class="dk-status">${status} ${!v.over ? `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>` : ''}</p>` +
      `<div class="dk-dice">${dice || '<span class="pt-muted">кубики в стакане</span>'}</div>` +
      (v.kept.length ? `<div class="dk-kept">Отложено: ${v.kept.map((d) => FACES[d]).join('')}</div>` : '') +
      `<div class="tb-actions">${actions}</div>` +
      `<details class="dk-rules"><summary>Очки</summary><p>1 — 10, 5 — 5. Три одинаковых: единицы — 100, остальные — ×10 (три шестёрки — 60). Четыре — вдвое, пять — вдесятеро. Стрит 1–5 — 125, 2–6 — 250.</p></details></div>`;
    el.querySelectorAll('.dk-die:not(:disabled)').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.dataset.i;
        sel = sel.includes(i) ? sel.filter((x) => x !== i) : sel.concat(i);
        render(v, ui);
      })
    );
    const r = el.querySelector('[data-roll]');
    if (r) r.addEventListener('click', () => ui.send({ roll: 1 }));
    el.querySelectorAll('[data-then]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.send({ take: sel, then: b.dataset.then });
        sel = [];
      })
    );
    const bb = el.querySelector('[data-best]');
    if (bb)
      bb.addEventListener('click', () => {
        sel = best(v.roll).idx;
        render(v, ui);
      });
    const key = v.roll.join('') + v.phase + v.turn;
    if (render.key !== key) {
      render.key = key;
      if (v.roll.length) SG.sound.play(v.phase === 'bust' ? 'error' : 'drop');
    }
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === me ? 'win' : 'lose');
      if (v.winner === me) SG.store.set('dice1000-wins', SG.store.get('dice1000-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({ game: 'dice1000', min: 2, max: 6, bots: true, soloBots: 2, aiForGone: true, botDelay: () => 900 + Math.random() * 800, create, view, act, tick, ai, render });
  window.__dice1000 = { score, best };
})();
