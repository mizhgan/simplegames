/* Покер на костях (Yahtzee) */
(() => {
  'use strict';

  const CATS = [
    { name: 'Единицы', upper: 1 },
    { name: 'Двойки', upper: 2 },
    { name: 'Тройки', upper: 3 },
    { name: 'Четвёрки', upper: 4 },
    { name: 'Пятёрки', upper: 5 },
    { name: 'Шестёрки', upper: 6 },
    { name: 'Тройка', hint: 'сумма всех' },
    { name: 'Каре', hint: 'сумма всех' },
    { name: 'Фулл-хаус', hint: '25' },
    { name: 'Малый стрейт', hint: '30' },
    { name: 'Большой стрейт', hint: '40' },
    { name: 'Покер', hint: '50' },
    { name: 'Шанс', hint: 'сумма всех' },
  ];
  // средняя «цена» категории — ИИ старается не тратить категории ниже среднего
  const BASE = [2.4, 4.8, 7.2, 9.6, 12, 14.4, 15, 8, 14, 18, 12, 12, 22];
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  const $ = (id) => document.getElementById(id);
  const diceEl = $('dice');
  const rollBtn = $('roll-btn');
  const statusEl = $('status');
  const tableEl = $('scores');

  let mode = SG.store.get('yahtzee-mode', 'ai');
  let dice, held, rollsLeft, turn, sheets, over, busy, timer;
  let lastAi = -1;

  // ---------- подсчёт ----------

  const counts = (d) => {
    const c = [0, 0, 0, 0, 0, 0, 0];
    d.forEach((v) => c[v]++);
    return c;
  };
  const sum = (d) => d.reduce((a, b) => a + b, 0);

  function scoreFor(cat, d) {
    const c = counts(d);
    const max = Math.max(...c);
    const has = (arr) => arr.every((v) => c[v]);
    switch (cat) {
      case 6: return max >= 3 ? sum(d) : 0;
      case 7: return max >= 4 ? sum(d) : 0;
      case 8: return c.includes(3) && c.includes(2) ? 25 : 0;
      case 9: return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
      case 10: return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
      case 11: return max === 5 ? 50 : 0;
      case 12: return sum(d);
      default: return c[cat + 1] * (cat + 1);
    }
  }

  function totals(sheet) {
    let upper = 0;
    let lower = 0;
    sheet.forEach((v, i) => {
      if (v == null) return;
      if (i < 6) upper += v;
      else lower += v;
    });
    const bonus = upper >= 63 ? 35 : 0;
    return { upper, bonus, total: upper + bonus + lower };
  }

  // ---------- ИИ ----------

  function catValue(cat, d, sheet) {
    const s = scoreFor(cat, d);
    let v = s - BASE[cat];
    if (cat < 6) {
      const need = 3 * (cat + 1);
      if (s >= need && totals(sheet).upper < 63) v += 6;
    }
    return v;
  }

  function bestCat(d, sheet) {
    let best = -1;
    let bv = -Infinity;
    for (let k = 0; k < 13; k++) {
      if (sheet[k] != null) continue;
      const v = catValue(k, d, sheet);
      if (v > bv) {
        bv = v;
        best = k;
      }
    }
    return { cat: best, v: bv };
  }

  const rnd = () => 1 + Math.floor(Math.random() * 6);

  function chooseHold(d, left, sheet) {
    let best = null;
    let bestV = -Infinity;
    const TRIALS = 160;
    for (let mask = 0; mask < 32; mask++) {
      let acc = 0;
      for (let t = 0; t < TRIALS; t++) {
        let cur = d.map((v, i) => (mask & (1 << i) ? v : rnd()));
        if (left > 1) {
          // упрощённо: на второй переброс держим ещё и совпавшие с удержанными
          const keepFaces = new Set(d.filter((v, i) => mask & (1 << i)));
          const distinct = keepFaces.size === d.filter((v, i) => mask & (1 << i)).length;
          const seen = new Set();
          cur = cur.map((v, i) => {
            if (mask & (1 << i)) {
              seen.add(v);
              return v;
            }
            const keep = distinct && keepFaces.size >= 3 ? !keepFaces.has(v) && !seen.has(v) : keepFaces.has(v);
            if (keep) {
              seen.add(v);
              return v;
            }
            return rnd();
          });
        }
        acc += bestCat(cur, sheet).v;
      }
      const v = acc / TRIALS;
      if (v > bestV) {
        bestV = v;
        best = mask;
      }
    }
    // если лучше ничего не трогать и сразу записать — сравниваем с текущим
    const now = bestCat(d, sheet).v;
    if (now >= bestV) return 31;
    return best;
  }

  // ---------- ход игры ----------

  function roll() {
    if (over || rollsLeft === 0) return;
    dice = dice.map((v, i) => (held[i] && rollsLeft < 3 ? v : rnd()));
    rollsLeft--;
    if (mode === 'net' && turn === 0) net.send({ t: 'roll', dice, held });
    SG.sound.play('drop');
    render(true);
  }

  function humanRoll() {
    if (busy || turn !== 0 || (mode === 'net' && !net.active)) return;
    roll();
  }

  function toggleHold(i) {
    if (busy || turn !== 0 || over || rollsLeft === 3 || rollsLeft === 0) return;
    held[i] = !held[i];
    if (mode === 'net') net.send({ t: 'hold', held });
    SG.sound.play('click');
    render();
  }

  function record(cat) {
    const sheet = sheets[turn];
    if (sheet[cat] != null || rollsLeft === 3) return;
    if (mode === 'net' && turn === 0) net.send({ t: 'rec', cat });
    sheet[cat] = scoreFor(cat, dice);
    SG.sound.play(sheet[cat] ? (cat === 11 ? 'win' : 'coin') : 'error');
    nextTurn();
  }

  function nextTurn() {
    const done = (s) => s.every((v) => v != null);
    if (sheets.every(done)) return finish();
    if (mode === 'ai' || mode === 'net') turn = 1 - turn;
    rollsLeft = 3;
    held = [false, false, false, false, false];
    render();
    if (turn === 1 && mode === 'ai') aiTurn();
  }

  function aiTurn() {
    busy = true;
    const sheet = sheets[1];
    const step = () => {
      if (rollsLeft === 3) {
        roll();
        timer = setTimeout(step, 700);
        return;
      }
      if (rollsLeft > 0) {
        const mask = chooseHold(dice, rollsLeft, sheet);
        if (mask !== 31) {
          held = dice.map((v, i) => !!(mask & (1 << i)));
          render();
          timer = setTimeout(() => {
            roll();
            timer = setTimeout(step, 700);
          }, 550);
          return;
        }
      }
      const { cat } = bestCat(dice, sheet);
      busy = false;
      lastAi = cat;
      record(cat);
    };
    timer = setTimeout(step, 500);
  }


  function finish() {
    over = true;
    const me = totals(sheets[0]).total;
    if (me > SG.store.get('yahtzee-best', 0)) SG.store.set('yahtzee-best', me);
    if (mode === 'ai' || mode === 'net') {
      const ai = totals(sheets[1]).total;
      if (mode === 'net') net.result(me > ai ? 'win' : me < ai ? 'lose' : 'draw');
      if (me > ai) {
        statusEl.textContent = 'Победа ' + me + ':' + ai + '! 🎉';
        SG.store.set('yahtzee-wins', SG.store.get('yahtzee-wins', 0) + 1);
        SG.sound.play('win');
      } else if (me < ai) {
        statusEl.textContent = (mode === 'net' ? 'Соперник' : 'Компьютер') + ' выиграл ' + ai + ':' + me + '.';
        SG.sound.play('lose');
      } else {
        statusEl.textContent = 'Ничья — ' + me + ' очков.';
        SG.sound.play('draw');
      }
    } else {
      statusEl.textContent = 'Игра окончена: ' + me + ' очков.';
      SG.sound.play('win');
    }
    render();
  }

  // ---------- отрисовка ----------

  const dieHTML = (v) => Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[v].includes(k) ? 'on' : ''}"></i>`).join('');

  function render(rolled) {
    [...diceEl.children].forEach((el, i) => {
      el.innerHTML = dieHTML(dice[i]);
      el.classList.toggle('held', held[i] && rollsLeft < 3);
      el.classList.toggle('blank', rollsLeft === 3);
      if (rolled && !(held[i] && rollsLeft < 2)) {
        el.classList.remove('rolling');
        void el.offsetWidth;
        el.classList.add('rolling');
      }
      el.disabled = busy || turn !== 0 || over || rollsLeft === 3 || rollsLeft === 0;
    });
    rollBtn.disabled = busy || turn !== 0 || over || rollsLeft === 0;
    rollBtn.textContent = rollsLeft === 3 ? 'Бросить кости' : 'Перебросить (' + rollsLeft + ')';

    const cols = mode === 'ai' || mode === 'net' ? [0, 1] : [0];
    const t = sheets.map(totals);
    let h = '<thead><tr><th></th>' + cols.map((p) => `<th>${p === 0 ? 'Вы' : mode === 'net' ? 'Соперн.' : 'Комп.'}</th>`).join('') + '</tr></thead><tbody>';
    const row = (k) => {
      const c = CATS[k];
      let tr = `<tr><th>${c.name}${c.hint ? `<small>${c.hint}</small>` : ''}</th>`;
      cols.forEach((p) => {
        const v = sheets[p][k];
        if (v != null) tr += `<td class="${p === 1 && k === lastAi ? 'fresh' : ''}">${v}</td>`;
        else if (p === turn && rollsLeft < 3 && !busy && !over) {
          const s = scoreFor(k, dice);
          tr += `<td><button type="button" class="yz-pick ${s ? '' : 'zero'}" data-cat="${k}">${s}</button></td>`;
        } else tr += '<td></td>';
      });
      return tr + '</tr>';
    };
    for (let k = 0; k < 6; k++) h += row(k);
    h += '<tr class="sub"><th>Бонус<small>63+ → 35</small></th>' + cols.map((p) => `<td>${t[p].bonus || t[p].upper + '/63'}</td>`).join('') + '</tr>';
    for (let k = 6; k < 13; k++) h += row(k);
    h += '<tr class="total"><th>Итого</th>' + cols.map((p) => `<td>${t[p].total}</td>`).join('') + '</tr></tbody>';
    tableEl.innerHTML = h;

    const filled = sheets[0].filter((v) => v != null).length;
    $('round').textContent = Math.min(13, filled + (over ? 0 : 1)) + '/13';
    $('wins').textContent = SG.store.get('yahtzee-wins', 0);
    $('best').textContent = SG.store.get('yahtzee-best', 0);
    if (!over) {
      if (mode === 'net' && !net.active) statusEl.textContent = 'Нет соединения с соперником';
      else if (turn === 1) statusEl.textContent = mode === 'net' ? 'Ходит соперник…' : 'Ходит компьютер…';
      else if (rollsLeft === 3) statusEl.textContent = 'Бросайте кости.';
      else if (rollsLeft > 0) statusEl.textContent = 'Отметьте кости, которые оставить, и перебросьте остальные — или запишите результат.';
      else statusEl.textContent = 'Выберите, куда записать результат.';
    }
  }

  diceEl.addEventListener('click', (e) => {
    const b = e.target.closest('.yz-die');
    if (b) toggleHold(Number(b.dataset.i));
  });
  tableEl.addEventListener('click', (e) => {
    const b = e.target.closest('.yz-pick');
    if (b && turn === 0 && !busy) record(Number(b.dataset.cat));
  });
  rollBtn.addEventListener('click', () => {
    rollBtn.blur();
    humanRoll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (document.activeElement && document.activeElement.closest('button') && e.key === 'Enter') return;
      e.preventDefault();
      humanRoll();
    } else if (/^[1-5]$/.test(e.key)) toggleHold(Number(e.key) - 1);
  });

  function newGame(first) {
    clearTimeout(timer);
    dice = [1, 2, 3, 4, 5];
    held = [false, false, false, false, false];
    rollsLeft = 3;
    turn = first || 0;
    sheets = [new Array(13).fill(null), new Array(13).fill(null)];
    if (mode === 'solo') sheets[1] = sheets[1].map(() => 0);
    over = false;
    busy = false;
    lastAi = -1;
    render();
  }

  for (let i = 0; i < 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'yz-die';
    b.dataset.i = i;
    b.setAttribute('aria-label', 'Кость ' + (i + 1));
    diceEl.appendChild(b);
  }

  // ---------- игра по сети: бросает тот, чей ход, и присылает результат ----------

  let netFirst = 0; // кто начинал прошлую партию (0 — мы)
  const net = SG.net.setup({
    game: 'yahtzee',
    modeEl: $('mode'),
    onRematch: () => $('new-btn').click(),
    onConnect(role) {
      mode = 'net';
      net.info('по очереди, у каждого своя таблица');
      netFirst = role === 'host' ? 0 : 1;
      newGame(netFirst);
    },
    onMessage(msg) {
      if (msg.t === 'new') {
        netFirst = msg.first === 'you' ? 0 : 1;
        newGame(netFirst);
      } else if (turn !== 1 || over) return;
      else if (msg.t === 'roll' && Array.isArray(msg.dice) && msg.dice.length === 5 && rollsLeft > 0) {
        dice = msg.dice.map((v) => Math.min(6, Math.max(1, v | 0)));
        held = (msg.held || []).map(Boolean).slice(0, 5);
        rollsLeft--;
        SG.sound.play('drop');
        render(true);
      } else if (msg.t === 'hold' && Array.isArray(msg.held)) {
        held = msg.held.map(Boolean).slice(0, 5);
        render();
      } else if (msg.t === 'rec' && Number.isInteger(msg.cat) && msg.cat >= 0 && msg.cat < 13) record(msg.cat);
    },
    onDisconnect(voluntary) {
      if (mode !== 'net') return;
      if (voluntary) {
        mode = 'ai';
        modeSeg.set('ai');
        newGame();
      } else render();
    },
  });

  const modeSeg = SG.segmented($('mode'), mode, (v) => {
    mode = v;
    SG.store.set('yahtzee-mode', v);
    newGame();
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (mode === 'net') {
      if (!net.active) return;
      // в новой партии начинает другой
      netFirst = 1 - netFirst;
      net.send({ t: 'new', first: netFirst === 0 ? 'me' : 'you' });
      newGame(netFirst);
    } else newGame();
  });

  newGame();
})();
