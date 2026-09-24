/* Длинные нарды: игрок (белые) против компьютера (чёрные) */
(() => {
  'use strict';

  // У каждого игрока свой путь из 24 пунктов: 0 — «голова», 18–23 — «дом».
  // Пункт доски для белых = индекс пути; для чёрных = (индекс + 12) % 24.
  const ME = 'me';
  const AI = 'ai';
  const STEP_MS = 420;
  const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const statusEl = $('status');
  const rollBtn = $('roll-btn');
  const undoBtn = $('undo-btn');
  const diceEl = $('dice');

  let S; // { me: {pos, off, turns}, ai: {...} }
  let turn, dice, seqs, done, turnStart, selectedFrom, over, busy;

  const opp = (who) => (who === ME ? AI : ME);
  const toBoard = (who, i) => (who === ME ? i : (i + 12) % 24);
  const toRoute = (who, b) => (who === ME ? b : (b + 12) % 24);

  const clone = (st) => ({
    me: { pos: st.me.pos.slice(), off: st.me.off, turns: st.me.turns },
    ai: { pos: st.ai.pos.slice(), off: st.ai.off, turns: st.ai.turns },
  });

  // ---------- правила ----------

  const allHome = (p) => p.pos.slice(0, 18).every((n) => !n);

  function blockadeOk(st, who) {
    // запрещён сплошной блок из 6 пунктов, если впереди него нет ни одной шашки соперника
    const p = st[who].pos;
    const o = st[opp(who)].pos;
    let run = 0;
    for (let i = 0; i < 24; i++) {
      run = p[i] ? run + 1 : 0;
      if (run >= 6) {
        const start = i - 5;
        const oppFirst = toRoute(opp(who), toBoard(who, start));
        const oppLast = oppFirst + 5;
        if (oppLast > 23) continue; // блок на стыке пути соперника — ему не мешает
        let ahead = false;
        for (let k = oppLast + 1; k < 24; k++) if (o[k]) ahead = true;
        if (!ahead) return false;
      }
    }
    return true;
  }

  function canMove(st, who, from, d, headUsed, headLimit) {
    const p = st[who];
    if (!p.pos[from]) return false;
    if (from === 0 && headUsed >= headLimit) return false;
    const to = from + d;
    if (to <= 23) {
      return !st[opp(who)].pos[toRoute(opp(who), toBoard(who, to))];
    }
    // выброс: все шашки в доме; с большим значением — только если дальше шашек нет
    if (!allHome(p)) return false;
    if (to === 24) return true;
    for (let k = 18; k < from; k++) if (p.pos[k]) return false;
    return true;
  }

  function applyMove(st, who, from, d) {
    const p = st[who];
    p.pos[from]--;
    const to = from + d;
    if (to <= 23) p.pos[to]++;
    else p.off++;
  }

  // Все допустимые последовательности ходов на бросок
  function sequences(st, who, roll, dedupe = false) {
    const diceList = roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]];
    const firstTurn = st[who].turns === 0;
    const headLimit = firstTurn && roll[0] === roll[1] && [3, 4, 6].includes(roll[0]) ? 2 : 1;
    const out = [];
    const seen = new Set();

    function dfs(cur, remaining, moves, headUsed) {
      let any = false;
      const tried = new Set();
      for (let k = 0; k < remaining.length; k++) {
        const d = remaining[k];
        if (tried.has(d)) continue;
        tried.add(d);
        for (let from = 0; from < 24; from++) {
          if (!canMove(cur, who, from, d, headUsed, headLimit)) continue;
          const next = clone(cur);
          applyMove(next, who, from, d);
          const rest = remaining.slice(0, k).concat(remaining.slice(k + 1));
          const key = dedupe && next[who].pos.join(',') + '|' + next[who].off + '|' + rest.join('') + '|' + (headUsed + (from === 0 ? 1 : 0));
          any = true;
          // для ИИ одинаковые позиции отсекаем; игроку оставляем все порядки ходов
          if (dedupe) {
            if (seen.has(key)) continue;
            seen.add(key);
          }
          dfs(next, rest, moves.concat([{ from, d }]), headUsed + (from === 0 ? 1 : 0));
        }
      }
      if (!any) out.push({ moves, state: cur });
    }
    dfs(st, diceList, [], 0);

    // блок из шести пунктов без шашек соперника впереди недопустим
    let legal = out.filter((s) => blockadeOk(s.state, who));
    if (!legal.length) legal = out.filter((s) => !s.moves.length);
    const maxLen = Math.max(0, ...legal.map((s) => s.moves.length));
    legal = legal.filter((s) => s.moves.length === maxLen);
    // если можно сыграть только одну кость — обязательно большую
    if (maxLen === 1 && roll[0] !== roll[1]) {
      const big = Math.max(...roll);
      if (legal.some((s) => s.moves[0].d === big)) legal = legal.filter((s) => s.moves[0].d === big);
    }
    return legal;
  }

  // ---------- ИИ ----------

  function evaluate(st, who) {
    const p = st[who];
    const o = st[opp(who)];
    let pip = 0;
    p.pos.forEach((n, i) => (pip += n * (24 - i)));
    let oppPip = 0;
    o.pos.forEach((n, i) => (oppPip += n * (24 - i)));
    // занятые пункты на пути соперника и длинные «заборы»
    let block = 0;
    let run = 0;
    let bestRun = 0;
    for (let i = 0; i < 24; i++) {
      if (p.pos[i]) {
        run++;
        const oi = toRoute(opp(who), toBoard(who, i));
        if (oi < 18 && o.pos.slice(0, oi).some((n) => n)) block++;
      } else run = 0;
      bestRun = Math.max(bestRun, run);
    }
    const stacks = p.pos.reduce((s, n, i) => s + (i > 0 && n > 3 ? n - 3 : 0), 0);
    return -pip + oppPip * 0.2 + p.off * 12 + block * 3 + bestRun * 4 - stacks * 2;
  }

  function aiPick(list) {
    let best = -Infinity;
    let pick = list[0];
    list.forEach((s) => {
      const v = evaluate(s.state, AI) + Math.random() * 0.5;
      if (v > best) {
        best = v;
        pick = s;
      }
    });
    return pick;
  }

  // ---------- ход партии ----------

  function roll() {
    return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  }

  function startTurn(who) {
    turn = who;
    selectedFrom = null;
    done = [];
    dice = null;
    seqs = null;
    render();
    if (who === ME) {
      statusEl.textContent = 'Ваш ход: бросьте кости.';
      rollBtn.disabled = false;
    } else {
      statusEl.textContent = 'Ходит компьютер…';
      rollBtn.disabled = true;
      busy = true;
      setTimeout(aiTurn, 600);
    }
  }

  function rollDice() {
    if (turn !== ME || dice || over) return;
    dice = roll();
    SG.sound.play('drop');
    turnStart = clone(S);
    seqs = sequences(S, ME, dice);
    rollBtn.disabled = true;
    if (!seqs.length || !seqs[0].moves.length) {
      statusEl.textContent = 'Выпало ' + dice.join(' и ') + ' — ходов нет, ход переходит компьютеру.';
      render();
      setTimeout(() => endTurn(ME), 1400);
      return;
    }
    statusEl.textContent = 'Выпало ' + dice.join(' и ') + '. Выберите шашку.';
    render();
  }

  function aiTurn() {
    dice = roll();
    SG.sound.play('drop');
    const list = sequences(S, AI, dice, true);
    render();
    if (!list.length || !list[0].moves.length) {
      statusEl.textContent = 'У компьютера ' + dice.join(' и ') + ' — ходов нет.';
      setTimeout(() => endTurn(AI), 1200);
      return;
    }
    const pick = aiPick(list);
    statusEl.textContent = 'Компьютер: ' + dice.join(' и ');
    let k = 0;
    const step = () => {
      const m = pick.moves[k];
      applyMove(S, AI, m.from, m.d);
      done.push(m.d);
      SG.sound.play('place', 3);
      render();
      k++;
      if (checkWin(AI)) return;
      if (k < pick.moves.length) setTimeout(step, STEP_MS);
      else setTimeout(() => endTurn(AI), STEP_MS + 150);
    };
    setTimeout(step, STEP_MS);
  }

  function endTurn(who) {
    S[who].turns++;
    busy = false;
    startTurn(opp(who));
  }

  // Шаги, которые сейчас можно сделать (с учётом уже сделанных в этом ходу)
  function availableMoves() {
    if (!seqs) return [];
    const k = done.length;
    const out = [];
    seqs.forEach((s) => {
      const m = s.moves[k];
      if (m && !out.some((x) => x.from === m.from && x.d === m.d)) out.push(m);
    });
    return out;
  }

  function playerMove(m) {
    applyMove(S, ME, m.from, m.d);
    done.push(m.d);
    const k = done.length - 1;
    seqs = seqs.filter((s) => s.moves[k] && s.moves[k].from === m.from && s.moves[k].d === m.d);
    selectedFrom = null;
    SG.sound.play(m.from + m.d > 23 ? 'coin' : 'place');
    render();
    if (checkWin(ME)) return;
    if (seqs.every((s) => s.moves.length === done.length)) {
      statusEl.textContent = 'Ход сделан.';
      setTimeout(() => endTurn(ME), 500);
    }
  }

  function onPoint(board) {
    if (turn !== ME || !dice || over) return;
    const moves = availableMoves();
    if (selectedFrom !== null) {
      const route = toRoute(ME, board);
      const m = moves.find((x) => x.from === selectedFrom && x.from + x.d === route);
      if (m) {
        playerMove(m);
        return;
      }
    }
    const from = toRoute(ME, board);
    selectedFrom = moves.some((x) => x.from === from) ? from : null;
    if (selectedFrom !== null) SG.sound.play('click');
    render();
  }

  function onOff() {
    if (turn !== ME || selectedFrom === null) return;
    const opts = availableMoves().filter((x) => x.from === selectedFrom && x.from + x.d > 23);
    if (!opts.length) return;
    // выбрасываем по возможности меньшим значением
    opts.sort((a, b) => a.d - b.d);
    playerMove(opts[0]);
  }

  function undoTurn() {
    if (turn !== ME || !turnStart || !done.length || over) return;
    S = clone(turnStart);
    done = [];
    seqs = sequences(S, ME, dice);
    selectedFrom = null;
    SG.sound.play('click');
    render();
  }

  function checkWin(who) {
    if (S[who].off < 15) return false;
    over = true;
    busy = true;
    const mars = S[opp(who)].off === 0;
    const pts = mars ? 2 : 1;
    const score = SG.store.get('nardy-score', { me: 0, ai: 0 });
    score[who] += pts;
    SG.store.set('nardy-score', score);
    if (who === ME) SG.store.set('nardy-wins', SG.store.get('nardy-wins', 0) + 1);
    SG.sound.play(who === ME ? 'win' : 'lose');
    statusEl.textContent =
      (who === ME ? 'Вы победили' : 'Компьютер победил') + (mars ? ' с марсом (2 очка)!' : '!') + (who === ME ? ' 🎉' : ' 🤖');
    render();
    return true;
  }

  // ---------- отрисовка ----------

  // Верхний ряд: пункты 12…23 слева направо; нижний: 11…0 слева направо
  const TOP = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const BOTTOM = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const pointEls = {};

  function buildBoard() {
    boardEl.innerHTML = '';
    [
      ['top', TOP],
      ['bottom', BOTTOM],
    ].forEach(([rowName, list]) => {
      list.forEach((b, k) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'nd-point ' + rowName + (k % 2 ? ' alt' : '') + (k === 6 ? ' after-bar' : '');
        el.style.gridRow = rowName === 'top' ? '1' : '3';
        el.style.gridColumn = String(k + 1 + (k >= 6 ? 1 : 0));
        el.addEventListener('click', () => onPoint(b));
        boardEl.appendChild(el);
        pointEls[b] = el;
      });
    });
    const bar = document.createElement('div');
    bar.className = 'nd-bar';
    boardEl.appendChild(bar);
  }

  function render() {
    const moves = turn === ME && dice ? availableMoves() : [];
    const froms = new Set(moves.map((m) => m.from));
    const targets = new Set(
      moves.filter((m) => m.from === selectedFrom && m.from + m.d <= 23).map((m) => toBoard(ME, m.from + m.d))
    );
    for (let b = 0; b < 24; b++) {
      const el = pointEls[b];
      const mine = S.me.pos[toRoute(ME, b)];
      const his = S.ai.pos[toRoute(AI, b)];
      const n = mine || his;
      const color = mine ? 'white' : 'black';
      const shown = Math.min(n, 5);
      let html = '';
      for (let k = 0; k < shown; k++) {
        const label = k === shown - 1 && n > 5 ? n : '';
        html += `<span class="nd-chk ${color}">${label}</span>`;
      }
      el.innerHTML = html;
      el.classList.toggle('from', froms.has(toRoute(ME, b)) && selectedFrom === null);
      el.classList.toggle('selected', selectedFrom !== null && toRoute(ME, b) === selectedFrom);
      el.classList.toggle('target', targets.has(b));
    }
    const offOk = moves.some((m) => m.from === selectedFrom && m.from + m.d > 23);
    $('off-me').textContent = S.me.off;
    $('off-ai').textContent = S.ai.off;
    $('off-tray').classList.toggle('target', offOk);

    if (dice) {
      const all = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
      const used = done.slice();
      diceEl.innerHTML = all
        .map((d) => {
          const k = used.indexOf(d);
          const isUsed = k >= 0;
          if (isUsed) used.splice(k, 1);
          return `<span class="nd-die ${turn === AI ? 'ai' : ''} ${isUsed ? 'used' : ''}">${DICE_FACES[d]}</span>`;
        })
        .join('');
    } else {
      diceEl.innerHTML = '';
    }
    undoBtn.disabled = turn !== ME || !done.length || over;
    const score = SG.store.get('nardy-score', { me: 0, ai: 0 });
    $('score-me').textContent = score.me;
    $('score-ai').textContent = score.ai;
  }

  function newGame() {
    S = {
      me: { pos: [15, ...Array(23).fill(0)], off: 0, turns: 0 },
      ai: { pos: [15, ...Array(23).fill(0)], off: 0, turns: 0 },
    };
    over = false;
    busy = false;
    dice = null;
    // кто ходит первым — решает бросок по одной кости
    let a;
    let b;
    do {
      a = 1 + Math.floor(Math.random() * 6);
      b = 1 + Math.floor(Math.random() * 6);
    } while (a === b);
    render();
    startTurn(a > b ? ME : AI);
    statusEl.textContent = 'Жребий: у вас ' + a + ', у компьютера ' + b + '. ' + (a > b ? 'Вы ходите первым — бросьте кости.' : 'Первым ходит компьютер…');
  }

  rollBtn.addEventListener('click', () => {
    rollBtn.blur();
    rollDice();
  });
  undoBtn.addEventListener('click', () => {
    undoBtn.blur();
    undoTurn();
  });
  $('off-tray').addEventListener('click', onOff);
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (busy && !over) return;
    newGame();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      rollDice();
    }
  });

  buildBoard();
  newGame();
})();
