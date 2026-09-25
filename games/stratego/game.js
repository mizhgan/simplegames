/* Стратего (малое): звания фигур соперника скрыты, пока они не встретятся в бою */
(() => {
  'use strict';

  const N = 8;
  const LAKES = new Set([3 * N + 2, 4 * N + 2, 3 * N + 5, 4 * N + 5]);
  // 0 — флаг, 1 — шпион, 2 — разведчик, 3 — сапёр, 4…10 — офицеры, 11 — бомба
  const ARMY = [0, 11, 11, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 9, 10];
  const NAME = { 0: 'Флаг', 1: 'Шпион', 2: 'Разведчик', 3: 'Сапёр', 4: 'Сержант', 5: 'Лейтенант', 6: 'Капитан', 7: 'Майор', 9: 'Генерал', 10: 'Маршал', 11: 'Бомба' };
  const ICON = { 0: '🚩', 1: '🕵', 11: '💣' };
  const label = (r) => ICON[r] || String(r);
  const HOME = [[], []];
  for (let i = 0; i < 16; i++) {
    HOME[0].push(6 * N + i); // строки 6–7 — нижние (игрок 1)
    HOME[1].push(i); // строки 0–1 — верхние
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const PLY_LIMIT = 500;

  function create(seed) {
    const rand = SG.duel.rng(seed);
    // черновая расстановка каждой стороны — от общего зерна (игрок её поменяет перед боем)
    const setups = [0, 1].map(() => SG.duel.shuffleWith(ARMY.slice(), rand));
    return { b: new Array(N * N).fill(null), phase: 'setup', ready: [false, false], turn: 0, draft: setups, ply: 0, dead: [[], []] };
  }

  const movable = (p) => p && p.r !== 0 && p.r !== 11;

  function pieceMoves(s, i) {
    const p = s.b[i];
    if (!p || !movable(p)) return [];
    const out = [];
    const x0 = i % N;
    const y0 = Math.floor(i / N);
    for (const [dx, dy] of DIRS) {
      for (let k = 1; k < N; k++) {
        const x = x0 + dx * k;
        const y = y0 + dy * k;
        if (x < 0 || y < 0 || x >= N || y >= N) break;
        const t = y * N + x;
        if (LAKES.has(t)) break;
        const q = s.b[t];
        if (q && q.o === p.o) break;
        out.push(t);
        if (q || p.r !== 2) break; // разведчик ходит на любое число клеток
      }
    }
    return out;
  }

  function moves(s) {
    if (s.over) return [];
    if (s.phase === 'setup') return [{ setup: s.draft[s.turn] }];
    const out = [];
    for (let i = 0; i < N * N; i++) {
      const p = s.b[i];
      if (p && p.o === s.turn) for (const t of pieceMoves(s, i)) out.push({ f: i, t });
    }
    return out;
  }

  function legal(s, m) {
    if (!m || s.over) return false;
    if (s.phase === 'setup') {
      if (!Array.isArray(m.setup) || m.setup.length !== 16) return false;
      return ARMY.slice().sort((a, b) => a - b).join() === m.setup.slice().sort((a, b) => a - b).join();
    }
    const p = s.b[m.f];
    return !!p && p.o === s.turn && pieceMoves(s, m.f).includes(m.t);
  }

  // исход боя: 1 — побеждает нападающий, −1 — защитник, 0 — оба гибнут
  function fight(a, d) {
    if (d === 0) return 1;
    if (d === 11) return a === 3 ? 1 : -1;
    if (a === 1 && d === 10) return 1;
    if (a === d) return 0;
    return a > d ? 1 : -1;
  }

  function apply(s, m) {
    const me = s.turn;
    s.battle = null;
    if (m.setup) {
      HOME[me].forEach((cell, k) => (s.b[cell] = { o: me, r: m.setup[k], k: false, mv: false }));
      s.ready[me] = true;
      s.turn = 1 - me;
      if (s.ready[0] && s.ready[1]) {
        s.phase = 'play';
        s.turn = 0;
      }
      return;
    }
    const a = s.b[m.f];
    const d = s.b[m.t];
    s.b[m.f] = null;
    a.mv = true;
    if (Math.abs(m.t - m.f) > 1 && Math.abs(m.t - m.f) !== N) a.k = true; // дальний ход выдаёт разведчика
    s.ply++;
    s.last = { f: m.f, t: m.t };
    if (!d) s.b[m.t] = a;
    else {
      a.k = d.k = true;
      const r = fight(a.r, d.r);
      s.battle = { a: a.r, d: d.r, r, by: me };
      if (r === 1) {
        s.b[m.t] = a;
        s.dead[d.o].push(d.r);
        if (d.r === 0) s.over = { winner: me, text: 'Флаг захвачен!' };
      } else if (r === -1) s.dead[me].push(a.r);
      else {
        s.b[m.t] = null;
        s.dead[me].push(a.r);
        s.dead[d.o].push(d.r);
      }
    }
    s.turn = 1 - me;
    if (!s.over && !moves(s).length) s.over = { winner: me, text: 'Соперник не может ходить.' };
    if (!s.over && s.ply >= PLY_LIMIT) s.over = { winner: null, text: 'Слишком долгая битва.' };
  }

  // ---------- компьютер ----------

  function aiSetup(s, level) {
    const me = s.turn;
    const rest = ARMY.slice();
    const setup = new Array(16).fill(-1);
    // флаг в заднем ряду, бомбы рядом с ним
    const back = me === 0 ? [8, 15] : [0, 7]; // индексы клеток заднего ряда в порядке HOME
    const fx = Math.floor(Math.random() * 8);
    const flagSlot = back[0] + fx;
    setup[flagSlot] = 0;
    rest.splice(rest.indexOf(0), 1);
    if (level !== 'easy') {
      const around = [flagSlot - 1, flagSlot + 1, me === 0 ? flagSlot - 8 : flagSlot + 8].filter((k) => k >= 0 && k < 16 && Math.floor(k / 8) === Math.floor(flagSlot / 8) || k === (me === 0 ? flagSlot - 8 : flagSlot + 8));
      for (const k of SG.shuffle(around).slice(0, 2)) {
        if (k >= 0 && k < 16 && setup[k] < 0) {
          setup[k] = 11;
          rest.splice(rest.indexOf(11), 1);
        }
      }
    }
    SG.shuffle(rest);
    for (let k = 0; k < 16; k++) if (setup[k] < 0) setup[k] = rest.pop();
    return { setup };
  }

  function ai(s, level) {
    if (s.phase === 'setup') return aiSetup(s, level);
    const me = s.turn;
    const all = moves(s);
    const dir = me === 0 ? -1 : 1;
    let best = all[0];
    let bv = -Infinity;
    for (const m of all) {
      const a = s.b[m.f];
      const d = s.b[m.t];
      let v = Math.random() * (level === 'easy' ? 20 : 4);
      const fy = Math.floor(m.f / N);
      const ty = Math.floor(m.t / N);
      v += (ty - fy) * dir * 3; // вперёд
      if (d) {
        if (d.k) {
          const r = fight(a.r, d.r);
          v += r === 1 ? 20 + d.r * 3 + (d.r === 0 ? 1000 : 0) : r === 0 ? d.r - a.r : -15 - a.r * 3;
        } else {
          // неизвестная фигура: неподвижная может оказаться бомбой или флагом
          const risky = !d.mv;
          if (a.r === 2) v += 8; // разведка боем
          else if (a.r === 3 && risky) v += 10;
          else if (a.r >= 9) v += risky ? -25 : -6;
          else v += risky ? -4 : a.r - 5;
        }
      }
      // не подставляемся под известную старшую фигуру
      if (level !== 'easy') {
        const tx = m.t % N;
        for (const [dx, dy] of DIRS) {
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const q = s.b[y * N + x];
          if (q && q.o !== me && q.k && movable(q) && fight(q.r, a.r) === 1) v -= 10 + a.r * 2;
        }
      }
      if (a.r >= 9 && !d) v -= 2; // старших бережём
      if (v > bv) {
        bv = v;
        best = m;
      }
    }
    return best;
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const cells = [];
  for (let k = 0; k < N * N; k++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'st-cell';
    b.addEventListener('click', () => click(b.idx));
    boardEl.appendChild(b);
    cells.push(b);
  }
  let sel = -1;
  let draft = null; // своя расстановка до «Готово»
  let revealed = -1; // вдвоём за одним экраном: чья армия открыта

  const viewSide = (v, s) => (v.mode === 'pvp' ? s.turn : v.watch ? -1 : v.me === null || v.me === undefined ? 0 : v.me);

  function click(i) {
    const s = duel.state;
    if (!duel.canMove()) return;
    const v = duel.view();
    if (v.mode === 'pvp' && revealed !== s.turn) return;
    const me = s.turn;
    if (s.phase === 'setup') {
      const k = HOME[me].indexOf(i);
      if (k < 0) return;
      if (sel < 0) sel = k;
      else {
        [draft[sel], draft[k]] = [draft[k], draft[sel]];
        sel = -1;
        SG.sound.play('slide');
      }
      return duel.render();
    }
    const p = s.b[i];
    if (p && p.o === me) {
      sel = sel === i ? -1 : i;
      return duel.render();
    }
    if (sel >= 0 && pieceMoves(s, sel).includes(i)) {
      const f = sel;
      sel = -1;
      duel.play({ f, t: i });
      return;
    }
    sel = -1;
    duel.render();
  }

  $('shuffle-btn').addEventListener('click', () => {
    if (!draft) return;
    SG.shuffle(draft);
    sel = -1;
    duel.render();
  });
  $('ready-btn').addEventListener('click', () => {
    if (!draft) return;
    const setup = draft.slice();
    draft = null;
    sel = -1;
    duel.play({ setup });
  });
  $('curtain').querySelector('button').addEventListener('click', () => {
    revealed = duel.state.turn;
    duel.render();
  });

  const duel = SG.duel({
    game: 'stratego',
    sides: ['Синие', 'Красные'],
    create,
    legal,
    apply,
    over: (s) => s.over || null,
    hint(s) {
      if (s.phase === 'setup') return 'расставьте армию: меняйте фигуры местами, затем «Готово»';
      return sel >= 0 ? 'куда пойти?' : 'выберите фигуру';
    },
    ai,
    aiDelay: 450,
    sound: (s) => (s.battle ? (s.battle.r === 0 ? 'explode' : 'capture') : s.phase === 'setup' ? 'card' : 'move'),
    onNew() {
      sel = -1;
      draft = null;
      revealed = -1;
    },
    render(s, v) {
      if (!v.canMove) sel = -1;
      const side = viewSide(v, s);
      const hiddenTurn = v.mode === 'pvp' && revealed !== s.turn && !v.over;
      const show = (p) => v.over || p.k || (!hiddenTurn && p.o === side);
      if (s.phase === 'setup' && v.canMove && !draft) draft = s.draft[s.turn].slice();
      if (s.phase !== 'setup') draft = null;
      const targets = new Set(sel >= 0 && s.phase === 'play' ? pieceMoves(s, sel) : []);
      const flipBoard = side === 1;
      for (let k = 0; k < N * N; k++) {
        const i = flipBoard ? N * N - 1 - k : k;
        const el = cells[k];
        el.idx = i;
        let p = s.b[i];
        if (s.phase === 'setup' && draft && HOME[s.turn].includes(i)) p = { o: s.turn, r: draft[HOME[s.turn].indexOf(i)], k: false };
        let cls = 'st-cell';
        if (LAKES.has(i)) cls += ' lake';
        if (s.last && (s.last.f === i || s.last.t === i)) cls += ' last';
        if (targets.has(i)) cls += ' target';
        if (s.phase === 'setup' && draft && sel >= 0 && HOME[s.turn][sel] === i) cls += ' sel';
        if (s.phase === 'play' && i === sel) cls += ' sel';
        if (p) {
          cls += ' o' + p.o + (show(p) ? '' : ' hidden');
          el.innerHTML = show(p) ? `<span>${label(p.r)}</span>` : '';
          el.title = show(p) ? NAME[p.r] : '';
        } else {
          el.innerHTML = '';
          el.title = '';
        }
        el.className = cls;
      }
      const setupMine = s.phase === 'setup' && v.canMove && !hiddenTurn;
      $('setup-bar').hidden = !setupMine;
      $('curtain').hidden = !hiddenTurn || !v.canMove;
      let msg = '';
      if (s.battle) {
        const b = s.battle;
        msg = 'Бой: ' + NAME[b.a] + ' (' + label(b.a) + ') против ' + NAME[b.d] + ' (' + label(b.d) + ') — ' + (b.r === 1 ? 'победил нападавший' : b.r === -1 ? 'устоял защитник' : 'погибли оба');
      }
      $('battle').textContent = msg;
      $('dead').innerHTML = [0, 1]
        .map((p) => `<span class="o${p}">Потери ${p ? 'красных' : 'синих'}: ${s.dead[p].map(label).join(' ') || '—'}</span>`)
        .join('');
    },
  });
})();
