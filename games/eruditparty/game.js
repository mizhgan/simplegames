/* Эрудит на компанию: скрэббл на 2–4 игроков */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const TURN_TIME = 120;

  const N = 15;
  const CENTER = 7 * N + 7;
  const RACK = 7;
  const BINGO = 15; // за все 7 фишек за ход
  // буква: [количество, очки]
  const TILES = {
    а: [10, 1], б: [3, 3], в: [5, 2], г: [3, 3], д: [5, 2], е: [9, 1], ж: [2, 5], з: [2, 5], и: [8, 1], й: [4, 2], к: [6, 2],
    л: [4, 2], м: [5, 2], н: [8, 1], о: [10, 1], п: [6, 2], р: [6, 2], с: [6, 2], т: [5, 2], у: [3, 3], ф: [1, 10], х: [2, 5],
    ц: [1, 10], ч: [2, 5], ш: [1, 10], щ: [1, 10], ъ: [1, 10], ы: [2, 5], ь: [2, 5], э: [1, 10], ю: [1, 10], я: [3, 3],
  };
  const VAL = (ch) => TILES[ch][1];

  // премиальные клетки: W3/W2 — слово ×3/×2, L3/L2 — буква ×3/×2
  const BONUS = new Array(N * N).fill('');
  const put = (kind, list) => list.forEach(([r, c]) => (BONUS[r * N + c] = kind));
  put('W3', [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]]);
  put('W2', [[1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10], [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10], [7, 7]]);
  put('L3', [[1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13], [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]]);
  put('L2', [[0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11], [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11]]);
  const BONUS_TEXT = { W3: 'СЛОВО ×3', W2: 'СЛОВО ×2', L3: 'БУКВА ×3', L2: 'БУКВА ×2' };

  // ---------- словарь ----------
  const DICT = new Set(['ад', 'ар', 'ас', 'до', 'еж', 'ил', 'ля', 'ми', 'ом', 'ре', 'си', 'ус', 'уж', 'ум', 'фа', 'юг', 'яд', 'як', 'ют', 'ор']);
  (() => {
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
    let prev = '';
    window.BALDA_DICT_PACKED.split(' ').forEach((token) => {
      const w = prev.slice(0, digits.indexOf(token[0])) + token.slice(1);
      DICT.add(w);
      prev = w;
    });
  })();
  const AI_WORDS = window.BALDA_AI.concat([...DICT].filter((w) => w.length === 2)).filter((w) => /^[а-я]+$/.test(w) && w.length <= N);

  // ---------- правила ----------

  function rand() {
    return Math.random();
  }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // места по порядку: racks, scores — массивы по номеру места
  function create(players) {
    const bag = [];
    for (const ch in TILES) for (let k = 0; k < TILES[ch][0]; k++) bag.push(ch);
    const s = { ids: players.map((p) => p.id), names: players.map((p) => p.name), board: new Array(N * N).fill(''), bag, racks: players.map(() => []), scores: players.map(() => 0), turn: 0, passes: 0, log: [], over: false, now: Date.now() };
    shuffle(s, s.bag);
    s.ids.forEach((_, k) => draw(s, k));
    s.turn = Math.floor(Math.random() * s.ids.length);
    s.deadline = s.now + TURN_TIME * 1000;
    return s;
  }

  function draw(s, side) {
    while (s.racks[side].length < RACK && s.bag.length) s.racks[side].push(s.bag.pop());
  }

  const rcOf = (i) => [Math.floor(i / N), i % N];

  // читает слово через клетку i в направлении d (1 — вправо, N — вниз) с учётом новых фишек
  function wordAt(board, extra, i, d) {
    const get = (x) => extra.get(x) || board[x];
    const [r, c] = rcOf(i);
    const inLine = (x) => (d === 1 ? Math.floor(x / N) === r : x % N === c) && x >= 0 && x < N * N;
    let start = i;
    while (inLine(start - d) && get(start - d)) start -= d;
    const cells = [];
    for (let x = start; inLine(x) && get(x); x += d) cells.push(x);
    return { cells, word: cells.map(get).join('') };
  }

  // проверка и подсчёт хода; tiles — [[клетка, буква], …]
  function evaluate(s, tiles) {
    if (!tiles.length) return { error: 'Выложите фишки на поле' };
    const extra = new Map();
    for (const [i, ch] of tiles) {
      if (!Number.isInteger(i) || i < 0 || i >= N * N || s.board[i] || extra.has(i) || !TILES[ch]) return { error: 'Так ходить нельзя' };
      extra.set(i, ch);
    }
    const rows = new Set(tiles.map(([i]) => Math.floor(i / N)));
    const cols = new Set(tiles.map(([i]) => i % N));
    if (rows.size > 1 && cols.size > 1) return { error: 'Фишки должны стоять в одну линию' };
    const empty = s.board.every((x) => !x);
    let dir = rows.size === 1 && cols.size > 1 ? 1 : cols.size === 1 && rows.size > 1 ? N : 0;
    if (!dir) {
      // одна фишка: направление, в котором получается слово длиннее
      const h = wordAt(s.board, extra, tiles[0][0], 1);
      const v = wordAt(s.board, extra, tiles[0][0], N);
      dir = h.cells.length >= v.cells.length ? 1 : N;
    }
    const main = wordAt(s.board, extra, tiles[0][0], dir);
    // все новые фишки должны войти в одно слово без пропусков
    for (const [i] of tiles) if (!main.cells.includes(i)) return { error: 'Между фишками не должно быть пустых клеток' };
    if (main.cells.length < 2) return { error: 'Слово должно быть не короче двух букв' };
    const words = [main];
    for (const [i] of tiles) {
      const cross = wordAt(s.board, extra, i, dir === 1 ? N : 1);
      if (cross.cells.length > 1) words.push(cross);
    }
    if (empty) {
      if (!extra.has(CENTER)) return { error: 'Первое слово должно пройти через центральную звезду' };
    } else if (words.length === 1 && main.cells.every((x) => extra.has(x))) return { error: 'Слово должно касаться уже выложенных фишек' };
    const bad = words.filter((w) => !DICT.has(w.word));
    if (bad.length) return { error: 'Нет в словаре: ' + bad.map((w) => w.word.toUpperCase()).join(', '), words };
    let total = 0;
    for (const w of words) {
      let sum = 0;
      let mul = 1;
      for (const x of w.cells) {
        let v = VAL(extra.get(x) || s.board[x]);
        if (extra.has(x)) {
          if (BONUS[x] === 'L2') v *= 2;
          if (BONUS[x] === 'L3') v *= 3;
          if (BONUS[x] === 'W2') mul *= 2;
          if (BONUS[x] === 'W3') mul *= 3;
        }
        sum += v;
      }
      w.score = sum * mul;
      total += w.score;
    }
    if (tiles.length === RACK) total += BINGO;
    return { score: total, words };
  }

  function hasTiles(rack, letters) {
    const r = rack.slice();
    for (const ch of letters) {
      const k = r.indexOf(ch);
      if (k < 0) return false;
      r.splice(k, 1);
    }
    return true;
  }

  const rackValue = (rack) => rack.reduce((a, ch) => a + VAL(ch), 0);
  const seat = (s, id) => s.ids.indexOf(id);

  function act(s, id, m, now) {
    if (!m || s.over) return false;
    const me = seat(s, id);
    if (me !== s.turn) return false;
    const rack = s.racks[me];
    s.lastTiles = [];
    if (m.pass) {
      s.passes++;
      s.log.unshift({ side: me, text: 'пас' });
    } else if (Array.isArray(m.swap)) {
      if (!m.swap.length || s.bag.length < RACK || !hasTiles(rack, m.swap)) return false;
      for (const ch of m.swap) rack.splice(rack.indexOf(ch), 1);
      s.bag.push(...m.swap);
      shuffle(s, s.bag);
      draw(s, me);
      s.passes++;
      s.log.unshift({ side: me, text: 'обмен ' + m.swap.length + ' фишек' });
    } else if (Array.isArray(m.tiles)) {
      if (!hasTiles(rack, m.tiles.map((t) => t[1]))) return false;
      const res = evaluate(s, m.tiles);
      if (res.error) return false;
      for (const [i, ch] of m.tiles) {
        s.board[i] = ch;
        rack.splice(rack.indexOf(ch), 1);
      }
      s.scores[me] += res.score;
      s.lastTiles = m.tiles.map((t) => t[0]);
      s.passes = 0;
      s.log.unshift({ side: me, text: res.words.map((w) => w.word.toUpperCase()).join(', ') + ' +' + res.score });
      draw(s, me);
      if (!rack.length && !s.bag.length) {
        // закончил первым — забирает очки за фишки соперников
        s.ids.forEach((_, k) => {
          if (k === me) return;
          const left = rackValue(s.racks[k]);
          s.scores[me] += left;
          s.scores[k] -= left;
        });
        return finish(s);
      }
    } else return false;
    if (s.log.length > 12) s.log.length = 12;
    if (s.passes >= s.ids.length * 2) {
      s.ids.forEach((_, k) => (s.scores[k] -= rackValue(s.racks[k])));
      return finish(s);
    }
    s.turn = (s.turn + 1) % s.ids.length;
    s.deadline = now + TURN_TIME * 1000;
    return true;
  }

  function finish(s) {
    s.over = true;
    const best = Math.max(...s.scores);
    s.winners = s.ids.filter((_, k) => s.scores[k] === best);
    return true;
  }

  function tick(s, now) {
    s.now = now;
    if (s.over || now < s.deadline) return false;
    return act(s, s.ids[s.turn], { pass: 1 }, now);
  }

  function leave(s, id) {
    // ушедший игрок пасует, пока не вернётся
    void s;
    void id;
  }

  // ---------- компьютер ----------

  function findMoves(s, words) {
    const me = s.turn;
    const rack = s.racks[me];
    const have = {};
    rack.forEach((ch) => (have[ch] = (have[ch] || 0) + 1));
    const empty = s.board.every((x) => !x);
    const out = [];
    const seen = new Set();
    for (const dir of [1, N]) {
      for (let line = 0; line < N; line++) {
        const cellAt = (k) => (dir === 1 ? line * N + k : k * N + line);
        const L = [];
        let lineHas = false;
        for (let k = 0; k < N; k++) {
          L.push(s.board[cellAt(k)]);
          if (L[k]) lineHas = true;
        }
        // рядом ли с линией есть фишки (иначе ход по ней может быть только первым)
        let near = lineHas;
        if (!near) {
          for (let k = 0; k < N && !near; k++) {
            for (const d of [-1, 1]) {
              const l2 = line + d;
              if (l2 < 0 || l2 >= N) continue;
              if (s.board[dir === 1 ? l2 * N + k : k * N + l2]) near = true;
            }
          }
        }
        if (!near && !(empty && line === 7)) continue;
        for (const w of words) {
          const len = w.length;
          for (let st = 0; st + len <= N; st++) {
            if (st > 0 && L[st - 1]) continue;
            if (st + len < N && L[st + len]) continue;
            const need = {};
            let ok = true;
            let placed = 0;
            let old = 0;
            for (let k = 0; k < len; k++) {
              const ch = w[k];
              const cur = L[st + k];
              if (cur) {
                if (cur !== ch) {
                  ok = false;
                  break;
                }
                old++;
              } else {
                need[ch] = (need[ch] || 0) + 1;
                if (need[ch] > (have[ch] || 0)) {
                  ok = false;
                  break;
                }
                placed++;
              }
            }
            if (!ok || !placed) continue;
            const tiles = [];
            for (let k = 0; k < len; k++) if (!L[st + k]) tiles.push([cellAt(st + k), w[k]]);
            const key = tiles.map((t) => t.join(':')).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            const res = evaluate(s, tiles);
            if (!res.error) out.push({ tiles, score: res.score });
          }
        }
      }
    }
    return out;
  }

  function aiMove(s, level) {
    const words = level === 'easy' ? AI_WORDS.filter((w) => w.length <= 6) : AI_WORDS;
    const found = findMoves(s, words);
    if (!found.length) {
      if (s.bag.length >= RACK) {
        // меняем «неудобные» дорогие буквы
        const swap = s.racks[s.turn].filter((ch) => VAL(ch) >= 5 || ch === 'ъ' || ch === 'ь' || ch === 'ы');
        return { swap: swap.length ? swap : s.racks[s.turn].slice(0, 3) };
      }
      return { pass: 1 };
    }
    found.sort((a, b) => b.score - a.score);
    let pick;
    if (level === 'hard') pick = found[0];
    else if (level === 'normal') pick = found[Math.floor(Math.random() * Math.min(4, found.length))];
    else pick = found[Math.floor(found.length * (0.4 + Math.random() * 0.6))] || found[found.length - 1];
    return { tiles: pick.tiles };
  }


  function ai(s, id, level) {
    if (s.over || s.ids[s.turn] !== id) return null;
    return aiMove(s, level);
  }

  // ---------- вид ----------

  function view(s, id) {
    const me = seat(s, id);
    return {
      board: s.board,
      last: s.lastTiles || [],
      rack: me >= 0 ? s.racks[me] : null,
      myTurn: me === s.turn && !s.over,
      players: s.ids.map((pid, k) => ({ id: pid, name: s.names[k], score: s.scores[k], n: s.racks[k].length, turn: k === s.turn && !s.over })),
      bag: s.bag.length,
      log: s.log.map((x) => ({ name: s.names[x.side], text: x.text })),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.over,
      winners: s.winners || null,
    };
  }

  // ---------- отрисовка ----------

  let pending = new Map(); // клетка → индекс фишки
  let selected = -1;
  let swapMode = false;
  let swapSel = new Set();
  let lastTurnKey = '';
  let V = null;
  let UI = null;

  function reset() {
    pending = new Map();
    selected = -1;
    swapMode = false;
    swapSel = new Set();
  }

  function render(v, ui) {
    V = v;
    UI = ui;
    const key = v.players.map((p) => p.turn).join() + v.log.length + (v.log[0] ? v.log[0].text : '');
    if (key !== lastTurnKey) {
      lastTurnKey = key;
      reset();
      if (v.myTurn) SG.sound.play('hint');
    }
    draw2();
  }

  function draw2() {
    const v = V;
    const ui = UI;
    const el = ui.el;
    const rack = v.rack || [];
    const draft = new Map([...pending].map(([c, k]) => [c, rack[k]]));
    let cellsHtml = '';
    for (let i = 0; i < N * N; i++) {
      const ch = v.board[i] || draft.get(i);
      let cls = 'er-cell';
      let inner = '';
      if (ch) {
        cls += ' tile' + (draft.has(i) ? ' draft' : '') + (v.last.includes(i) ? ' last' : '');
        inner = `${ch.toUpperCase()}<small>${VAL(ch)}</small>`;
      } else {
        if (BONUS[i]) cls += ' b-' + BONUS[i];
        inner = i === CENTER ? '★' : BONUS[i] ? `<span>${BONUS_TEXT[BONUS[i]]}</span>` : '';
      }
      cellsHtml += `<button type="button" class="${cls}" data-cell="${i}">${inner}</button>`;
    }
    const inDraft = new Set(pending.values());
    const rackHtml = rack.map((ch, k) => `<button type="button" class="er-tile${k === selected ? ' sel' : ''}${inDraft.has(k) ? ' used' : ''}${swapSel.has(k) ? ' swap' : ''}" data-k="${k}" ${v.myTurn ? '' : 'disabled'}>${ch.toUpperCase()}<small>${VAL(ch)}</small></button>`).join('');
    let preview = '';
    let pcls = '';
    if (swapMode) preview = 'Обмен: выбрано ' + swapSel.size;
    else if (draft.size && v.myTurn) {
      const res = evaluate({ board: v.board }, [...draft]);
      preview = res.error ? res.error : res.words.map((w) => w.word.toUpperCase()).join(', ') + ' — ' + res.score + ' оч.';
      pcls = res.error ? 'bad' : 'ok';
    }
    const seats = v.players.map((p) => `<div class="pt-seat${p.turn ? ' turn' : ''}${p.id === ui.me ? ' me' : ''}"><b>${esc(p.name)}</b><span>${p.score} оч.</span></div>`).join('');
    let status;
    if (v.over) status = (v.winners || []).includes(ui.me) ? 'Вы победили! 🏆' : 'Победа: ' + (v.winners || []).map((x) => esc(ui.name(x))).join(', ');
    else status = (v.myTurn ? 'Ваш ход: выберите фишку, затем клетку' : 'Ходит ' + esc(v.players.find((p) => p.turn).name)) + ` <span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    el.innerHTML =
      `<div class="pt-panel ep"><div class="pt-seats">${seats}</div><p class="ep-status">${status} · в мешке ${v.bag}</p>` +
      `<div class="er-board">${cellsHtml}</div>` +
      (v.rack ? `<div class="er-rack">${rackHtml}</div><p class="er-preview ${pcls}">${preview}</p>` : '') +
      (v.myTurn ? `<div class="er-actions"><button class="btn btn-primary" type="button" data-play ${swapMode ? (swapSel.size ? '' : 'disabled') : pending.size ? '' : 'disabled'}>${swapMode ? 'Обменять' : 'Сделать ход'}</button><button class="btn btn-ghost" type="button" data-recall>Вернуть</button><button class="btn btn-ghost ${swapMode ? 'active' : ''}" type="button" data-swap ${v.bag >= RACK ? '' : 'disabled'}>Обмен</button><button class="btn btn-ghost" type="button" data-pass>Пас</button></div>` : '') +
      `<ol class="er-log">${v.log.map((x) => `<li><b>${esc(x.name)}:</b> ${esc(x.text)}</li>`).join('')}</ol></div>`;
    el.querySelectorAll('[data-cell]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.dataset.cell;
        if (!v.myTurn || swapMode) return;
        if (pending.has(i)) pending.delete(i);
        else if (!v.board[i] && selected >= 0) {
          pending.set(i, selected);
          selected = -1;
          SG.sound.play('place');
        }
        draw2();
      })
    );
    el.querySelectorAll('[data-k]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = +b.dataset.k;
        if (swapMode) {
          if (swapSel.has(k)) swapSel.delete(k);
          else swapSel.add(k);
        } else if ([...pending.values()].includes(k)) {
          for (const [c, kk] of pending) if (kk === k) pending.delete(c);
        } else selected = selected === k ? -1 : k;
        draw2();
      })
    );
    const on = (sel, fn) => {
      const b = el.querySelector(sel);
      if (b) b.addEventListener('click', fn);
    };
    on('[data-play]', () => {
      if (swapMode) {
        const letters = [...swapSel].map((k) => rack[k]);
        reset();
        return ui.send({ swap: letters });
      }
      const tiles = [...pending].map(([c, k]) => [c, rack[k]]);
      const res = evaluate({ board: v.board }, tiles);
      if (res.error) {
        SG.sound.play('error');
        return;
      }
      reset();
      ui.send({ tiles });
    });
    on('[data-recall]', () => {
      reset();
      draw2();
    });
    on('[data-swap]', () => {
      const was = swapMode;
      reset();
      swapMode = !was;
      draw2();
    });
    on('[data-pass]', () => {
      reset();
      ui.send({ pass: 1 });
    });
    if (v.over && !render.done) {
      render.done = true;
      const won = (v.winners || []).includes(ui.me);
      SG.sound.play(won ? 'win' : 'lose');
      if (won) SG.store.set('eruditparty-wins', SG.store.get('eruditparty-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({ game: 'eruditparty', min: 2, max: 4, bots: true, soloBots: 2, aiForGone: true, botDelay: () => 1500 + Math.random() * 1500, create, view, act, tick, ai, leave, render });
})();
