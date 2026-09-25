/* Шпион: все знают место, кроме шпиона. Задавайте вопросы и вычислите чужака, пока он не догадался, где вы */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const PLACES = {
    'Больница': ['Врач', 'Медсестра', 'Пациент', 'Хирург', 'Посетитель', 'Санитар'],
    'Школа': ['Учитель', 'Ученик', 'Директор', 'Охранник', 'Повар столовой', 'Завхоз'],
    'Самолёт': ['Пилот', 'Стюардесса', 'Пассажир бизнес-класса', 'Пассажир эконома', 'Бортмеханик', 'Турист'],
    'Пляж': ['Спасатель', 'Продавец кукурузы', 'Турист', 'Серфер', 'Фотограф', 'Ребёнок с ведёрком'],
    'Цирк': ['Клоун', 'Акробат', 'Дрессировщик', 'Фокусник', 'Зритель', 'Жонглёр'],
    'Космическая станция': ['Командир', 'Инженер', 'Учёный', 'Космический турист', 'Врач', 'Пилот'],
    'Подводная лодка': ['Капитан', 'Штурман', 'Кок', 'Акустик', 'Механик', 'Матрос'],
    'Театр': ['Актёр', 'Режиссёр', 'Суфлёр', 'Гардеробщица', 'Зритель', 'Осветитель'],
    'Банк': ['Кассир', 'Охранник', 'Управляющий', 'Клиент', 'Инкассатор', 'Консультант'],
    'Ресторан': ['Шеф-повар', 'Официант', 'Посетитель', 'Сомелье', 'Музыкант', 'Критик'],
    'Супермаркет': ['Кассир', 'Покупатель', 'Охранник', 'Грузчик', 'Мерчендайзер', 'Директор'],
    'Полицейский участок': ['Детектив', 'Дежурный', 'Задержанный', 'Адвокат', 'Журналист', 'Стажёр'],
    'Поезд': ['Проводник', 'Машинист', 'Пассажир', 'Продавец чая', 'Контролёр', 'Студент'],
    'Пиратский корабль': ['Капитан', 'Юнга', 'Кок', 'Пленник', 'Боцман', 'Попугай'],
    'Воинская часть': ['Генерал', 'Рядовой', 'Повар', 'Медик', 'Связист', 'Часовой'],
    'Киностудия': ['Режиссёр', 'Каскадёр', 'Оператор', 'Звезда', 'Гримёр', 'Сценарист'],
    'Отель': ['Портье', 'Горничная', 'Гость', 'Швейцар', 'Управляющий', 'Бармен'],
    'Университет': ['Профессор', 'Студент', 'Ректор', 'Аспирант', 'Библиотекарь', 'Лаборант'],
    'Посольство': ['Посол', 'Охранник', 'Секретарь', 'Турист', 'Дипломат', 'Переводчик'],
    'Спа-салон': ['Массажист', 'Клиент', 'Косметолог', 'Администратор', 'Банщик', 'Стилист'],
    'Зоопарк': ['Смотритель', 'Ветеринар', 'Посетитель', 'Фотограф', 'Продавец мороженого', 'Экскурсовод'],
    'Казино': ['Крупье', 'Игрок', 'Охранник', 'Бармен', 'Менеджер', 'Шулер'],
    'Стадион': ['Футболист', 'Болельщик', 'Судья', 'Тренер', 'Комментатор', 'Продавец хот-догов'],
    'Свадьба': ['Жених', 'Невеста', 'Тамада', 'Фотограф', 'Гость', 'Тёща'],
    'Музей': ['Экскурсовод', 'Смотритель', 'Реставратор', 'Посетитель', 'Директор', 'Школьник'],
    'Полярная станция': ['Начальник', 'Метеоролог', 'Геолог', 'Повар', 'Радист', 'Врач'],
  };
  const PLACE_NAMES = Object.keys(PLACES);
  const VOTE_TIME = 30;

  // ---------- правила ----------

  function create(players, opts) {
    const place = PLACE_NAMES[Math.floor(Math.random() * PLACE_NAMES.length)];
    const roles = SG.shuffle(PLACES[place].slice());
    const spy = players[Math.floor(Math.random() * players.length)].id;
    const s = { ids: players.map((p) => p.id), names: {}, role: {}, place, spy, phase: 'play', asker: null, accused: [], vote: null, now: Date.now(), result: null, time: (opts && +opts.time) || 420, final: {} };
    players.forEach((p, i) => {
      s.names[p.id] = p.name;
      s.role[p.id] = p.id === spy ? null : roles[i % roles.length];
    });
    s.asker = s.ids[Math.floor(Math.random() * s.ids.length)];
    s.deadline = s.now + s.time * 1000;
    return s;
  }

  function end(s, winner, why) {
    s.phase = 'end';
    s.result = { winner, why };
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || !s.names[id]) return false;
    if (s.phase === 'play') {
      if (a.ask !== undefined && id === s.asker && a.ask !== id && s.names[a.ask] !== undefined) {
        s.asker = a.ask;
        s.lastAsk = { from: id, to: a.ask };
        return true;
      }
      // обвинение: каждый — не больше одного раза за партию
      if (a.accuse !== undefined && !s.accused.includes(id) && a.accuse !== id && s.names[a.accuse] !== undefined) {
        s.accused.push(id);
        s.phase = 'vote';
        s.vote = { by: id, target: a.accuse, yes: [id], no: [], until: now + VOTE_TIME * 1000, left: s.deadline - now };
        return true;
      }
      if (a.guess && id === s.spy) {
        if (a.guess === s.place) end(s, 'spy', 'Шпион угадал место: ' + s.place);
        else end(s, 'town', 'Шпион ошибся: назвал «' + a.guess + '», а на самом деле — ' + s.place);
        return true;
      }
      return false;
    }
    if (s.phase === 'vote' && a.yes !== undefined) {
      const v = s.vote;
      if (id === v.target || v.yes.includes(id) || v.no.includes(id)) return false;
      (a.yes ? v.yes : v.no).push(id);
      resolveVote(s, now);
      return true;
    }
    if (s.phase === 'final' && a.final !== undefined && s.names[a.final] !== undefined && a.final !== id) {
      s.final[id] = a.final;
      if (s.ids.every((x) => s.final[x] !== undefined)) finishFinal(s);
      return true;
    }
    return false;
  }

  function resolveVote(s, now) {
    const v = s.vote;
    const voters = s.ids.filter((x) => x !== v.target);
    if (v.no.length) {
      // хоть один против — обвинение снято
      s.phase = 'play';
      s.deadline = now + v.left;
      s.vote = null;
      s.lastVote = { target: v.target, ok: false };
      return;
    }
    if (v.yes.length >= voters.length) {
      if (v.target === s.spy) end(s, 'town', 'Шпион пойман: это был ' + s.names[s.spy]);
      else end(s, 'spy', 'Город ошибся: ' + s.names[v.target] + ' — не шпион. Шпионом был ' + s.names[s.spy]);
    }
  }

  function finishFinal(s) {
    const tally = {};
    Object.values(s.final).forEach((t) => (tally[t] = (tally[t] || 0) + 1));
    const max = Math.max(...Object.values(tally));
    const lead = Object.keys(tally).filter((t) => tally[t] === max).map(Number);
    if (lead.length === 1 && lead[0] === s.spy) end(s, 'town', 'Время вышло, но город вычислил шпиона: ' + s.names[s.spy]);
    else end(s, 'spy', 'Время вышло, и шпион остался незамеченным: это был ' + s.names[s.spy]);
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'play' && now >= s.deadline) {
      s.phase = 'final';
      s.deadline = now + 45000;
      return true;
    }
    if (s.phase === 'vote' && now >= s.vote.until) {
      // кто не проголосовал — против
      s.vote.no.push(-1);
      resolveVote(s, now);
      return true;
    }
    if (s.phase === 'final' && now >= s.deadline) {
      if (!Object.keys(s.final).length) end(s, 'spy', 'Никто не назвал шпиона. Шпионом был ' + s.names[s.spy]);
      else finishFinal(s);
      return true;
    }
    return false;
  }

  function leave(s, id) {
    if (s.phase === 'end') return;
    if (id === s.spy) end(s, 'town', 'Шпион сбежал из игры: это был ' + s.names[s.spy]);
    else if (s.asker === id) s.asker = s.ids.find((x) => x !== id);
  }

  // ---------- вид ----------

  function view(s, id) {
    const over = s.phase === 'end';
    const v = {
      phase: s.phase,
      left: Math.max(0, ((s.phase === 'vote' ? s.vote.until : s.deadline) - Date.now()) / 1000),
      places: PLACE_NAMES,
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid] })),
      asker: s.asker,
      lastAsk: s.lastAsk || null,
      canAccuse: s.names[id] !== undefined && !s.accused.includes(id),
      vote: s.vote ? { by: s.vote.by, target: s.vote.target, yes: s.vote.yes.length, no: s.vote.no.length, mine: s.vote.yes.includes(id) ? 'yes' : s.vote.no.includes(id) ? 'no' : null, need: s.ids.length - 1 } : null,
      lastVote: s.lastVote || null,
      final: s.phase === 'final' ? { mine: s.final[id], n: Object.keys(s.final).length } : null,
      over,
      result: s.result,
    };
    if (s.names[id] !== undefined) v.card = id === s.spy ? { spy: true } : { place: s.place, role: s.role[id] };
    if (over) {
      v.reveal = { place: s.place, spy: s.spy };
      v.card = v.card || null;
    }
    return v;
  }

  // ---------- отрисовка ----------

  let peek = false;
  let crossed = new Set();
  let guessing = false;
  function cardHtml(c) {
    if (!c) return '';
    const inner = peek ? (c.spy ? '<span class="sp-icon">🕵</span><b>Вы — шпион!</b><small>Выясните, где все, и не выдайте себя.</small>' : `<span class="sp-icon">📍</span><b>${esc(c.place)}</b><small>Ваша роль: ${esc(c.role)}</small>`) : '<span class="sp-icon">🂠</span><b>Ваша карточка</b><small>нажмите, чтобы подсмотреть</small>';
    return `<button type="button" class="mf-card sp-card ${peek ? 'open' : ''}" data-peek>${inner}</button>`;
  }

  function render(v, ui) {
    const el = ui.el;
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    let head = '';
    let body = '';
    const isSpy = v.card && v.card.spy;
    if (v.phase === 'play') {
      head = `Идёт допрос ${timer}`;
      const mine = v.asker === ui.me;
      body =
        `<p>${mine ? '<b>Ваш вопрос!</b> Спросите кого-нибудь (голосом или в чате) и отметьте, кого спросили:' : 'Спрашивает <b>' + esc(ui.name(v.asker)) + '</b>' + (v.lastAsk ? ` · прошлый вопрос: ${esc(ui.name(v.lastAsk.from))} → ${esc(ui.name(v.lastAsk.to))}` : '')}</p>` +
        (mine ? `<div class="pt-choices">${v.players.filter((p) => p.id !== ui.me).map((p) => `<button class="btn btn-ghost" type="button" data-ask="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : '') +
        (v.lastVote && !v.lastVote.ok ? `<p class="pt-muted">Обвинение против ${esc(ui.name(v.lastVote.target))} не прошло.</p>` : '') +
        `<div class="sp-actions">` +
        (v.canAccuse && !ui.watcher ? `<details class="sp-accuse"><summary class="btn btn-ghost">🫵 Обвинить в шпионаже</summary><div class="pt-choices">${v.players.filter((p) => p.id !== ui.me).map((p) => `<button class="btn btn-ghost" type="button" data-accuse="${p.id}">${esc(p.name)}</button>`).join('')}</div><p class="pt-muted">Обвинить можно один раз за партию. Нужно согласие всех остальных.</p></details>` : '') +
        (isSpy ? `<button class="btn btn-primary" type="button" data-guess>🕵 Я знаю, где мы!</button>` : '') +
        `</div>`;
      if (isSpy && guessing) body += `<div class="sp-guess"><p>Где все? Ошибётесь — проиграете.</p><div class="pt-choices">${v.places.map((p) => `<button class="btn btn-ghost" type="button" data-place="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>`;
    } else if (v.phase === 'vote') {
      const t = v.vote;
      head = `Голосование ${timer}`;
      body = `<p class="pt-big">${esc(ui.name(t.by))} обвиняет ${esc(ui.name(t.target))}</p><p>Нужно единогласие: за ${t.yes} из ${t.need}.</p>`;
      if (t.target !== ui.me && !t.mine && !ui.watcher) body += '<div class="pt-choices"><button class="btn btn-primary" type="button" data-yes="1">Это шпион!</button><button class="btn btn-ghost" type="button" data-yes="0">Не согласен</button></div>';
      else if (t.target === ui.me) body += '<p class="pt-muted">Обвиняют вас — защищайтесь в чате!</p>';
      else body += '<p class="pt-muted">Голос принят.</p>';
    } else if (v.phase === 'final') {
      head = `Время вышло! ${timer}`;
      body = `<p>Кто шпион? Каждый называет одного (проголосовали ${v.final.n} из ${v.players.length}).</p>` + (!ui.watcher ? `<div class="pt-choices">${v.players.filter((p) => p.id !== ui.me).map((p) => `<button class="btn btn-ghost ${v.final.mine === p.id ? 'sel' : ''}" type="button" data-final="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : '');
    } else if (v.over) {
      const won = v.card && ((v.card.spy && v.result.winner === 'spy') || (!v.card.spy && v.result.winner === 'town'));
      head = v.result.winner === 'spy' ? '🕵 Победа шпиона' : '🎉 Шпион пойман';
      body = `<p class="pt-big">${v.card ? (won ? 'Вы победили!' : 'Вы проиграли.') : ''}</p><p>${esc(v.result.why)}.</p><p>Место: <b>${esc(v.reveal.place)}</b> · шпион: <b>${esc(ui.name(v.reveal.spy))}</b></p>`;
      peek = true;
    }
    const places = `<details class="sp-places" ${isSpy ? 'open' : ''}><summary>Все места (${v.places.length}) — отмечайте догадки</summary><div class="sp-grid">${v.places.map((p) => `<button type="button" class="sp-place ${crossed.has(p) ? 'x' : ''}" data-x="${esc(p)}">${esc(p)}</button>`).join('')}</div></details>`;
    el.innerHTML = `<div class="pt-panel"><h3>${head}</h3>${cardHtml(v.card)}${body}${places}</div>`;
    const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
    on('[data-peek]', () => {
      peek = !peek;
      render(v, ui);
    });
    on('[data-ask]', (b) => ui.send({ ask: +b.dataset.ask }));
    on('[data-accuse]', (b) => ui.send({ accuse: +b.dataset.accuse }));
    on('[data-guess]', () => {
      guessing = !guessing;
      render(v, ui);
    });
    on('[data-place]', (b) => {
      guessing = false;
      ui.send({ guess: b.dataset.place });
    });
    on('[data-yes]', (b) => ui.send({ yes: b.dataset.yes === '1' }));
    on('[data-final]', (b) => ui.send({ final: +b.dataset.final }));
    on('[data-x]', (b) => {
      const p = b.dataset.x;
      if (crossed.has(p)) crossed.delete(p);
      else crossed.add(p);
      b.classList.toggle('x');
    });
    if (v.over && !render.done) {
      render.done = true;
      const won = v.card && ((v.card.spy && v.result.winner === 'spy') || (!v.card.spy && v.result.winner === 'town'));
      SG.sound.play(won ? 'win' : 'lose');
      if (won) SG.store.set('spy-wins', SG.store.get('spy-wins', 0) + 1);
    }
    if (!v.over && render.done) {
      render.done = false;
      peek = false;
      crossed = new Set();
    }
  }

  // ---------- на одном телефоне ----------

  function local(el, exit) {
    let n = SG.store.get('spy-local-n', 4);
    let time = SG.store.get('spy-local-time', 420);
    const setup = () => {
      el.innerHTML =
        `<div class="pt-panel"><h3>Шпион на одном телефоне</h3><p>Передавайте телефон по кругу: каждый тайно смотрит свою карточку.</p>` +
        `<label class="sp-row">Игроков <input type="number" min="3" max="12" value="${n}" data-n></label>` +
        `<label class="sp-row">Время <select data-time><option value="300">5 минут</option><option value="420">7 минут</option><option value="540">9 минут</option></select></label>` +
        `<div class="pt-start"><button class="btn btn-primary" type="button" data-go>Раздать карточки</button><button class="btn btn-ghost" type="button" data-exit>Назад</button></div></div>`;
      el.querySelector('[data-time]').value = String(time);
      el.querySelector('[data-exit]').addEventListener('click', exit);
      el.querySelector('[data-go]').addEventListener('click', () => {
        n = Math.max(3, Math.min(12, +el.querySelector('[data-n]').value || 4));
        time = +el.querySelector('[data-time]').value;
        SG.store.set('spy-local-n', n);
        SG.store.set('spy-local-time', time);
        deal();
      });
    };
    const deal = () => {
      const place = PLACE_NAMES[Math.floor(Math.random() * PLACE_NAMES.length)];
      const roles = SG.shuffle(PLACES[place].slice());
      const spy = Math.floor(Math.random() * n);
      let i = 0;
      let shown = false;
      const step = () => {
        if (i >= n) return play(place, spy);
        el.innerHTML =
          `<div class="pt-panel"><h3>Игрок ${i + 1} из ${n}</h3>` +
          (shown
            ? `<div class="mf-card sp-card open">${i === spy ? '<span class="sp-icon">🕵</span><b>Вы — шпион!</b><small>Выясните, где все.</small>' : `<span class="sp-icon">📍</span><b>${esc(place)}</b><small>Ваша роль: ${esc(roles[i % roles.length])}</small>`}</div><button class="btn btn-primary" type="button" data-next>Скрыть и передать дальше</button>`
            : `<p>Передайте телефон игроку ${i + 1}. Остальные — не подглядывать!</p><button class="btn btn-primary" type="button" data-show>Показать мою карточку</button>`) +
          `</div>`;
        const b = el.querySelector('[data-show], [data-next]');
        b.addEventListener('click', () => {
          if (shown) i++;
          shown = !shown;
          step();
        });
      };
      step();
    };
    const play = (place, spy) => {
      const until = Date.now() + time * 1000;
      el.innerHTML =
        `<div class="pt-panel"><h3>Игра идёт</h3><p class="pt-big sp-clock">${SG.formatTime(time)}</p><p>Задавайте друг другу вопросы по кругу. Шпион может в любой момент объявить место, а город — договориться и обвинить шпиона.</p>` +
        `<details class="sp-places"><summary>Все места</summary><div class="sp-grid">${PLACE_NAMES.map((p) => `<span class="sp-place">${esc(p)}</span>`).join('')}</div></details>` +
        `<div class="pt-start"><button class="btn btn-primary" type="button" data-reveal>Открыть ответ</button><button class="btn btn-ghost" type="button" data-again>Новая раздача</button></div><p class="sp-answer" hidden></p></div>`;
      const clock = el.querySelector('.sp-clock');
      const t = setInterval(() => {
        if (!clock.isConnected) return clearInterval(t);
        const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        clock.textContent = left ? SG.formatTime(left) : 'Время вышло!';
        if (!left) {
          clearInterval(t);
          SG.sound.play('lose');
        }
      }, 500);
      el.querySelector('[data-reveal]').addEventListener('click', () => {
        const a = el.querySelector('.sp-answer');
        a.hidden = false;
        a.innerHTML = `Место: <b>${esc(place)}</b> · шпион — <b>игрок ${spy + 1}</b>`;
      });
      el.querySelector('[data-again]').addEventListener('click', () => {
        clearInterval(t);
        setup();
      });
    };
    setup();
  }

  SG.party({
    game: 'spy',
    min: 3,
    max: 10,
    bots: false,
    local: { label: '📱 На одном телефоне', start: local },
    options: {
      html: '<label>Время на раунд <select data-time><option value="300">5 минут</option><option value="420" selected>7 минут</option><option value="540">9 минут</option></select></label>',
      read: (el) => ({ time: +((el.querySelector('[data-time]') || {}).value || 420) }),
      show(el, o) {
        if (o && o.time) el.querySelector('[data-time]').value = String(o.time);
      },
    },
    create,
    view,
    act,
    tick,
    leave,
    render,
  });
  window.__spy = { PLACES };
})();
