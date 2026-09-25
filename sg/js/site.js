/* SimpleGames — функции сайта: недавние и избранные игры, достижения, «Игра дня».
   Подключается на всех страницах после common.js. */
(() => {
  'use strict';

  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;
  const ROOT = new URL('../../', SCRIPT_URL).href;
  const store = SG.store;

  // ---------- каталог ----------

  const GAMES = {
    snake: 'Змейка', 2048: '2048', tictactoe: 'Крестики-нолики', memory: 'Мемори', minesweeper: 'Сапёр',
    breakout: 'Арканоид', tetris: 'Тетрис', flappy: 'Птичка', sudoku: 'Судоку', fifteen: 'Пятнашки',
    connect4: 'Четыре в ряд', wordle: 'Вордли', solitaire: 'Косынка', checkers: 'Шашки', dino: 'Динозаврик',
    lines: 'Линии', spider: 'Паук', reversi: 'Реверси', battleship: 'Морской бой', match3: 'Три в ряд',
    stack: 'Stack', durak: 'Дурак', nardy: 'Нарды', mahjong: 'Маджонг', bubbles: 'Шарики', fillword: 'Филворд',
    pacman: 'Пакман', balda: 'Балда', freecell: 'Свободная ячейка', nonogram: 'Японские кроссворды', jumper: 'Прыгун',
    pong: 'Понг', simon: 'Саймон', hangman: 'Виселица', wordsmith: 'Слова из слова', gomoku: 'Гомоку',
    dots: 'Точки и квадраты', blackjack: 'Двадцать одно', yahtzee: 'Покер на костях', flow: 'Соедини точки',
    pipes: 'Водопроводчик', sokoban: 'Сокобан', kakuro: 'Какуро', killer: 'Киллер-судоку', frogger: 'Лягушка',
    invaders: 'Космические захватчики', asteroids: 'Астероиды', eggs: 'Яйцелов', tanks: 'Танчики',
    chess: 'Шахматы', uttt: 'Ultimate крестики-нолики', quarto: 'Кватро', ugolki: 'Уголки', mill: 'Мельница',
    mancala: 'Манкала', hex: 'Гекс', go: 'Го 9×9', erudit: 'Эрудит', wordduel: 'Дуэль в Вордли', cities: 'Города',
    crocodile: 'Крокодил-рисовалка', thousand: 'Тысяча', seka: 'Сека', war: 'Пьяница', holdem: 'Покер: холдем',
    tron: 'Трон', airhockey: 'Аэрохоккей', tankduel: 'Танчики вдвоём', bomber: 'Бомбермен-дуэль',
    capture: 'Точки: захват', pentago: 'Пентаго', blokus: 'Блокус', stratego: 'Стратего', domino: 'Домино', lotto: 'Русское лото',
    wordrace: 'Слова из слова: дуэль', bulls: 'Быки и коровы', hangduel: 'Виселица вдвоём',
    snakeduel: 'Змейки-дуэль', tetrisduel: 'Тетрис-баттл', billiards: 'Бильярд', soccer: 'Мини-футбол', racing: 'Гонки',
    artillery: 'Артиллерия', pingpong: 'Настольный теннис',
    mafia: 'Мафия', spy: 'Шпион', dixit: 'Ассоциации', crocoparty: 'Крокодил для компании', pokerparty: 'Покер на компанию',
    durakparty: 'Дурак на компанию', maumau: 'Мау-мау', quiz: 'Викторина', codenames: 'Кодовые слова',
    uno: 'Уно', magnat: 'Магнат', eruditparty: 'Эрудит на компанию', whoami: 'Кто я?', resistance: 'Сопротивление',
    conspiracy: 'Заговор', twotruths: 'Правда или ложь', hat: 'Шляпа', bunker: 'Бункер', bingo: 'Бинго',
    dice1000: 'Тысяча на костях', tournament: 'Турнир',
    pig: 'Свинья', ur: 'Королевская игра Ура', hasami: 'Хасами-сёги', abalone: 'Абалон', blindmaze: 'Лабиринт вслепую',
    backgammon: 'Короткие нарды', crossduel: 'Кросс-ворд батл',
    dogfight: 'Воздушный бой', curling: 'Кёрлинг', sumo: 'Сумо', minigolf: 'Мини-гольф', worms: 'Червячки',
    reaction: 'Реакция', pinball: 'Пинбол-дуэль',
  };
  const TOTAL = Object.keys(GAMES).length;
  const gameUrl = (id) => ROOT + 'games/' + id + '/index.html';

  const pageGame = (() => {
    const m = location.pathname.match(/\/games\/([^/]+)\//);
    return m && GAMES[m[1]] ? m[1] : null;
  })();

  // ---------- недавние и сыгранные ----------

  if (pageGame) {
    const recent = store.get('recent', []).filter((id) => id !== pageGame && GAMES[id]);
    recent.unshift(pageGame);
    store.set('recent', recent.slice(0, 8));
    const played = store.get('played', []);
    if (!played.includes(pageGame)) {
      played.push(pageGame);
      store.set('played', played);
    }
  }

  // ---------- «Игра дня» ----------

  // [игра, ключ, тип, сколько, задание]; тип: win — счётчик вырос на n, max — рекорд побит, min — лучшее время улучшено
  const DAILY = [
    ['tictactoe', 'ttt-wins', 'win', 1, 'Выиграйте партию'],
    ['connect4', 'c4-wins', 'win', 1, 'Выиграйте партию'],
    ['checkers', 'checkers-wins', 'win', 1, 'Выиграйте партию'],
    ['reversi', 'reversi-wins', 'win', 1, 'Выиграйте партию'],
    ['battleship', 'battleship-wins', 'win', 1, 'Потопите флот компьютера'],
    ['durak', 'durak-wins', 'win', 1, 'Выиграйте кон и не останьтесь дураком'],
    ['nardy', 'nardy-wins', 'win', 1, 'Выиграйте партию'],
    ['balda', 'balda-wins', 'win', 1, 'Обыграйте компьютер'],
    ['solitaire', 'solitaire-wins', 'win', 1, 'Разложите пасьянс'],
    ['spider', 'spider-wins', 'win', 1, 'Разложите пасьянс'],
    ['freecell', 'freecell-wins', 'win', 1, 'Разложите пасьянс'],
    ['mahjong', 'mahjong-wins', 'win', 1, 'Разберите все плитки'],
    ['wordle', 'wordle-wins', 'win', 1, 'Угадайте слово'],
    ['fillword', 'fillword-wins', 'win', 1, 'Решите филворд'],
    ['nonogram', 'nonogram-solved', 'win', 1, 'Решите японский кроссворд'],
    ['hangman', 'hangman-wins', 'win', 2, 'Угадайте 2 слова'],
    ['gomoku', 'gomoku-wins', 'win', 1, 'Соберите пять в ряд раньше соперника'],
    ['dots', 'dots-wins', 'win', 1, 'Выиграйте партию'],
    ['blackjack', 'blackjack-wins', 'win', 3, 'Выиграйте 3 раздачи'],
    ['yahtzee', 'yahtzee-wins', 'win', 1, 'Обыграйте компьютер'],
    ['pong', 'pong-wins', 'win', 1, 'Выиграйте матч у компьютера'],
    ['flow', 'flow-solved', 'win', 3, 'Решите 3 головоломки'],
    ['pipes', 'pipes-solved', 'win', 2, 'Проведите воду в 2 уровнях'],
    ['sokoban', 'sokoban-solved', 'win', 1, 'Пройдите новый уровень'],
    ['kakuro', 'kakuro-solved', 'win', 1, 'Решите какуро'],
    ['killer', 'killer-solved', 'win', 1, 'Решите киллер-судоку'],
    ['wordsmith', 'wordsmith-words', 'win', 10, 'Найдите 10 слов'],
    ['chess', 'chess-wins', 'win', 1, 'Обыграйте компьютер в шахматы'],
    ['uttt', 'uttt-wins', 'win', 1, 'Выиграйте партию'],
    ['quarto', 'quarto-wins', 'win', 1, 'Выиграйте партию'],
    ['ugolki', 'ugolki-wins', 'win', 1, 'Займите угол раньше компьютера'],
    ['mill', 'mill-wins', 'win', 1, 'Выиграйте партию'],
    ['mancala', 'mancala-wins', 'win', 1, 'Соберите больше камней, чем компьютер'],
    ['hex', 'hex-wins', 'win', 1, 'Соедините свои края раньше компьютера'],
    ['go', 'go-wins', 'win', 1, 'Выиграйте партию'],
    ['erudit', 'erudit-wins', 'win', 1, 'Обыграйте компьютер'],
    ['wordduel', 'wordduel-wins', 'win', 1, 'Угадайте слово раньше соперника'],
    ['cities', 'cities-wins', 'win', 1, 'Переиграйте компьютер в города'],
    ['thousand', 'thousand-wins', 'win', 1, 'Первым наберите 1000'],
    ['seka', 'seka-wins', 'win', 1, 'Оставьте компьютер без фишек'],
    ['war', 'war-wins', 'win', 1, 'Соберите все карты'],
    ['holdem', 'holdem-wins', 'win', 1, 'Выиграйте все фишки'],
    ['tron', 'tron-wins', 'win', 1, 'Выиграйте матч'],
    ['airhockey', 'airhockey-wins', 'win', 1, 'Выиграйте матч'],
    ['tankduel', 'tankduel-wins', 'win', 1, 'Выиграйте танковую дуэль'],
    ['bomber', 'bomber-wins', 'win', 1, 'Выиграйте матч'],
    ['capture', 'capture-wins', 'win', 1, 'Захватите больше точек, чем компьютер'],
    ['pentago', 'pentago-wins', 'win', 1, 'Соберите пять в ряд'],
    ['blokus', 'blokus-wins', 'win', 1, 'Выставьте больше клеток, чем компьютер'],
    ['stratego', 'stratego-wins', 'win', 1, 'Захватите флаг компьютера'],
    ['domino', 'domino-wins', 'win', 1, 'Выиграйте партию'],
    ['lotto', 'lotto-wins', 'win', 1, 'Первым закройте ряд'],
    ['wordrace', 'wordrace-wins', 'win', 1, 'Составьте больше слов, чем компьютер'],
    ['bulls', 'bulls-wins', 'win', 1, 'Угадайте число раньше компьютера'],
    ['hangduel', 'hangduel-wins', 'win', 1, 'Отгадайте слово лучше соперника'],
    ['snakeduel', 'snakeduel-wins', 'win', 1, 'Выиграйте матч'],
    ['tetrisduel', 'tetrisduel-wins', 'win', 1, 'Переиграйте соперника'],
    ['billiards', 'billiards-wins', 'win', 1, 'Первым забейте восемь шаров'],
    ['soccer', 'soccer-wins', 'win', 1, 'Выиграйте матч'],
    ['racing', 'racing-wins', 'win', 1, 'Приезжайте первым'],
    ['artillery', 'artillery-wins', 'win', 1, 'Подбейте танк соперника'],
    ['pingpong', 'pingpong-wins', 'win', 1, 'Выиграйте партию до 11'],
    ['maumau', 'maumau-wins', 'win', 1, 'Первым сбросьте все карты'],
    ['durakparty', 'durakparty-wins', 'win', 1, 'Не останьтесь в дураках'],
    ['pokerparty', 'pokerparty-wins', 'win', 1, 'Выиграйте турнир'],
    ['quiz', 'quiz-wins', 'win', 1, 'Выиграйте викторину'],
    ['dixit', 'dixit-wins', 'win', 1, 'Наберите больше всех очков'],
    ['uno', 'uno-wins', 'win', 1, 'Первым сбросьте все карты'],
    ['magnat', 'magnat-wins', 'win', 1, 'Станьте самым богатым'],
    ['dice1000', 'dice1000-wins', 'win', 1, 'Первым наберите 1000'],
    ['bingo', 'bingo-wins', 'win', 1, 'Первым соберите линию'],
    ['pig', 'pig-wins', 'win', 1, 'Первым наберите 100 очков'],
    ['ur', 'ur-wins', 'win', 1, 'Проведите все фишки раньше соперника'],
    ['hasami', 'hasami-wins', 'win', 1, 'Выиграйте партию'],
    ['abalone', 'abalone-wins', 'win', 1, 'Вытолкните шесть шаров соперника'],
    ['blindmaze', 'blindmaze-wins', 'win', 1, 'Найдите выход раньше соперника'],
    ['backgammon', 'backgammon-wins', 'win', 1, 'Выиграйте партию'],
    ['crossduel', 'crossduel-wins', 'win', 1, 'Разгадайте больше слов'],
    ['dogfight', 'dogfight-wins', 'win', 1, 'Выиграйте воздушный бой'],
    ['curling', 'curling-wins', 'win', 1, 'Выиграйте матч'],
    ['sumo', 'sumo-wins', 'win', 1, 'Вытолкните соперника с ринга'],
    ['minigolf', 'minigolf-wins', 'win', 1, 'Пройдите поле за меньшее число ударов'],
    ['worms', 'worms-wins', 'win', 1, 'Победите команду соперника'],
    ['reaction', 'reaction-wins', 'win', 1, 'Будьте быстрее соперника'],
    ['pinball', 'pinball-wins', 'win', 1, 'Выиграйте матч'],
    ['snake', 'snake-best', 'max'],
    ['2048', '2048-best', 'max'],
    ['tetris', 'tetris-best', 'max'],
    ['flappy', 'flappy-best', 'max'],
    ['dino', 'dino-best', 'max'],
    ['breakout', 'breakout-best', 'max'],
    ['lines', 'lines-best', 'max'],
    ['match3', 'match3-best', 'max'],
    ['stack', 'stack-best', 'max'],
    ['bubbles', 'bubbles-best', 'max'],
    ['pacman', 'pacman-best', 'max'],
    ['jumper', 'jumper-best', 'max'],
    ['simon', 'simon-best', 'max'],
    ['invaders', 'invaders-best', 'max'],
    ['asteroids', 'asteroids-best', 'max'],
    ['frogger', 'frogger-best', 'max'],
    ['eggs', 'eggs-best', 'max'],
    ['tanks', 'tanks-best', 'max'],
    ['sudoku', 'sudoku-best-easy', 'min', 0, 'лёгкое судоку'],
    ['minesweeper', 'mines-best-beginner', 'min', 0, 'сапёра на лёгком уровне'],
    ['memory', 'memory-best-s', 'min', 0, 'мемори 4×4', 'moves'],
    ['fifteen', 'fifteen-best-4', 'min', 0, 'пятнашки 4×4', 'moves'],
  ];

  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 864e5));

  function pickFor(key) {
    let h = 2166136261;
    for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h % DAILY.length;
  }

  function dailyIndex(key) {
    const prev = dayKey(new Date(new Date(key + 'T12:00').getTime() - 864e5));
    const i = pickFor(key);
    return i === pickFor(prev) ? (i + 1) % DAILY.length : i;
  }

  function daily() {
    let d = store.get('daily', null);
    if (!d || d.date !== today) {
      const [id, key] = DAILY[dailyIndex(today)];
      d = { date: today, id, base: store.get(key, null), done: false };
      store.set('daily', d);
    }
    return d;
  }

  function dailyInfo() {
    const d = daily();
    const [id, key, kind, n, text, unit] = DAILY.find((x) => x[0] === d.id) || DAILY[dailyIndex(today)];
    const cur = store.get(key, null);
    let goal;
    let progress = '';
    if (kind === 'win') {
      goal = text;
      const got = Math.max(0, (cur || 0) - (d.base || 0));
      if (n > 1) progress = Math.min(got, n) + ' / ' + n;
    } else if (kind === 'max') {
      goal = d.base ? 'Побейте свой рекорд — ' + d.base : 'Сыграйте и установите первый рекорд';
    } else {
      const shown = d.base == null ? '' : unit === 'moves' ? d.base + ' ход.' : SG.formatTime(d.base);
      goal = d.base == null ? 'Решите ' + text : 'Решите ' + text + ' лучше своего рекорда — ' + shown;
    }
    return { d, id, key, kind, n, goal, progress, cur };
  }

  function checkDaily() {
    const info = dailyInfo();
    const { d, kind, n, cur } = info;
    if (d.done || cur == null) return false;
    let ok = false;
    if (kind === 'win') ok = cur - (d.base || 0) >= n;
    else if (kind === 'max') ok = cur > (d.base || 0);
    else ok = d.base == null || cur < d.base;
    if (!ok) return false;
    d.done = true;
    store.set('daily', d);
    const s = store.get('daily-streak', { last: null, count: 0 });
    s.count = s.last === yesterday ? s.count + 1 : s.last === today ? s.count : 1;
    s.last = today;
    store.set('daily-streak', s);
    if (s.count > store.get('daily-best-streak', 0)) store.set('daily-best-streak', s.count);
    store.set('daily-total', store.get('daily-total', 0) + 1);
    toast('✅', 'Задание дня выполнено!', GAMES[d.id]);
    return true;
  }

  // ---------- достижения ----------

  const num = (k) => Number(store.get(k, 0)) || 0;
  const sum = (...keys) => keys.reduce((s, k) => s + num(k), 0);
  const has = (...keys) => (keys.some((k) => store.get(k, null) != null) ? 1 : 0);

  const ACHIEVEMENTS = [
    ['first', '🎮', 'Первая игра', 'Сыграйте в любую игру', () => store.get('played', []).length, 1],
    ['explorer', '🧭', 'Любопытство', 'Попробуйте 10 разных игр', () => store.get('played', []).length, 10],
    ['traveler', '🗺️', 'Путешественник', 'Попробуйте 25 разных игр', () => store.get('played', []).length, 25],
    ['collector', '👑', 'Коллекционер', 'Сыграйте во все игры сайта', () => store.get('played', []).length, TOTAL],
    ['fan', '⭐', 'Любимчики', 'Добавьте 3 игры в избранное', () => store.get('favorites', []).length, 3],
    ['daily', '📅', 'Игра дня', 'Выполните задание дня', () => num('daily-total'), 1],
    ['daily7', '🔥', 'Неделя без пропусков', 'Выполняйте задание дня 7 дней подряд', () => num('daily-best-streak'), 7],
    ['daily30', '🗓️', 'Постоянство', 'Выполните 30 заданий дня', () => num('daily-total'), 30],
    ['snake', '🐍', 'Удав', 'Съешьте 30 яблок в «Змейке»', () => num('snake-best'), 30],
    ['tetris', '🧱', 'Тетрисист', 'Наберите 5000 очков в «Тетрисе»', () => num('tetris-best'), 5000],
    ['2048', '🔢', 'Мастер слияний', 'Наберите 10 000 очков в «2048»', () => num('2048-best'), 10000],
    ['flappy', '🐦', 'Лётчик', 'Пролетите 25 труб в «Птичке»', () => num('flappy-best'), 25],
    ['pacman', '🟡', 'Обжора', 'Наберите 3000 очков в «Пакмане»', () => num('pacman-best'), 3000],
    ['invaders', '👾', 'Защитник Земли', 'Наберите 2000 очков в «Космических захватчиках»', () => num('invaders-best'), 2000],
    ['asteroids', '☄️', 'Космонавт', 'Наберите 5000 очков в «Астероидах»', () => num('asteroids-best'), 5000],
    ['frogger', '🐸', 'Попрыгунья', 'Наберите 1000 очков в «Лягушке»', () => num('frogger-best'), 1000],
    ['eggs', '🥚', 'Ну, погоди!', 'Поймайте 100 яиц в «Яйцелове»', () => num('eggs-best'), 100],
    ['tanks', '🪖', 'Танкист', 'Дойдите до 3-го уровня в «Танчиках»', () => num('tanks-stage'), 3],
    ['simon', '🎵', 'Отличная память', 'Повторите 15 нот в «Саймоне»', () => num('simon-best'), 15],
    ['sudoku', '9️⃣', 'Судоку решено', 'Решите любое судоку', () => has('sudoku-best-easy', 'sudoku-best-medium', 'sudoku-best-hard'), 1],
    ['sudoku-hard', '🧠', 'Мастер судоку', 'Решите сложное судоку', () => has('sudoku-best-hard'), 1],
    ['killer', '➕', 'Киллер', 'Решите киллер-судоку', () => num('killer-solved'), 1],
    ['kakuro', '🔲', 'Какуро', 'Решите 3 какуро', () => num('kakuro-solved'), 3],
    ['mines', '💣', 'Сапёр', 'Разминируйте поле на любом уровне', () => has('mines-best-beginner', 'mines-best-intermediate', 'mines-best-expert'), 1],
    ['mines-expert', '🎖️', 'Сапёр-профи', 'Пройдите «Сапёра» на уровне «Эксперт»', () => has('mines-best-expert'), 1],
    ['sokoban', '📦', 'Кладовщик', 'Пройдите 10 уровней «Сокобана»', () => num('sokoban-solved'), 10],
    ['sokoban-all', '🏗️', 'Хозяин склада', 'Пройдите все 32 уровня «Сокобана»', () => num('sokoban-solved'), 32],
    ['nonogram', '🎨', 'Художник', 'Решите 5 японских кроссвордов', () => num('nonogram-solved'), 5],
    ['flow', '🌈', 'Все цвета', 'Решите 10 головоломок «Соедини точки»', () => num('flow-solved'), 10],
    ['pipes', '🔧', 'Сантехник', 'Проведите воду в 5 уровнях «Водопроводчика»', () => num('pipes-solved'), 5],
    ['wordle', '🔤', 'Словесник', 'Угадайте 10 слов в «Вордли»', () => num('wordle-wins'), 10],
    ['wordsmith', '📚', 'Эрудит', 'Найдите 30 слов в одной партии «Слов из слова»', () => num('wordsmith-best'), 30],
    ['hangman', '🪢', 'Везунчик', 'Угадайте 5 слов подряд в «Виселице»', () => num('hangman-best-streak'), 5],
    ['strategist', '♟️', 'Стратег', 'Одержите 10 побед в логических играх для двоих', () => sum('ttt-wins', 'c4-wins', 'checkers-wins', 'reversi-wins', 'gomoku-wins', 'dots-wins', 'battleship-wins'), 10],
    ['durak', '🃏', 'Не дурак', 'Выиграйте 5 партий в «Дурака»', () => num('durak-wins'), 5],
    ['solitaire', '🂡', 'Пасьянсник', 'Разложите 10 пасьянсов', () => sum('solitaire-wins', 'spider-wins', 'freecell-wins'), 10],
    ['blackjack', '💰', 'Удачливый игрок', 'Доведите банк в «Двадцать одно» до 2000', () => num('blackjack-best'), 2000],
    ['yahtzee', '🎲', 'Покерфейс', 'Наберите 250 очков в «Покере на костях»', () => num('yahtzee-best'), 250],
    ['chess', '♞', 'Шахматист', 'Выиграйте партию в шахматы', () => num('chess-wins'), 1],
    ['go', '⚫', 'Мастер го', 'Выиграйте партию в го', () => num('go-wins'), 1],
    ['erudit', '🔠', 'Знаток слов', 'Выиграйте партию в «Эрудит»', () => num('erudit-wins'), 1],
    ['boards', '🎯', 'Настольщик', 'Одержите 10 побед в Ultimate, Кватро, Уголках, Мельнице, Манкале и Гексе', () => sum('uttt-wins', 'quarto-wins', 'ugolki-wins', 'mill-wins', 'mancala-wins', 'hex-wins'), 10],
    ['cards', '🂮', 'Картёжник', 'Выиграйте 5 матчей в Тысячу, Секу, холдем или Пьяницу', () => sum('thousand-wins', 'seka-wins', 'holdem-wins', 'war-wins'), 5],
    ['arena', '🏆', 'Чемпион арены', 'Выиграйте 5 матчей в Троне, Аэрохоккее, Танчиках вдвоём или Бомбермене', () => sum('tron-wins', 'airhockey-wins', 'tankduel-wins', 'bomber-wins'), 5],
    ['duo', '🤝', 'Дуэлянт', 'Одержите 10 побед в Захвате, Пентаго, Блокусе, Стратего, Домино и Лото', () => sum('capture-wins', 'pentago-wins', 'blokus-wins', 'stratego-wins', 'domino-wins', 'lotto-wins'), 10],
    ['words2', '📝', 'Словесная дуэль', 'Выиграйте 5 раз в Словах-дуэли, Быках и коровах или Виселице вдвоём', () => sum('wordrace-wins', 'bulls-wins', 'hangduel-wins'), 5],
    ['sport', '🏓', 'Спортсмен', 'Выиграйте 5 матчей в бильярд, мини-футбол, теннис или гонки', () => sum('billiards-wins', 'soccer-wins', 'pingpong-wins', 'racing-wins'), 5],
    ['arena2', '💥', 'Боец', 'Выиграйте 5 матчей в Змейках, Тетрис-баттле или Артиллерии', () => sum('snakeduel-wins', 'tetrisduel-wins', 'artillery-wins'), 5],
    ['party', '👥', 'Душа компании', 'Победите в 5 играх на компанию', () => sum('mafia-wins', 'spy-wins', 'dixit-wins', 'crocoparty-wins', 'pokerparty-wins', 'durakparty-wins', 'maumau-wins', 'quiz-wins', 'codenames-wins'), 5],
    ['mafia', '🕴', 'Крёстный отец', 'Победите в «Мафии»', () => num('mafia-wins'), 1],
    ['online', '🌐', 'Сетевой игрок', 'Доиграйте 5 партий по сети', () => num('net-results'), 5],
    ['company', '🎉', 'Вечеринка', 'Победите в 5 играх из Уно, Магната, Кто я, Сопротивления, Заговора, Шляпы, Бункера, Бинго и других', () => sum('uno-wins', 'magnat-wins', 'eruditparty-wins', 'whoami-wins', 'resistance-wins', 'conspiracy-wins', 'twotruths-wins', 'hat-wins', 'bunker-wins', 'bingo-wins', 'dice1000-wins'), 5],
    ['classic', '🏺', 'Древние игры', 'Одержите 5 побед в Свинье, Уре, Хасами-сёги, Абалоне, коротких нардах, Лабиринте или Кросс-ворде', () => sum('pig-wins', 'ur-wins', 'hasami-wins', 'abalone-wins', 'backgammon-wins', 'blindmaze-wins', 'crossduel-wins'), 5],
    ['arena3', '🛩️', 'Ас', 'Выиграйте 5 матчей в Воздушном бою, Кёрлинге, Сумо, Мини-гольфе, Червячках, Реакции или Пинболе', () => sum('dogfight-wins', 'curling-wins', 'sumo-wins', 'minigolf-wins', 'worms-wins', 'reaction-wins', 'pinball-wins'), 5],
    ['champion', '🏆', 'Чемпион турнира', 'Выиграйте турнир в комнате', () => num('tournament-wins'), 1],
    ['rating', '📈', 'Рейтинг 1300', 'Поднимите рейтинг в любой игре по сети до 1300', () => Math.max(0, ...Object.values(store.get('elo', {})).map((e) => (e && e.r) || 0)), 1300],
    ['rivals', '🤜', 'Старые знакомые', 'Сыграйте по сети с 5 разными людьми', () => store.get('rivals', []).length, 5],
  ].map(([id, icon, title, desc, value, target]) => ({ id, icon, title, desc, value, target }));

  const progressOf = (a) => {
    try {
      return Math.min(a.target, a.value() || 0);
    } catch (e) {
      return 0;
    }
  };

  function checkAchievements(silent) {
    const got = store.get('achievements', null);
    const first = got === null;
    const unlocked = got || {};
    const fresh = [];
    ACHIEVEMENTS.forEach((a) => {
      if (unlocked[a.id] || progressOf(a) < a.target) return;
      unlocked[a.id] = Date.now();
      fresh.push(a);
    });
    if (fresh.length || first) store.set('achievements', unlocked);
    // при первом запуске не засыпаем уведомлениями за старые успехи
    if (silent || (first && fresh.length > 1)) return;
    fresh.slice(0, 3).forEach((a) => toast(a.icon, 'Достижение: ' + a.title, a.desc));
  }

  // проверяем после каждого сохранения — игры пишут результаты через SG.store.set
  let timer = 0;
  const origSet = store.set;
  let busy = false;
  store.set = (key, value) => {
    origSet(key, value);
    if (busy) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      busy = true;
      try {
        checkDaily();
        checkAchievements(false);
      } finally {
        busy = false;
      }
    }, 400);
  };

  // ---------- уведомления ----------

  let toastBox = null;
  function toast(icon, title, text) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'sg-toasts';
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    const el = document.createElement('a');
    el.className = 'sg-toast';
    el.href = ROOT + 'achievements.html';
    el.innerHTML = '<span class="sg-toast-icon"></span><span><b></b><small></small></span>';
    el.querySelector('.sg-toast-icon').textContent = icon;
    el.querySelector('b').textContent = title;
    el.querySelector('small').textContent = text || '';
    toastBox.appendChild(el);
    SG.sound.play('hint');
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4700);
  }

  // ---------- ссылка на достижения в шапке ----------

  const TROPHY =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';

  function initHeaderLink() {
    const nav = document.querySelector('.header-nav');
    if (!nav) return;
    const a = document.createElement('a');
    a.className = 'icon-btn';
    a.href = ROOT + 'achievements.html';
    a.title = 'Достижения';
    a.setAttribute('aria-label', 'Достижения');
    a.innerHTML = TROPHY;
    nav.insertBefore(a, nav.firstChild);
  }

  // ---------- главная страница ----------

  const cardFor = (id) => document.querySelector('.game-card[href="games/' + id + '/index.html"]');

  function miniCard(id) {
    const card = cardFor(id);
    const a = document.createElement('a');
    a.className = 'mini-card';
    a.href = gameUrl(id);
    if (card) a.setAttribute('style', card.getAttribute('style'));
    const thumb = card ? card.querySelector('.thumb').innerHTML : '';
    a.innerHTML = '<span class="mini-thumb">' + thumb + '</span><span class="mini-title"></span>';
    a.querySelector('.mini-title').textContent = GAMES[id];
    return a;
  }

  function initHome() {
    const cards = document.querySelectorAll('.game-card');
    if (!cards.length) return;

    // избранное
    let favs = store.get('favorites', []);
    cards.forEach((card) => {
      const m = card.getAttribute('href').match(/games\/([^/]+)\//);
      if (!m) return;
      const id = m[1];
      card.dataset.id = id;
      const star = document.createElement('span');
      star.className = 'fav-btn';
      star.setAttribute('role', 'button');
      star.tabIndex = 0;
      const render = () => {
        const on = favs.includes(id);
        star.textContent = on ? '★' : '☆';
        star.classList.toggle('on', on);
        star.setAttribute('aria-pressed', String(on));
        star.setAttribute('aria-label', on ? 'Убрать из избранного' : 'Добавить в избранное');
        star.title = on ? 'Убрать из избранного' : 'В избранное';
        card.dataset.fav = on ? '1' : '';
      };
      const toggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        favs = store.get('favorites', []);
        favs = favs.includes(id) ? favs.filter((x) => x !== id) : favs.concat(id);
        store.set('favorites', favs);
        SG.sound.play('flag');
        render();
        document.dispatchEvent(new CustomEvent('sg:favchange'));
      };
      star.addEventListener('click', toggle);
      star.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && toggle(e));
      render();
      card.appendChild(star);
    });

    // «Игра дня»
    const dailyEl = document.getElementById('daily');
    if (dailyEl) {
      const info = dailyInfo();
      const card = cardFor(info.id);
      const streak = store.get('daily-streak', { last: null, count: 0 });
      const alive = streak.last === today || streak.last === yesterday;
      const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      dailyEl.className = 'daily-card' + (info.d.done ? ' done' : '');
      if (card) dailyEl.setAttribute('style', card.getAttribute('style'));
      dailyEl.innerHTML =
        '<div class="daily-thumb">' + (card ? card.querySelector('.thumb').innerHTML : '') + '</div>' +
        '<div class="daily-body">' +
        '<div class="daily-label">Игра дня · ' + date + '</div>' +
        '<h2></h2><p class="daily-goal"></p>' +
        '<div class="daily-actions"><a class="btn btn-primary"></a><span class="daily-streak"></span></div>' +
        '</div>';
      dailyEl.querySelector('h2').textContent = GAMES[info.id];
      dailyEl.querySelector('.daily-goal').textContent = (info.d.done ? '✅ Выполнено: ' : '🎯 ') + info.goal + (info.progress && !info.d.done ? ' (' + info.progress + ')' : '');
      const btn = dailyEl.querySelector('.btn');
      btn.href = gameUrl(info.id);
      btn.textContent = info.d.done ? 'Сыграть ещё' : 'Играть';
      const cnt = alive ? streak.count : 0;
      dailyEl.querySelector('.daily-streak').textContent = cnt ? '🔥 ' + cnt + ' ' + plural(cnt, 'день', 'дня', 'дней') + ' подряд' : 'Выполняйте задания каждый день — будет серия 🔥';
      dailyEl.hidden = false;
    }

    // недавние
    const recentEl = document.getElementById('recent');
    if (recentEl) {
      const recent = store.get('recent', []).filter((id) => GAMES[id]).slice(0, 6);
      if (recent.length) {
        const list = recentEl.querySelector('.mini-list');
        recent.forEach((id) => list.appendChild(miniCard(id)));
        recentEl.hidden = false;
      }
    }
    const top = document.getElementById('home-top');
    if (top) top.classList.toggle('single', !recentEl || recentEl.hidden);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- страница достижений ----------

  function initAchievementsPage() {
    const grid = document.getElementById('achievements');
    if (!grid) return;
    const unlocked = store.get('achievements', {}) || {};
    let done = 0;
    ACHIEVEMENTS.forEach((a) => {
      const p = progressOf(a);
      const ok = !!unlocked[a.id];
      if (ok) done++;
      const el = document.createElement('div');
      el.className = 'ach' + (ok ? ' ok' : '');
      el.innerHTML = '<div class="ach-icon"></div><div class="ach-body"><h3></h3><p></p><div class="ach-bar"><i></i></div><small></small></div>';
      el.querySelector('.ach-icon').textContent = a.icon;
      el.querySelector('h3').textContent = a.title;
      el.querySelector('p').textContent = a.desc;
      el.querySelector('.ach-bar i').style.width = (ok ? 100 : (p / a.target) * 100) + '%';
      el.querySelector('small').textContent = ok
        ? 'Получено ' + new Date(unlocked[a.id]).toLocaleDateString('ru-RU')
        : a.target > 1
          ? p + ' / ' + a.target
          : 'Ещё не получено';
      grid.appendChild(el);
    });
    const sum = document.getElementById('ach-summary');
    if (sum) sum.textContent = done + ' из ' + ACHIEVEMENTS.length;
    const bar = document.getElementById('ach-progress');
    if (bar) bar.style.width = (done / ACHIEVEMENTS.length) * 100 + '%';
    const played = document.getElementById('ach-played');
    if (played) played.textContent = store.get('played', []).length + ' из ' + TOTAL;
    const streak = document.getElementById('ach-streak');
    if (streak) streak.textContent = store.get('daily-best-streak', 0);
    const total = document.getElementById('ach-daily');
    if (total) total.textContent = store.get('daily-total', 0);
    initNetProfile();
  }

  // рейтинг по играм и недавние соперники (их записывает sg/js/net.js)
  function initNetProfile() {
    const box = document.getElementById('ach-net');
    if (!box) return;
    const elo = store.get('elo', {}) || {};
    const rivals = (store.get('rivals', []) || []).filter((r) => r && r.id);
    const games = Object.keys(elo).filter((g) => GAMES[g] && elo[g] && elo[g].n);
    if (!games.length && !rivals.length) return;
    box.hidden = false;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    document.getElementById('ach-elo').innerHTML = games.length
      ? games
          .sort((a, b) => elo[b].r - elo[a].r)
          .map((g) => `<li><a href="${gameUrl(g)}">${esc(GAMES[g])}</a><b>${elo[g].r}</b><small>${elo[g].n} ${plural(elo[g].n, 'партия', 'партии', 'партий')}</small></li>`)
          .join('')
      : '<li class="empty">Сыграйте партию по сети — появится рейтинг.</li>';
    document.getElementById('ach-rivals').innerHTML = rivals.length
      ? rivals
          .map((r) => `<li><span>${esc(r.name)}${r.game && GAMES[r.game] ? ` <small>· <a href="${gameUrl(r.game)}">${esc(GAMES[r.game])}</a></small>` : ''}</span><b title="Ваши победы : поражения">${r.w || 0}:${r.l || 0}</b></li>`)
          .join('')
      : '<li class="empty">Пока никого.</li>';
    const cb = document.getElementById('ach-inbox');
    cb.checked = !store.get('inbox-off', false);
    cb.addEventListener('change', () => store.set('inbox-off', !cb.checked));
  }

  SG.site = { GAMES, ACHIEVEMENTS, daily: dailyInfo, toast };

  const ready = () => {
    daily();
    checkDaily();
    checkAchievements(false);
    initHeaderLink();
    initHome();
    initAchievementsPage();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
