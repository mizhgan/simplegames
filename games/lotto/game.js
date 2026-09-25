/* Русское лото вдвоём: достаём бочонки, кто первым закроет карточку */
(() => {
  'use strict';

  const CARDS = 2; // карточек у каждого
  const NICK = {
    1: 'кол', 7: 'кочерга', 8: 'бабушкины очки', 11: 'барабанные палочки', 12: 'дюжина', 13: 'чёртова дюжина', 18: 'совершеннолетие',
    22: 'гусочки', 25: 'опять двадцать пять', 33: 'кудри', 44: 'стульчики', 48: 'половинку просим', 50: 'полсотни', 55: 'перчатки',
    66: 'валенки', 69: 'туда-сюда', 77: 'топорики', 88: 'бараночки', 89: 'дедушкин сосед', 90: 'дедушка',
  };

  // карточка: 3 ряда × 9 столбцов, в ряду 5 чисел; в столбце k числа от 10k до 10k+9 (1–9 и 80–90 по краям)
  function makeCard(rand) {
    const colRange = (k) => (k === 0 ? [1, 9] : k === 8 ? [80, 90] : [k * 10, k * 10 + 9]);
    for (;;) {
      const layout = [0, 1, 2].map(() => SG.duel.shuffleWith([0, 1, 2, 3, 4, 5, 6, 7, 8], rand).slice(0, 5).sort((a, b) => a - b));
      // в каждом столбце хотя бы одно число
      const perCol = Array.from({ length: 9 }, (_, k) => layout.filter((r) => r.includes(k)).length);
      if (perCol.some((c) => c === 0)) continue;
      const card = [0, 1, 2].map(() => new Array(9).fill(0));
      for (let k = 0; k < 9; k++) {
        const [lo, hi] = colRange(k);
        const pool = [];
        for (let v = lo; v <= hi; v++) pool.push(v);
        const nums = SG.duel.shuffleWith(pool, rand).slice(0, perCol[k]).sort((a, b) => a - b);
        let j = 0;
        for (let r = 0; r < 3; r++) if (layout[r].includes(k)) card[r][k] = nums[j++];
      }
      return card;
    }
  }

  function create(seed) {
    const rand = SG.duel.rng(seed);
    const cards = [0, 1].map(() => Array.from({ length: CARDS }, () => makeCard(rand)));
    const bag = SG.duel.shuffleWith(Array.from({ length: 90 }, (_, i) => i + 1), rand);
    return { cards, bag, drawn: [], turn: 0 };
  }

  // «короткая» игра: побеждает первый закрытый ряд на любой карточке
  const rowLeft = (s, row) => row.filter((v) => v && !s.drawn.includes(v)).length;
  const closed = (s, card) => card.some((row) => rowLeft(s, row) === 0);
  const left = (s, p) => Math.min(...s.cards[p].flatMap((c) => c.map((row) => rowLeft(s, row))));

  const legal = (s, m) => !!m && m.d === 1 && !s.win && s.bag.length > 0;

  function apply(s) {
    const n = s.bag[s.drawn.length];
    s.drawn.push(n);
    s.last = n;
    const done = [0, 1].map((p) => s.cards[p].some((c) => closed(s, c)));
    if (done[0] || done[1]) s.win = done[0] && done[1] ? 'both' : done[0] ? 0 : 1;
    s.turn = 1 - s.turn;
  }

  // ---------- интерфейс ----------

  const $ = (id) => document.getElementById(id);
  const autoBtn = $('auto-btn');
  let auto = SG.store.get('lotto-auto', true);
  let autoTimer = 0;
  const tickAuto = () => {
    clearTimeout(autoTimer);
    if (!auto) return;
    autoTimer = setTimeout(() => {
      if (auto && duel.canMove()) duel.play({ d: 1 });
      tickAuto();
    }, 1100);
  };
  autoBtn.addEventListener('click', () => {
    auto = !auto;
    SG.store.set('lotto-auto', auto);
    render();
    tickAuto();
  });
  $('draw-btn').addEventListener('click', () => duel.play({ d: 1 }));
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !e.target.closest('input')) {
      e.preventDefault();
      duel.play({ d: 1 });
    }
  });
  const render = () => duel.render();

  function cardHtml(s, card, fresh) {
    return (
      '<div class="lt-card">' +
      card
        .map((row) => {
          const full = rowLeft(s, row) === 0;
          return row.map((v) => (v ? `<span class="${s.drawn.includes(v) ? 'hit' : ''}${v === fresh ? ' fresh' : ''}${full ? ' row-win' : ''}">${v}</span>` : `<span class="blank${full ? ' row-win' : ''}"></span>`)).join('');
        })
        .join('') +
      '</div>'
    );
  }

  const duel = SG.duel({
    game: 'lotto',
    sides: ['Первый', 'Второй'],
    create,
    legal,
    apply,
    over(s) {
      if (s.win === undefined) return null;
      return { winner: s.win === 'both' ? null : s.win, text: 'Ряд закрыт на ' + s.drawn.length + '-м бочонке!' };
    },
    hint: () => 'достаньте бочонок',
    ai: () => ({ d: 1 }),
    aiDelay: 900,
    sound: () => 'drop',
    render(s, v) {
      const me = v.watch ? v.hostSide : v.mode === 'pvp' ? 0 : v.me === null || v.me === undefined ? 0 : v.me;
      const op = 1 - me;
      const names = v.mode === 'ai' ? ['Вы', 'Компьютер'] : v.mode === 'pvp' ? ['Первый игрок', 'Второй игрок'] : v.watch ? ['Игрок 1', 'Игрок 2'] : ['Вы', 'Соперник'];
      $('opp-name').textContent = names[1];
      $('my-name').textContent = names[0];
      $('opp-left').textContent = 'до победы: ' + left(s, op);
      $('my-left').textContent = 'до победы: ' + left(s, me);
      $('opp-cards').innerHTML = s.cards[op].map((c) => cardHtml(s, c, s.last)).join('');
      $('my-cards').innerHTML = s.cards[me].map((c) => cardHtml(s, c, s.last)).join('');
      $('barrel').innerHTML = s.last ? `<b>${s.last}</b><small>${NICK[s.last] || ''}</small>` : '<small>мешок с бочонками</small>';
      $('history').textContent = s.drawn.slice(-12).reverse().join(' · ');
      $('count').textContent = 'Вынуто: ' + s.drawn.length + ' из 90';
      $('draw-btn').disabled = !v.canMove;
      autoBtn.textContent = auto ? 'Авто: вкл' : 'Авто: выкл';
      autoBtn.classList.toggle('active', auto);
      if (v.canMove && auto) tickAuto();
    },
  });
})();
