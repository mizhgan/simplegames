/* Уно: сбросьте все карты первым — по цвету или значению, с «+2», пропусками, разворотами и дикими картами */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const COLORS = ['red', 'yellow', 'green', 'blue'];
  const CNAME = ['красный', 'жёлтый', 'зелёный', 'синий'];
  const HAND = 7;
  const TURN_TIME = 30;
  // значения: 0–9, 's' пропуск, 'r' разворот, 'd' +2, 'w' дикая, 'f' дикая +4
  const LABEL = { s: '⊘', r: '⇄', d: '+2', w: '★', f: '+4' };
  const NAME = { s: 'пропуск', r: 'разворот', d: '+2', w: 'дикая', f: 'дикая +4' };

  function deck() {
    const out = [];
    let id = 0;
    for (let c = 0; c < 4; c++) {
      out.push({ id: id++, c, v: '0' });
      for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 's', 'r', 'd']) {
        out.push({ id: id++, c, v });
        out.push({ id: id++, c, v });
      }
    }
    for (let k = 0; k < 4; k++) {
      out.push({ id: id++, c: -1, v: 'w' });
      out.push({ id: id++, c: -1, v: 'f' });
    }
    return SG.shuffle(out);
  }

  const cardName = (x) => (x.c < 0 ? NAME[x.v] : CNAME[x.c] + ' ' + (NAME[x.v] || x.v));

  function create(players) {
    const s = { ids: players.map((p) => p.id), names: {}, hands: {}, draw: deck(), pile: [], turn: 0, dir: 1, color: 0, drew: false, log: [], winner: null, now: Date.now() };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.hands[p.id] = s.draw.splice(0, HAND);
    });
    // первая карта — обычная цифра
    const i = s.draw.findIndex((x) => /\d/.test(x.v));
    s.pile.push(s.draw.splice(i, 1)[0]);
    s.color = s.pile[0].c;
    s.turn = Math.floor(Math.random() * s.ids.length);
    s.deadline = s.now + TURN_TIME * 1000;
    say(s, 'Первым ходит ' + s.names[s.ids[s.turn]] + '.');
    return s;
  }

  function say(s, t) {
    s.log.push(t);
    if (s.log.length > 6) s.log.shift();
  }

  const top = (s) => s.pile[s.pile.length - 1];
  const cur = (s) => s.ids[s.turn];
  const nextIdx = (s, k = 1) => (((s.turn + s.dir * k) % s.ids.length) + s.ids.length) % s.ids.length;
  const canPlay = (s, x) => x.c < 0 || x.c === s.color || x.v === top(s).v;

  function take(s, id, n) {
    for (let k = 0; k < n; k++) {
      if (!s.draw.length) {
        const t = s.pile.pop();
        s.draw = SG.shuffle(s.pile.map((x) => (x.v === 'w' || x.v === 'f' ? { ...x, c: -1 } : x)));
        s.pile = [t];
      }
      if (!s.draw.length) return;
      s.hands[id].push(s.draw.pop());
    }
  }

  function advance(s, k, now) {
    s.turn = nextIdx(s, k);
    s.drew = false;
    s.deadline = now + TURN_TIME * 1000;
  }

  function act(s, id, a, now) {
    if (s.winner !== null || !a || cur(s) !== id) return false;
    const hand = s.hands[id];
    const name = s.names[id];
    if (a.play !== undefined) {
      const i = hand.findIndex((x) => x.id === a.play);
      if (i < 0 || !canPlay(s, hand[i])) return false;
      const x = hand[i];
      if (x.c < 0 && !(a.color >= 0 && a.color < 4)) return false;
      // после взятия можно сыграть только взятую карту
      if (s.drew && i !== hand.length - 1) return false;
      hand.splice(i, 1);
      s.pile.push(x.c < 0 ? { ...x, c: a.color } : x);
      s.color = x.c < 0 ? a.color : x.c;
      let text = name + ': ' + cardName(x) + (x.c < 0 ? ' → ' + CNAME[a.color] : '');
      if (!hand.length) {
        s.winner = id;
        say(s, text + ' — и это последняя! Победа 🎉');
        return true;
      }
      if (hand.length === 1) text += ' — «УНО!»';
      let skip = 1;
      const victim = s.ids[nextIdx(s)];
      if (x.v === 's') skip = 2;
      else if (x.v === 'r') {
        s.dir = -s.dir;
        if (s.ids.length === 2) skip = 2;
      } else if (x.v === 'd') {
        take(s, victim, 2);
        text += ' — ' + s.names[victim] + ' берёт 2 и пропускает ход';
        skip = 2;
      } else if (x.v === 'f') {
        take(s, victim, 4);
        text += ' — ' + s.names[victim] + ' берёт 4 и пропускает ход';
        skip = 2;
      }
      say(s, text);
      advance(s, skip, now);
      return true;
    }
    if (a.draw && !s.drew) {
      take(s, id, 1);
      s.drew = true;
      if (!canPlay(s, hand[hand.length - 1])) {
        say(s, name + ' берёт карту и пропускает ход');
        advance(s, 1, now);
      }
      return true;
    }
    if (a.pass && s.drew) {
      say(s, name + ' пасует');
      advance(s, 1, now);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.winner !== null || now < s.deadline) return false;
    const id = cur(s);
    // время вышло: берём карту и пропускаем
    if (!s.drew) take(s, id, 1);
    say(s, s.names[id] + ' не успел — берёт карту');
    advance(s, 1, now);
    return true;
  }

  // ---------- боты ----------

  function ai(s, id, level) {
    if (s.winner !== null || cur(s) !== id) return null;
    const hand = s.hands[id];
    let ok = hand.filter((x) => canPlay(s, x));
    if (s.drew) ok = ok.filter((x) => x === hand[hand.length - 1]);
    if (!ok.length) return s.drew ? { pass: 1 } : { draw: 1 };
    const cnt = [0, 0, 0, 0];
    hand.forEach((x) => x.c >= 0 && cnt[x.c]++);
    const best = cnt.indexOf(Math.max(...cnt));
    if (level === 'easy') return { play: ok[Math.floor(Math.random() * ok.length)].id, color: best };
    const nextN = s.hands[s.ids[nextIdx(s)]].length;
    const score = (x) => {
      let v = x.c >= 0 ? cnt[x.c] * 2 : -8; // дикие бережём
      if ('sdr'.includes(x.v)) v += nextN <= 2 ? 12 : level === 'hard' ? 2 : 0;
      if (x.v === 'f') v += nextN <= 2 ? 20 : hand.length <= 2 ? 10 : -6;
      if (/\d/.test(x.v)) v += +x.v * 0.1;
      return v;
    };
    ok.sort((a, b) => score(b) - score(a));
    return { play: ok[0].id, color: best };
  }

  // ---------- вид ----------

  function view(s, id) {
    const v = {
      seats: s.ids.map((pid, i) => ({ id: pid, name: s.names[pid], n: s.hands[pid].length, turn: i === s.turn && s.winner === null })),
      top: top(s),
      color: s.color,
      deck: s.draw.length,
      dir: s.dir,
      log: s.log.slice(-4),
      winner: s.winner,
      over: s.winner !== null,
      myTurn: cur(s) === id && s.winner === null,
      drew: s.drew,
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
    };
    if (s.hands[id]) {
      const hand = s.hands[id];
      v.hand = hand.slice().sort((a, b) => a.c - b.c || String(a.v).localeCompare(String(b.v)));
      let ok = v.myTurn ? hand.filter((x) => canPlay(s, x)) : [];
      if (s.drew) ok = ok.filter((x) => x === hand[hand.length - 1]);
      v.ok = ok.map((x) => x.id);
    }
    return v;
  }

  // ---------- отрисовка ----------

  const cardHtml = (x, extra = '') => `<button type="button" class="un-card c${x.c} ${extra}" data-id="${x.id}"><span>${LABEL[x.v] || x.v}</span></button>`;
  let picking = null;

  function render(v, ui) {
    const el = ui.el;
    const seats = v.seats.map((p) => `<div class="pt-seat${p.turn ? ' turn' : ''}${p.id === ui.me ? ' me' : ''}"><b>${esc(p.name)}${p.id === ui.me ? ' (вы)' : ''}</b><span>🂠 ${p.n}${p.n === 1 ? ' · УНО!' : ''}</span></div>`).join('');
    let status;
    if (v.over) status = v.winner === ui.me ? 'Вы победили! 🎉' : esc(ui.name(v.winner)) + ' побеждает.';
    else if (v.myTurn) status = (v.drew ? 'Сыграйте взятую карту или пасуйте.' : 'Ваш ход: карта того же цвета или значения.') + ` <span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    else status = 'Ходит ' + esc(ui.name(v.seats.find((p) => p.turn).id)) + '…';
    el.innerHTML =
      `<div class="tb un-table"><div class="pt-seats">${seats}</div>` +
      `<div class="tb-center"><div class="tb-row"><div class="un-card back"><span>УНО</span></div><span class="tb-pot">колода ${v.deck}</span>${cardHtml(v.top, 'top')}<span class="un-dot c${v.color}" title="${CNAME[v.color]}"></span><span class="tb-pot">${v.dir > 0 ? '↻' : '↺'}</span></div>` +
      `<div class="tb-msg">${status}</div><div class="mm-log">${v.log.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>` +
      (v.hand ? `<div class="un-hand">${v.hand.map((x) => cardHtml(x, v.ok.includes(x.id) ? 'playable' : v.myTurn ? 'dim' : '')).join('')}</div>` : '') +
      `<div class="tb-actions">${v.myTurn && !v.drew ? '<button class="btn btn-primary" type="button" data-draw>Взять карту</button>' : ''}${v.myTurn && v.drew ? '<button class="btn btn-ghost" type="button" data-pass>Пас</button>' : ''}</div>` +
      `<div class="un-pick" hidden><p>Какой цвет?</p><div class="pt-choices">${CNAME.map((n, i) => `<button type="button" class="un-dot big c${i}" data-color="${i}" aria-label="${n}"></button>`).join('')}</div></div></div>`;
    const pick = el.querySelector('.un-pick');
    el.querySelectorAll('.un-hand .un-card.playable').forEach((b) =>
      b.addEventListener('click', () => {
        const x = v.hand.find((h) => h.id === +b.dataset.id);
        if (x.c < 0) {
          picking = x.id;
          pick.hidden = false;
          return;
        }
        ui.send({ play: x.id });
        SG.sound.play('flip');
      })
    );
    pick.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => ui.send({ play: picking, color: +b.dataset.color })));
    const d = el.querySelector('[data-draw]');
    if (d) d.addEventListener('click', () => ui.send({ draw: 1 }));
    const p = el.querySelector('[data-pass]');
    if (p) p.addEventListener('click', () => ui.send({ pass: 1 }));
    if (v.over && !render.done) {
      render.done = true;
      SG.sound.play(v.winner === ui.me ? 'win' : 'lose');
      if (v.winner === ui.me) SG.store.set('uno-wins', SG.store.get('uno-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({ game: 'uno', min: 2, max: 8, bots: true, soloBots: 3, aiForGone: true, create, view, act, tick, ai, render });
})();
