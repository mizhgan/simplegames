/* Лабиринт вслепую: постройте лабиринт сопернику и пройдите его лабиринт, не видя стен */
(() => {
  'use strict';

  const N = 6;
  const MAXW = 20;
  const START = (N - 1) * N; // левый нижний угол
  const EXIT = N - 1; // правый верхний
  const STEP = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

  // стены: h[y*N+x] — между (x,y) и (x,y+1); v[y*N+x] — между (x,y) и (x+1,y)
  const empty = () => ({ h: Array(N * N).fill(0), v: Array(N * N).fill(0) });
  const count = (w) => w.h.reduce((a, b) => a + b, 0) + w.v.reduce((a, b) => a + b, 0);

  function wallBetween(w, a, b) {
    const ax = a % N;
    const ay = Math.floor(a / N);
    const bx = b % N;
    const by = Math.floor(b / N);
    if (ax === bx) return !!w.h[Math.min(ay, by) * N + ax];
    return !!w.v[ay * N + Math.min(ax, bx)];
  }

  function neighbor(c, dir) {
    const x = (c % N) + STEP[dir][0];
    const y = Math.floor(c / N) + STEP[dir][1];
    return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : -1;
  }

  // длина кратчайшего пути (−1 — нет пути); unknown — считать неизвестные стены открытыми
  function path(w, from, to) {
    const dist = Array(N * N).fill(-1);
    const prev = Array(N * N).fill(-1);
    dist[from] = 0;
    const q = [from];
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      for (const d of 'udlr') {
        const n = neighbor(c, d);
        if (n < 0 || dist[n] >= 0 || wallBetween(w, c, n)) continue;
        dist[n] = dist[c] + 1;
        prev[n] = c;
        q.push(n);
      }
    }
    return { len: dist[to], prev };
  }

  function validMaze(w) {
    return !!w && Array.isArray(w.h) && Array.isArray(w.v) && w.h.length === N * N && w.v.length === N * N && count(w) <= MAXW && path(w, START, EXIT).len > 0;
  }

  function randomMaze(tries = 40) {
    let best = null;
    for (let t = 0; t < tries; t++) {
      const w = empty();
      let n = 0;
      for (let k = 0; k < 200 && n < MAXW; k++) {
        const kind = Math.random() < 0.5 ? 'h' : 'v';
        const x = Math.floor(Math.random() * N);
        const y = Math.floor(Math.random() * N);
        if ((kind === 'h' && y >= N - 1) || (kind === 'v' && x >= N - 1)) continue;
        const i = y * N + x;
        if (w[kind][i]) continue;
        w[kind][i] = 1;
        if (path(w, START, EXIT).len < 0) w[kind][i] = 0;
        else n++;
      }
      const len = path(w, START, EXIT).len;
      if (!best || len > best.len) best = { w, len };
    }
    return best.w;
  }

  // ---------- правила ----------

  function create() {
    return { turn: 0, phase: 'build', maze: [null, null], pos: [START, START], known: [empty(), empty()], seen: [[START], [START]], steps: [0, 0], bumps: [0, 0], last: null };
  }

  // сторона side проходит лабиринт, построенный соперником: maze[1 - side]
  function legal(s, m) {
    if (!m) return false;
    if (s.phase === 'build') return !!m.maze && validMaze(m.maze);
    if (!STEP[m.dir]) return false;
    return neighbor(s.pos[s.turn], m.dir) >= 0;
  }

  function apply(s, m) {
    const me = s.turn;
    if (s.phase === 'build') {
      s.maze[me] = { h: m.maze.h.map((x) => (x ? 1 : 0)), v: m.maze.v.map((x) => (x ? 1 : 0)) };
      if (me === 0) s.turn = 1;
      else {
        s.phase = 'play';
        s.turn = 0;
      }
      s.last = { side: me, built: true };
      return;
    }
    const from = s.pos[me];
    const to = neighbor(from, m.dir);
    const w = s.maze[1 - me];
    if (wallBetween(w, from, to)) {
      // врезались: стена становится видна, ход переходит
      const k = s.known[me];
      const ax = from % N;
      const ay = Math.floor(from / N);
      const bx = to % N;
      const by = Math.floor(to / N);
      if (ax === bx) k.h[Math.min(ay, by) * N + ax] = 1;
      else k.v[ay * N + Math.min(ax, bx)] = 1;
      s.bumps[me]++;
      s.last = { side: me, bump: true, from, to };
      s.turn = 1 - me;
    } else {
      s.pos[me] = to;
      s.steps[me]++;
      if (!s.seen[me].includes(to)) s.seen[me].push(to);
      s.last = { side: me, from, to };
    }
  }

  // ---------- компьютер ----------

  function ai(s, level) {
    if (s.phase === 'build') return { maze: randomMaze(level === 'easy' ? 3 : level === 'normal' ? 20 : 80) };
    const me = s.turn;
    const k = s.known[me];
    const p = path(k, s.pos[me], EXIT);
    // идём по кратчайшему пути, считая неизвестные стены открытыми
    let c = EXIT;
    while (p.prev[c] !== s.pos[me] && p.prev[c] >= 0) c = p.prev[c];
    let dir = Object.keys(STEP).find((d) => neighbor(s.pos[me], d) === c);
    if (level === 'easy' && Math.random() < 0.3) {
      const ok = Object.keys(STEP).filter((d) => neighbor(s.pos[me], d) >= 0 && !wallBetween(k, s.pos[me], neighbor(s.pos[me], d)));
      dir = ok[Math.floor(Math.random() * ok.length)];
    }
    return { dir: dir || 'u' };
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  let draft = empty();

  // сетка 11×11: клетки на чётных позициях, стены между ними
  function drawGrid(el, opt) {
    let html = '';
    for (let gy = 0; gy < 2 * N - 1; gy++) {
      for (let gx = 0; gx < 2 * N - 1; gx++) {
        const x = gx >> 1;
        const y = gy >> 1;
        if (gx % 2 === 0 && gy % 2 === 0) {
          const c = y * N + x;
          let cls = 'bm-c';
          if (c === START) cls += ' start';
          if (c === EXIT) cls += ' exit';
          if (opt.seen && opt.seen.includes(c)) cls += ' seen';
          html += `<div class="${cls}">${opt.pos === c ? `<i class="bm-me s${opt.side}"></i>` : c === EXIT ? '🏁' : ''}</div>`;
        } else if (gx % 2 === 1 && gy % 2 === 0) {
          const i = y * N + x;
          const on = opt.w.v[i];
          html += `<button type="button" class="bm-w v${on ? ' on' : ''}${opt.edit ? ' edit' : ''}" data-k="v" data-i="${i}" ${opt.edit ? '' : 'tabindex="-1"'}></button>`;
        } else if (gx % 2 === 0 && gy % 2 === 1) {
          const i = y * N + x;
          const on = opt.w.h[i];
          html += `<button type="button" class="bm-w h${on ? ' on' : ''}${opt.edit ? ' edit' : ''}" data-k="h" data-i="${i}" ${opt.edit ? '' : 'tabindex="-1"'}></button>`;
        } else html += '<div class="bm-post"></div>';
      }
    }
    el.innerHTML = html;
    if (opt.edit)
      el.querySelectorAll('.bm-w.edit').forEach((b) =>
        b.addEventListener('click', () => {
          const k = b.dataset.k;
          const i = +b.dataset.i;
          if (!draft[k][i] && count(draft) >= MAXW) return;
          draft[k][i] = draft[k][i] ? 0 : 1;
          SG.sound.play('click');
          duel.render();
        })
      );
  }

  $('bm-random').addEventListener('click', () => {
    draft = randomMaze(30);
    duel.render();
  });
  $('bm-clear').addEventListener('click', () => {
    draft = empty();
    duel.render();
  });
  $('bm-done').addEventListener('click', () => {
    if (!validMaze(draft)) return;
    const m = { maze: draft };
    draft = empty();
    duel.play(m);
  });
  document.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => duel.play({ dir: b.dataset.dir })));
  document.addEventListener('keydown', (e) => {
    const map = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r' };
    if (!map[e.code] || !duel.canMove() || duel.state.phase !== 'play') return;
    e.preventDefault();
    duel.play({ dir: map[e.code] });
  });

  const duel = SG.duel({
    game: 'blindmaze',
    sides: ['Синий', 'Красный'],
    create,
    legal,
    apply,
    over(s) {
      for (const side of [0, 1]) if (s.pos[side] === EXIT) return { winner: side, text: 'Выход найден: ' + s.steps[side] + ' шагов, ' + s.bumps[side] + ' ударов о стены.' };
      return null;
    },
    hint(s) {
      if (s.phase === 'build') return 'постройте лабиринт для соперника (до ' + MAXW + ' стен)';
      return 'идите к флажку стрелками';
    },
    ai,
    aiDelay: 450,
    sound: (s) => (s.last && s.last.bump ? 'hit' : s.last && s.last.built ? 'place' : 'move'),
    onNew() {
      draft = empty();
    },
    render(s, v) {
      const me = v.watch ? v.hostSide : v.mode === 'pvp' ? s.turn : v.me === null || v.me === undefined ? 0 : v.me;
      const build = s.phase === 'build';
      $('bm-build').hidden = !(build && v.canMove);
      $('bm-play').hidden = build;
      $('bm-pad').hidden = build || !v.canMove;
      if (build) {
        $('bm-wait').hidden = v.canMove;
        if (v.canMove) {
          drawGrid($('bm-editor'), { w: draft, edit: true, side: me });
          const ok = validMaze(draft);
          $('bm-count').textContent = 'Стен: ' + count(draft) + ' из ' + MAXW + (ok ? '' : ' — нужен проход от старта к флажку!');
          $('bm-done').disabled = !ok;
        }
        return;
      }
      $('bm-wait').hidden = true;
      // слева — лабиринт, который я прохожу (вижу только найденные стены); справа — мой лабиринт и соперник в нём
      const opp = 1 - me;
      drawGrid($('bm-mine'), { w: s.known[me], seen: s.seen[me], pos: s.pos[me], side: me });
      const showOwn = !v.watch && (v.mode !== 'pvp' || v.over);
      drawGrid($('bm-theirs'), { w: showOwn || v.over ? s.maze[me] || empty() : s.known[opp], seen: s.seen[opp], pos: s.pos[opp], side: opp });
      const name = (x) => (v.mode === 'pvp' ? (x ? 'Красный' : 'Синий') : v.watch ? (x === v.hostSide ? 'Игрок 1' : 'Игрок 2') : x === me ? 'Вы' : v.mode === 'ai' ? 'Компьютер' : 'Соперник');
      $('bm-t1').textContent = name(me) + ' в лабиринте соперника';
      $('bm-t2').textContent = name(opp) + (showOwn ? ' в вашем лабиринте' : ' — его путь');
      $('bm-note').textContent = s.last && s.last.bump ? name(s.last.side) + ' врезается в стену — ход переходит.' : '';
    },
  });
})();
