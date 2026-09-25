/* Сопротивление: среди повстанцев прячутся шпионы. Лидер собирает команду, все голосуют, команда тайно проваливает или выполняет миссию */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const SPIES = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
  const SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
  const T = { pick: 90, vote: 45, mission: 45, reveal: 6 };

  function create(players) {
    const n = players.length;
    const spies = SG.shuffle(players.map((p) => p.id)).slice(0, SPIES[n]);
    const s = { ids: players.map((p) => p.id), names: {}, spy: {}, n, leader: Math.floor(Math.random() * n), mission: 0, results: [], rejects: 0, phase: 'pick', team: [], votes: {}, cards: {}, log: [], now: Date.now(), history: [] };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.spy[p.id] = spies.includes(p.id);
    });
    s.deadline = s.now + T.pick * 1000;
    return s;
  }

  const say = (s, t) => {
    s.log.push(t);
    if (s.log.length > 10) s.log.shift();
  };
  const size = (s) => SIZES[s.n][s.mission];
  const needFails = (s) => (s.n >= 7 && s.mission === 3 ? 2 : 1);
  const leaderId = (s) => s.ids[s.leader];
  const wins = (s, r) => s.results.filter((x) => x === r).length;

  function nextLeader(s, now) {
    s.leader = (s.leader + 1) % s.n;
    s.phase = 'pick';
    s.team = [];
    s.votes = {};
    s.deadline = now + T.pick * 1000;
  }

  function checkEnd(s) {
    if (wins(s, 'ok') >= 3) s.winner = 'res';
    else if (wins(s, 'fail') >= 3) s.winner = 'spy';
    else if (s.rejects >= 5) {
      s.winner = 'spy';
      say(s, 'Пять команд подряд отклонены — город в хаосе, шпионы победили.');
    }
    if (s.winner) s.phase = 'end';
    return !!s.winner;
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || s.names[id] === undefined) return false;
    if (s.phase === 'pick' && id === leaderId(s) && Array.isArray(a.team)) {
      const team = [...new Set(a.team)].filter((x) => s.names[x] !== undefined);
      if (team.length !== size(s)) return false;
      s.team = team;
      s.phase = 'vote';
      s.votes = {};
      s.deadline = now + T.vote * 1000;
      return true;
    }
    if (s.phase === 'vote' && (a.vote === true || a.vote === false)) {
      s.votes[id] = a.vote;
      if (s.ids.every((x) => s.votes[x] !== undefined)) closeVote(s, now);
      return true;
    }
    if (s.phase === 'mission' && s.team.includes(id) && (a.card === 'ok' || a.card === 'fail') && s.cards[id] === undefined) {
      // повстанец не может провалить миссию
      s.cards[id] = s.spy[id] ? a.card : 'ok';
      if (s.team.every((x) => s.cards[x])) closeMission(s, now);
      return true;
    }
    return false;
  }

  function closeVote(s, now) {
    const yes = s.ids.filter((x) => s.votes[x]).length;
    const ok = yes > s.n / 2;
    s.lastVote = { team: s.team.slice(), votes: { ...s.votes }, ok };
    say(s, 'Команда ' + s.team.map((x) => s.names[x]).join(', ') + ': ' + (ok ? 'одобрена' : 'отклонена') + ' (' + yes + ' за)');
    if (ok) {
      s.rejects = 0;
      s.phase = 'mission';
      s.cards = {};
      s.deadline = now + T.mission * 1000;
    } else {
      s.rejects++;
      if (!checkEnd(s)) nextLeader(s, now);
    }
  }

  function closeMission(s, now) {
    const fails = s.team.filter((x) => s.cards[x] === 'fail').length;
    const res = fails >= needFails(s) ? 'fail' : 'ok';
    s.results.push(res);
    s.history.push({ team: s.team.slice(), fails });
    say(s, 'Миссия ' + (s.mission + 1) + ': ' + (res === 'ok' ? '✅ выполнена' : '❌ провалена') + (fails ? ' (карт провала: ' + fails + ')' : ''));
    s.mission++;
    s.phase = 'reveal';
    s.deadline = now + T.reveal * 1000;
    checkEnd(s);
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'pick') {
      // лидер не успел — команда случайно, с ним самим
      const others = SG.shuffle(s.ids.filter((x) => x !== leaderId(s)));
      return act(s, leaderId(s), { team: [leaderId(s), ...others].slice(0, size(s)) }, now);
    }
    if (s.phase === 'vote') {
      s.ids.forEach((x) => s.votes[x] === undefined && (s.votes[x] = true));
      closeVote(s, now);
      return true;
    }
    if (s.phase === 'mission') {
      s.team.forEach((x) => s.cards[x] === undefined && (s.cards[x] = 'ok'));
      closeMission(s, now);
      return true;
    }
    if (s.phase === 'reveal') {
      nextLeader(s, now);
      return true;
    }
    return false;
  }

  // ---------- боты ----------

  // подозрительность: сколько раз игрок был в проваленных миссиях
  function suspicion(s, x) {
    return s.history.reduce((a, h) => a + (h.fails && h.team.includes(x) ? h.fails / h.team.length : 0), 0);
  }

  function ai(s, id, level) {
    const spy = s.spy[id];
    if (s.phase === 'pick' && id === leaderId(s)) {
      const others = s.ids.filter((x) => x !== id);
      let order;
      if (spy) order = SG.shuffle(others.filter((x) => !s.spy[x]));
      else order = others.slice().sort((a, b) => suspicion(s, a) - suspicion(s, b) + (Math.random() - 0.5) * (level === 'easy' ? 3 : 0.3));
      return { team: [id, ...order].slice(0, size(s)) };
    }
    if (s.phase === 'vote' && s.votes[id] === undefined) {
      if (s.rejects >= 3) return { vote: !spy || s.team.some((x) => s.spy[x]) };
      if (spy) return { vote: s.team.some((x) => s.spy[x]) || Math.random() < 0.3 };
      // против, если в команде есть кто-то из проваленных миссий
      const worst = Math.max(0, ...s.team.filter((x) => x !== id).map((x) => suspicion(s, x)));
      const limit = level === 'hard' ? 0.3 : 0.45;
      return { vote: worst < limit || Math.random() < (level === 'easy' ? 0.4 : 0.1) };
    }
    if (s.phase === 'mission' && s.team.includes(id) && s.cards[id] === undefined) {
      if (!spy) return { card: 'ok' };
      // шпионы не проваливают вдвоём без нужды и иногда маскируются в первой миссии
      const mates = s.team.filter((x) => s.spy[x]);
      const first = mates[0] === id;
      if (needFails(s) === 1 && !first) return { card: 'ok' };
      if (s.mission === 0 && level !== 'easy' && Math.random() < 0.5) return { card: 'ok' };
      return { card: 'fail' };
    }
    return null;
  }

  // ---------- вид ----------

  function view(s, id) {
    const spy = s.spy[id];
    const over = s.phase === 'end';
    return {
      phase: s.phase,
      mission: s.mission,
      sizes: SIZES[s.n],
      twoFails: s.n >= 7,
      results: s.results,
      rejects: s.rejects,
      leader: leaderId(s),
      team: s.team,
      size: s.phase === 'pick' || s.phase === 'vote' || s.phase === 'mission' ? size(s) : 0,
      voted: s.ids.filter((x) => s.votes[x] !== undefined),
      myVote: s.votes[id],
      lastVote: s.lastVote || null,
      played: s.team.filter((x) => s.cards[x]),
      myCard: s.cards[id],
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], spy: over || (spy && s.spy[pid]) ? s.spy[pid] : null })),
      mySpy: s.names[id] !== undefined ? spy : null,
      log: s.log.slice(-6),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over,
      winner: s.winner || null,
    };
  }

  // ---------- отрисовка ----------

  let pick = [];
  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const track = v.sizes.map((n, i) => `<div class="rs-m ${v.results[i] || ''}${i === v.mission && !v.over ? ' cur' : ''}"><b>${n}</b>${v.twoFails && i === 3 ? '<small>2 провала</small>' : ''}</div>`).join('');
    const role = v.mySpy === null ? '' : `<div class="rs-role ${v.mySpy ? 'spy' : ''}">${v.mySpy ? '🕶 Вы — шпион' : '✊ Вы — повстанец'}</div>`;
    const list = v.players
      .map((p) => {
        const inTeam = v.team.includes(p.id);
        const sel = v.phase === 'pick' && pick.includes(p.id);
        const lv = v.lastVote && v.phase !== 'vote' ? (v.lastVote.votes[p.id] ? '👍' : '👎') : '';
        return `<button type="button" class="rs-p${p.id === v.leader ? ' leader' : ''}${inTeam || sel ? ' team' : ''}${p.spy ? ' spy' : ''}${p.id === me ? ' me' : ''}" data-p="${p.id}">${p.id === v.leader ? '👑 ' : ''}${esc(p.name)}${p.spy ? ' 🕶' : ''}${v.phase === 'vote' && v.voted.includes(p.id) ? ' ✓' : ''}${lv ? ' ' + lv : ''}</button>`;
      })
      .join('');
    let body = '';
    if (v.phase === 'pick') {
      if (v.leader === me) body = `<p>Вы лидер: выберите ${v.size} игроков для миссии ${v.mission + 1} (можно себя). ${timer}</p><button class="btn btn-primary" type="button" data-send ${pick.length === v.size ? '' : 'disabled'}>Предложить команду (${pick.length}/${v.size})</button>`;
      else body = `<p>Лидер ${esc(ui.name(v.leader))} собирает команду из ${v.size}. ${timer}</p>`;
    } else if (v.phase === 'vote') {
      body = `<p>Одобрить команду для миссии ${v.mission + 1}? ${timer}</p>` + (ui.watcher ? '' : `<div class="pt-choices"><button class="btn ${v.myVote === true ? 'btn-primary' : 'btn-ghost'}" type="button" data-vote="1">👍 За</button><button class="btn ${v.myVote === false ? 'btn-primary' : 'btn-ghost'}" type="button" data-vote="0">👎 Против</button></div>`) + `<p class="pt-muted">Проголосовали ${v.voted.length} из ${v.players.length}. Отклонено подряд: ${v.rejects} из 5.</p>`;
    } else if (v.phase === 'mission') {
      const inTeam = v.team.includes(me);
      body = `<p>Команда на задании… ${timer}</p>` + (inTeam && !v.myCard ? `<div class="pt-choices"><button class="btn btn-primary" type="button" data-card="ok">✅ Выполнить</button>${v.mySpy ? '<button class="btn btn-ghost rs-fail" type="button" data-card="fail">❌ Провалить</button>' : ''}</div>` : inTeam ? '<p class="pt-muted">Карта сыграна.</p>' : '') + `<p class="pt-muted">Сыграли карты: ${v.played.length} из ${v.team.length}</p>`;
    } else if (v.phase === 'reveal') body = `<p class="pt-big">${esc(v.log[v.log.length - 1])}</p>`;
    else if (v.over) {
      const mine = v.mySpy === null ? null : v.mySpy === (v.winner === 'spy');
      body = `<p class="pt-big">${v.winner === 'spy' ? '🕶 Победа шпионов' : '✊ Победа Сопротивления'}</p>${mine === null ? '' : `<p>${mine ? 'Вы победили!' : 'Вы проиграли.'}</p>`}`;
    }
    el.innerHTML = `<div class="pt-panel rs">${role}<div class="rs-track">${track}</div><div class="rs-list">${list}</div>${body}<div class="mm-log">${v.log.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>`;
    el.querySelectorAll('.rs-p').forEach((b) =>
      b.addEventListener('click', () => {
        if (v.phase !== 'pick' || v.leader !== me) return;
        const id = +b.dataset.p;
        if (pick.includes(id)) pick = pick.filter((x) => x !== id);
        else if (pick.length < v.size) pick.push(id);
        render(v, ui);
      })
    );
    const snd = el.querySelector('[data-send]');
    if (snd)
      snd.addEventListener('click', () => {
        ui.send({ team: pick });
        pick = [];
      });
    el.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => ui.send({ vote: b.dataset.vote === '1' })));
    el.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => ui.send({ card: b.dataset.card })));
    if (v.phase !== 'pick') pick = [];
    const key = v.phase + v.mission + v.leader;
    if (render.key !== key) {
      render.key = key;
      if ((v.phase === 'pick' && v.leader === me) || v.phase === 'vote' || (v.phase === 'mission' && v.team.includes(me))) SG.sound.play('hint');
      if (v.over && v.mySpy !== null) {
        const won = v.mySpy === (v.winner === 'spy');
        SG.sound.play(won ? 'win' : 'lose');
        if (won) SG.store.set('resistance-wins', SG.store.get('resistance-wins', 0) + 1);
      }
    }
  }

  SG.party({
    game: 'resistance',
    min: 5,
    max: 10,
    bots: true,
    soloBots: 4,
    aiForGone: true,
    botDelay: () => 1200 + Math.random() * 2500,
    create,
    view,
    act,
    tick,
    ai,
    render,
  });
})();
