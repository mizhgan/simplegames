/* Магнат: кубики, улицы, аренда и дома — разорите соперников */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const START = 1500;
  const PASS_GO = 200;
  const TURN_TIME = 40;
  const GROUPS = ['#8b5a2b', '#38bdf8', '#ec4899', '#f97316', '#ef4444', '#16a34a'];
  // поле из 28 клеток: t — тип, g — группа улиц, p — цена
  const B = [
    { t: 'go', n: 'Старт' },
    { t: 'st', n: 'Садовая', g: 0, p: 60 }, { t: 'st', n: 'Лесная', g: 0, p: 70 }, { t: 'ch', n: 'Шанс' }, { t: 'st', n: 'Речная', g: 0, p: 80 },
    { t: 'tr', n: 'Вокзал', p: 200 }, { t: 'st', n: 'Школьная', g: 1, p: 100 },
    { t: 'jail', n: 'Тюрьма' },
    { t: 'st', n: 'Парковая', g: 1, p: 110 }, { t: 'st', n: 'Озёрная', g: 1, p: 120 }, { t: 'tax', n: 'Налог', p: 100 }, { t: 'st', n: 'Театральная', g: 2, p: 140 },
    { t: 'st', n: 'Музейная', g: 2, p: 150 }, { t: 'st', n: 'Цветочная', g: 2, p: 160 },
    { t: 'park', n: 'Стоянка' },
    { t: 'st', n: 'Морская', g: 3, p: 180 }, { t: 'ch', n: 'Шанс' }, { t: 'st', n: 'Портовая', g: 3, p: 190 }, { t: 'st', n: 'Маячная', g: 3, p: 200 },
    { t: 'tr', n: 'Аэропорт', p: 200 }, { t: 'st', n: 'Невский', g: 4, p: 220 },
    { t: 'gojail', n: 'В тюрьму' },
    { t: 'st', n: 'Тверская', g: 4, p: 240 }, { t: 'st', n: 'Арбат', g: 4, p: 250 }, { t: 'tax', n: 'Роскошь', p: 150 }, { t: 'st', n: 'Рублёвка', g: 5, p: 300 },
    { t: 'st', n: 'Остоженка', g: 5, p: 320 }, { t: 'st', n: 'Кремлёвская', g: 5, p: 350 },
  ];
  const N = B.length;
  const JAIL = B.findIndex((c) => c.t === 'jail');
  const houseCost = (c) => 50 * (1 + Math.floor(c.g / 2));
  const MAXH = 4;
  const CHANCE = [
    ['Премия за победу в конкурсе красоты', 100], ['Банк ошибся в вашу пользу', 150], ['Штраф за превышение скорости', -50],
    ['Оплата лечения у стоматолога', -100], ['Наследство от тётушки', 200], ['Налог на лужайку', -80], ['Идите на Старт', 'go'],
    ['Отправляйтесь в тюрьму', 'jail'], ['Вернитесь на 3 клетки назад', 'back'], ['Дивиденды по акциям', 50], ['День рождения: каждый дарит вам 30', 'gift'],
  ];

  // ---------- правила ----------

  function create(players, opts) {
    const s = { ids: players.map((p) => p.id), names: {}, money: {}, pos: {}, jail: {}, out: [], own: {}, houses: {}, turn: 0, phase: 'roll', dice: [0, 0], doubles: 0, log: [], now: Date.now(), round: 1, limit: (opts && +opts.rounds) || 0, winner: null, color: {} };
    players.forEach((p, i) => {
      s.names[p.id] = p.name;
      s.money[p.id] = START;
      s.pos[p.id] = 0;
      s.jail[p.id] = 0;
      s.color[p.id] = 'var(--p' + ((i % 8) + 1) + ')'; // как аватарки в лобби и ленте
    });
    s.deadline = s.now + TURN_TIME * 1000;
    say(s, 'Первым бросает ' + s.names[s.ids[0]] + '.', { w: s.ids[0], i: '🎲' });
    return s;
  }

  const say = (s, t, o) => {
    SG.party.log(s, t, o);
  };
  const cur = (s) => s.ids[s.turn];
  const alive = (s) => s.ids.filter((id) => !s.out.includes(id));
  const groupCells = (g) => B.map((c, i) => [c, i]).filter(([c]) => c.g === g).map(([, i]) => i);
  const hasGroup = (s, id, g) => groupCells(g).every((i) => s.own[i] === id);

  function rent(s, i, dice) {
    const c = B[i];
    const o = s.own[i];
    if (c.t === 'tr') {
      const n = B.filter((x, k) => x.t === 'tr' && s.own[k] === o).length;
      return n === 2 ? 150 : 50;
    }
    const h = s.houses[i] || 0;
    if (h) return Math.round(c.p * [0, 0.5, 1.5, 3, 4.5][h]);
    return Math.round(c.p * 0.1) * (hasGroup(s, o, c.g) ? 2 : 1);
  }

  function worth(s, id) {
    let w = s.money[id];
    Object.entries(s.own).forEach(([i, o]) => {
      if (o !== id) return;
      w += B[i].p + (s.houses[i] || 0) * (B[i].g !== undefined ? houseCost(B[i]) : 0);
    });
    return w;
  }

  // платёж; если денег не хватает — продаём дома, потом банкротство
  function pay(s, id, amount, to) {
    s.money[id] -= amount;
    if (s.money[id] < 0) {
      Object.keys(s.houses).forEach((i) => {
        while (s.money[id] < 0 && s.own[i] === id && s.houses[i] > 0) {
          s.houses[i]--;
          s.money[id] += houseCost(B[i]) / 2;
        }
      });
    }
    let paid = amount;
    if (s.money[id] < 0) {
      paid = amount + s.money[id];
      bankrupt(s, id);
    }
    if (to !== undefined && to !== null) s.money[to] += paid;
  }

  function bankrupt(s, id) {
    s.money[id] = 0;
    s.out.push(id);
    Object.keys(s.own).forEach((i) => {
      if (s.own[i] === id) {
        delete s.own[i];
        delete s.houses[i];
      }
    });
    say(s, s.names[id] + ' — банкрот!', { w: id, i: '💸', k: 'bad', big: true });
    if (alive(s).length <= 1) finish(s);
  }

  function finish(s) {
    s.phase = 'end';
    const a = alive(s);
    const best = Math.max(...a.map((id) => worth(s, id)));
    s.winner = a.find((id) => worth(s, id) === best);
    say(s, s.names[s.winner] + ' — магнат!', { w: s.winner, i: '🏆', k: 'good', big: true });
  }

  function moveTo(s, id, to, passGo) {
    if (passGo && to < s.pos[id]) {
      s.money[id] += PASS_GO;
      say(s, s.names[id] + ' проходит Старт: +' + PASS_GO, { w: id, i: '🏁', k: 'good' });
    }
    track(s, id, to, passGo);
    s.pos[id] = to;
    land(s, id);
  }

  function land(s, id) {
    const i = s.pos[id];
    const c = B[i];
    const name = s.names[id];
    s.offer = null;
    if (c.t === 'st' || c.t === 'tr') {
      const o = s.own[i];
      if (o === undefined) s.offer = i;
      else if (o !== id) {
        const r = rent(s, i, s.dice);
        say(s, name + ' платит ' + s.names[o] + ' аренду ' + r + ' (' + c.n + ')', { w: id, i: '💰', k: 'bad', big: r >= 100 });
        pay(s, id, r, o);
      }
    } else if (c.t === 'tax') {
      say(s, name + ': ' + c.n.toLowerCase() + ' −' + c.p, { w: id, i: '🧾', k: 'bad' });
      pay(s, id, c.p);
    } else if (c.t === 'gojail') toJail(s, id);
    else if (c.t === 'ch') {
      const [text, v] = CHANCE[Math.floor(Math.random() * CHANCE.length)];
      const card = name + ' тянет «Шанс»: ' + text.toLowerCase();
      if (typeof v === 'number') {
        say(s, card + (v > 0 ? ' +' + v : ' −' + -v), { w: id, i: '❓', k: v > 0 ? 'good' : 'bad', big: true });
        if (v > 0) s.money[id] += v;
        else pay(s, id, -v);
      } else if (v === 'go') {
        say(s, card, { w: id, i: '❓', big: true });
        moveTo(s, id, 0, true);
      } else if (v === 'jail') {
        say(s, card, { w: id, i: '❓', k: 'bad', big: true });
        toJail(s, id);
      } else if (v === 'back') {
        const to = (s.pos[id] + N - 3) % N;
        say(s, card + ' → ' + B[to].n, { w: id, i: '❓', big: true });
        moveTo(s, id, to, false);
      } else if (v === 'gift') {
        const from = alive(s).filter((x) => x !== id && !s.out.includes(x));
        const before = s.money[id];
        from.forEach((x) => pay(s, x, 30, id));
        say(s, card + ' +' + (s.money[id] - before), { w: id, i: '🎁', k: 'good', big: true });
      }
    }
  }

  // путь фишки за бросок — для анимации: шагом по клеткам (бросок) или прыжком (карточка «Шанс», тюрьма)
  function track(s, id, to, walk) {
    if (s.lastMove && s.lastMove.id === id && s.lastMove.path) s.lastMove.path.push({ from: s.pos[id], to, walk: !!walk });
  }

  function toJail(s, id) {
    track(s, id, JAIL, false);
    s.pos[id] = JAIL;
    s.jail[id] = 3;
    s.doubles = 0;
    s.again = false;
    say(s, s.names[id] + ' отправляется в тюрьму', { w: id, i: '🚓', k: 'bad', big: true });
  }

  function nextTurn(s, now) {
    if (s.phase === 'end') return;
    const a = alive(s);
    if (a.length <= 1) return finish(s);
    let k = s.turn;
    do {
      k = (k + 1) % s.ids.length;
      if (k === 0) s.round++;
    } while (s.out.includes(s.ids[k]));
    s.turn = k;
    s.phase = 'roll';
    s.doubles = 0;
    s.offer = null;
    s.deadline = now + TURN_TIME * 1000;
    if (s.limit && s.round > s.limit) finish(s);
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || cur(s) !== id) return false;
    const name = s.names[id];
    if (a.roll && s.phase === 'roll') {
      const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      s.dice = d;
      s.moveN = (s.moveN || 0) + 1;
      s.lastMove = { id, n: s.moveN, path: [] };
      const dbl = d[0] === d[1];
      if (s.jail[id]) {
        if (dbl) {
          s.jail[id] = 0;
          say(s, name + ' выбрасывает дубль и выходит из тюрьмы', { w: id, i: '🔓', k: 'good' });
        } else {
          s.jail[id]--;
          if (s.jail[id] === 0) {
            pay(s, id, 50);
            say(s, name + ' платит 50 и выходит из тюрьмы', { w: id, i: '🔓' });
          } else {
            say(s, name + ' остаётся в тюрьме', { w: id, i: '🚔' });
            s.phase = 'act';
            s.again = false;
            s.deadline = now + TURN_TIME * 1000;
            return true;
          }
        }
        s.again = false;
      } else {
        s.doubles = dbl ? s.doubles + 1 : 0;
        if (s.doubles >= 3) {
          toJail(s, id);
          s.phase = 'act';
          return true;
        }
        s.again = dbl;
      }
      say(s, name + (a.again ? ' бросает ещё раз: ' : ' бросает ') + d[0] + '+' + d[1] + ' → ' + B[(s.pos[id] + d[0] + d[1]) % N].n, { w: id, i: '🎲' });
      moveTo(s, id, (s.pos[id] + d[0] + d[1]) % N, true);
      if (s.out.includes(id)) {
        nextTurn(s, now);
        return true;
      }
      if (s.jail[id]) s.again = false;
      s.phase = 'act';
      s.deadline = now + TURN_TIME * 1000;
      return true;
    }
    if (a.bail && s.phase === 'roll' && s.jail[id] && s.money[id] >= 50) {
      pay(s, id, 50);
      s.jail[id] = 0;
      say(s, name + ' платит 50 и выходит из тюрьмы', { w: id, i: '🔓' });
      return true;
    }
    if (s.phase !== 'act') return false;
    if (a.buy && s.offer !== null && s.offer !== undefined && s.money[id] >= B[s.offer].p) {
      s.money[id] -= B[s.offer].p;
      s.own[s.offer] = id;
      say(s, name + ' покупает ' + B[s.offer].n + ' за ' + B[s.offer].p, { w: id, i: '🛒', k: 'good', big: true });
      s.offer = null;
      return true;
    }
    if (a.build !== undefined) {
      const i = a.build;
      const c = B[i];
      if (!c || c.t !== 'st' || s.own[i] !== id || !hasGroup(s, id, c.g) || (s.houses[i] || 0) >= MAXH || s.money[id] < houseCost(c)) return false;
      // строим равномерно: не больше, чем на 1 дом выше соседей по группе
      const min = Math.min(...groupCells(c.g).map((k) => s.houses[k] || 0));
      if ((s.houses[i] || 0) > min) return false;
      s.money[id] -= houseCost(c);
      s.houses[i] = (s.houses[i] || 0) + 1;
      say(s, name + ' строит дом: ' + c.n + ' (' + s.houses[i] + ')', { w: id, i: '🏠', k: 'good' });
      return true;
    }
    if (a.end) {
      s.offer = null;
      if (s.again) {
        // дубль: сразу второй бросок, без лишнего нажатия «Бросить кубики»
        s.phase = 'roll';
        return act(s, id, { roll: 1, again: 1 }, now);
      }
      nextTurn(s, now);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    const id = cur(s);
    // время вышло — за игрока: бросок или завершение хода
    if (s.phase === 'roll') return act(s, id, { roll: 1 }, now);
    return act(s, id, { end: 1 }, now);
  }

  function leave(s, id) {
    if (s.phase === 'end' || s.out.includes(id)) return;
    const was = cur(s) === id;
    bankrupt(s, id);
    if (was && s.phase !== 'end') nextTurn(s, s.now);
  }

  // ---------- боты ----------

  function ai(s, id, level) {
    if (s.phase === 'end' || cur(s) !== id) return null;
    const m = s.money[id];
    if (s.phase === 'roll') {
      if (s.jail[id] && m > 400 && level !== 'easy') return { bail: 1 };
      return { roll: 1 };
    }
    if (s.offer !== null && s.offer !== undefined) {
      const p = B[s.offer].p;
      const keep = level === 'easy' ? 0 : level === 'hard' ? 150 : 250;
      const wantsGroup = B[s.offer].g !== undefined && groupCells(B[s.offer].g).some((k) => s.own[k] === id);
      if (m - p >= keep || (wantsGroup && m >= p)) return { buy: 1 };
    }
    const reserve = level === 'hard' ? 150 : 300;
    for (let i = 0; i < N; i++) {
      const c = B[i];
      if (c.t !== 'st' || s.own[i] !== id || !hasGroup(s, id, c.g)) continue;
      const min = Math.min(...groupCells(c.g).map((k) => s.houses[k] || 0));
      if ((s.houses[i] || 0) === min && min < MAXH && m - houseCost(c) >= reserve) return { build: i };
    }
    return { end: 1 };
  }

  // ---------- вид ----------

  function view(s, id) {
    const me = cur(s) === id && s.phase !== 'end';
    const canBuild = [];
    if (me && s.phase === 'act')
      B.forEach((c, i) => {
        if (c.t !== 'st' || s.own[i] !== id || !hasGroup(s, id, c.g) || (s.houses[i] || 0) >= MAXH || s.money[id] < houseCost(c)) return;
        const min = Math.min(...groupCells(c.g).map((k) => s.houses[k] || 0));
        if ((s.houses[i] || 0) === min) canBuild.push(i);
      });
    return {
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], money: s.money[pid], pos: s.pos[pid], jail: s.jail[pid] > 0, out: s.out.includes(pid), color: s.color[pid], worth: worth(s, pid) })),
      own: s.own,
      houses: s.houses,
      turn: cur(s),
      phase: s.phase,
      dice: s.dice,
      offer: me && s.offer !== null && s.offer !== undefined ? s.offer : null,
      canBuild,
      again: s.again,
      log: s.log.slice(-30),
      round: s.round,
      move: s.lastMove || null,
      limit: s.limit,
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.phase === 'end',
      winner: s.winner,
    };
  }

  // ---------- отрисовка ----------

  // клетка → место на кольце 8×8
  function cellPos(i) {
    if (i <= 7) return [8, 8 - i]; // низ: справа налево
    if (i <= 14) return [8 - (i - 7), 1]; // левая сторона: снизу вверх
    if (i <= 21) return [1, 1 + (i - 14)]; // верх: слева направо
    return [1 + (i - 21), 8]; // правая сторона: сверху вниз
  }
  const ICON = { go: '🏁', jail: '🚔', park: '🅿', gojail: '👮', ch: '❓', tax: '💰', tr: '🚆' };
  const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  // что уже показано: позиции фишек, деньги и последний ход — чтобы анимировать только изменения
  const seen = { pos: {}, money: {}, jail: {}, move: 0, dice: [0, 0] };
  const letter = (name) => (Array.from(String(name).trim().replace(/^Бот\s+/, ''))[0] || '?').toUpperCase();

  function render(v, ui) {
    const el = ui.el;
    lastV = v;
    lastEl = el;
    const colorOf = (pid) => (v.players.find((p) => p.id === pid) || {}).color;
    const cells = B.map((c, i) => {
      const [r, col] = cellPos(i);
      const owner = v.own[i];
      const h = v.houses[i] || 0;
      return `<div class="mg-cell ${c.t}${v.offer === i ? ' offer' : ''}${v.canBuild.includes(i) ? ' can' : ''}" style="grid-row:${r};grid-column:${col}" data-i="${i}">` +
        (c.g !== undefined ? `<span class="mg-band" style="background:${GROUPS[c.g]}">${h ? '🏠'.repeat(h) : ''}</span>` : `<span class="mg-icon">${c.t === 'tr' && i > 10 ? '✈' : ICON[c.t] || ''}</span>`) +
        `<span class="mg-name">${esc(c.n)}</span>${c.p && c.t !== 'tax' ? `<span class="mg-price">${c.p}</span>` : ''}` +
        (owner !== undefined ? `<span class="mg-owner" style="background:${colorOf(owner)}" title="${esc(ui.name(owner))}"></span>` : '') +
        '</div>';
    }).join('');
    const mine = v.turn === ui.me && !v.over;
    let actions = '';
    if (mine && v.phase === 'roll') {
      actions = '<button class="btn btn-primary" type="button" data-roll>🎲 Бросить кубики</button>';
      const me = v.players.find((p) => p.id === ui.me);
      if (me.jail && me.money >= 50) actions += '<button class="btn btn-ghost" type="button" data-bail>Заплатить 50 и выйти</button>';
    } else if (mine && v.phase === 'act') {
      if (v.offer !== null) actions += `<button class="btn btn-primary" type="button" data-buy>Купить ${esc(B[v.offer].n)} за ${B[v.offer].p}</button>`;
      actions += `<button class="btn btn-ghost" type="button" data-end>${v.again ? '🎲 Бросить ещё (дубль)' : 'Завершить ход'}</button>`;
      if (v.canBuild.length) actions += '<p class="pt-muted">Можно строить дома: нажмите на подсвеченную улицу.</p>';
    }
    const turnP = v.players.find((p) => p.id === v.turn);
    let status;
    if (v.over) status = v.winner === ui.me ? 'Вы — магнат! 🏆' : 'Победил ' + esc(ui.name(v.winner));
    else
      status =
        (turnP ? `<span class="mg-ava" style="background:${turnP.color}">${esc(letter(turnP.name))}</span>` : '') +
        (mine ? 'Ваш ход' : 'Ходит ' + esc(ui.name(v.turn))) +
        ` <span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const center =
      `<div class="mg-center"><div class="mg-dice" aria-label="Кубики">${diceHtml(v.dice)}</div><div class="mg-status">${status}</div>` +
      `<div class="tb-actions">${actions}</div>` +
      `<div class="mg-round">Круг ${v.round}${v.limit ? ' из ' + v.limit : ''}</div></div>`;
    const players = v.players
      .map(
        (p) =>
          `<div class="pt-seat${p.id === v.turn && !v.over ? ' turn' : ''}${p.id === ui.me ? ' me' : ''}${p.out ? ' out' : ''}" data-seat="${p.id}" title="Капитал ${p.worth}">` +
          `<b><span class="mg-ava" style="background:${p.color}">${esc(letter(p.name))}</span>${esc(p.name)}</b>` +
          `<span class="mg-money"><span>${p.out ? 'банкрот' : '💵 ' + p.money}</span><span>${p.jail ? ' · 🚔' : ''}</span></span></div>`
      )
      .join('');
    const tokens = v.players
      .filter((p) => !p.out)
      .map((p) => `<span class="mg-tok${p.id === v.turn && !v.over ? ' turn' : ''}" data-tok="${p.id}" style="--c:${p.color}" title="${esc(p.name)}">${esc(letter(p.name))}</span>`)
      .join('');
    el.innerHTML = `<div class="pt-panel mg"><div class="pt-seats">${players}</div><div class="mg-board">${cells}${center}<div class="mg-tokens">${tokens}</div></div></div>`;
    const on = (sel, a) => {
      const b = el.querySelector(sel);
      if (b) b.addEventListener('click', () => ui.send(a));
    };
    on('[data-roll]', { roll: 1 });
    on('[data-bail]', { bail: 1 });
    on('[data-buy]', { buy: 1 });
    on('[data-end]', { end: 1 });
    el.querySelectorAll('.mg-cell.can').forEach((c) => c.addEventListener('click', () => ui.send({ build: +c.dataset.i })));

    animate(v, el, ui);

    const key = v.dice.join() + (v.log.length ? v.log[v.log.length - 1].n : 0);
    if (render.key !== key) {
      render.key = key;
      if (!v.over) SG.sound.play('click');
    }
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === ui.me ? 'win' : 'lose');
      if (v.winner === ui.me) SG.store.set('magnat-wins', SG.store.get('magnat-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  const diceHtml = (d) => (d[0] ? `<span>${DIE[d[0]]}</span><span>${DIE[d[1]]}</span>` : '<span>🎲</span>');

  // фишки лежат отдельным слоем поверх поля и переезжают в центр своей клетки
  function placeTokens(el, pos) {
    const board = el.querySelector('.mg-board');
    const layer = el.querySelector('.mg-tokens');
    if (!board || !layer) return;
    const b = board.getBoundingClientRect();
    const byCell = {};
    layer.querySelectorAll('[data-tok]').forEach((t) => {
      const i = pos[t.dataset.tok];
      (byCell[i] = byCell[i] || []).push(t);
    });
    Object.entries(byCell).forEach(([i, toks]) => {
      const cell = board.querySelector('.mg-cell[data-i="' + i + '"]');
      if (!cell) return;
      const r = cell.getBoundingClientRect();
      toks.forEach((t, k) => {
        const size = t.offsetWidth;
        // несколько фишек в клетке — веером, чтобы не закрывали друг друга
        const spread = toks.length > 1 ? (k - (toks.length - 1) / 2) * size * 0.55 : 0;
        // в процентах от поля: если поле потом сожмётся или растянется, фишки останутся на своих клетках
        const x = ((r.left - b.left + r.width / 2) / b.width) * 100;
        const y = ((r.top - b.top + r.height * 0.62) / b.height) * 100;
        t.style.left = x + '%';
        t.style.top = y + '%';
        t.style.transform = `translate(calc(-50% + ${spread}px), -50%)`;
      });
    });
  }

  const ROLL_MS = 800; // бросок кубиков
  const STEP_MS = 170; // шаг фишки по клетке
  const JUMP_MS = 420; // прыжок по карточке «Шанс» или в тюрьму
  const PAUSE_MS = 900; // пауза перед прыжком: успеть прочитать, что выпало

  // порядок хода: катятся кубики → фишка едет по клеткам → встала: записи ленты →
  // (если «Шанс» или «В тюрьму») пауза и прыжок → деньги, кнопки
  function animate(v, el, ui) {
    const target = {};
    v.players.forEach((p) => (target[p.id] = p.pos));
    const layer = el.querySelector('.mg-tokens');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mv = v.move;
    const fresh = !reduce && mv && mv.n !== seen.move && seen.pos[mv.id] !== undefined;
    const path = fresh && mv.path ? mv.path : [];
    const dice = el.querySelector('.mg-dice');

    // шаги фишки со временем каждого
    const steps = [];
    let arrive = 0; // когда фишка встала на первую клетку — тогда и видно, что там произошло
    path.forEach((seg, i) => {
      if (seg.walk) for (let c = seg.from; c !== seg.to; ) steps.push({ cell: (c = (c + 1) % N), ms: STEP_MS });
      else steps.push({ cell: seg.to, ms: JUMP_MS, pre: i ? PAUSE_MS : 0 });
      if (!i) arrive = steps.reduce((t, x) => t + (x.pre || 0) + x.ms, 0);
    });
    const rollMs = fresh && dice && v.dice[0] ? ROLL_MS : 0;
    const total = rollMs + steps.reduce((t, x) => t + (x.pre || 0) + x.ms, 0);
    arrive += rollMs;

    // фишки сначала там, где их видели в прошлый раз
    const start = Object.assign({}, target);
    if (path.length) start[mv.id] = path[0].from;
    layer.classList.add('still');
    placeTokens(el, start);
    void layer.offsetWidth;
    layer.classList.remove('still');

    if (rollMs) {
      // пока крутятся — прежние грани, выпавшие видны только в конце
      dice.innerHTML = diceHtml(seen.dice[0] ? seen.dice : [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      rollDice(dice, v.dice);
    }
    seen.dice = v.dice.slice();
    if (total) {
      if (ui.hold) ui.hold(arrive, total + 150, rollMs);
      // пока ход не закончился, кнопки видны, но не нажимаются
      const acts = el.querySelector('.tb-actions');
      if (acts) acts.classList.add('mg-wait');
      setTimeout(() => acts && acts.classList.remove('mg-wait'), total);
    }
    if (steps.length) {
      const tok = layer.querySelector('[data-tok="' + mv.id + '"]');
      const pos = Object.assign({}, start);
      let k = 0;
      const next = () => {
        if (!layer.isConnected) return;
        if (k >= steps.length) {
          if (tok) tok.classList.remove('moving');
          const cell = el.querySelector('.mg-cell[data-i="' + steps[steps.length - 1].cell + '"]');
          if (cell) cell.classList.add('landed');
          return;
        }
        const st = steps[k++];
        setTimeout(() => {
          if (!layer.isConnected) return;
          pos[mv.id] = st.cell;
          placeTokens(el, pos);
          setTimeout(next, st.ms);
        }, st.pre || 0);
      };
      setTimeout(() => {
        if (!layer.isConnected) return;
        if (tok) tok.classList.add('moving');
        next();
      }, rollMs);
    } else placeTokens(el, target);
    if (mv) seen.move = mv.n;
    seen.pos = target;

    // деньги: пока фишка едет, у игроков старые суммы; когда встала — новые и всплывающие «+200» / «−140»
    const changes = [];
    const jailed = [];
    v.players.forEach((p) => {
      const before = seen.money[p.id];
      if (before !== undefined && before !== p.money) changes.push([p, before]);
      if (p.jail && !seen.jail[p.id]) jailed.push(p);
      seen.money[p.id] = p.money;
      seen.jail[p.id] = !!p.jail;
    });
    const moneyOf = (id) => el.querySelector('[data-seat="' + id + '"] .mg-money');
    if (total) {
      changes.forEach(([p, before]) => {
        const m = moneyOf(p.id);
        if (m && !p.out) m.firstChild.textContent = '💵 ' + before;
      });
      jailed.forEach((p) => {
        const m = moneyOf(p.id);
        if (m) m.lastChild.textContent = '';
      });
    }
    const reveal = () => {
      jailed.forEach((p) => {
        const m = moneyOf(p.id);
        if (m && m.isConnected) m.lastChild.textContent = ' · 🚔';
      });
      changes.forEach(([p, before]) => {
        const seat = el.querySelector('[data-seat="' + p.id + '"]');
        if (!seat || !seat.isConnected) return;
        const m = moneyOf(p.id);
        if (m && !p.out) m.firstChild.textContent = '💵 ' + p.money;
        const d = p.money - before;
        const f = document.createElement('span');
        f.className = 'mg-delta ' + (d > 0 ? 'up' : 'down');
        f.textContent = (d > 0 ? '+' : '−') + Math.abs(d);
        seat.appendChild(f);
        setTimeout(() => f.remove(), 1800);
      });
    };
    if (total) setTimeout(reveal, total);
    else reveal();
  }

  function rollDice(dice, final) {
    // один спокойный бросок: кубики крутятся, замедляются и, почти остановившись, показывают выпавшее
    dice.classList.add('rolling');
    setTimeout(() => {
      if (dice.isConnected) dice.innerHTML = diceHtml(final);
    }, ROLL_MS * 0.6);
    setTimeout(() => dice.isConnected && dice.classList.remove('rolling'), ROLL_MS);
  }


  // при изменении размера окна фишки встают на свои клетки заново
  let lastV = null;
  let lastEl = null;
  window.addEventListener('resize', () => lastV && lastEl && lastEl.isConnected && placeTokens(lastEl, Object.fromEntries(lastV.players.map((p) => [p.id, p.pos]))));

  SG.party({
    game: 'magnat',
    min: 2,
    max: 6,
    bots: true,
    soloBots: 2,
    aiForGone: true,
    botDelay: () => 900 + Math.random() * 700,
    options: {
      html: '<label>Длина партии <select data-rounds><option value="0">До последнего банкрота</option><option value="15">15 кругов</option><option value="25" selected>25 кругов</option><option value="40">40 кругов</option></select></label>',
      read: (el) => ({ rounds: +((el.querySelector('[data-rounds]') || {}).value || 25) }),
      show(el, o) {
        if (o && o.rounds !== undefined) el.querySelector('[data-rounds]').value = String(o.rounds);
      },
    },
    create,
    view,
    act,
    tick,
    ai,
    leave,
    render,
  });
})();
