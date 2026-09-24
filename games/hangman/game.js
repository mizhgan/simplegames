/* Виселица — угадай слово по буквам */
(() => {
  'use strict';

  const MAX_MISTAKES = 7;
  const KB_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];
  const CODE_TO_RU = {
    KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyT: 'е', KeyY: 'н', KeyU: 'г', KeyI: 'ш', KeyO: 'щ', KeyP: 'з',
    BracketLeft: 'х', BracketRight: 'ъ', KeyA: 'ф', KeyS: 'ы', KeyD: 'в', KeyF: 'а', KeyG: 'п', KeyH: 'р',
    KeyJ: 'о', KeyK: 'л', KeyL: 'д', Semicolon: 'ж', Quote: 'э', KeyZ: 'я', KeyX: 'ч', KeyC: 'с', KeyV: 'м',
    KeyB: 'и', KeyN: 'т', KeyM: 'ь', Comma: 'б', Period: 'ю',
  };
  const WORDS = window.SG_NOUNS.filter((w) => w.length >= 5 && w.length <= 8);

  const $ = (id) => document.getElementById(id);
  const wordEl = $('word');
  const kbEl = $('keyboard');
  const statusEl = $('status');
  const parts = [...document.querySelectorAll('#gallows .part')];

  let word, guessed, mistakes, over;
  let streak = SG.store.get('hangman-streak', 0);

  const keyEls = {};
  KB_ROWS.forEach((row) => {
    const r = document.createElement('div');
    r.className = 'hg-row';
    [...row].forEach((ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hg-key';
      b.textContent = ch;
      b.addEventListener('click', () => guess(ch));
      r.appendChild(b);
      keyEls[ch] = b;
    });
    kbEl.appendChild(r);
  });

  function render() {
    wordEl.innerHTML = [...word]
      .map((ch) => `<span class="hg-letter ${guessed.has(ch) ? 'shown' : ''} ${over && !guessed.has(ch) ? 'missed' : ''}">${guessed.has(ch) || over ? ch : ''}</span>`)
      .join('');
    parts.forEach((p, k) => p.classList.toggle('on', k < mistakes));
    $('mistakes').textContent = mistakes + '/' + MAX_MISTAKES;
    $('streak').textContent = streak;
    $('wins').textContent = SG.store.get('hangman-wins', 0);
  }

  function guess(ch) {
    if (over || guessed.has(ch)) return;
    guessed.add(ch);
    const el = keyEls[ch];
    if (word.includes(ch)) {
      el.classList.add('hit');
      SG.sound.play('place', 5);
    } else {
      el.classList.add('miss');
      mistakes++;
      SG.sound.play('error');
    }
    el.disabled = true;
    render();
    if ([...word].every((c) => guessed.has(c))) finish(true);
    else if (mistakes >= MAX_MISTAKES) finish(false);
  }

  function finish(won) {
    over = true;
    if (won) {
      streak++;
      SG.store.set('hangman-wins', SG.store.get('hangman-wins', 0) + 1);
      statusEl.textContent = 'Угадали! Ошибок: ' + mistakes + '. 🎉';
      SG.sound.play('win');
    } else {
      streak = 0;
      statusEl.textContent = 'Не угадали — это было слово «' + word + '».';
      SG.sound.play('lose');
    }
    SG.store.set('hangman-streak', streak);
    const best = SG.store.get('hangman-best-streak', 0);
    if (streak > best) SG.store.set('hangman-best-streak', streak);
    render();
  }

  function newGame() {
    word = WORDS[Math.floor(Math.random() * WORDS.length)];
    guessed = new Set();
    mistakes = 0;
    over = false;
    Object.values(keyEls).forEach((b) => {
      b.disabled = false;
      b.classList.remove('hit', 'miss');
    });
    statusEl.textContent = 'Слово из ' + word.length + ' букв. Угадывайте по одной букве.';
    render();
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 'Enter' || e.key === ' ') && over) {
      e.preventDefault();
      newGame();
      return;
    }
    const k = e.key.toLowerCase().replace('ё', 'е');
    const ch = /^[а-я]$/.test(k) ? k : CODE_TO_RU[e.code];
    if (ch) {
      e.preventDefault();
      guess(ch);
    }
  });
  $('new-btn').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (!over && guessed.size) {
      streak = 0;
      SG.store.set('hangman-streak', 0);
    }
    newGame();
  });

  newGame();
})();
