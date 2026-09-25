/* Пьяница: открываем карты по очереди, старшая забирает обе; шестёрка бьёт туза */
(() => {
  'use strict';

  const C = SG.cards;
  const LIMIT = 3000; // ходов до подсчёта по числу карт

  // сравнение: 1 — первая старше, −1 — вторая, 0 — спор
  function cmp(a, b) {
    if (a.rank === 6 && b.rank === 14) return 1;
    if (a.rank === 14 && b.rank === 6) return -1;
    return Math.sign(a.rank - b.rank);
  }

  function create(seed) {
    const rand = SG.duel.rng(seed);
    const deck = SG.duel.shuffleWith(C.deck(6), rand).map((c) => c.id);
    return { piles: [deck.slice(0, 18), deck.slice(18)], table: [[], []], turn: 0, flips: 0, war: false, result: null, last: null };
  }

  const legal = (s, m) => !!m && m.f === 1 && !s.over;

  function apply(s, m) {
    void m;
    const me = s.turn;
    const pile = s.piles[me];
    if (s.result) {
      // новый круг: стол очищен
      s.table = [[], []];
      s.result = null;
      s.war = false;
    }
    // в споре сначала кладём карту рубашкой вверх
    if (s.war && pile.length > 1) s.table[me].push({ id: pile.shift(), up: false });
    if (pile.length) s.table[me].push({ id: pile.shift(), up: true });
    s.flips++;
    if (me === 1) resolve(s);
    s.turn = 1 - me;
  }

  function resolve(s) {
    const a = s.table[0][s.table[0].length - 1];
    const b = s.table[1][s.table[1].length - 1];
    const lose = (side) => (s.over = { winner: 1 - side, text: (side ? 'У второго' : 'У первого') + ' игрока кончились карты.' });
    if (!a || !b) return lose(a ? 1 : 0);
    const r = cmp(C.byId(a.id), C.byId(b.id));
    if (r === 0) {
      s.war = true;
      s.result = null;
      if (!s.piles[0].length) return lose(0);
      if (!s.piles[1].length) return lose(1);
      return;
    }
    const w = r > 0 ? 0 : 1;
    // победитель забирает все карты со стола под низ своей колоды
    const won = [...s.table[1 - w], ...s.table[w]].map((x) => x.id);
    s.piles[w].push(...won);
    s.result = { winner: w, n: won.length };
    s.war = false;
    if (!s.piles[1 - w].length) s.over = { winner: w, text: 'Все карты у ' + (w ? 'второго' : 'первого') + ' игрока.' };
    else if (s.flips >= LIMIT) {
      const [x, y] = [s.piles[0].length, s.piles[1].length];
      s.over = { winner: x === y ? null : x > y ? 0 : 1, text: 'Слишком долгая партия — считаем карты: ' + x + ':' + y + '.' };
    }
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const autoBtn = $('auto-btn');
  let auto = false;
  let autoTimer = 0;

  function tickAuto() {
    clearTimeout(autoTimer);
    if (!auto) return;
    autoTimer = setTimeout(() => {
      if (auto && duel.canMove()) duel.play({ f: 1 });
      tickAuto();
    }, 380);
  }
  autoBtn.addEventListener('click', () => {
    auto = !auto;
    autoBtn.classList.toggle('active', auto);
    autoBtn.textContent = auto ? 'Стоп' : 'Автоигра';
    tickAuto();
  });
  $('flip-btn').addEventListener('click', () => duel.play({ f: 1 }));
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !e.target.closest('input')) {
      e.preventDefault();
      duel.play({ f: 1 });
    }
  });
  const pileEls = [$('pile-0'), $('pile-1')];
  pileEls.forEach((el) => el.addEventListener('click', () => duel.play({ f: 1 })));

  const duel = SG.duel({
    game: 'war',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over: (s) => s.over || null,
    hint: (s) => (s.war ? 'спор! Кладите карту рубашкой вверх и ещё одну' : 'открывайте карту'),
    ai: () => ({ f: 1 }),
    aiDelay: 300,
    sound: (s) => (s.result ? (s.result.n > 2 ? 'win' : 'card') : s.war && s.turn === 0 ? 'flag' : 'flip'),
    render(s, v) {
      const top = v.flip ? 0 : 1; // сверху — соперник
      const bottom = 1 - top;
      const name = (side) => (v.mode === 'pvp' ? (side ? 'Игрок 2' : 'Игрок 1') : v.watch ? (side === v.hostSide ? 'Игрок 1' : 'Игрок 2') : side === v.me ? 'Вы' : v.mode === 'ai' ? 'Компьютер' : 'Соперник');
      [[top, 'top'], [bottom, 'bottom']].forEach(([side, pos]) => {
        $('name-' + pos).textContent = name(side);
        $('count-' + pos).textContent = s.piles[side].length + ' карт';
        const pileEl = pos === 'top' ? pileEls[1] : pileEls[0];
        pileEl.innerHTML = s.piles[side].length ? C.back(side === s.turn && v.canMove ? 'playable' : '') : '';
        $('table-' + pos).innerHTML = s.table[side].map((x) => (x.up ? C.html(C.byId(x.id), s.result && s.result.winner === side ? 'win' : '') : C.back())).join('');
        $('label-' + pos).classList.toggle('turn', side === s.turn && !v.over);
      });
      $('msg').textContent = s.result ? name(s.result.winner) + ' забира' + (name(s.result.winner) === 'Вы' ? 'ете' : 'ет') + ' ' + s.result.n + ' карт' + (s.result.n > 4 ? '' : 'ы') : s.war ? 'Спор!' : '';
      $('flip-btn').disabled = !v.canMove;
      if (v.over && auto) autoBtn.click();
    },
  });
})();
