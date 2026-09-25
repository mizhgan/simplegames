/* Мафия: город против мафии. Ночью мафия выбирает жертву, доктор лечит, комиссар проверяет; днём город голосует */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const ROLES = {
    mafia: { name: 'Мафия', icon: '🕴', text: 'Ночью вместе с другой мафией выберите жертву. Днём притворяйтесь мирным жителем.' },
    doctor: { name: 'Доктор', icon: '🩺', text: 'Каждую ночь выбирайте, кого лечить: если мафия выберет его, он выживет. Одного и того же — не две ночи подряд.' },
    sheriff: { name: 'Комиссар', icon: '🕵', text: 'Каждую ночь проверяйте одного игрока — узнаете, мафия ли он.' },
    civ: { name: 'Мирный житель', icon: '🙂', text: 'Ночью спите. Днём ищите мафию и голосуйте против неё.' },
  };
  const ROLE_TIME = 12;
  const NIGHT = 35;
  const MORNING = 7;
  const VOTE = 35;

  function composition(n) {
    const mafia = n >= 11 ? 3 : n >= 6 ? 2 : 1;
    const list = Array(mafia).fill('mafia');
    list.push('sheriff');
    if (n >= 5) list.push('doctor');
    while (list.length < n) list.push('civ');
    return list;
  }

  // ---------- правила ----------

  function create(players, opts) {
    const roles = SG.shuffle(composition(players.length));
    const s = {
      ids: players.map((p) => p.id),
      names: {},
      role: {},
      alive: {},
      phase: 'roles',
      day: 0,
      deadline: 0,
      now: Date.now(),
      talk: (opts && +opts.talk) || 90,
      night: {},
      lastHeal: null,
      checks: {},
      ready: [],
      votes: {},
      log: [],
      winner: null,
      mchat: [],
    };
    players.forEach((p, i) => {
      s.names[p.id] = p.name;
      s.role[p.id] = roles[i];
      s.alive[p.id] = true;
    });
    s.deadline = s.now + ROLE_TIME * 1000;
    return s;
  }

  const alive = (s) => s.ids.filter((id) => s.alive[id]);
  const aliveRole = (s, r) => alive(s).filter((id) => s.role[id] === r);
  const say = (s, t) => {
    s.log.push(t);
    if (s.log.length > 30) s.log.shift();
  };

  function startNight(s, now) {
    s.day++;
    s.phase = 'night';
    s.night = { kill: {}, heal: null, check: null };
    s.mchat = [];
    s.deadline = now + NIGHT * 1000;
    say(s, '🌙 Ночь ' + s.day + '. Город засыпает, просыпается мафия…');
  }

  function nightDone(s) {
    const n = s.night;
    const mafiaDone = aliveRole(s, 'mafia').every((id) => n.kill[id] !== undefined);
    const docDone = !aliveRole(s, 'doctor').length || n.heal !== null;
    const sherDone = !aliveRole(s, 'sheriff').length || n.check !== null;
    return mafiaDone && docDone && sherDone;
  }

  function endNight(s, now) {
    const n = s.night;
    // жертва — за кого больше голосов мафии (при равенстве — случайно из лидеров)
    const tally = {};
    Object.values(n.kill).forEach((t) => t !== null && (tally[t] = (tally[t] || 0) + 1));
    const max = Math.max(0, ...Object.values(tally));
    const lead = Object.keys(tally).filter((t) => tally[t] === max).map(Number);
    const victim = lead.length ? lead[Math.floor(Math.random() * lead.length)] : null;
    if (n.check !== null) {
      const sheriff = aliveRole(s, 'sheriff')[0];
      if (sheriff !== undefined) s.checks[n.check] = s.role[n.check] === 'mafia';
    }
    s.lastHeal = n.heal;
    s.phase = 'morning';
    s.deadline = now + MORNING * 1000;
    if (victim !== null && victim !== n.heal) {
      s.alive[victim] = false;
      s.morning = { victim };
      say(s, '☀ Утро. Этой ночью убит(а) ' + s.names[victim] + ' — ' + ROLES[s.role[victim]].name.toLowerCase() + '.');
    } else {
      s.morning = { victim: null, saved: victim !== null };
      say(s, '☀ Утро. Этой ночью никто не погиб' + (victim !== null ? ' — доктор успел вовремя!' : '.'));
    }
    checkWin(s);
  }

  function checkWin(s) {
    const m = aliveRole(s, 'mafia').length;
    const town = alive(s).length - m;
    if (!m) s.winner = 'town';
    else if (m >= town) s.winner = 'mafia';
    if (s.winner) {
      s.phase = 'end';
      say(s, s.winner === 'town' ? '🎉 Мафия побеждена — победа города!' : '🕴 Мафия захватила город.');
    }
  }

  function startDay(s, now) {
    s.phase = 'day';
    s.ready = [];
    s.deadline = now + s.talk * 1000;
    say(s, '💬 День ' + s.day + ': обсуждение. Кто похож на мафию?');
  }

  function startVote(s, now) {
    s.phase = 'vote';
    s.votes = {};
    s.deadline = now + VOTE * 1000;
  }

  function endVote(s, now) {
    const tally = {};
    Object.values(s.votes).forEach((t) => t !== null && (tally[t] = (tally[t] || 0) + 1));
    const max = Math.max(0, ...Object.values(tally));
    const lead = Object.keys(tally).filter((t) => tally[t] === max).map(Number);
    if (lead.length === 1 && max >= 2) {
      const out = lead[0];
      s.alive[out] = false;
      say(s, '⚖ Город изгнал ' + s.names[out] + ' (' + max + ' гол.) — ' + ROLES[s.role[out]].name.toLowerCase() + '.');
    } else say(s, '⚖ Город не договорился — никто не изгнан.');
    s.lastVote = { ...s.votes };
    checkWin(s);
    if (!s.winner) startNight(s, now);
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end') return false;
    const me = s.role[id];
    const live = s.alive[id];
    if (a.ok && s.phase === 'roles') {
      if (!s.ready.includes(id)) s.ready.push(id);
      if (s.ready.length >= s.ids.length) startNight(s, now);
      return true;
    }
    if (!live) return false;
    const target = a.t;
    const valid = (t) => t === null || (s.ids.includes(t) && s.alive[t]);
    if (s.phase === 'night') {
      if (a.kill !== undefined && me === 'mafia' && valid(a.kill) && (a.kill === null || s.role[a.kill] !== 'mafia')) s.night.kill[id] = a.kill;
      else if (a.heal !== undefined && me === 'doctor' && valid(a.heal) && a.heal !== null && a.heal !== s.lastHeal) s.night.heal = a.heal;
      else if (a.check !== undefined && me === 'sheriff' && valid(a.check) && a.check !== null && a.check !== id && s.checks[a.check] === undefined) s.night.check = a.check;
      else if (a.say && me === 'mafia') {
        s.mchat.push({ id, text: String(a.say).slice(0, 120) });
        if (s.mchat.length > 20) s.mchat.shift();
        return true;
      } else return false;
      if (nightDone(s)) s.deadline = Math.min(s.deadline, now + 1500);
      return true;
    }
    if (s.phase === 'day' && a.ready) {
      if (!s.ready.includes(id)) s.ready.push(id);
      if (s.ready.length > alive(s).length / 2) startVote(s, now);
      return true;
    }
    if (s.phase === 'vote' && a.vote !== undefined && valid(a.vote) && a.vote !== id) {
      s.votes[id] = a.vote;
      if (alive(s).every((x) => s.votes[x] !== undefined)) s.deadline = Math.min(s.deadline, now + 1500);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'roles') startNight(s, now);
    else if (s.phase === 'night') endNight(s, now);
    else if (s.phase === 'morning') startDay(s, now);
    else if (s.phase === 'day') startVote(s, now);
    else if (s.phase === 'vote') endVote(s, now);
    return true;
  }

  // мёртвые молчат, ночью общий чат спит
  function chat(s, id) {
    if (s.phase === 'end' || s.phase === 'roles') return undefined;
    if (!s.alive[id]) return false;
    if (s.phase === 'night') return false;
    return undefined;
  }

  function leave(s, id) {
    if (s.phase === 'end' || !s.alive[id]) return;
    s.alive[id] = false;
    say(s, s.names[id] + ' покинул город — ' + ROLES[s.role[id]].name.toLowerCase() + '.');
    checkWin(s);
  }

  // ---------- боты ----------

  function ai(s, id) {
    const me = s.role[id];
    const others = alive(s).filter((x) => x !== id);
    const pick = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
    if (s.phase === 'roles') return s.ready.includes(id) ? null : { ok: 1 };
    if (!s.alive[id]) return null;
    if (s.phase === 'night') {
      if (me === 'mafia' && s.night.kill[id] === undefined) {
        // поддерживаем выбор напарника, если он уже есть
        const mate = Object.values(s.night.kill).find((t) => t !== null);
        return { kill: mate !== undefined ? mate : pick(others.filter((x) => s.role[x] !== 'mafia')) };
      }
      if (me === 'doctor' && s.night.heal === null) return { heal: pick(alive(s).filter((x) => x !== s.lastHeal)) };
      if (me === 'sheriff' && s.night.check === null) {
        const t = pick(others.filter((x) => s.checks[x] === undefined));
        return t === null ? null : { check: t };
      }
      return null;
    }
    if (s.phase === 'day') return s.ready.includes(id) ? null : { ready: 1 };
    if (s.phase === 'vote' && s.votes[id] === undefined) {
      if (me === 'mafia') return { vote: pick(others.filter((x) => s.role[x] !== 'mafia')) };
      // комиссар знает мафию — голосует против неё
      if (me === 'sheriff') {
        const found = others.find((x) => s.checks[x] === true);
        if (found !== undefined) return { vote: found };
      }
      // остальные идут за большинством или голосуют наугад
      const tally = {};
      Object.values(s.votes).forEach((t) => t !== null && t !== id && (tally[t] = (tally[t] || 0) + 1));
      const lead = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      if (lead !== undefined && Math.random() < 0.4) return { vote: +lead };
      const cleared = others.filter((x) => !(me === 'sheriff' && s.checks[x] === false));
      return { vote: Math.random() < 0.15 ? null : pick(cleared) };
    }
    return null;
  }

  // ---------- вид ----------

  function view(s, id) {
    const me = s.role[id];
    const dead = id !== -1 && s.alive[id] === false;
    const seeAll = s.phase === 'end' || dead;
    const v = {
      phase: s.phase,
      day: s.day,
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      log: s.log.slice(-8),
      me: me ? { role: me, alive: s.alive[id] } : null,
      players: s.ids.map((pid) => {
        let role = null;
        // свою роль не пишем в списке — она на карточке, которую можно прикрыть
        if (seeAll || !s.alive[pid]) role = s.role[pid];
        else if (me === 'mafia' && s.role[pid] === 'mafia' && pid !== id) role = 'mafia';
        const p = { id: pid, name: s.names[pid], alive: s.alive[pid], role };
        if (me === 'sheriff' && s.checks[pid] !== undefined) p.checked = s.checks[pid];
        if (s.phase === 'vote') p.votes = Object.values(s.votes).filter((t) => t === pid).length;
        return p;
      }),
      ready: s.ready.length,
      aliveN: alive(s).length,
      winner: s.winner,
      over: s.phase === 'end',
      talk: s.talk,
    };
    if (s.phase === 'vote') v.votes = s.votes;
    if (s.phase === 'day' || s.phase === 'roles') v.iReady = s.ready.includes(id);
    if (s.phase === 'night' && s.alive[id]) {
      if (me === 'mafia') {
        v.kill = s.night.kill;
        v.mchat = s.mchat.map((m) => ({ name: s.names[m.id], text: m.text }));
      }
      if (me === 'doctor') {
        v.heal = s.night.heal;
        v.lastHeal = s.lastHeal;
      }
      if (me === 'sheriff') v.check = s.night.check;
    }
    return v;
  }

  // ---------- отрисовка ----------

  let showRole = false;
  function render(v, ui) {
    const el = ui.el;
    const me = v.me;
    const R = (r) => ROLES[r];
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    let head = '';
    let body = '';
    const myCard = me
      ? `<button type="button" class="mf-card ${showRole || v.phase === 'roles' ? 'open' : ''}" data-flip><span class="mf-icon">${showRole || v.phase === 'roles' ? R(me.role).icon : '🂠'}</span><b>${showRole || v.phase === 'roles' ? R(me.role).name : 'Ваша роль'}</b><small>${showRole || v.phase === 'roles' ? R(me.role).text : 'нажмите, чтобы подсмотреть'}</small></button>`
      : '';
    const playerBtns = (filter, act, selected, extra) =>
      `<div class="pt-choices mf-targets">${v.players
        .filter(filter)
        .map((p) => `<button type="button" class="btn btn-ghost ${selected === p.id ? 'sel' : ''}" data-${act}="${p.id}">${esc(p.name)}${extra ? extra(p) : ''}</button>`)
        .join('')}</div>`;
    const living = (p) => p.alive;
    if (v.phase === 'roles') {
      head = `Раздача ролей ${timer}`;
      body = me ? `<p>Запомните свою роль и никому её не показывайте.</p>${v.iReady ? '<p class="pt-muted">Ждём остальных…</p>' : '<button class="btn btn-primary" type="button" data-ok>Понятно</button>'}` : '<p>Игроки смотрят свои роли.</p>';
    } else if (v.phase === 'night') {
      head = `🌙 Ночь ${v.day} ${timer}`;
      if (!me || !me.alive) body = '<p>Город спит. Ночные роли делают свой выбор…</p>';
      else if (me.role === 'mafia') {
        const mine = v.kill[ui.me];
        body =
          `<p>Выберите жертву вместе с напарниками:</p>` +
          playerBtns((p) => living(p) && p.role !== 'mafia', 'kill', mine, (p) => {
            const n = Object.values(v.kill).filter((t) => t === p.id).length;
            return n ? ' · ' + '🔪'.repeat(n) : '';
          }) +
          `<div class="mf-mchat">${(v.mchat || []).map((m) => `<p><b>${esc(m.name)}:</b> ${esc(m.text)}</p>`).join('') || '<p class="pt-muted">Шёпот мафии — видят только свои.</p>'}</div>` +
          `<form class="mf-say"><input type="text" maxlength="120" placeholder="Шепнуть мафии…"><button class="btn btn-ghost" type="submit">➤</button></form>`;
      } else if (me.role === 'doctor') body = `<p>Кого лечить этой ночью?</p>` + playerBtns((p) => living(p) && p.id !== v.lastHeal, 'heal', v.heal);
      else if (me.role === 'sheriff') body = `<p>Кого проверить?</p>` + playerBtns((p) => living(p) && p.id !== ui.me && p.checked === undefined, 'check', v.check);
      else body = '<p>Вы спите. Ночью общий чат молчит.</p>';
    } else if (v.phase === 'morning') {
      head = '☀ Утро';
      body = `<p class="pt-big">${esc(v.log[v.log.length - 1].replace('☀ Утро. ', ''))}</p>`;
    } else if (v.phase === 'day') {
      head = `💬 День ${v.day} — обсуждение ${timer}`;
      body =
        '<p>Обсуждайте в чате: кто вёл себя подозрительно?</p>' +
        (me && me.alive ? (v.iReady ? `<p class="pt-muted">Вы готовы голосовать (${v.ready} из ${v.aliveN}).</p>` : `<button class="btn btn-primary" type="button" data-ready>К голосованию (${v.ready} из ${v.aliveN})</button>`) : '');
    } else if (v.phase === 'vote') {
      head = `⚖ Голосование ${timer}`;
      const mine = v.votes[ui.me];
      body =
        (me && me.alive ? '<p>Кого изгнать из города? Нужно хотя бы 2 голоса и больше, чем у других.</p>' + playerBtns((p) => living(p) && p.id !== ui.me, 'vote', mine, (p) => (p.votes ? ' · ' + p.votes : '')) + `<button class="btn btn-ghost ${mine === null ? 'sel' : ''}" type="button" data-vote="null">Воздержаться</button>` : '<p>Город голосует…</p>') +
        `<div class="mf-votes">${Object.entries(v.votes)
          .map(([f, t]) => `<span>${esc(ui.name(+f))} → ${t === null ? 'воздержался' : esc(ui.name(t))}</span>`)
          .join('')}</div>`;
    } else if (v.over) {
      head = v.winner === 'town' ? '🎉 Победа города' : '🕴 Победа мафии';
      const mine = me && ((me.role === 'mafia') === (v.winner === 'mafia'));
      body = me ? `<p class="pt-big">${mine ? 'Вы победили!' : 'Вы проиграли.'}</p>` : '';
    }
    const list = v.players
      .map((p) => `<li class="${p.alive ? '' : 'dead'}${p.id === ui.me ? ' me' : ''}"><span>${p.alive ? '' : '💀 '}${esc(p.name)}</span>${p.role ? `<em>${R(p.role).icon} ${R(p.role).name}</em>` : ''}${p.checked !== undefined ? `<em class="${p.checked ? 'bad' : 'good'}">${p.checked ? 'мафия!' : 'чист'}</em>` : ''}</li>`)
      .join('');
    el.innerHTML =
      `<div class="pt-panel mf ${v.phase === 'night' ? 'night' : ''}"><h3>${head}</h3>${myCard}${body}` +
      `<ul class="mf-list">${list}</ul><div class="mf-log">${v.log.slice(-5).map((x) => `<p>${esc(x)}</p>`).join('')}</div></div>`;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', fn));
    on('[data-flip]', () => {
      showRole = !showRole;
      render(v, ui);
    });
    on('[data-ok]', () => ui.send({ ok: 1 }));
    on('[data-ready]', () => ui.send({ ready: 1 }));
    el.querySelectorAll('[data-kill]').forEach((b) => b.addEventListener('click', () => ui.send({ kill: +b.dataset.kill })));
    el.querySelectorAll('[data-heal]').forEach((b) => b.addEventListener('click', () => ui.send({ heal: +b.dataset.heal })));
    el.querySelectorAll('[data-check]').forEach((b) => b.addEventListener('click', () => ui.send({ check: +b.dataset.check })));
    el.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => ui.send({ vote: b.dataset.vote === 'null' ? null : +b.dataset.vote })));
    const f = el.querySelector('.mf-say');
    if (f)
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const i = f.querySelector('input');
        if (i.value.trim()) ui.send({ say: i.value.trim() });
        i.value = '';
      });
    if (render.phase !== v.phase + v.day) {
      render.phase = v.phase + v.day;
      if (v.phase === 'night') SG.sound.play('drop');
      if (v.phase === 'morning') SG.sound.play(v.log.length && /убит/.test(v.log[v.log.length - 1]) ? 'explode' : 'match');
      if (v.over && me) {
        const won = (me.role === 'mafia') === (v.winner === 'mafia');
        SG.sound.play(won ? 'win' : 'lose');
        if (won) SG.store.set('mafia-wins', SG.store.get('mafia-wins', 0) + 1);
      }
    }
  }

  SG.party({
    game: 'mafia',
    min: 4,
    max: 12,
    bots: true,
    soloBots: 5,
    chatSolo: true,
    botNames: ['Бот Дон', 'Бот Сэм', 'Бот Люси', 'Бот Тони', 'Бот Мия', 'Бот Лео', 'Бот Ника', 'Бот Вито', 'Бот Роза', 'Бот Карл', 'Бот Эмма'],
    botDelay: () => 1500 + Math.random() * 3500,
    options: {
      html: '<label>Время на обсуждение <select data-talk><option value="60">1 минута</option><option value="90" selected>1,5 минуты</option><option value="120">2 минуты</option><option value="180">3 минуты</option></select></label><p class="pt-muted" data-comp></p>',
      read(el) {
        const t = el.querySelector('[data-talk]');
        return { talk: t ? +t.value : 90 };
      },
      show(el, o) {
        if (o && o.talk) el.querySelector('[data-talk]').value = String(o.talk);
      },
    },
    create,
    view,
    act,
    tick,
    ai,
    chat,
    leave,
    render,
  });
  window.__mafia = { composition };
})();
