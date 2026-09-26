/* Кто я? У каждого на лбу персонаж — видят все, кроме него самого. Вопросы «да/нет» и догадки */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const DECKS = {
    tales: {
      name: 'Сказки и мультфильмы',
      list: 'Колобок|Баба-яга|Кощей Бессмертный|Иван-царевич|Царевна-лягушка|Емеля|Змей Горыныч|Золушка|Белоснежка|Красная Шапочка|Буратино|Мальвина|Пьеро|Карабас-Барабас|Чебурашка|Крокодил Гена|Шапокляк|Винни-Пух|Пятачок|Кот Матроскин|Пёс Шарик|Почтальон Печкин|Дядя Фёдор|Карлсон|Малыш|Волк из «Ну, погоди!»|Заяц из «Ну, погоди!»|Кот Леопольд|Простоквашино|Незнайка|Знайка|Доктор Айболит|Бармалей|Мойдодыр|Муха-Цокотуха|Снегурочка|Дед Мороз|Русалочка|Алладин|Джинн|Шрек|Осёл из «Шрека»|Микки Маус|Губка Боб|Симба|Кот в сапогах|Пеппи Длинныйчулок|Маша из «Маши и Медведя»|Смешарик Крош|Лунтик|Кот Леопольд|Три богатыря|Илья Муромец|Алёша Попович|Добрыня Никитич|Садко|Старик Хоттабыч|Мэри Поппинс|Питер Пэн|Капитан Крюк|Гарри Поттер|Гермиона|Дамблдор|Волан-де-Морт|Фродо|Гэндальф|Голлум|Человек-паук|Бэтмен|Супермен|Халк|Железный человек|Шерлок Холмс|Доктор Ватсон|Дюймовочка|Снежная королева|Щелкунчик|Мюнхгаузен|Робин Гуд|Том Сойер|Маугли|Балу|Тарзан|Пиноккио|Кай и Герда'.split('|'),
    },
    people: {
      name: 'Знаменитости',
      list: 'Александр Пушкин|Лев Толстой|Фёдор Достоевский|Антон Чехов|Николай Гоголь|Юрий Гагарин|Валентина Терешкова|Пётр I|Екатерина II|Иван Грозный|Наполеон|Юлий Цезарь|Клеопатра|Альберт Эйнштейн|Исаак Ньютон|Дмитрий Менделеев|Михаил Ломоносов|Леонардо да Винчи|Микеланджело|Пабло Пикассо|Винсент Ван Гог|Моцарт|Бетховен|Пётр Чайковский|Уильям Шекспир|Чарли Чаплин|Мэрилин Монро|Майкл Джексон|Элвис Пресли|Битлз|Стив Джобс|Билл Гейтс|Илон Маск|Марк Цукерберг|Колумб|Магеллан|Нил Армстронг|Мария Кюри|Никола Тесла|Томас Эдисон|Чарльз Дарвин|Зигмунд Фрейд|Уолт Дисней|Агата Кристи|Жюль Верн|Александр Суворов|Михаил Кутузов|Александр Невский|Владимир Высоцкий|Юрий Никулин|Алла Пугачёва|Виктор Цой|Лионель Месси|Криштиану Роналду|Пеле|Мохаммед Али|Усэйн Болт|Гарри Каспаров|Мать Тереза|Махатма Ганди|Джордж Вашингтон|Авраам Линкольн|Мартин Лютер Кинг|Фидель Кастро|Че Гевара|Будда|Конфуций|Сократ|Аристотель|Архимед|Галилей|Коперник|Джоконда'.split('|'),
    },
    animals: {
      name: 'Животные и предметы',
      list: 'Жираф|Слон|Пингвин|Кенгуру|Осьминог|Крокодил|Ёж|Панда|Коала|Хамелеон|Муравей|Пчела|Дельфин|Акула|Сова|Попугай|Страус|Верблюд|Черепаха|Улитка|Бобр|Енот|Лиса|Волк|Медведь|Тигр|Лев|Зебра|Бегемот|Носорог|Холодильник|Пылесос|Зонтик|Самокат|Вертолёт|Подводная лодка|Кактус|Лампочка|Будильник|Чайник|Утюг|Телефон|Гитара|Скрипка|Барабан|Воздушный шар|Снеговик|Ракета|Робот|Микроскоп|Телескоп|Компас|Якорь|Маяк|Пирамида|Эйфелева башня|Статуя Свободы|Кремль|Радуга|Вулкан|Айсберг|Метеорит|Облако|Молния|Пицца|Мороженое|Арбуз|Торт|Бутерброд|Пельмени'.split('|'),
    },
  };
  const norm = (w) => String(w).toLowerCase().replace(/ё/g, 'е').replace(/«[^»]*»/g, '').replace(/[^а-яa-z0-9]+/g, ' ').trim();
  const ASK_TIME = 60;
  const ANSWER_TIME = 30;

  function dist(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  // догадка засчитывается при почти полном совпадении или совпадении главного слова (фамилии)
  function matches(guess, name) {
    const g = norm(guess);
    const n = norm(name);
    if (!g) return false;
    if (g === n || dist(g, n) <= Math.floor(n.length / 6)) return true;
    const words = n.split(' ').filter((w) => w.length > 3);
    return words.some((w) => g === w || (g.length > 4 && dist(g, w) <= 1)) && words.length > 1;
  }

  // ---------- правила ----------

  function create(players, opts) {
    const o = opts || {};
    const s = { ids: players.map((p) => p.id), names: {}, who: {}, done: [], phase: 'write', turn: 0, q: null, answers: {}, log: [], now: Date.now(), mode: o.mode || 'deck', place: [] };
    players.forEach((p) => (s.names[p.id] = p.name));
    if (s.mode === 'deck') {
      const deck = SG.shuffle(DECKS[o.deck || 'tales'].list.slice());
      s.ids.forEach((id, i) => (s.who[id] = deck[i]));
      startAsk(s, s.now);
    } else s.deadline = s.now + 90000;
    return s;
  }

  const say = (s, t, o) => {
    SG.party.log(s, t, o);
  };
  const active = (s) => s.ids.filter((id) => !s.done.includes(id));
  // кому игрок загадывает персонажа (следующему по кругу)
  const target = (s, id) => s.ids[(s.ids.indexOf(id) + 1) % s.ids.length];
  const cur = (s) => s.ids[s.turn];

  function startAsk(s, now) {
    s.phase = 'ask';
    s.q = null;
    s.answers = {};
    s.deadline = now + ASK_TIME * 1000;
  }

  function nextPlayer(s, now) {
    const a = active(s);
    if (a.length <= 1) return finish(s);
    do s.turn = (s.turn + 1) % s.ids.length;
    while (s.done.includes(cur(s)));
    startAsk(s, now);
  }

  function finish(s) {
    s.phase = 'end';
    active(s).forEach((id) => s.place.push(id));
  }

  function resolve(s, now) {
    const vals = Object.values(s.answers);
    const yes = vals.filter((x) => x === 'y').length;
    const no = vals.filter((x) => x === 'n').length;
    const verdict = yes > no ? 'да' : no > yes ? 'нет' : 'непонятно';
    say(s, '❓ ' + s.names[cur(s)] + ': «' + s.q + '» — ' + verdict + ' (' + yes + '/' + no + ')');
    // «да» — спрашивает дальше, иначе ход переходит
    if (verdict === 'да') startAsk(s, now);
    else nextPlayer(s, now);
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || !s.names[id]) return false;
    if (s.phase === 'write' && a.write) {
      const t = target(s, id);
      s.who[t] = String(a.write).trim().slice(0, 40);
      if (!s.who[t]) delete s.who[t];
      if (s.ids.every((x) => s.who[x])) {
        s.turn = 0;
        startAsk(s, now);
      }
      return true;
    }
    if (s.phase === 'ask' && id === cur(s)) {
      if (a.q) {
        s.q = String(a.q).trim().slice(0, 120);
        if (!s.q) return false;
        s.phase = 'answer';
        s.answers = {};
        s.deadline = now + ANSWER_TIME * 1000;
        return true;
      }
      if (a.guess) {
        if (matches(a.guess, s.who[id])) {
          s.done.push(id);
          s.place.push(id);
          say(s, '🎉 ' + s.names[id] + ' угадал(а): «' + s.who[id] + '» — место ' + s.place.length);
          nextPlayer(s, now);
        } else {
          say(s, '✗ ' + s.names[id] + ' думает, что он(а) «' + String(a.guess).slice(0, 40) + '» — нет!');
          nextPlayer(s, now);
        }
        return true;
      }
      if (a.skip) {
        nextPlayer(s, now);
        return true;
      }
    }
    if (s.phase === 'answer' && id !== cur(s) && ['y', 'n', '?'].includes(a.ans)) {
      s.answers[id] = a.ans;
      const voters = s.ids.filter((x) => x !== cur(s));
      if (voters.every((x) => s.answers[x])) resolve(s, now);
      return true;
    }
    if (a.giveup && !s.done.includes(id) && s.phase !== 'write') {
      s.done.push(id);
      say(s, '🏳 ' + s.names[id] + ' сдаётся: это был(а) «' + s.who[id] + '»');
      if (cur(s) === id) nextPlayer(s, now);
      else if (active(s).length <= 1) finish(s);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'write') {
      // кто не успел — персонаж из колоды
      const deck = SG.shuffle(DECKS.tales.list.slice());
      s.ids.forEach((id, i) => !s.who[id] && (s.who[id] = deck[i]));
      startAsk(s, now);
    } else if (s.phase === 'ask') nextPlayer(s, now);
    else if (s.phase === 'answer') resolve(s, now);
    return true;
  }

  function leave(s, id) {
    if (s.phase === 'end' || s.done.includes(id)) return;
    s.done.push(id);
    if (cur(s) === id) nextPlayer(s, s.now);
  }

  // ---------- вид ----------

  function view(s, id) {
    return {
      phase: s.phase,
      players: s.ids.map((pid) => ({ id: pid, name: s.names[pid], who: pid === id && s.phase !== 'end' && !s.done.includes(id) ? null : s.who[pid] || null, done: s.done.includes(pid), place: s.place.indexOf(pid) + 1 })),
      turn: cur(s),
      q: s.q,
      answers: s.answers,
      myAns: s.answers[id],
      writeFor: s.phase === 'write' && s.names[id] ? target(s, id) : null,
      wrote: s.phase === 'write' ? s.ids.filter((x) => s.who[target(s, x)]) : [],
      log: s.log.slice(-30),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.phase === 'end',
      place: s.place,
      done: s.done.includes(id),
    };
  }

  // ---------- отрисовка ----------

  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const cards = v.players
      .map((p) => `<div class="wa-card${p.id === v.turn && !v.over ? ' turn' : ''}${p.done ? ' done' : ''}${p.id === me ? ' me' : ''}"><b>${esc(p.name)}${p.id === me ? ' (вы)' : ''}</b><span class="wa-who">${p.id === me && !p.who ? '❔ это вы' : p.who ? esc(p.who) : '…'}</span>${p.place ? `<small>место ${p.place}</small>` : ''}</div>`)
      .join('');
    let body = '';
    if (v.phase === 'write') {
      body = v.writeFor !== null && v.writeFor !== undefined
        ? `<p>Загадайте персонажа для <b>${esc(ui.name(v.writeFor))}</b> — он(а) не увидит, остальные увидят. ${timer}</p><form class="wa-form" data-f="write"><input type="text" maxlength="40" placeholder="Например, Чебурашка" required><button class="btn btn-primary" type="submit">Загадать</button></form><p class="pt-muted">Готовы: ${v.wrote.length} из ${v.players.length}</p>`
        : `<p>Игроки загадывают персонажей… ${timer}</p>`;
    } else if (v.phase === 'ask') {
      if (v.turn === me)
        body = `<p><b>Ваш ход.</b> Задайте вопрос, на который можно ответить «да» или «нет», или попробуйте угадать. ${timer}</p><form class="wa-form" data-f="q"><input type="text" maxlength="120" placeholder="Я живой человек?" required><button class="btn btn-primary" type="submit">Спросить</button></form><form class="wa-form" data-f="guess"><input type="text" maxlength="40" placeholder="Я — …" required><button class="btn btn-ghost" type="submit">Я знаю, кто я!</button></form><button class="btn btn-ghost" type="button" data-skip>Передать ход</button>`;
      else body = `<p>Спрашивает <b>${esc(ui.name(v.turn))}</b>… ${timer}</p>`;
    } else if (v.phase === 'answer') {
      const asker = v.turn === me;
      body = `<p class="pt-big">«${esc(v.q)}»</p><p>${asker ? 'Ждём ответов' : 'Ответьте про <b>' + esc(ui.name(v.turn)) + '</b> (' + esc((v.players.find((p) => p.id === v.turn) || {}).who || '') + ')'} ${timer}</p>` +
        (!asker && !ui.watcher ? `<div class="pt-choices"><button class="btn ${v.myAns === 'y' ? 'btn-primary' : 'btn-ghost'}" type="button" data-ans="y">Да</button><button class="btn ${v.myAns === 'n' ? 'btn-primary' : 'btn-ghost'}" type="button" data-ans="n">Нет</button><button class="btn ${v.myAns === '?' ? 'btn-primary' : 'btn-ghost'}" type="button" data-ans="?">Не знаю</button></div>` : '') +
        `<p class="pt-muted">Ответили: ${Object.keys(v.answers).length} из ${v.players.length - 1}</p>`;
    } else if (v.over) {
      const w = v.place[0];
      body = `<p class="pt-big">${w === me ? 'Вы угадали первым! 🏆' : 'Первым угадал(а) ' + esc(ui.name(w))}</p>`;
    }
    const giveup = !v.over && v.phase !== 'write' && !v.done && !ui.watcher ? '<button class="btn btn-ghost wa-give" type="button" data-giveup>Сдаться</button>' : '';
    el.innerHTML = `<div class="pt-panel wa"><div class="wa-cards">${cards}</div>${body}${giveup}</div>`;
    el.querySelectorAll('.wa-form').forEach((f) =>
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = f.querySelector('input').value.trim();
        if (!t) return;
        ui.send({ [f.dataset.f]: t });
      })
    );
    el.querySelectorAll('[data-ans]').forEach((b) => b.addEventListener('click', () => ui.send({ ans: b.dataset.ans })));
    const sk = el.querySelector('[data-skip]');
    if (sk) sk.addEventListener('click', () => ui.send({ skip: 1 }));
    const g = el.querySelector('[data-giveup]');
    if (g) g.addEventListener('click', () => confirm('Сдаться и узнать, кто вы?') && ui.send({ giveup: 1 }));
    const key = v.phase + v.turn + (v.log.length ? v.log[v.log.length - 1].n : 0);
    if (render.key !== key) {
      render.key = key;
      if (v.phase === 'answer' && v.turn !== me) SG.sound.play('hint');
      if (v.phase === 'ask' && v.turn === me) SG.sound.play('hint');
    }
    if (v.over && !render.done) {
      render.done = true;
      const won = v.place[0] === me;
      SG.sound.play(won ? 'win' : 'lose');
      if (won) SG.store.set('whoami-wins', SG.store.get('whoami-wins', 0) + 1);
    }
    if (!v.over) render.done = false;
  }

  SG.party({
    game: 'whoami',
    min: 2,
    max: 10,
    bots: false,
    options: {
      html:
        '<label>Кто загадывает <select data-mode><option value="deck">Сайт (из колоды)</option><option value="players">Игроки друг другу</option></select></label>' +
        '<label>Колода <select data-deck><option value="tales">Сказки и мультфильмы</option><option value="people">Знаменитости</option><option value="animals">Животные и предметы</option></select></label>',
      read: (el) => ({ mode: el.querySelector('[data-mode]').value, deck: el.querySelector('[data-deck]').value }),
      show(el, o) {
        if (!o) return;
        if (o.mode) el.querySelector('[data-mode]').value = o.mode;
        if (o.deck) el.querySelector('[data-deck]').value = o.deck;
      },
    },
    create,
    view,
    act,
    tick,
    leave,
    render,
  });
  window.__whoami = { matches };
})();
