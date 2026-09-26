  function setup(opts) {
    const api = {
      active: false,
      role: null,
      send,
      leave,
      info,
      result,
    };
    let conn = null; // { send(obj), close() }
    let peer = null;
    let pc = null;
    let pingTimer = 0;
    let lastSeen = 0;
    let bar = null;
    let infoText = '';
    let helloDone = false;
    let pendingClose = null; // закрыть подключение хозяина, которое ещё не поздоровалось
    let myRoom = ''; // код комнаты хозяина (гость должен его назвать)
    let joinKey = ''; // код комнаты, куда входит гость
    let lobbyPeer = null;
    let lobbyTimer = 0;
    const series = { me: 0, them: 0, draw: 0 };
    let resultLocked = false;
    let finishedGame = false;
    let rematchMine = false;
    let rematchTheirs = false;
    let myToken = ''; // код комнаты для ссылок (у хозяина и гостя)
    const watchers = []; // у хозяина: подключённые зрители { c, send }
    let watcherCount = 0; // сколько зрителей (видят и игроки, и зрители)
    let watchPing = 0;
    let mirrorObs = null;
    let mirrorTimer = 0;
    let lastMirror = '';
    let rival = null; // карточка соперника: { id, name, elo }
    let eloNote = '';
    const WHO = { host: 'Игрок 1', guest: 'Игрок 2', watcher: 'Зритель' };

    // кнопка «По сети» в переключателе режимов
    let netBtn = null;
    if (opts.modeEl) {
      netBtn = document.createElement('button');
      netBtn.type = 'button';
      netBtn.className = 'net-mode-btn';
      netBtn.textContent = '🌐 По сети';
      netBtn.addEventListener('click', () => {
        netBtn.blur();
        if (!api.active) host();
      });
      opts.modeEl.appendChild(netBtn);
      // выбор другого режима — выход из сетевой игры
      opts.modeEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (b && api.active) leave();
        if (b) netBtn.classList.remove('active');
      }, true);
    }

    function markMode(on) {
      if (!opts.modeEl) return;
      if (on) opts.modeEl.querySelectorAll('button[data-value]').forEach((b) => b.classList.remove('active'));
      if (netBtn) netBtn.classList.toggle('active', on);
    }

    function renderBar(state) {
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'net-bar';
        const stage = document.querySelector('.game-stage');
        if (stage) stage.insertBefore(bar, stage.firstChild);
      }
      bar.hidden = false;
      bar.dataset.state = state;
      if (state === 'on') {
        bar.innerHTML =
          '<span class="net-dot"></span><span class="net-text"></span><span class="net-rival" hidden></span><span class="net-score" hidden></span>' +
          '<button class="btn btn-ghost net-rematch" type="button" hidden>Реванш</button>' +
          '<button class="btn btn-ghost net-watch-btn" type="button" title="Ссылка для зрителей" hidden>👁 <span></span></button>' +
          '<button class="btn btn-ghost net-react-btn" type="button" aria-label="Реакция" title="Реакция">😊</button>' +
          '<button class="btn btn-ghost" type="button" data-leave>Выйти</button>' +
          '<div class="net-react" hidden>' +
          REACTIONS.map((r, i) => `<button type="button" data-r="${i}"${r.length > 2 ? ' class="phrase"' : ''}>${r}</button>`).join('') +
          '</div>' +
          '<div class="net-watch" hidden><p>Пусть смотрят, как вы играете: отправьте эту ссылку — зрители увидят партию, но ходить не смогут.</p>' +
          '<div class="net-link"><input type="text" readonly aria-label="Ссылка для зрителей"><button class="btn btn-primary" type="button" data-copy>Скопировать</button>' +
          (navigator.share ? '<button class="btn btn-ghost" type="button" data-share>Поделиться</button>' : '') +
          '</div></div>';
        bar.querySelector('[data-leave]').addEventListener('click', () => leave());
        const wbox = bar.querySelector('.net-watch');
        bar.querySelector('.net-watch-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          wbox.hidden = !wbox.hidden;
          const url = watchUrl();
          const input = wbox.querySelector('input');
          input.value = url;
          if (!wbox.hidden) input.select();
        });
        wbox.querySelector('[data-copy]').addEventListener('click', (e) => copy(watchUrl(), e.currentTarget));
        const sh = wbox.querySelector('[data-share]');
        if (sh) sh.addEventListener('click', () => navigator.share({ title: document.title, text: 'Смотри, как мы играем!', url: watchUrl() }).catch(() => {}));
        const picker = bar.querySelector('.net-react');
        bar.querySelector('.net-react-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          picker.hidden = !picker.hidden;
        });
        picker.addEventListener('click', (e) => {
          const b = e.target.closest('[data-r]');
          if (!b) return;
          picker.hidden = true;
          const v = +b.dataset.r;
          rawSend({ t: '_react', v });
          if (api.role === 'host') toWatchers({ t: '_react', v, who: 'host' });
          bubble(REACTIONS[v], true);
        });
        bar.querySelector('.net-rematch').addEventListener('click', () => {
          if (rematchMine) return;
          rematchMine = true;
          rawSend({ t: '_rematch' });
          checkRematch();
        });
        updateBar();
      } else {
        bar.innerHTML = '<span class="net-dot"></span><span class="net-text">Соединение с соперником потеряно</span><button class="btn btn-ghost" type="button">Закрыть</button>';
        bar.querySelector('button').addEventListener('click', () => (bar.hidden = true));
      }
    }

    document.addEventListener('click', (e) => {
      const picker = bar && bar.querySelector('.net-react');
      if (picker && !picker.hidden && !e.target.closest('.net-react')) picker.hidden = true;
      const wbox = bar && bar.querySelector('.net-watch');
      if (wbox && !wbox.hidden && !e.target.closest('.net-watch')) wbox.hidden = true;
    });

    const watchUrl = () => baseUrl() + '#watch=' + myToken;

    function updateBar() {
      if (!bar || bar.dataset.state !== 'on') return;
      const watching = api.role === 'watcher';
      bar.classList.toggle('watching', watching);
      bar.querySelector('.net-text').textContent = watching
        ? '👁 Вы зритель' + (opts.watch ? '' : ' · видите экран игрока 1')
        : 'Игра по сети' + (infoText ? ' · ' + infoText : '');
      const sc = bar.querySelector('.net-score');
      const played = series.me + series.them + series.draw;
      sc.hidden = !played;
      sc.textContent = 'Счёт ' + series.me + ':' + series.them;
      sc.title = watching
        ? 'Игрок 1 — ' + series.me + ', игрок 2 — ' + series.them
        : 'Вы — ' + series.me + ', соперник — ' + series.them + (series.draw ? ', ничьих — ' + series.draw : '');
      const rv = bar.querySelector('.net-rival');
      rv.hidden = watching || !rival;
      if (rival) {
        rv.textContent = 'vs ' + rival.name + ' · ' + profile.rating(opts.game) + (eloNote ? ' ' + eloNote : '');
        rv.title = 'Ваш рейтинг в этой игре — ' + profile.rating(opts.game) + ', у соперника — ' + rival.elo;
      }
      const wb = bar.querySelector('.net-watch-btn');
      wb.hidden = !myToken;
      wb.querySelector('span').textContent = watcherCount ? watcherCount : 'Зрителям';
      wb.title = watcherCount ? 'Зрителей: ' + watcherCount + '. Ссылка для зрителей' : 'Ссылка для зрителей';
      const rb = bar.querySelector('.net-rematch');
      rb.hidden = watching || !(finishedGame && opts.onRematch);
      rb.disabled = rematchMine;
      rb.classList.toggle('pulse', rematchTheirs && !rematchMine);
      rb.textContent = rematchMine ? 'Ждём ответа…' : rematchTheirs ? 'Реванш? Да!' : 'Реванш';
    }

    // всплывающая реакция над полем
    function bubble(text, mine, who) {
      if (!bar) return;
      const el = document.createElement('div');
      el.className = 'net-bubble' + (mine ? ' mine' : '') + (who === 'watcher' ? ' watcher' : '');
      const from = mine ? 'Вы' : api.role === 'watcher' || who === 'watcher' ? WHO[who] || 'Соперник' : 'Соперник';
      el.textContent = from + ': ' + text;
      bar.appendChild(el);
      if (!mine) SG.sound.play('hint');
      setTimeout(() => el.classList.add('out'), 2600);
      setTimeout(() => el.remove(), 3100);
    }

    function result(r) {
      if (!api.active || resultLocked || api.role === 'watcher') return;
      resultLocked = true;
      finishedGame = true;
      SG.store.set('net-results', SG.store.get('net-results', 0) + 1);
      if (r === 'win') series.me++;
      else if (r === 'lose') series.them++;
      else series.draw++;
      if (rival) {
        const e = profile.record(rival, opts.game, r);
        const d = e.after - e.before;
        eloNote = '(' + (d >= 0 ? '+' : '') + d + ')';
      }
      tourReport(r);
      updateBar();
      if (api.role === 'host') toWatchers({ t: '_wseries', s: series });
    }

    // началась новая партия — сбрасываем итог и предложения реванша
    function newGameSeen() {
      eloNote = '';
      resultLocked = false;
      finishedGame = false;
      rematchMine = rematchTheirs = false;
      updateBar();
    }

    function checkRematch() {
      if (rematchMine && rematchTheirs) {
        rematchMine = rematchTheirs = false;
        if (api.role === 'host' && opts.onRematch) opts.onRematch();
      }
      updateBar();
    }

    function info(text) {
      infoText = text;
      updateBar();
    }

