/* Заговор: честные граждане против заговорщиков и их тайного Лидера. Президент и канцлер принимают законы */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const T = { nominate: 60, vote: 45, pres: 45, chan: 45, power: 60, show: 6 };
  const ROLE = { good: { name: 'Честный гражданин', icon: '🕊' }, bad: { name: 'Заговорщик', icon: '🐍' }, boss: { name: 'Лидер заговора', icon: '👁' } };

  function create(players) {
    const n = players.length;
    const bads = n <= 6 ? 1 : n <= 8 ? 2 : 3;
    const order = SG.shuffle(players.map((p) => p.id));
    const s = {
      ids: players.map((p) => p.id), names: {}, role: {}, alive: {}, n,
      deck: SG.shuffle([...Array(6).fill('B'), ...Array(11).fill('R')]), discard: [],
      blue: 0, red: 0, tracker: 0, pres: Math.floor(Math.random() * n), nominee: null, chancellor: null,
      lastGov: [], phase: 'nominate', votes: {}, hand: [], log: [], now: Date.now(), known: {}, peek: null, power: null, winner: null,
    };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.alive[p.id] = true;
      s.role[p.id] = 'good';
    });
    s.role[order[0]] = 'boss';
    for (let k = 1; k <= bads; k++) s.role[order[k]] = 'bad';
    s.deadline = s.now + T.nominate * 1000;
    say(s, 'Президент — ' + s.names[s.ids[s.pres]] + '. Он выбирает канцлера.');
    return s;
  }

  const say = (s, t, o) => {
    SG.party.log(s, t, o);
  };
  const presId = (s) => s.ids[s.pres];
  const alive = (s) => s.ids.filter((x) => s.alive[x]);

  function draw(s, k) {
    if (s.deck.length < k) {
      s.deck = SG.shuffle(s.deck.concat(s.discard));
      s.discard = [];
    }
    return s.deck.splice(0, k);
  }

  function canChancellor(s, x) {
    if (!s.alive[x] || x === presId(s)) return false;
    // нельзя подряд тем же, кто был в прошлом правительстве (при 5 живых — только прошлый канцлер)
    if (s.lastGov[1] === x) return false;
    if (alive(s).length > 5 && s.lastGov[0] === x) return false;
    return true;
  }

  function nextPres(s, now) {
    do s.pres = (s.pres + 1) % s.n;
    while (!s.alive[presId(s)]);
    s.phase = 'nominate';
    s.nominee = null;
    s.votes = {};
    s.deadline = now + T.nominate * 1000;
  }

  function enact(s, card, now, chaos) {
    if (card === 'B') s.blue++;
    else s.red++;
    say(s, (chaos ? 'Хаос! Принят верхний закон: ' : 'Принят закон: ') + (card === 'B' ? '🕊 честный' : '🐍 заговорщицкий') + ' (🕊 ' + s.blue + '/5 · 🐍 ' + s.red + '/6)');
    s.tracker = 0;
    if (s.blue >= 5) return end(s, 'good', 'Пять честных законов — заговор раскрыт!');
    if (s.red >= 6) return end(s, 'bad', 'Шесть заговорщицких законов — власть у заговора.');
    if (chaos) {
      s.lastGov = [];
      return nextPres(s, now);
    }
    // особые полномочия президента за заговорщицкие законы
    if (card === 'R') {
      const p = powerFor(s, s.red);
      if (p) {
        s.phase = 'power';
        s.power = p;
        s.deadline = now + T.power * 1000;
        if (p === 'peek') s.peek = s.deck.length >= 3 ? s.deck.slice(0, 3) : draw(s, 3).concat([]);
        return;
      }
    }
    nextPres(s, now);
  }

  function powerFor(s, red) {
    if (red === 2 && s.n >= 7) return 'investigate';
    if (red === 3) return 'peek';
    if (red === 4 || red === 5) return 'kill';
    return null;
  }

  function end(s, w, why) {
    s.phase = 'end';
    s.winner = w;
    say(s, '🏁 ' + why);
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || !s.alive[id]) return false;
    if (s.phase === 'nominate' && id === presId(s) && a.nominate !== undefined) {
      if (!canChancellor(s, a.nominate)) return false;
      s.nominee = a.nominate;
      s.phase = 'vote';
      s.votes = {};
      s.deadline = now + T.vote * 1000;
      return true;
    }
    if (s.phase === 'vote' && (a.vote === true || a.vote === false)) {
      s.votes[id] = a.vote;
      if (alive(s).every((x) => s.votes[x] !== undefined)) closeVote(s, now);
      return true;
    }
    if (s.phase === 'pres' && id === presId(s) && Number.isInteger(a.drop) && s.hand[a.drop]) {
      s.discard.push(s.hand.splice(a.drop, 1)[0]);
      s.phase = 'chan';
      s.deadline = now + T.chan * 1000;
      return true;
    }
    if (s.phase === 'chan' && id === s.chancellor && Number.isInteger(a.pass) && s.hand[a.pass]) {
      const card = s.hand.splice(a.pass, 1)[0];
      s.discard.push(...s.hand);
      s.hand = [];
      enact(s, card, now, false);
      return true;
    }
    if (s.phase === 'power' && id === presId(s)) {
      if (s.power === 'peek' && a.ok) {
        s.peek = null;
        nextPres(s, now);
        return true;
      }
      const t = a.target;
      if (t === undefined || !s.alive[t] || t === id) return false;
      if (s.power === 'investigate') {
        s.known[id] = s.known[id] || {};
        s.known[id][t] = s.role[t] === 'good' ? 'good' : 'bad';
        say(s, s.names[id] + ' проверил(а) ' + s.names[t]);
      } else if (s.power === 'kill') {
        s.alive[t] = false;
        say(s, '💀 ' + s.names[id] + ' устраняет ' + s.names[t]);
        if (s.role[t] === 'boss') return end(s, 'good', 'Лидер заговора устранён!') || true;
      }
      s.power = null;
      nextPres(s, now);
      return true;
    }
    return false;
  }

  function closeVote(s, now) {
    const yes = alive(s).filter((x) => s.votes[x]).length;
    const ok = yes > alive(s).length / 2;
    s.lastVotes = { ...s.votes };
    say(s, 'Правительство ' + s.names[presId(s)] + ' + ' + s.names[s.nominee] + ': ' + (ok ? 'избрано' : 'отклонено') + ' (' + yes + ' за)');
    if (ok) {
      s.chancellor = s.nominee;
      s.lastGov = [presId(s), s.nominee];
      if (s.red >= 3 && s.role[s.nominee] === 'boss') return end(s, 'bad', 'Лидер заговора стал канцлером!');
      s.hand = draw(s, 3);
      s.phase = 'pres';
      s.deadline = now + T.pres * 1000;
    } else {
      s.tracker++;
      if (s.tracker >= 3) return enact(s, draw(s, 1)[0], now, true);
      nextPres(s, now);
    }
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    const p = presId(s);
    if (s.phase === 'nominate') return act(s, p, { nominate: alive(s).find((x) => canChancellor(s, x)) }, now);
    if (s.phase === 'vote') {
      alive(s).forEach((x) => s.votes[x] === undefined && (s.votes[x] = false));
      closeVote(s, now);
      return true;
    }
    if (s.phase === 'pres') return act(s, p, { drop: 0 }, now);
    if (s.phase === 'chan') return act(s, s.chancellor, { pass: 0 }, now);
    if (s.phase === 'power') {
      if (s.power === 'peek') return act(s, p, { ok: 1 }, now);
      return act(s, p, { target: alive(s).find((x) => x !== p) }, now);
    }
    return false;
  }

  function leave(s, id) {
    if (s.phase === 'end' || !s.alive[id]) return;
    s.alive[id] = false;
    say(s, s.names[id] + ' покинул игру');
    if (s.role[id] === 'boss') return end(s, 'good', 'Лидер заговора сбежал!');
    if (presId(s) === id) nextPres(s, s.now);
  }

  // ---------- боты ----------

  function ai(s, id, level) {
    const r = s.role[id];
    const bad = r !== 'good';
    const others = alive(s).filter((x) => x !== id);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const knownBad = (x) => (s.known[id] && s.known[id][x] === 'bad') || (bad && s.role[x] !== 'good');
    if (s.phase === 'nominate' && id === presId(s)) {
      const c = others.filter((x) => canChancellor(s, x));
      const pref = bad ? c.filter((x) => s.role[x] !== 'good' && (s.red >= 3 || level === 'easy' || Math.random() < 0.5)) : c.filter((x) => !knownBad(x));
      return { nominate: pick(pref.length ? pref : c) };
    }
    if (s.phase === 'vote' && s.votes[id] === undefined) {
      if (bad) return { vote: s.role[s.nominee] !== 'good' || s.role[presId(s)] !== 'good' || Math.random() < 0.5 };
      if (s.red >= 3 && level !== 'easy' && Math.random() < 0.3) return { vote: false };
      return { vote: !knownBad(s.nominee) && !knownBad(presId(s)) && (s.tracker >= 2 || Math.random() < 0.75) };
    }
    if (s.phase === 'pres' && id === presId(s)) {
      // сбрасываем «чужой» закон, если он есть
      const want = bad ? 'B' : 'R';
      const i = s.hand.indexOf(want);
      return { drop: i >= 0 ? i : 0 };
    }
    if (s.phase === 'chan' && id === s.chancellor) {
      const want = bad && (level !== 'easy' || Math.random() < 0.7) ? 'R' : 'B';
      const i = s.hand.indexOf(want);
      return { pass: i >= 0 ? i : 0 };
    }
    if (s.phase === 'power' && id === presId(s)) {
      if (s.power === 'peek') return { ok: 1 };
      const good = others.filter((x) => s.role[x] === 'good');
      if (bad) return { target: pick(good.length ? good : others) };
      const sus = others.filter(knownBad);
      return { target: pick(sus.length ? sus : others) };
    }
    return null;
  }

  // ---------- вид ----------

  function view(s, id) {
    const r = s.role[id];
    const over = s.phase === 'end';
    // заговорщики знают своих; лидер знает своих только в малой игре
    const seesTeam = r === 'bad' || (r === 'boss' && s.n <= 6);
    return {
      phase: s.phase,
      blue: s.blue,
      red: s.red,
      tracker: s.tracker,
      pres: presId(s),
      nominee: s.nominee,
      chancellor: s.chancellor,
      powers: [1, 2, 3, 4, 5, 6].map((k) => powerFor(s, k)),
      players: s.ids.map((pid) => ({
        id: pid, name: s.names[pid], alive: s.alive[pid],
        role: over || pid === id || (seesTeam && s.role[pid] !== 'good') ? s.role[pid] : s.known[id] && s.known[id][pid] ? (s.known[id][pid] === 'good' ? 'good' : 'bad?') : null,
        term: s.lastGov.includes(pid),
        can: s.phase === 'nominate' && canChancellor(s, pid),
      })),
      myRole: r || null,
      alive: s.alive[id],
      voted: s.ids.filter((x) => s.votes[x] !== undefined),
      myVote: s.votes[id],
      lastVotes: s.lastVotes || null,
      hand: (s.phase === 'pres' && id === presId(s)) || (s.phase === 'chan' && id === s.chancellor) ? s.hand : null,
      power: s.phase === 'power' ? s.power : null,
      peek: s.phase === 'power' && id === presId(s) ? s.peek : null,
      deck: s.deck.length,
      log: s.log.slice(-30),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over,
      winner: s.winner,
    };
  }

  // ---------- отрисовка ----------

  const law = (c, extra = '', attrs = '') => `<button type="button" class="cs-law ${c === 'B' ? 'blue' : 'red'} ${extra}" ${attrs}>${c === 'B' ? '🕊' : '🐍'}</button>`;
  const POWER = { investigate: '🔍 проверка', peek: '👀 3 закона', kill: '💀 устранение' };

  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const board =
      `<div class="cs-track blue">${[1, 2, 3, 4, 5].map((k) => `<span class="${k <= v.blue ? 'on' : ''}">${k <= v.blue ? '🕊' : ''}</span>`).join('')}</div>` +
      `<div class="cs-track red">${[1, 2, 3, 4, 5, 6].map((k, i) => `<span class="${k <= v.red ? 'on' : ''}" title="${POWER[v.powers[i]] || ''}">${k <= v.red ? '🐍' : v.powers[i] ? `<small>${POWER[v.powers[i]].split(' ')[0]}</small>` : ''}</span>`).join('')}</div>` +
      `<p class="pt-muted">Хаос: ${v.tracker}/3 · в колоде ${v.deck}</p>`;
    const role = v.myRole ? `<div class="cs-role ${v.myRole}">${ROLE[v.myRole].icon} ${ROLE[v.myRole].name}${v.alive ? '' : ' · вы выбыли'}</div>` : '';
    const list = v.players
      .map((p) => {
        const r = p.role ? (p.role === 'bad?' ? ' 🐍?' : ' ' + ROLE[p.role].icon) : '';
        const vt = v.lastVotes && v.phase !== 'vote' && v.lastVotes[p.id] !== undefined ? (v.lastVotes[p.id] ? ' 👍' : ' 👎') : v.phase === 'vote' && v.voted.includes(p.id) ? ' ✓' : '';
        return `<button type="button" class="rs-p${p.alive ? '' : ' dead'}${p.id === v.pres ? ' pres' : ''}${p.id === v.nominee ? ' nom' : ''}${p.id === me ? ' me' : ''}" data-p="${p.id}">${p.id === v.pres ? '🎩 ' : p.id === v.nominee ? '📜 ' : ''}${p.alive ? '' : '💀 '}${esc(p.name)}${r}${vt}</button>`;
      })
      .join('');
    let body = '';
    const isPres = v.pres === me;
    if (v.phase === 'nominate') body = isPres ? `<p>Вы президент: выберите канцлера (нажмите на игрока). ${timer}</p>` : `<p>Президент ${esc(ui.name(v.pres))} выбирает канцлера… ${timer}</p>`;
    else if (v.phase === 'vote') body = `<p>Правительство: 🎩 ${esc(ui.name(v.pres))} + 📜 ${esc(ui.name(v.nominee))}. ${timer}</p>` + (v.alive && !ui.watcher ? `<div class="pt-choices"><button class="btn ${v.myVote === true ? 'btn-primary' : 'btn-ghost'}" type="button" data-vote="1">👍 Да</button><button class="btn ${v.myVote === false ? 'btn-primary' : 'btn-ghost'}" type="button" data-vote="0">👎 Нет</button></div>` : '');
    else if (v.phase === 'pres') body = v.hand ? `<p>Вы вытянули три закона. Сбросьте один — два уйдут канцлеру. ${timer}</p><div class="cs-hand">${v.hand.map((c, i) => law(c, '', `data-drop="${i}"`)).join('')}</div>` : `<p>Президент выбирает законы… ${timer}</p>`;
    else if (v.phase === 'chan') body = v.hand ? `<p>Выберите закон, который будет принят. ${timer}</p><div class="cs-hand">${v.hand.map((c, i) => law(c, '', `data-pass="${i}"`)).join('')}</div>` : `<p>Канцлер ${esc(ui.name(v.chancellor))} принимает закон… ${timer}</p>`;
    else if (v.phase === 'power') {
      if (!isPres) body = `<p>Президент использует полномочие: ${POWER[v.power]}… ${timer}</p>`;
      else if (v.power === 'peek') body = `<p>Три верхних закона колоды:</p><div class="cs-hand">${(v.peek || []).map((c) => law(c, '', 'disabled')).join('')}</div><button class="btn btn-primary" type="button" data-ok>Понятно</button>`;
      else body = `<p>${v.power === 'kill' ? 'Кого устранить?' : 'Чью партийность проверить?'} Нажмите на игрока. ${timer}</p>`;
    } else if (v.over) {
      const won = v.myRole && ((v.myRole === 'good') === (v.winner === 'good'));
      body = `<p class="pt-big">${v.winner === 'good' ? '🕊 Победа честных граждан' : '🐍 Победа заговора'}</p>${v.myRole ? `<p>${won ? 'Вы победили!' : 'Вы проиграли.'}</p>` : ''}`;
    }
    el.innerHTML = `<div class="pt-panel cs">${role}<div class="cs-board">${board}</div><div class="rs-list">${list}</div>${body}</div>`;
    el.querySelectorAll('.rs-p').forEach((b) =>
      b.addEventListener('click', () => {
        const id = +b.dataset.p;
        if (v.phase === 'nominate' && isPres) ui.send({ nominate: id });
        else if (v.phase === 'power' && isPres && v.power !== 'peek') ui.send({ target: id });
      })
    );
    el.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => ui.send({ vote: b.dataset.vote === '1' })));
    el.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', () => ui.send({ drop: +b.dataset.drop })));
    el.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => ui.send({ pass: +b.dataset.pass })));
    const ok = el.querySelector('[data-ok]');
    if (ok) ok.addEventListener('click', () => ui.send({ ok: 1 }));
    const key = v.phase + v.pres + v.blue + v.red;
    if (render.key !== key) {
      render.key = key;
      if (v.hand || (v.phase === 'nominate' && isPres) || (v.phase === 'vote' && v.alive)) SG.sound.play('hint');
      if (v.over && v.myRole) {
        const won = (v.myRole === 'good') === (v.winner === 'good');
        SG.sound.play(won ? 'win' : 'lose');
        if (won) SG.store.set('conspiracy-wins', SG.store.get('conspiracy-wins', 0) + 1);
      }
    }
  }

  SG.party({ game: 'conspiracy', min: 5, max: 10, bots: true, soloBots: 4, aiForGone: true, botDelay: () => 1200 + Math.random() * 2500, create, view, act, tick, ai, leave, render });
})();
