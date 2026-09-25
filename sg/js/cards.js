/* SimpleGames — игральные карты для карточных игр на двоих (вид карт — sg/css/cards.css). */
(() => {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = ['пики', 'червы', 'бубны', 'трефы'];
  const RANK_NAMES = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
  const isRed = (c) => c.suit === 1 || c.suit === 2;

  // колода от minRank до туза; id — стабильный номер карты
  function deck(minRank = 2) {
    const out = [];
    for (let s = 0; s < 4; s++) for (let r = minRank; r <= 14; r++) out.push({ id: s * 13 + (r - 2), rank: r, suit: s });
    return out;
  }
  const byId = (id) => ({ id, rank: (id % 13) + 2, suit: Math.floor(id / 13) });

  function html(c, extra = '') {
    const r = RANK_NAMES[c.rank];
    const s = SUITS[c.suit];
    return (
      `<div class="sol-card up ${isRed(c) ? 'red' : ''} ${extra}" data-id="${c.id}" aria-label="${r} ${SUIT_NAMES[c.suit]}">` +
      `<div class="sol-face"><span class="tl">${r}<br>${s}</span><span class="mid">${s}</span><span class="br">${r}<br>${s}</span></div></div>`
    );
  }
  const back = (extra = '') => `<div class="sol-card ${extra}"><div class="sol-back"></div></div>`;
  const name = (c) => RANK_NAMES[c.rank] + SUITS[c.suit];

  SG.cards = { SUITS, SUIT_NAMES, RANK_NAMES, isRed, deck, byId, html, back, name };
})();
