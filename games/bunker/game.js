/* Бункер: катастрофа, мест в бункере на всех не хватит. Раскрывайте свои карты и убеждайте, что вы нужны */
(() => {
  'use strict';

  const esc = SG.party.esc;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const CATS = [
    ['Ядерная зима', 'После обмена ядерными ударами поверхность покрыта снегом и пеплом. Выходить можно будет лет через пять.'],
    ['Зомби-вирус', 'Вирус превращает людей в агрессивных зомби. Вакцину пока не нашли — год под землёй как минимум.'],
    ['Падение астероида', 'Огромный астероид поднял в воздух тучи пыли, солнца не видно. Ждать три года.'],
    ['Восстание машин', 'Искусственный интеллект захватил всю технику. Под землёй глушат сигнал — сидим два года.'],
    ['Всемирный потоп', 'Льды растаяли, вода поднялась на сотни метров. Бункер в горах, запасов на два года.'],
    ['Нашествие инопланетян', 'Пришельцы зачищают города. Бункер экранирован — надо продержаться год и найти способ сопротивляться.'],
    ['Солнечная вспышка', 'Мощная вспышка уничтожила электронику и опасна радиацией. Полтора года в укрытии.'],
    ['Гигантские муравьи', 'Мутировавшие муравьи размером с собаку заполонили континент. Сидим, пока их не станет меньше, — год.'],
  ];
  const BUNKER = ['большая кухня и запас консервов', 'огород с гидропоникой', 'мастерская с инструментами', 'медицинский кабинет', 'библиотека на 2000 книг', 'спортзал', 'радиостанция', 'оружейная комната', 'кинотеатр с фильмами', 'мини-ферма с курами', 'химическая лаборатория', 'бассейн с фильтром'];
  const CARDS = {
    prof: ['Врач-хирург', 'Инженер-электрик', 'Повар', 'Программист', 'Учитель', 'Агроном', 'Военный', 'Психолог', 'Сантехник', 'Химик', 'Биолог', 'Механик', 'Строитель', 'Медсестра', 'Пожарный', 'Полицейский', 'Юрист', 'Бухгалтер', 'Блогер', 'Актёр', 'Музыкант', 'Художник', 'Пилот', 'Моряк', 'Ветеринар', 'Фермер', 'Электрик', 'Геолог', 'Фармацевт', 'Стоматолог', 'Швея', 'Охотник', 'Спасатель МЧС', 'Радиолюбитель', 'Священник', 'Космонавт', 'Бариста', 'Парикмахер', 'Археолог', 'Таксист'],
    health: ['Полностью здоров', 'Астма', 'Близорукость', 'Диабет', 'Аллергия на пыль', 'Бессонница', 'Отличная форма, спортсмен', 'Больная спина', 'Хроническая мигрень', 'Плохой слух', 'Гипертония', 'Здоров, но храпит', 'Сломана рука (заживёт через месяц)', 'Беременность', 'Плоскостопие', 'Лишний вес', 'Идеальное здоровье, но возраст', 'Клаустрофобия в лёгкой форме', 'Дальтонизм', 'Иммунитет к большинству вирусов'],
    hobby: ['Шахматы', 'Кулинария', 'Рыбалка', 'Вязание', 'Игра на гитаре', 'Йога', 'Садоводство', 'Стрельба', 'Паркур', 'Фотография', 'Рисование', 'Чтение фантастики', 'Столярное дело', 'Альпинизм', 'Видеоигры', 'Танцы', 'Выживание в лесу', 'Сборка моделей', 'Астрономия', 'Пение', 'Бокс', 'Пчеловодство', 'Настольные игры', 'Медитация', 'Ремонт техники'],
    phobia: ['Боится темноты', 'Боится замкнутых пространств', 'Боится пауков', 'Боится крови', 'Боится высоты', 'Боится одиночества', 'Боится микробов', 'Боится громких звуков', 'Боится собак', 'Боится воды', 'Никаких фобий', 'Боится толпы', 'Боится врачей', 'Боится насекомых', 'Боится огня'],
    bag: ['Аптечка', 'Ящик тушёнки', 'Гитара', 'Ноутбук с солнечной батареей', 'Семена овощей', 'Охотничье ружьё', 'Набор инструментов', 'Рация', 'Книга «Как выжить»', 'Котёнок', 'Колода карт', 'Спальный мешок', 'Фильтр для воды', 'Ящик водки', 'Палатка', 'Швейный набор', 'Энциклопедия', 'Бензопила', 'Дрон', 'Семейный альбом', 'Лук и стрелы', 'Рыболовные снасти', 'Запас батареек', 'Химзащита', 'Плюшевый медведь'],
    fact: ['Служил в спецназе', 'Знает пять языков', 'Бывший чемпион по плаванию', 'Отлично готовит из ничего', 'Умеет чинить любую технику', 'Жил год на необитаемом острове', 'Храпит как трактор', 'Никогда не врёт', 'Отлично поёт', 'Может не спать трое суток', 'Сидел в тюрьме', 'Знает, где спрятан второй бункер', 'Боится ответственности', 'Прекрасный рассказчик', 'Лидер по натуре', 'Ненавидит работать руками', 'Прошёл курсы первой помощи', 'Раньше был богатым', 'Умеет гипнотизировать', 'Ничего не умеет, но всем нравится'],
  };
  const LABEL = { bio: 'Биология', prof: 'Профессия', health: 'Здоровье', hobby: 'Хобби', phobia: 'Фобия', bag: 'Багаж', fact: 'Факт' };
  const KEYS = Object.keys(LABEL);
  const T = { reveal: 60, talk: 60, vote: 40, result: 6 };

  function bio() {
    const g = Math.random() < 0.5 ? 'Мужчина' : 'Женщина';
    return g + ', ' + (18 + Math.floor(Math.random() * 60)) + ' лет' + (Math.random() < 0.15 ? ', бесплоден(на)' : '');
  }

  function create(players) {
    const n = players.length;
    const s = { ids: players.map((p) => p.id), names: {}, cards: {}, open: {}, alive: {}, cat: pick(CATS), bunker: SG.shuffle(BUNKER.slice()).slice(0, 3), cap: Math.max(1, Math.floor(n / 2)), round: 1, phase: 'reveal', votes: {}, log: [], now: Date.now() };
    const decks = {};
    Object.keys(CARDS).forEach((k) => (decks[k] = SG.shuffle(CARDS[k].slice())));
    players.forEach((p, i) => {
      s.names[p.id] = p.name;
      s.alive[p.id] = true;
      s.open[p.id] = [];
      s.cards[p.id] = { bio: bio() };
      Object.keys(CARDS).forEach((k) => (s.cards[p.id][k] = decks[k][i % decks[k].length]));
    });
    s.deadline = s.now + T.reveal * 1000;
    return s;
  }

  const alive = (s) => s.ids.filter((x) => s.alive[x]);
  const say = (s, t) => {
    s.log.push(t);
    if (s.log.length > 10) s.log.shift();
  };
  // в первом раунде все открывают профессию
  const mustProf = (s, id) => s.round === 1 && !s.open[id].includes('prof');
  const revealedThisRound = (s, id) => s.open[id].length >= s.round;

  function toTalk(s, now) {
    s.phase = 'talk';
    s.ready = [];
    s.deadline = now + T.talk * 1000;
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end' || !s.alive[id]) return false;
    if (s.phase === 'reveal' && a.open && KEYS.includes(a.open) && !s.open[id].includes(a.open) && !revealedThisRound(s, id)) {
      if (mustProf(s, id) && a.open !== 'prof') return false;
      s.open[id].push(a.open);
      if (alive(s).every((x) => revealedThisRound(s, x))) toTalk(s, now);
      return true;
    }
    if (s.phase === 'talk' && a.ready) {
      if (!s.ready.includes(id)) s.ready.push(id);
      if (s.ready.length > alive(s).length / 2) startVote(s, now);
      return true;
    }
    if (s.phase === 'vote' && a.vote !== undefined && s.alive[a.vote] && a.vote !== id) {
      s.votes[id] = a.vote;
      if (alive(s).every((x) => s.votes[x] !== undefined)) closeVote(s, now);
      return true;
    }
    return false;
  }

  function startVote(s, now) {
    s.phase = 'vote';
    s.votes = {};
    s.deadline = now + T.vote * 1000;
  }

  function closeVote(s, now) {
    const tally = {};
    Object.values(s.votes).forEach((t) => (tally[t] = (tally[t] || 0) + 1));
    const max = Math.max(0, ...Object.values(tally));
    const lead = Object.keys(tally).filter((t) => tally[t] === max).map(Number);
    // ничья — жребий среди лидеров
    const out = lead.length ? pick(lead) : pick(alive(s));
    s.alive[out] = false;
    s.kicked = out;
    say(s, '🚪 ' + s.names[out] + ' не попадает в бункер (' + (tally[out] || 0) + ' гол.)');
    s.phase = 'result';
    s.deadline = now + T.result * 1000;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'reveal') {
      // кто не успел — открываем за него случайную карту
      alive(s).forEach((x) => {
        if (revealedThisRound(s, x)) return;
        const left = KEYS.filter((k) => !s.open[x].includes(k));
        s.open[x].push(mustProf(s, x) ? 'prof' : pick(left));
      });
      toTalk(s, now);
    } else if (s.phase === 'talk') startVote(s, now);
    else if (s.phase === 'vote') {
      alive(s).forEach((x) => s.votes[x] === undefined && (s.votes[x] = pick(alive(s).filter((y) => y !== x))));
      closeVote(s, now);
    } else if (s.phase === 'result') {
      if (alive(s).length <= s.cap) {
        s.phase = 'end';
        say(s, '🔒 Двери бункера закрылись. Внутри: ' + alive(s).map((x) => s.names[x]).join(', '));
      } else {
        s.round++;
        s.phase = 'reveal';
        s.deadline = now + T.reveal * 1000;
      }
    }
    return true;
  }

  function leave(s, id) {
    if (s.phase === 'end' || !s.alive[id]) return;
    s.alive[id] = false;
    say(s, s.names[id] + ' ушёл сам');
    if (alive(s).length <= s.cap) s.phase = 'end';
  }

  function ai(s, id) {
    if (!s.alive[id]) return null;
    if (s.phase === 'reveal' && !revealedThisRound(s, id)) {
      const left = KEYS.filter((k) => !s.open[id].includes(k));
      return { open: mustProf(s, id) ? 'prof' : pick(left) };
    }
    if (s.phase === 'talk' && !s.ready.includes(id)) return { ready: 1 };
    if (s.phase === 'vote' && s.votes[id] === undefined) {
      // голосуем против того, у кого открыто что-то плохое, иначе за самого популярного
      const others = alive(s).filter((x) => x !== id);
      const bad = others.filter((x) => s.open[x].some((k) => /Боится крови|Диабет|Астма|Сидел|Ненавидит|Лишний|бесплод|Храпит/.test(s.cards[x][k])));
      const tally = {};
      Object.values(s.votes).forEach((t) => t !== id && (tally[t] = (tally[t] || 0) + 1));
      const lead = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      return { vote: bad.length ? pick(bad) : lead !== undefined && Math.random() < 0.5 ? +lead : pick(others) };
    }
    return null;
  }

  function view(s, id) {
    const over = s.phase === 'end';
    return {
      phase: s.phase,
      round: s.round,
      cat: s.cat,
      bunker: s.bunker,
      cap: s.cap,
      mine: s.cards[id] || null,
      myOpen: s.open[id] || [],
      mustProf: s.cards[id] ? mustProf(s, id) : false,
      canOpen: s.cards[id] && s.alive[id] && s.phase === 'reveal' && !revealedThisRound(s, id),
      alive: !!s.alive[id],
      players: s.ids.map((pid) => ({
        id: pid, name: s.names[pid], alive: s.alive[pid],
        cards: Object.fromEntries(KEYS.filter((k) => over || s.open[pid].includes(k)).map((k) => [k, s.cards[pid][k]])),
        done: s.phase === 'reveal' ? revealedThisRound(s, pid) : s.phase === 'vote' ? s.votes[pid] !== undefined : s.phase === 'talk' ? (s.ready || []).includes(pid) : false,
        votes: s.phase === 'vote' ? Object.values(s.votes).filter((t) => t === pid).length : 0,
      })),
      myVote: s.votes[id],
      ready: s.phase === 'talk' && (s.ready || []).includes(id),
      log: s.log.slice(-6),
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over,
    };
  }

  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const head = `<div class="bk-cat"><b>☢ ${esc(v.cat[0])}</b><p>${esc(v.cat[1])}</p><p class="pt-muted">В бункере: ${v.bunker.map(esc).join(', ')}. Мест: <b>${v.cap}</b>.</p></div>`;
    const mine = v.mine
      ? `<div class="bk-mine"><h4>Ваши карты</h4>${KEYS.map((k) => {
          const open = v.myOpen.includes(k);
          const can = v.canOpen && !open && (!v.mustProf || k === 'prof');
          return `<button type="button" class="bk-card${open ? ' open' : ''}${can ? ' can' : ''}" data-open="${k}" ${can ? '' : 'disabled'}><small>${LABEL[k]}${open ? ' · открыта' : ''}</small><span>${esc(v.mine[k])}</span></button>`;
        }).join('')}</div>`
      : '';
    const table = v.players
      .map((p) => `<div class="bk-p${p.alive ? '' : ' out'}${p.id === me ? ' me' : ''}"><b>${esc(p.name)}${p.done ? ' ✓' : ''}${p.votes ? ' · 🗳 ' + p.votes : ''}${p.alive ? '' : ' 🚪'}</b>${KEYS.filter((k) => p.cards[k]).map((k) => `<div><small>${LABEL[k]}:</small> ${esc(p.cards[k])}</div>`).join('') || '<div class="pt-muted">карты закрыты</div>'}${v.phase === 'vote' && v.alive && p.alive && p.id !== me && !ui.watcher ? `<button class="btn ${v.myVote === p.id ? 'btn-primary' : 'btn-ghost'}" type="button" data-vote="${p.id}">Выгнать</button>` : ''}</div>`)
      .join('');
    let status = '';
    if (v.phase === 'reveal') status = `Раунд ${v.round}: ${v.canOpen ? (v.mustProf ? 'откройте свою профессию' : 'откройте одну карту') : 'игроки открывают карты'} ${timer}`;
    else if (v.phase === 'talk') status = `Обсуждение: кого не брать в бункер? ${timer} ` + (v.alive && !v.ready && !ui.watcher ? '<button class="btn btn-primary" type="button" data-ready>К голосованию</button>' : '');
    else if (v.phase === 'vote') status = `Голосование: кого не брать? ${timer}`;
    else if (v.phase === 'result') status = esc(v.log[v.log.length - 1]);
    else if (v.over) status = v.alive ? '🎉 Вы в бункере!' : '💀 Вы остались снаружи.';
    el.innerHTML = `<div class="pt-panel bk">${head}<p class="bk-status">${status}</p>${mine}<div class="bk-table">${table}</div><div class="mm-log">${v.log.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>`;
    el.querySelectorAll('[data-open]:not(:disabled)').forEach((b) => b.addEventListener('click', () => ui.send({ open: b.dataset.open })));
    el.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => ui.send({ vote: +b.dataset.vote })));
    const r = el.querySelector('[data-ready]');
    if (r) r.addEventListener('click', () => ui.send({ ready: 1 }));
    const key = v.phase + v.round;
    if (render.key !== key) {
      render.key = key;
      if (v.phase === 'result') SG.sound.play('drop');
      if (v.over && v.mine) {
        SG.sound.play(v.alive ? 'win' : 'lose');
        if (v.alive) SG.store.set('bunker-wins', SG.store.get('bunker-wins', 0) + 1);
      }
    }
  }

  SG.party({ game: 'bunker', min: 4, max: 12, bots: true, soloBots: 5, chatSolo: true, aiForGone: true, botDelay: () => 1500 + Math.random() * 3000, create, view, act, tick, ai, leave, render });
})();
