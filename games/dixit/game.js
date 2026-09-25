/* Ассоциации: карточки из эмодзи. Ведущий загадывает ассоциацию, остальные подкладывают похожие карты и угадывают карту ведущего */
(() => {
  'use strict';

  const esc = SG.party.esc;
  // эмодзи и слова, с которыми они связаны (по ним «думают» боты)
  const EMO = [
    ['🌙', 'луна ночь сон небо мечта'], ['☀️', 'солнце лето тепло день свет'], ['⭐', 'звезда мечта успех небо слава'], ['🌈', 'радуга надежда чудо цвет дождь'],
    ['⛈️', 'гроза буря страх дождь гнев'], ['❄️', 'снег зима холод мороз'], ['🔥', 'огонь страсть жар опасность'], ['🌊', 'волна море вода стихия'],
    ['🌋', 'вулкан взрыв гнев извержение'], ['🌪️', 'вихрь хаос буря ветер'], ['🌵', 'кактус пустыня колючий жажда'], ['🌲', 'лес ёлка природа'],
    ['🌸', 'цветок весна нежность красота'], ['🍂', 'осень листья грусть'], ['🍄', 'гриб лес сказка'], ['🌍', 'земля мир планета путешествие'],
    ['🏔️', 'гора вершина цель высота'], ['🏝️', 'остров отдых море одиночество'], ['🏰', 'замок сказка король крепость'], ['🏠', 'дом семья уют'],
    ['🗝️', 'ключ тайна секрет дверь'], ['🚪', 'дверь выход вход выбор'], ['🪞', 'зеркало отражение правда я'], ['🕯️', 'свеча надежда тишина память'],
    ['⏳', 'время ожидание песок'], ['⏰', 'будильник утро спешка время'], ['📚', 'книги учёба знание школа'], ['✉️', 'письмо весть любовь почта'],
    ['🎁', 'подарок праздник сюрприз'], ['🎈', 'шарик праздник детство лёгкость'], ['🎭', 'театр маска роль обман'], ['🎨', 'искусство краски творчество'],
    ['🎵', 'музыка песня мелодия'], ['🎲', 'кубик игра случай удача'], ['🃏', 'джокер карты обман игра'], ['🧩', 'пазл загадка часть'],
    ['🔮', 'шар будущее магия гадание'], ['🪄', 'палочка магия чудо волшебство'], ['⚓', 'якорь море надёжность'], ['🧭', 'компас путь направление'],
    ['🗺️', 'карта путешествие приключение'], ['🚀', 'ракета космос полёт скорость'], ['✈️', 'самолёт полёт отпуск'], ['🚂', 'поезд дорога путь'],
    ['⛵', 'парус море свобода'], ['🚲', 'велосипед детство движение'], ['🛸', 'нло тайна пришелец космос'], ['🪐', 'планета космос даль'],
    ['👑', 'корона власть король победа'], ['💎', 'алмаз богатство ценность'], ['💰', 'деньги богатство жадность'], ['⚖️', 'весы справедливость выбор суд'],
    ['🗡️', 'кинжал предательство опасность'], ['🛡️', 'щит защита'], ['🏹', 'лук цель охота'], ['💣', 'бомба взрыв опасность'],
    ['❤️', 'сердце любовь'], ['💔', 'разбитое сердце расставание боль'], ['😂', 'смех радость шутка'], ['😢', 'слёзы грусть печаль'],
    ['😱', 'ужас страх крик'], ['😴', 'сон усталость лень'], ['🤔', 'мысль вопрос сомнение'], ['🤫', 'тишина тайна секрет'],
    ['👀', 'взгляд наблюдение'], ['👻', 'призрак страх прошлое'], ['💀', 'череп смерть опасность'], ['🤖', 'робот техника будущее'],
    ['👽', 'пришелец чужой космос'], ['🧙', 'маг мудрость волшебство'], ['🦸', 'герой сила подвиг'], ['🤡', 'клоун смех цирк'],
    ['🐱', 'кот уют лень'], ['🐶', 'собака друг верность'], ['🦊', 'лиса хитрость'], ['🐺', 'волк одиночество сила'],
    ['🦉', 'сова мудрость ночь'], ['🐢', 'черепаха медленно терпение'], ['🐇', 'заяц скорость страх'], ['🦋', 'бабочка лёгкость превращение'],
    ['🐝', 'пчела труд мёд'], ['🐍', 'змея коварство опасность'], ['🦁', 'лев сила смелость король'], ['🐘', 'слон память сила'],
    ['🐟', 'рыба вода молчание'], ['🐙', 'осьминог хитрость море'], ['🦄', 'единорог мечта сказка чудо'], ['🐉', 'дракон сила сказка огонь'],
    ['🍎', 'яблоко знание соблазн'], ['🍋', 'лимон кислый'], ['🍰', 'торт праздник сладость'], ['☕', 'кофе утро бодрость'],
    ['🍷', 'вино праздник'], ['🍕', 'пицца еда вечеринка'], ['🍯', 'мёд сладость'], ['🧀', 'сыр мышь ловушка'],
    ['⚽', 'мяч спорт игра'], ['🏆', 'кубок победа успех'], ['🎯', 'мишень цель точность'], ['🧗', 'подъём трудность вершина'],
    ['💡', 'лампа идея мысль'], ['🔒', 'замок тайна защита'], ['📷', 'фото память момент'], ['📺', 'телевизор новости'],
    ['📱', 'телефон связь'], ['💻', 'компьютер работа'], ['🔭', 'телескоп поиск звезда'], ['🧪', 'колба опыт наука'],
    ['⛓️', 'цепь плен связь'], ['🪤', 'мышеловка ловушка'], ['🕸️', 'паутина ловушка'], ['🧸', 'мишка детство игрушка'],
    ['🌅', 'рассвет начало надежда'], ['🌃', 'город ночь огни'], ['🎢', 'горки эмоции веселье'], ['🎪', 'цирк шоу праздник'],
  ];
  const TAGS = EMO.map((e) => e[1].split(' '));
  const stem = (w) => w.toLowerCase().replace(/ё/g, 'е').slice(0, 4);
  const HAND = 6;

  // карточка — три эмодзи
  function makeDeck() {
    const cards = new Set();
    while (cards.size < 96) {
      const pick = SG.shuffle([...EMO.keys()]).slice(0, 3).sort((a, b) => a - b);
      cards.add(pick.join('.'));
    }
    return SG.shuffle([...cards]).map((k, i) => ({ id: i, e: k.split('.').map(Number) }));
  }

  // ---------- правила ----------

  function create(players, opts) {
    const s = { ids: players.map((p) => p.id), names: {}, score: {}, hands: {}, deck: makeDeck(), teller: -1, target: (opts && +opts.target) || 25, now: Date.now(), round: 0 };
    players.forEach((p) => {
      s.names[p.id] = p.name;
      s.score[p.id] = 0;
      s.hands[p.id] = s.deck.splice(0, HAND);
    });
    s.per = s.ids.length === 3 ? 2 : 1; // втроём каждый подкладывает по две карты
    s.cards = {};
    nextRound(s, s.now);
    return s;
  }

  const TIMES = { tell: 90, match: 60, vote: 60, reveal: 9 };

  function nextRound(s, now) {
    s.round++;
    s.teller = (s.teller + 1) % s.ids.length;
    s.phase = 'tell';
    s.clue = '';
    s.played = {}; // id → [cardId]
    s.table = [];
    s.votes = {};
    s.deadline = now + TIMES.tell * 1000;
  }

  const tellerId = (s) => s.ids[s.teller];
  const findCard = (s, id) => s.cards[id];

  function refill(s) {
    s.ids.forEach((id) => {
      while (s.hands[id].length < HAND && s.deck.length) s.hands[id].push(s.deck.pop());
    });
  }

  function toVote(s, now) {
    // выкладываем карты рубашкой вниз в случайном порядке
    s.table = SG.shuffle(Object.entries(s.played).flatMap(([id, cs]) => cs.map((c) => ({ card: c, by: +id }))));
    s.phase = 'vote';
    s.deadline = now + TIMES.vote * 1000;
  }

  function score(s, now) {
    const t = tellerId(s);
    const tc = s.played[t][0].id;
    const guessers = s.ids.filter((id) => id !== t);
    const right = guessers.filter((id) => s.votes[id] === tc);
    const gain = {};
    s.ids.forEach((id) => (gain[id] = 0));
    if (right.length === 0 || right.length === guessers.length) guessers.forEach((id) => (gain[id] += 2));
    else {
      gain[t] += 3;
      right.forEach((id) => (gain[id] += 3));
    }
    // по очку за каждый голос за свою карту
    Object.values(s.votes).forEach((cid) => {
      const owner = s.table.find((x) => x.card.id === cid);
      if (owner && owner.by !== t) gain[owner.by] += 1;
    });
    s.ids.forEach((id) => (s.score[id] += gain[id]));
    s.gain = gain;
    s.phase = 'reveal';
    s.deadline = now + TIMES.reveal * 1000;
  }

  function act(s, id, a, now) {
    if (!a || s.phase === 'end') return false;
    const hand = s.hands[id];
    if (!hand) return false;
    if (s.phase === 'tell' && id === tellerId(s) && a.card !== undefined && a.clue) {
      const i = hand.findIndex((c) => c.id === a.card);
      if (i < 0) return false;
      s.clue = String(a.clue).trim().slice(0, 60);
      if (!s.clue) return false;
      s.played[id] = hand.splice(i, 1);
      s.phase = 'match';
      s.deadline = now + TIMES.match * 1000;
      return true;
    }
    if (s.phase === 'match' && id !== tellerId(s) && a.card !== undefined) {
      const mine = s.played[id] || [];
      if (mine.length >= s.per) return false;
      const i = hand.findIndex((c) => c.id === a.card);
      if (i < 0) return false;
      mine.push(hand.splice(i, 1)[0]);
      s.played[id] = mine;
      if (s.ids.every((x) => x === tellerId(s) || (s.played[x] || []).length >= s.per)) toVote(s, now);
      return true;
    }
    if (s.phase === 'vote' && id !== tellerId(s) && a.vote !== undefined && s.votes[id] === undefined) {
      const c = s.table.find((x) => x.card.id === a.vote);
      if (!c || c.by === id) return false;
      s.votes[id] = a.vote;
      if (s.ids.every((x) => x === tellerId(s) || s.votes[x] !== undefined)) score(s, now);
      return true;
    }
    return false;
  }

  function tick(s, now) {
    s.now = now;
    if (s.phase === 'end' || now < s.deadline) return false;
    if (s.phase === 'tell') {
      // ведущий промолчал — ход переходит
      nextRound(s, now);
      return true;
    }
    if (s.phase === 'match') {
      // кто не выбрал — кладём за него случайную карту
      s.ids.forEach((id) => {
        if (id === tellerId(s)) return;
        const mine = s.played[id] || [];
        while (mine.length < s.per && s.hands[id].length) mine.push(s.hands[id].splice(Math.floor(Math.random() * s.hands[id].length), 1)[0]);
        s.played[id] = mine;
      });
      toVote(s, now);
      return true;
    }
    if (s.phase === 'vote') {
      score(s, now);
      return true;
    }
    if (s.phase === 'reveal') {
      refill(s);
      const best = Math.max(...s.ids.map((id) => s.score[id]));
      const empty = s.ids.some((id) => s.hands[id].length < s.per + 0) && !s.deck.length;
      if (best >= s.target || empty) {
        s.phase = 'end';
        s.winners = s.ids.filter((id) => s.score[id] === best);
      } else nextRound(s, now);
      return true;
    }
    return false;
  }

  function leave(s, id) {
    if (s.phase === 'tell' && tellerId(s) === id) nextRound(s, s.now);
  }

  // ---------- боты ----------

  const cardTags = (c) => c.e.flatMap((i) => TAGS[i]);
  function match(c, clue) {
    const words = clue.split(/[^а-яёa-z]+/i).filter((w) => w.length > 2).map(stem);
    const tags = cardTags(c).map(stem);
    return words.reduce((a, w) => a + (tags.includes(w) ? 1 : 0), 0);
  }

  function ai(s, id, level) {
    const hand = s.hands[id];
    if (!hand) return null;
    if (s.phase === 'tell' && id === tellerId(s)) {
      const c = hand[Math.floor(Math.random() * hand.length)];
      const tags = c.e.map((i) => TAGS[i]);
      // лёгкий бот говорит прямо, сильный — берёт более далёкое слово
      const pickTag = (arr) => arr[level === 'easy' ? 0 : level === 'hard' ? arr.length - 1 : Math.floor(Math.random() * arr.length)];
      const clue = level === 'hard' && Math.random() < 0.5 ? pickTag(tags[0]) + ' и ' + pickTag(tags[1]) : pickTag(tags[Math.floor(Math.random() * tags.length)]);
      return { card: c.id, clue };
    }
    if (s.phase === 'match' && id !== tellerId(s) && (s.played[id] || []).length < s.per) {
      const scored = hand.map((c) => [c, match(c, s.clue) + Math.random() * 0.5]).sort((a, b) => b[1] - a[1]);
      return { card: scored[0][0].id };
    }
    if (s.phase === 'vote' && id !== tellerId(s) && s.votes[id] === undefined) {
      const opts = s.table.filter((x) => x.by !== id);
      const noise = { easy: 1.5, normal: 0.7, hard: 0.3 }[level];
      const scored = opts.map((x) => [x.card.id, match(x.card, s.clue) + Math.random() * noise]).sort((a, b) => b[1] - a[1]);
      return { vote: scored[0][0] };
    }
    return null;
  }

  // ---------- вид ----------

  function view(s, id) {
    const t = tellerId(s);
    const reveal = s.phase === 'reveal' || s.phase === 'end';
    return {
      phase: s.phase,
      round: s.round,
      teller: t,
      clue: s.clue,
      hand: s.hands[id] || null,
      per: s.per,
      myPlayed: (s.played[id] || []).map((c) => c.id),
      played: s.ids.filter((x) => (s.played[x] || []).length >= (x === t ? 1 : s.per)),
      table: s.phase === 'vote' || reveal ? s.table.map((x) => ({ card: x.card, by: reveal || x.by === id ? x.by : null, votes: reveal ? Object.entries(s.votes).filter(([, v]) => v === x.card.id).map(([k]) => +k) : null })) : null,
      myVote: s.votes[id],
      voted: s.ids.filter((x) => s.votes[x] !== undefined),
      gain: reveal ? s.gain : null,
      scores: s.ids.map((pid) => ({ id: pid, name: s.names[pid], score: s.score[pid] })),
      target: s.target,
      left: Math.max(0, (s.deadline - Date.now()) / 1000),
      over: s.phase === 'end',
      winners: s.winners || null,
      deck: s.deck.length,
    };
  }

  // ---------- отрисовка ----------

  const cardHtml = (c, extra = '', attrs = '') => `<button type="button" class="dx-card ${extra}" ${attrs}>${c.e.map((i) => `<span>${EMO[i][0]}</span>`).join('')}</button>`;
  let chosen = null;

  function render(v, ui) {
    const el = ui.el;
    const me = ui.me;
    const teller = v.teller === me;
    const timer = `<span class="pt-timer" data-left="${v.left}">${Math.ceil(v.left)}</span>`;
    const scores = v.scores
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((p) => `<div class="pt-seat${p.id === v.teller ? ' turn' : ''}${p.id === me ? ' me' : ''}"><b>${p.id === v.teller ? '🎙 ' : v.played.includes(p.id) || v.voted.includes(p.id) ? '✓ ' : ''}${esc(p.name)}</b><span>${p.score}${v.gain && v.gain[p.id] ? ` <em class="qz-plus">+${v.gain[p.id]}</em>` : ''}</span></div>`)
      .join('');
    let head = '';
    let body = '';
    let handMode = '';
    if (v.phase === 'tell') {
      head = teller ? `Вы ведущий: выберите карту и придумайте ассоциацию ${timer}` : `${esc(ui.name(v.teller))} загадывает ассоциацию… ${timer}`;
      if (teller) {
        handMode = 'pick';
        body = `<form class="dx-clue"><input type="text" maxlength="60" placeholder="Слово, фраза, строчка песни…" required><button class="btn btn-primary" type="submit" ${chosen === null ? 'disabled' : ''}>Загадать</button></form><p class="pt-muted">Не слишком прямо и не слишком туманно: если угадают все или никто — вы получите 0.</p>`;
      }
    } else if (v.phase === 'match') {
      head = `Ассоциация: «${esc(v.clue)}» ${timer}`;
      if (!teller && v.hand && v.myPlayed.length < v.per) {
        handMode = 'play';
        body = `<p>Подложите ${v.per > 1 ? 'две карты' : 'карту'}, которая тоже подходит — чтобы запутать остальных.</p>`;
      } else body = '<p class="pt-muted">Ждём, пока все подложат карты…</p>';
    } else if (v.phase === 'vote' || v.phase === 'reveal') {
      head = v.phase === 'vote' ? `«${esc(v.clue)}» — какая карта ведущего? ${timer}` : `«${esc(v.clue)}» — итоги раунда`;
      const canVote = v.phase === 'vote' && !teller && v.myVote === undefined && !ui.watcher;
      body =
        `<div class="dx-table">${v.table
          .map((x) => {
            const own = x.by === me;
            const isT = v.phase === 'reveal' && x.by === v.teller;
            const extra = (own ? 'own ' : '') + (isT ? 'teller ' : '') + (v.myVote === x.card.id ? 'sel ' : '');
            const info = v.phase === 'reveal' ? `<small>${esc(ui.name(x.by))}${isT ? ' (ведущий)' : ''}${x.votes.length ? ' · ' + x.votes.map((k) => esc(ui.name(k))).join(', ') : ''}</small>` : own ? '<small>ваша</small>' : '';
            return `<div class="dx-slot">${cardHtml(x.card, extra, canVote && !own ? `data-vote="${x.card.id}"` : 'disabled')}${info}</div>`;
          })
          .join('')}</div>` + (v.phase === 'vote' ? (teller ? '<p class="pt-muted">Вы ведущий — смотрите, как голосуют.</p>' : v.myVote !== undefined ? '<p class="pt-muted">Голос принят.</p>' : '<p>Выберите карту, которую, по-вашему, выложил ведущий.</p>') : '');
    } else if (v.over) {
      const w = v.winners || [];
      head = 'Игра окончена';
      body = `<p class="pt-big">${w.includes(me) ? 'Вы победили! 🏆' : 'Победа: ' + w.map((x) => esc(ui.name(x))).join(', ')}</p>`;
    }
    const hand = v.hand
      ? `<div class="dx-hand-label">Ваши карты</div><div class="dx-hand">${v.hand.map((c) => cardHtml(c, (handMode === 'pick' && chosen === c.id ? 'sel ' : '') + (handMode ? 'can' : ''), handMode ? `data-card="${c.id}"` : 'disabled')).join('')}</div>`
      : '';
    el.innerHTML = `<div class="pt-panel dx"><div class="pt-seats">${scores}</div><h3>${head}</h3>${body}${hand}<p class="pt-muted">Игра до ${v.target} очков · в колоде ${v.deck}</p></div>`;
    el.querySelectorAll('[data-card]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = +b.dataset.card;
        if (handMode === 'pick') {
          chosen = id;
          el.querySelectorAll('.dx-hand .dx-card').forEach((x) => x.classList.toggle('sel', +x.dataset.card === id));
          el.querySelector('.dx-clue button').disabled = false;
        } else ui.send({ card: id });
      })
    );
    el.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => ui.send({ vote: +b.dataset.vote })));
    const f = el.querySelector('.dx-clue');
    if (f)
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = f.querySelector('input').value.trim();
        if (!t || chosen === null) return;
        ui.send({ card: chosen, clue: t });
        chosen = null;
      });
    const key = v.phase + v.round;
    if (render.key !== key) {
      render.key = key;
      if (v.phase === 'tell' && teller) SG.sound.play('hint');
      if (v.phase === 'reveal') SG.sound.play(v.gain && v.gain[me] ? 'coin' : 'flip');
      if (v.over) {
        const won = (v.winners || []).includes(me);
        SG.sound.play(won ? 'win' : 'lose');
        if (won) SG.store.set('dixit-wins', SG.store.get('dixit-wins', 0) + 1);
      }
    }
  }

  SG.party({
    game: 'dixit',
    min: 3,
    max: 8,
    bots: true,
    soloBots: 3,
    aiForGone: true,
    botDelay: () => 2000 + Math.random() * 4000,
    options: {
      html: '<label>Играем до <select data-target><option value="15">15 очков</option><option value="25" selected>25 очков</option><option value="30">30 очков</option></select></label>',
      read: (el) => ({ target: +((el.querySelector('[data-target]') || {}).value || 25) }),
      show(el, o) {
        if (o && o.target) el.querySelector('[data-target]').value = String(o.target);
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
