/* Кодовые слова: две команды, капитаны знают, где свои агенты, и подсказывают одним словом */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const WORDS = (Array.isArray(window.SG_NOUNS) ? window.SG_NOUNS : String(window.SG_NOUNS).split(' ')).filter((w) => w.length >= 4 && w.length <= 8);
  // вариант «Картинки»: вместо слов — эмодзи
  const PICS = '🌙 ☀️ ⭐ 🌈 ⛈️ ❄️ 🔥 🌊 🌋 🌵 🌲 🌸 🍂 🍄 🌍 🏔️ 🏝️ 🏰 🏠 🗝️ 🚪 🕯️ ⏳ ⏰ 📚 ✉️ 🎁 🎈 🎭 🎨 🎵 🎲 🧩 🔮 ⚓ 🧭 🗺️ 🚀 ✈️ 🚂 ⛵ 🚲 🛸 👑 💎 💰 ⚖️ 🗡️ 🛡️ 🏹 💣 ❤️ 👻 💀 🤖 👽 🧙 🤡 🐱 🐶 🦊 🐺 🦉 🐢 🐇 🦋 🐝 🐍 🦁 🐘 🐟 🐙 🦄 🐉 🍎 🍋 🍰 ☕ 🍕 🍯 🧀 ⚽ 🏆 🎯 💡 🔒 📷 📺 📱 🔭 🧪 ⛓️ 🕸️ 🧸 🌅 🎢 🎪 🚗 🎸 🥁 🎤 🧲 🪁 🛶 🧊 🍉 🥕 🌶️ 🍔 🍩 🎃 🎄 🦀 🐧 🦒 🐌 🍀 🌻 🌴 🏀 🎳 🥊 🪓 🔔 📎 ✂️ 🧵'.split(' ');
  const TEAM = ['Красные', 'Синие'];
  const norm = (w) => String(w).toLowerCase().replace(/ё/g, 'е').trim();

  // ---------- правила ----------

  function create(players, opts) {
    const ids = SG.shuffle(players.map((p) => p.id));
    const s = { pics: !!(opts && opts.pics), ids: players.map((p) => p.id), names: {}, team: {}, captain: [null, null], phase: 'teams', now: Date.now(), log: [] };
    players.forEach((p) => (s.names[p.id] = p.name));
    // поровну и случайно; первые в каждой команде — капитаны
    ids.forEach((id, i) => (s.team[id] = i % 2));
    s.captain = [ids[0], ids[1]];
    return s;
  }

  function deal(s) {
    const words = SG.shuffle((s.pics ? PICS : WORDS).slice()).slice(0, 25);
    s.first = Math.random() < 0.5 ? 0 : 1;
    // 9 у начинающей команды, 8 у другой, 7 мирных, 1 убийца
    const key = [...Array(9).fill(s.first), ...Array(8).fill(1 - s.first), ...Array(7).fill(2), 3];
    const k = SG.shuffle(key);
    s.cards = words.map((w, i) => ({ w, k: k[i], open: false }));
    s.turn = s.first;
    s.phase = 'clue';
    s.clue = null;
    s.left = 0;
    s.pick = {};
    s.winner = null;
    s.log = ['Первыми ходят ' + TEAM[s.first].toLowerCase() + '.'];
  }

  const say = (s, t) => {
    s.log.push(t);
    if (s.log.length > 8) s.log.shift();
  };
  const remaining = (s, t) => s.cards.filter((c) => c.k === t && !c.open).length;
  const teamOk = (s) => [0, 1].every((t) => s.captain[t] !== null && s.team[s.captain[t]] === t && s.ids.some((id) => s.team[id] === t && id !== s.captain[t]));

  function act(s, id, a) {
    if (!a || s.names[id] === undefined || s.phase === 'end') return false;
    if (s.phase === 'teams') {
      if (a.team === 0 || a.team === 1) {
        const old = s.team[id];
        s.team[id] = a.team;
        if (s.captain[old] === id && old !== a.team) s.captain[old] = null;
        return true;
      }
      if (a.captain) {
        s.captain[s.team[id]] = id;
        return true;
      }
      if (a.go && teamOk(s)) {
        deal(s);
        return true;
      }
      return false;
    }
    const myTeam = s.team[id];
    if (s.phase === 'clue' && id === s.captain[s.turn] && a.clue) {
      const w = norm(a.clue).split(/\s+/)[0];
      const n = Math.max(0, Math.min(9, a.n | 0));
      if (!w || s.cards.some((c) => !c.open && (norm(c.w) === w || norm(c.w).startsWith(w) || w.startsWith(norm(c.w))))) return false;
      s.clue = { w, n };
      s.left = n === 0 ? 25 : n + 1;
      s.phase = 'guess';
      s.pick = {};
      say(s, TEAM[s.turn] + ': «' + w + '», ' + n);
      return true;
    }
    if (s.phase === 'guess' && myTeam === s.turn && id !== s.captain[s.turn]) {
      if (a.end) {
        say(s, TEAM[s.turn] + ' заканчивают ход');
        pass(s);
        return true;
      }
      const c = s.cards[a.card];
      if (!c || c.open) return false;
      // первый клик — отметить, второй по той же карте — открыть
      if (s.pick[id] !== a.card) {
        s.pick[id] = a.card;
        return true;
      }
      s.pick = {};
      c.open = true;
      if (c.k === 3) {
        s.winner = 1 - s.turn;
        s.phase = 'end';
        say(s, TEAM[s.turn] + ' открыли убийцу («' + c.w + '») — победа: ' + TEAM[s.winner].toLowerCase() + '!');
        return true;
      }
      if (!remaining(s, 0) || !remaining(s, 1)) {
        s.winner = remaining(s, 0) ? 1 : 0;
        s.phase = 'end';
        say(s, 'Все агенты найдены — победа: ' + TEAM[s.winner].toLowerCase() + '!');
        return true;
      }
      if (c.k === s.turn) {
        say(s, '«' + c.w + '» — свой агент');
        s.left--;
        if (s.left <= 0) pass(s);
      } else {
        say(s, '«' + c.w + '» — ' + (c.k === 2 ? 'мирный житель' : 'агент соперников'));
        pass(s);
      }
      return true;
    }
    return false;
  }

  function pass(s) {
    s.turn = 1 - s.turn;
    s.phase = 'clue';
    s.clue = null;
    s.pick = {};
  }

  function leave(s, id) {
    // ушёл капитан — капитаном становится другой из команды
    const t = s.team[id];
    if (s.captain[t] === id) {
      const other = s.ids.find((x) => x !== id && s.team[x] === t);
      s.captain[t] = other !== undefined ? other : null;
    }
    delete s.team[id];
    s.ids = s.ids.filter((x) => x !== id);
  }

  // ---------- вид ----------

  function view(s, id) {
    const cap = id === s.captain[0] || id === s.captain[1];
    const reveal = s.phase === 'end';
    return {
      pics: s.pics,
      phase: s.phase,
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], team: s.team[pid], cap: s.captain[s.team[pid]] === pid })),
      myTeam: s.team[id],
      cap,
      ready: s.phase === 'teams' ? teamOk(s) : true,
      cards: s.cards ? s.cards.map((c) => ({ w: c.w, k: c.open || cap || reveal ? c.k : null, open: c.open })) : null,
      turn: s.turn,
      clue: s.clue,
      left: s.left,
      pick: s.pick ? Object.entries(s.pick).map(([pid, card]) => ({ id: +pid, card })) : [],
      remain: s.cards ? [remaining(s, 0), remaining(s, 1)] : null,
      log: s.log.slice(-5),
      winner: s.winner,
      over: s.phase === 'end',
    };
  }

  // ---------- отрисовка ----------

  const KCLS = ['red', 'blue', 'neutral', 'killer'];
  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const team = (t) => v.players.filter((p) => p.team === t).map((p) => `<span class="${p.id === me ? 'me' : ''}">${p.cap ? '🎖 ' : ''}${esc(p.name)}</span>`).join('');
    const teams = `<div class="cn-teams"><div class="cn-team red"><b>${TEAM[0]}${v.remain ? ' · осталось ' + v.remain[0] : ''}</b>${team(0)}</div><div class="cn-team blue"><b>${TEAM[1]}${v.remain ? ' · осталось ' + v.remain[1] : ''}</b>${team(1)}</div></div>`;
    let body = '';
    if (v.phase === 'teams') {
      body =
        `<p>Разбейтесь на команды. В каждой нужен капитан 🎖 и хотя бы один отгадчик.</p>` +
        (v.myTeam !== undefined
          ? `<div class="pt-choices"><button class="btn btn-ghost cn-red" type="button" data-team="0">В красные</button><button class="btn btn-ghost cn-blue" type="button" data-team="1">В синие</button><button class="btn btn-ghost" type="button" data-cap>Стать капитаном</button></div>` +
            `<button class="btn btn-primary" type="button" data-go ${v.ready ? '' : 'disabled'}>Начать</button>`
          : '');
    } else {
      const myTurn = v.myTeam === v.turn;
      let status;
      if (v.over) status = `<span class="pt-big">${v.myTeam === v.winner ? 'Ваша команда победила! 🎉' : 'Победа: ' + TEAM[v.winner].toLowerCase()}</span>`;
      else if (v.phase === 'clue') status = myTurn && v.cap ? 'Ваша подсказка: одно слово и число — сколько карт к нему относится.' : `Капитан ${TEAM[v.turn].toLowerCase().replace(/е$/, 'ых')} придумывает подсказку…`;
      else status = `Подсказка: <b>«${esc(v.clue.w)}», ${v.clue.n}</b> · ходят ${TEAM[v.turn].toLowerCase()}` + (myTurn && !v.cap ? ' · нажмите на слово дважды, чтобы открыть' : '') + ` · попыток ${v.clue.n === 0 ? '∞' : v.left}`;
      const canGuess = v.phase === 'guess' && myTurn && !v.cap && !ui.watcher;
      body =
        `<p class="cn-status cn-${v.turn ? 'blue' : 'red'}">${status}</p>` +
        `<div class="cn-grid">${v.cards
          .map((c, i) => {
            const marks = v.pick.filter((p) => p.card === i).map((p) => esc(ui.name(p.id))).join(', ');
            const cls = (c.open ? 'open ' : '') + (c.k !== null ? KCLS[c.k] : '') + (v.pick.some((p) => p.card === i && p.id === me) ? ' sel' : '');
            return `<button type="button" class="cn-card ${cls}${v.pics ? ' pic' : ''}" data-card="${i}" ${canGuess && !c.open ? '' : 'disabled'}><span>${esc(c.w)}</span>${marks ? `<small>${marks}</small>` : ''}</button>`;
          })
          .join('')}</div>` +
        (v.phase === 'clue' && myTurn && v.cap && !v.over ? '<form class="cn-clue"><input type="text" maxlength="24" placeholder="Слово-подсказка" required><select>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<option value="${n}">${n}</option>`).join('') + '</select><button class="btn btn-primary" type="submit">Подсказать</button></form><p class="pt-muted cn-err" hidden>Подсказка не может быть словом с поля или его частью.</p>' : '') +
        (canGuess ? '<button class="btn btn-ghost" type="button" data-end>Закончить ход</button>' : '') +
        `<div class="mm-log">${v.log.map((x) => `<div>${esc(x)}</div>`).join('')}</div>`;
    }
    el.innerHTML = `<div class="pt-panel cn">${teams}${body}</div>`;
    el.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => ui.send({ team: +b.dataset.team })));
    const on = (sel, a) => {
      const b = el.querySelector(sel);
      if (b) b.addEventListener('click', () => ui.send(a));
    };
    on('[data-cap]', { captain: 1 });
    on('[data-go]', { go: 1 });
    on('[data-end]', { end: 1 });
    el.querySelectorAll('.cn-card:not(:disabled)').forEach((b) =>
      b.addEventListener('click', () => {
        ui.send({ card: +b.dataset.card });
        SG.sound.play('click');
      })
    );
    const f = el.querySelector('.cn-clue');
    if (f)
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const w = f.querySelector('input').value.trim();
        const bad = v.cards.some((c) => !c.open && (norm(c.w) === norm(w) || norm(c.w).startsWith(norm(w)) || norm(w).startsWith(norm(c.w))));
        el.querySelector('.cn-err').hidden = !bad;
        if (!w || bad || /\s/.test(w)) return;
        ui.send({ clue: w, n: +f.querySelector('select').value });
      });
    const key = v.phase + (v.clue ? v.clue.w : '') + (v.cards ? v.cards.filter((c) => c.open).length : 0);
    if (render.key !== key) {
      render.key = key;
      if (v.over) {
        const won = v.myTeam === v.winner;
        SG.sound.play(won ? 'win' : 'lose');
        if (won) SG.store.set('codenames-wins', SG.store.get('codenames-wins', 0) + 1);
      } else if (v.phase === 'guess' || v.phase === 'clue') SG.sound.play('flip');
    }
  }

  SG.party({
    game: 'codenames',
    options: {
      html: '<label>Карточки <select data-pics><option value="0">Слова</option><option value="1">Картинки (эмодзи)</option></select></label>',
      read: (el) => ({ pics: (el.querySelector('[data-pics]') || {}).value === '1' }),
      show(el, o) {
        if (o) el.querySelector('[data-pics]').value = o.pics ? '1' : '0';
      },
    },
    min: 4,
    max: 12,
    bots: false,
    create,
    view,
    act,
    leave,
    render,
  });
})();
