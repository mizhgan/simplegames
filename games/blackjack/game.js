/* Двадцать одно (блэкджек) */
(() => {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  const START = 1000;
  const DELAY = 480;

  const $ = (id) => document.getElementById(id);
  const dealerEl = $('dealer');
  const playerEl = $('player');
  const statusEl = $('status');
  const dealBtn = $('deal-btn');
  const hitBtn = $('hit-btn');
  const standBtn = $('stand-btn');
  const doubleBtn = $('double-btn');

  let balance = SG.store.get('blackjack-balance', START);
  let bet = Number(SG.store.get('blackjack-bet', '50'));
  let deck = [];
  let dealer, player, stake, phase, timer;
  // phase: 'bet' — ставка, 'play' — ход игрока, 'dealer' — ход дилера

  // ---------- карты ----------

  function freshDeck() {
    const d = [];
    let id = 0;
    for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ s, r, id: id++ });
    return SG.shuffle(d);
  }

  function take() {
    if (deck.length < 1) deck = freshDeck();
    return deck.pop();
  }

  const cardValue = (c) => (c.r === 12 ? 11 : Math.min(10, c.r + 2));

  function total(hand) {
    let t = 0;
    let aces = 0;
    for (const c of hand) {
      t += cardValue(c);
      if (c.r === 12) aces++;
    }
    while (t > 21 && aces) {
      t -= 10;
      aces--;
    }
    return { t, soft: aces > 0 };
  }

  const isBJ = (hand) => hand.length === 2 && total(hand).t === 21;

  function cardHTML(c, hidden) {
    if (hidden) return '<div class="sol-card bj-new"><div class="sol-back"></div></div>';
    const r = RANKS[c.r];
    const s = SUITS[c.s];
    const red = c.s === 1 || c.s === 2;
    return (
      `<div class="sol-card up ${red ? 'red' : ''} ${c.fresh ? 'bj-new' : ''}">` +
      `<div class="sol-face"><span class="tl">${r}<br>${s}</span><span class="mid">${s}</span><span class="br">${r}<br>${s}</span></div></div>`
    );
  }

  // ---------- отрисовка ----------

  function render() {
    const hideHole = phase === 'play';
    dealerEl.innerHTML = (dealer || []).map((c, i) => cardHTML(c, hideHole && i === 1)).join('');
    playerEl.innerHTML = (player || []).map((c) => cardHTML(c)).join('');
    [...(dealer || []), ...(player || [])].forEach((c) => (c.fresh = false));
    const dt = dealer && dealer.length ? (hideHole ? total([dealer[0]]).t + ' + ?' : total(dealer).t) : '';
    const pt = player && player.length ? total(player) : null;
    $('dealer-total').textContent = dt;
    $('player-total').textContent = pt ? (pt.soft && pt.t < 21 ? pt.t - 10 + '/' + pt.t : pt.t) : '';
    $('balance').textContent = balance;
    $('stake').textContent = stake || bet;
    $('wins').textContent = SG.store.get('blackjack-wins', 0);
    $('bet').hidden = phase !== 'bet';
    dealBtn.hidden = phase !== 'bet';
    hitBtn.hidden = standBtn.hidden = doubleBtn.hidden = phase === 'bet';
    hitBtn.disabled = standBtn.disabled = phase !== 'play';
    doubleBtn.disabled = phase !== 'play' || player.length !== 2 || balance < stake;
    if (phase === 'bet') {
      if (balance < 10) {
        dealBtn.textContent = 'Начать заново (' + START + ')';
      } else {
        dealBtn.textContent = 'Раздать (ставка ' + Math.min(bet, balance) + ')';
      }
    }
  }

  // ---------- ход игры ----------

  function deal() {
    if (phase !== 'bet') return;
    if (balance < 10) {
      balance = START;
      SG.store.set('blackjack-balance', balance);
      statusEl.textContent = 'Банк восстановлен. Делайте ставку.';
      render();
      return;
    }
    if (deck.length < 15) {
      deck = freshDeck();
      statusEl.textContent = 'Колода перемешана.';
    }
    stake = Math.min(bet, balance);
    balance -= stake;
    dealer = [];
    player = [];
    phase = 'play';
    const seq = [player, dealer, player, dealer];
    seq.forEach((h) => {
      const c = take();
      c.fresh = true;
      h.push(c);
    });
    SG.sound.play('card');
    if (isBJ(player) || isBJ(dealer)) {
      phase = 'dealer';
      render();
      timer = setTimeout(settle, DELAY);
      return;
    }
    statusEl.textContent = 'Ещё карту или хватит?';
    render();
  }

  function hit() {
    if (phase !== 'play') return;
    const c = take();
    c.fresh = true;
    player.push(c);
    SG.sound.play('card');
    const t = total(player).t;
    if (t > 21) {
      phase = 'dealer';
      render();
      timer = setTimeout(settle, DELAY);
      return;
    }
    render();
    if (t === 21) stand();
  }

  function stand() {
    if (phase !== 'play') return;
    phase = 'dealer';
    statusEl.textContent = 'Ход дилера…';
    render();
    SG.sound.play('flip');
    timer = setTimeout(dealerStep, DELAY);
  }

  function double() {
    if (phase !== 'play' || player.length !== 2 || balance < stake) return;
    balance -= stake;
    stake *= 2;
    const c = take();
    c.fresh = true;
    player.push(c);
    SG.sound.play('coin');
    if (total(player).t > 21) {
      phase = 'dealer';
      render();
      timer = setTimeout(settle, DELAY);
      return;
    }
    stand();
  }

  function dealerStep() {
    // дилер берёт до 17, на «мягких» 17 останавливается
    if (total(dealer).t < 17) {
      const c = take();
      c.fresh = true;
      dealer.push(c);
      SG.sound.play('card');
      render();
      timer = setTimeout(dealerStep, DELAY);
      return;
    }
    settle();
  }

  function settle() {
    const p = total(player).t;
    const d = total(dealer).t;
    let win = 0;
    let msg;
    if (p > 21) msg = 'Перебор — ' + p + '. Ставка проиграна.';
    else if (isBJ(player) && isBJ(dealer)) {
      win = stake;
      msg = 'У обоих блэкджек — ничья.';
    } else if (isBJ(player)) {
      win = stake + Math.floor(stake * 1.5);
      msg = 'Блэкджек! +' + (win - stake) + ' 🎉';
    } else if (isBJ(dealer)) msg = 'У дилера блэкджек.';
    else if (d > 21) {
      win = stake * 2;
      msg = 'У дилера перебор (' + d + ') — вы выиграли +' + stake + '!';
    } else if (p > d) {
      win = stake * 2;
      msg = p + ' против ' + d + ' — вы выиграли +' + stake + '!';
    } else if (p === d) {
      win = stake;
      msg = 'Ничья: ' + p + ' на ' + d + '. Ставка возвращена.';
    } else msg = p + ' против ' + d + ' — выиграл дилер.';

    balance += win;
    if (win > stake) {
      SG.store.set('blackjack-wins', SG.store.get('blackjack-wins', 0) + 1);
      SG.sound.play(isBJ(player) ? 'win' : 'coin');
    } else if (win === stake) SG.sound.play('draw');
    else SG.sound.play('lose');
    if (balance > SG.store.get('blackjack-best', START)) SG.store.set('blackjack-best', balance);
    SG.store.set('blackjack-balance', balance);
    if (balance < 10) msg += ' Банк пуст — начните заново.';
    statusEl.textContent = msg;
    phase = 'bet';
    stake = 0;
    render();
  }

  // ---------- управление ----------

  SG.segmented($('bet'), String(bet), (v) => {
    bet = Number(v);
    SG.store.set('blackjack-bet', v);
    render();
  });
  dealBtn.addEventListener('click', () => {
    dealBtn.blur();
    deal();
  });
  hitBtn.addEventListener('click', hit);
  standBtn.addEventListener('click', stand);
  doubleBtn.addEventListener('click', double);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (phase === 'bet') deal();
      else stand();
    } else if (e.code === 'KeyH') hit();
    else if (e.code === 'KeyS') stand();
    else if (e.code === 'KeyD') double();
  });

  phase = 'bet';
  dealer = [];
  player = [];
  statusEl.textContent = 'Выберите ставку и нажмите «Раздать».';
  render();
})();
