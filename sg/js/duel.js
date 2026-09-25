/* SimpleGames — каркас пошаговых игр для двоих: против компьютера, вдвоём на одном экране и по сети.

   Игра описывает только правила и отрисовку:
     const duel = SG.duel({
       game: 'chess',                   // id игры (для сети и рекордов)
       sides: ['Белые', 'Чёрные'],      // названия сторон 0 и 1
       create(seed) { return state },   // новая позиция; state.turn — чей ход (0 | 1);
                                        // seed одинаков у обоих игроков по сети (для раздачи фишек и т. п.)
       legal(state, move) { return true },
       apply(state, move) {},           // сделать ход (меняет state; state.turn — кто ходит дальше)
       over(state) { return null | { winner: 0 | 1 | null, text } },  // null — игра идёт
       render(state, view) {},          // view: { me, canMove, last, flip, mode }
       ai(state, level) { return move },  // ход компьютера (можно вернуть Promise)
       hint(state, view) { return '' },   // необязательная подсказка к строке состояния
       sound(state, move) { return 'place' },
     });
     duel.play(move) — ход человека (проверяется очередь и правила)

   Разметку страницы даёт генератор: #mode, #difficulty, #status, #new-btn, #undo-btn,
   #score-0, #score-1, #score-d, #label-0, #label-1.

   Здесь же — общие переборы для компьютера: SG.duel.search (альфа-бета) и SG.duel.mcts.
*/
(() => {
  'use strict';

  const LEVELS = ['easy', 'normal', 'hard'];

  function duel(cfg) {
    const $ = (id) => document.getElementById(id);
    const key = (k) => cfg.game + '-' + k;
    const statusEl = $('status');
    const diffEl = $('difficulty');
    const undoBtn = $('undo-btn');
    const modes = [...($('mode') ? $('mode').querySelectorAll('button[data-value]') : [])].map((b) => b.dataset.value);

    let mode = SG.store.get(key('mode'), modes[0] || 'ai');
    if (!modes.includes(mode)) mode = modes[0] || 'ai';
    let level = SG.store.get(key('diff'), 'normal');
    if (!LEVELS.includes(level)) level = 'normal';

    let state;
    let history = []; // сделанные ходы — для отмены и проверки порядка в сети
    let humanSide = 0; // против компьютера: за кого играет человек
    let mySide = 0; // по сети
    let finished = null;
    let token = 0; // растёт с каждой новой партией, чтобы «старый» ход компьютера не сработал
    let thinking = false;
    let seed = 1;
    const scores = [0, 0, 0]; // сторона 0, сторона 1, ничьи

    const me = () => (mode === 'ai' ? humanSide : mode === 'net' ? mySide : null);
    const isHumanTurn = () => {
      if (finished || thinking) return false;
      if (mode === 'pvp') return true;
      if (mode === 'net') return net.active && state.turn === mySide;
      return state.turn === humanSide;
    };

    function view() {
      const m = me();
      return {
        me: m,
        mode,
        canMove: isHumanTurn(),
        last: history.length ? history[history.length - 1] : null,
        flip: m === 1 || (mode === 'pvp' && cfg.flipPvp && state.turn === 1),
        over: finished,
      };
    }

    function render() {
      cfg.render(state, view());
      updateStatus();
      if (undoBtn) undoBtn.disabled = mode === 'net' || !history.length || !!thinking || (mode === 'ai' && !history.some((h) => h.side === humanSide));
    }

    function sideName(s) {
      return cfg.sides[s];
    }

    function updateStatus() {
      if (!statusEl) return;
      if (finished) return;
      const v = view();
      const hint = cfg.hint ? cfg.hint(state, v) : '';
      let text;
      if (mode === 'net') text = !net.active ? 'Нет соединения с соперником' : state.turn === mySide ? 'Ваш ход' : 'Ход соперника…';
      else if (mode === 'ai') text = state.turn === humanSide ? 'Ваш ход' : 'Компьютер думает…';
      else text = 'Ход: ' + sideName(state.turn).toLowerCase();
      statusEl.textContent = text + (hint && (mode === 'pvp' || state.turn === me()) ? ' — ' + hint : '');
    }

    function renderScores() {
      const set = (id, v) => $(id) && ($(id).textContent = v);
      set('score-0', scores[0]);
      set('score-1', scores[1]);
      set('score-d', scores[2]);
      const label = (s) => {
        if (mode === 'ai') return (s === humanSide ? 'Вы' : 'Компьютер') + ' · ' + sideName(s);
        if (mode === 'net') return (s === mySide ? 'Вы' : 'Соперник') + ' · ' + sideName(s);
        return sideName(s);
      };
      set('label-0', label(0));
      set('label-1', label(1));
    }

    function checkOver() {
      const res = cfg.over(state);
      if (!res) return false;
      finished = res;
      const w = res.winner;
      if (w === null || w === undefined) scores[2]++;
      else scores[w]++;
      renderScores();
      const mine = me();
      let text;
      let snd = 'win';
      if (w === null || w === undefined) {
        text = 'Ничья 🤝';
        snd = 'draw';
      } else if (mode === 'pvp') text = 'Победили ' + sideName(w).toLowerCase() + '! 🎉';
      else if (w === mine) text = 'Вы победили! 🎉';
      else {
        text = mode === 'ai' ? 'Компьютер победил 🤖' : 'Соперник победил';
        snd = 'lose';
      }
      if (mode !== 'pvp' && w === mine) SG.store.set(key('wins'), SG.store.get(key('wins'), 0) + 1);
      if (mode === 'net') net.result(w === null || w === undefined ? 'draw' : w === mine ? 'win' : 'lose');
      SG.sound.play(snd);
      if (statusEl) statusEl.textContent = (res.text ? res.text + ' ' : '') + text;
      if (cfg.onOver) cfg.onOver(state, res, view());
      return true;
    }

    function doMove(move, fromNet) {
      const side = state.turn;
      cfg.apply(state, move);
      history.push({ m: move, side });
      if (!fromNet && mode === 'net') net.send({ t: 'move', m: move, n: history.length - 1 });
      SG.sound.play(cfg.sound ? cfg.sound(state, move) : 'place');
      const done = checkOver();
      render();
      if (!done) maybeAi();
    }

    function maybeAi() {
      if (mode !== 'ai' || finished || state.turn === humanSide) return;
      thinking = true;
      render();
      const my = token;
      setTimeout(async () => {
        if (my !== token || mode !== 'ai') return;
        let m;
        try {
          m = await cfg.ai(state, level, state.turn);
        } catch (e) {
          m = undefined;
        }
        if (my !== token || mode !== 'ai') return;
        thinking = false;
        if (m === undefined || m === null) return render();
        doMove(m);
      }, cfg.aiDelay === undefined ? 350 : cfg.aiDelay);
    }

    // ход человека из интерфейса игры
    function play(move) {
      if (!isHumanTurn() || !cfg.legal(state, move)) return false;
      doMove(move);
      return true;
    }

    const newSeed = () => Math.floor(Math.random() * 2147483647) + 1;

    function newGame(side, sd) {
      token++;
      thinking = false;
      finished = null;
      history = [];
      seed = sd || newSeed();
      state = cfg.create(seed);
      if (mode === 'ai' && side !== undefined) humanSide = side;
      if (cfg.onNew) cfg.onNew(state);
      render();
      maybeAi();
    }

    function undo() {
      if (mode === 'net' || !history.length || thinking) return;
      token++;
      let n = history.length - 1;
      if (mode === 'ai') {
        // откатываем до последнего хода человека включительно
        while (n > 0 && history[n].side !== humanSide) n--;
        if (history[n].side !== humanSide) return;
      }
      if (finished) {
        const w = finished.winner;
        scores[w === null || w === undefined ? 2 : w]--;
        renderScores();
      }
      const keep = history.slice(0, n);
      state = cfg.create(seed);
      if (cfg.onNew) cfg.onNew(state);
      history = [];
      finished = null;
      keep.forEach((h) => {
        cfg.apply(state, h.m);
        history.push(h);
      });
      SG.sound.play('slide');
      render();
    }

    function resetScores() {
      scores[0] = scores[1] = scores[2] = 0;
      renderScores();
    }

    const syncDiff = () => diffEl && (diffEl.style.display = mode === 'ai' ? '' : 'none');

    // ---------- сеть ----------

    const net = SG.net
      ? SG.net.setup({
          game: cfg.game,
          modeEl: $('mode'),
          onRematch: () => $('new-btn') && $('new-btn').click(),
          onConnect(role) {
            mode = 'net';
            mySide = role === 'host' ? 0 : 1;
            net.info('вы играете: ' + sideName(mySide).toLowerCase());
            syncDiff();
            resetScores();
            if (role === 'host') {
              // первую партию начинает хозяин — с общим «зерном» раздачи
              const sd = newSeed();
              net.send({ t: 'new', side: 1, seed: sd });
              newGame(undefined, sd);
            } else newGame();
          },
          onMessage(msg) {
            if (msg.t === 'move') {
              if (finished || state.turn === mySide || msg.n !== history.length || !cfg.legal(state, msg.m)) return;
              doMove(msg.m, true);
            } else if (msg.t === 'new' && (msg.side === 0 || msg.side === 1)) {
              mySide = msg.side;
              net.info('вы играете: ' + sideName(mySide).toLowerCase());
              renderScores();
              newGame(undefined, msg.seed);
            }
          },
          onDisconnect(voluntary) {
            if (mode !== 'net') return;
            if (voluntary) {
              mode = modes.includes('pvp') ? 'pvp' : modes[0];
              modeSeg.set(mode);
              syncDiff();
              resetScores();
              newGame();
            } else render();
          },
        })
      : null;

    const modeSeg = $('mode')
      ? SG.segmented($('mode'), mode, (v) => {
          mode = v;
          SG.store.set(key('mode'), v);
          syncDiff();
          humanSide = 0;
          resetScores();
          newGame();
        })
      : { set() {} };

    if (diffEl) {
      SG.segmented(diffEl, level, (v) => {
        level = v;
        SG.store.set(key('diff'), v);
        resetScores();
        newGame();
      });
    }

    if ($('new-btn')) {
      $('new-btn').addEventListener('click', (e) => {
        e.currentTarget.blur();
        if (mode === 'net') {
          if (!net.active) return;
          mySide = 1 - mySide; // в новой партии меняемся сторонами
          const sd = newSeed();
          net.send({ t: 'new', side: 1 - mySide, seed: sd });
          net.info('вы играете: ' + sideName(mySide).toLowerCase());
          renderScores();
          newGame(undefined, sd);
        } else if (mode === 'ai') newGame(cfg.swapSides === false ? 0 : history.length ? 1 - humanSide : humanSide);
        else newGame();
      });
    }
    if (undoBtn) undoBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      undo();
    });

    syncDiff();
    renderScores();

    const api = {
      play,
      get state() {
        return state;
      },
      get mode() {
        return mode;
      },
      get level() {
        return level;
      },
      view,
      render,
      get history() {
        return history;
      },
      canMove: isHumanTurn,
      net,
      cfg,
    };
    window.__duel = api; // для автотестов
    // первую партию запускаем после того, как игра вернула объект (render может обращаться к нему)
    setTimeout(() => newGame(0), 0);
    return api;
  }

  // ---------- перебор с альфа-бета отсечением ----------
  // g: { moves(s), play(s, m) → новая позиция, evaluate(s) → оценка для того, чей ход в s,
  //      terminal(s) → оценка или null, order(s, moves) — необязательная сортировка }
  // Ходы, после которых очередь не меняется (дополнительный ход), учитываются.
  function search(root, g, opts) {
    const deadline = performance.now() + (opts.timeMs || 1000);
    const maxDepth = opts.depth || 4;
    let stop = false;
    let nodes = 0;
    function nega(s, depth, alpha, beta) {
      if ((++nodes & 1023) === 0 && performance.now() > deadline) stop = true;
      const t = g.terminal ? g.terminal(s, depth) : null;
      if (t !== null && t !== undefined) return t;
      if (depth <= 0 || stop) return g.evaluate(s);
      let moves = g.moves(s);
      if (!moves.length) return g.evaluate(s);
      if (g.order) moves = g.order(s, moves);
      let best = -Infinity;
      for (const m of moves) {
        const c = g.play(s, m);
        const v = c.turn === s.turn ? nega(c, depth - 1, alpha, beta) : -nega(c, depth - 1, -beta, -alpha);
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta || stop) break;
      }
      return best;
    }
    let rootMoves = g.moves(root);
    if (!rootMoves.length) return null;
    if (g.order) rootMoves = g.order(root, rootMoves);
    let bestMove = rootMoves[0];
    for (let d = 1; d <= maxDepth; d++) {
      let best = -Infinity;
      let cand = [];
      const scored = [];
      for (const m of rootMoves) {
        const c = g.play(root, m);
        const v = c.turn === root.turn ? nega(c, d - 1, -Infinity, Infinity) : -nega(c, d - 1, -Infinity, Infinity);
        if (stop) break;
        scored.push([v, m]);
        if (v > best + 1e-9) {
          best = v;
          cand = [m];
        } else if (Math.abs(v - best) < 1e-9) cand.push(m);
      }
      if (stop && d > 1) break;
      if (cand.length) bestMove = cand[Math.floor(Math.random() * cand.length)];
      // лучшие ходы первыми на следующей глубине
      scored.sort((a, b) => b[0] - a[0]);
      rootMoves = scored.map((x) => x[1]).concat(rootMoves.slice(scored.length));
      if (stop) break;
    }
    return bestMove;
  }

  // ---------- Монте-Карло (UCT) ----------
  // g: { moves(s), play(s, m) → новая позиция, winner(s) → 0 | 1 | null(ничья) | undefined(идёт),
  //      rollout(s) → победитель при случайном доигрывании (необязательно) }
  function mcts(root, g, opts) {
    const deadline = performance.now() + (opts.timeMs || 800);
    const maxIter = opts.iterations || 1e9;
    const mk = (s, parent, move) => ({ s, parent, move, kids: null, untried: null, n: 0, w: 0 });
    const top = mk(root, null, null);
    const rollout =
      g.rollout ||
      ((s) => {
        let x = s;
        for (let i = 0; i < 400; i++) {
          const w = g.winner(x);
          if (w !== undefined) return w;
          const ms = g.moves(x);
          if (!ms.length) return null;
          x = g.play(x, ms[Math.floor(Math.random() * ms.length)]);
        }
        return null;
      });
    let it = 0;
    while (it < maxIter && (it & 15 || performance.now() < deadline)) {
      it++;
      let node = top;
      // выбор
      while (node.untried && !node.untried.length && node.kids.length) {
        let best = null;
        let bv = -Infinity;
        const ln = Math.log(node.n);
        for (const k of node.kids) {
          const v = k.w / k.n + 1.2 * Math.sqrt(ln / k.n);
          if (v > bv) {
            bv = v;
            best = k;
          }
        }
        node = best;
      }
      // расширение
      if (!node.untried) {
        node.untried = g.winner(node.s) === undefined ? g.moves(node.s).slice() : [];
        node.kids = [];
      }
      if (node.untried.length) {
        const i = Math.floor(Math.random() * node.untried.length);
        const m = node.untried[i];
        node.untried[i] = node.untried[node.untried.length - 1];
        node.untried.pop();
        const kid = mk(g.play(node.s, m), node, m);
        node.kids.push(kid);
        node = kid;
      }
      // доигрывание
      const w = g.winner(node.s) !== undefined ? g.winner(node.s) : rollout(node.s);
      // обратное распространение: w — очки для того, кто сделал ход в узел
      while (node) {
        node.n++;
        if (node.parent) {
          const mover = node.parent.s.turn;
          node.w += w === null || w === undefined ? 0.5 : w === mover ? 1 : 0;
        }
        node = node.parent;
      }
    }
    if (!top.kids || !top.kids.length) {
      const ms = g.moves(root);
      return ms.length ? ms[Math.floor(Math.random() * ms.length)] : null;
    }
    let best = top.kids[0];
    for (const k of top.kids) if (k.n > best.n) best = k;
    duel.lastIterations = it;
    return best.move;
  }

  // воспроизводимый генератор случайных чисел (mulberry32): одинаковая раздача у обоих игроков
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const shuffleWith = (arr, rand) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  duel.rng = rng;
  duel.shuffleWith = shuffleWith;
  duel.search = search;
  duel.mcts = mcts;
  SG.duel = duel;
})();
