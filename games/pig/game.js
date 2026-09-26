/* Свинья: бросайте кубик сколько хотите, но единица сжигает всё, что набрано за ход. До 100 */
(() => {
  'use strict';

  const GOAL = 100;
  const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const ROLL_MS = 800; // бросок кубика
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pts = (n) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'очко' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'очка' : 'очков');

  // кубик — из «зерна» партии, чтобы по сети у обоих выпадало одно и то же
  function die(s) {
    s.rnd = (s.rnd + 0x6d2b79f5) >>> 0;
    let t = s.rnd;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return 1 + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 6);
  }

  function create(seed) {
    return { rnd: seed >>> 0, scores: [0, 0], pot: 0, turn: 0, rolls: [], last: null };
  }

  const legal = (s, m) => !!m && (m.r === 1 || (m.h === 1 && s.pot > 0));

  function apply(s, m) {
    if (m.r) {
      const d = die(s);
      s.rolls.push(d);
      s.last = { side: s.turn, d };
      if (d === 1) {
        s.last.lost = s.pot;
        s.pot = 0;
        s.rolls = [];
        s.bust = s.turn;
        s.turn = 1 - s.turn;
      } else {
        s.pot += d;
        s.bust = null;
      }
    } else {
      s.scores[s.turn] += s.pot;
      s.last = { side: s.turn, held: s.pot };
      s.pot = 0;
      s.rolls = [];
      s.bust = null;
      if (s.scores[s.turn] < GOAL) s.turn = 1 - s.turn;
    }
  }

  function ai(s, level) {
    const me = s.turn;
    const mine = s.scores[me] + s.pot;
    if (mine >= GOAL) return s.pot ? { h: 1 } : { r: 1 };
    if (!s.pot) return { r: 1 };
    const opp = s.scores[1 - me];
    let limit;
    if (level === 'easy') limit = 10 + Math.floor(Math.random() * 12);
    else if (level === 'normal') limit = 20;
    // сильный: рискует больше, когда отстаёт, и осторожнее, когда впереди
    else {
      limit = Math.max(14, Math.min(30, 21 + Math.round((opp - s.scores[me]) / 8)));
      // соперник почти у цели — идём до конца
      if (opp >= 80) limit = GOAL;
    }
    return s.pot >= limit ? { h: 1 } : { r: 1 };
  }

  const $ = (id) => document.getElementById(id);
  const duel = SG.duel({
    game: 'pig',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over: (s) => (s.scores[0] >= GOAL ? { winner: 0, text: 'Счёт ' + s.scores[0] + ':' + s.scores[1] + '.' } : s.scores[1] >= GOAL ? { winner: 1, text: 'Счёт ' + s.scores[1] + ':' + s.scores[0] + '.' } : null),
    hint: (s) => (s.pot ? 'в ходе ' + s.pot + ' — бросить ещё или записать?' : 'бросайте кубик'),
    ai,
    aiDelay: 650,
    // «сгорело» звучит, когда кубик докатился (см. render)
    sound: (s, m) => (m.h ? 'coin' : s.bust !== null && s.bust !== undefined && reduce() ? 'error' : 'drop'),
    roll: (s, m) => (m.r && !reduce() ? ROLL_MS : 0),
    rollText: 'Кубик катится…',
    render(s, v) {
      // пока кубик катится, остальное (очки хода, чей ход) показываем как было
      if (v.busy) {
        if (v.last !== rolled) {
          rolled = v.last;
          rollDie($('pg-die'), s.last.d);
        }
        $('roll-btn').disabled = $('hold-btn').disabled = true;
        return;
      }
      if (rolled && rolled === v.last && s.last && s.last.d === 1) SG.sound.play('error');
      rolled = null;
      const me = v.watch ? v.hostSide : v.me === null || v.me === undefined ? 0 : v.me;
      const name = (x) => (v.mode === 'pvp' ? (x ? 'Игрок 2' : 'Игрок 1') : v.watch ? (x === v.hostSide ? 'Игрок 1' : 'Игрок 2') : x === me ? 'Вы' : v.mode === 'ai' ? 'Компьютер' : 'Соперник');
      [0, 1].forEach((x) => {
        $('pg-name-' + x).textContent = name(x);
        $('pg-pts-' + x).textContent = s.scores[x];
        $('pg-bar-' + x).style.width = Math.min(100, s.scores[x]) + '%';
        $('pg-side-' + x).classList.toggle('turn', s.turn === x && !v.over);
      });
      const L = s.last;
      $('pg-die').textContent = L && L.d ? FACES[L.d] : '🎲';
      $('pg-die').classList.toggle('bust', !!(L && L.d === 1));
      $('pg-die').classList.remove('rolling');
      $('pg-pot').textContent = s.pot
        ? 'В ходе: ' + s.pot + ' (' + s.rolls.join(' + ') + ')'
        : L && L.d === 1
          ? name(L.side) + ': единица — ' + (L.lost ? 'сгорело ' + pts(L.lost) + '!' : 'ход переходит.')
          : L && L.held
            ? name(L.side) + ': +' + L.held + ', всего ' + s.scores[L.side]
            : '';
      $('roll-btn').disabled = !v.canMove;
      $('hold-btn').disabled = !v.canMove || !s.pot;
    },
  });
  // один спокойный оборот: кубик докатывается и ближе к концу ложится выпавшей гранью (остальное покажет render)
  let rolled = null; // ход, бросок которого сейчас катится
  function rollDie(el, d) {
    el.classList.remove('bust');
    el.classList.add('rolling');
    setTimeout(() => el.classList.contains('rolling') && (el.textContent = FACES[d]), ROLL_MS * 0.6);
  }

  $('roll-btn').addEventListener('click', () => duel.play({ r: 1 }));
  $('hold-btn').addEventListener('click', () => duel.play({ h: 1 }));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      duel.play({ r: 1 });
    } else if (e.code === 'Enter') duel.play({ h: 1 });
  });
})();
