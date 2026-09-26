    // ---------- «зеркало» экрана хозяина для игр без своего режима просмотра ----------

    function mirrorPayload() {
      const stage = document.querySelector('.game-stage');
      if (!stage) return null;
      const clone = stage.cloneNode(true);
      clone.querySelectorAll('.net-bar, .net-mirror, #mode, #difficulty, .rt-pads').forEach((el) => el.remove());
      clone.querySelectorAll('.game-controls').forEach((el) => !el.textContent.trim() && el.remove());
      // холсты передаём картинками
      const src = stage.querySelectorAll('canvas');
      clone.querySelectorAll('canvas').forEach((cv, i) => {
        const img = document.createElement('img');
        img.className = cv.className;
        img.setAttribute('style', cv.getAttribute('style') || '');
        img.alt = '';
        try {
          img.src = src[i].toDataURL('image/jpeg', 0.7);
        } catch (e) {
          /* ignore */
        }
        cv.replaceWith(img);
      });
      if (opts.mirrorMask) opts.mirrorMask(clone);
      neutralize(clone);
      const stats = document.querySelector('.game-head .stats');
      let statsHtml = '';
      if (stats) {
        const sc = stats.cloneNode(true);
        neutralize(sc);
        statsHtml = sc.innerHTML;
      }
      return { t: '_mirror', h: clone.innerHTML, s: statsHtml };
    }

    // подписи с точки зрения хозяина («Ваш ход», «Соперник») зрителю переводим в «игрок 1 / игрок 2»
    const W = '(^|[^А-Яа-яЁё])';
    const MIRROR_WORDS = [
      [/Ваш ход/g, 'Ходит игрок 1'], [/Ход соперника…?/g, 'Ходит игрок 2'], [/Соперник думает…?/g, 'Думает игрок 2'],
      [/Вы победили/g, 'Игрок 1 победил'], [/Вы проиграли/g, 'Игрок 1 проиграл'], [/Вы остались/g, 'Игрок 1 остался'],
      [/Ваш флот/g, 'Флот игрока 1'], [/Ваши карты/g, 'Карты игрока 1'], [/Противник/g, 'Игрок 2'],
      [new RegExp(W + 'Вы(?![А-Яа-яЁё])', 'g'), '$1Игрок 1'], [new RegExp(W + 'вы(?![А-Яа-яЁё])', 'g'), '$1игрок 1'],
      [/у вас/g, 'у игрока 1'], [/Вам(?![А-Яа-яЁё])/g, 'Игроку 1'], [/Соперн\./g, 'Игр. 2'],
      [/Соперника/g, 'Игрока 2'], [/соперника/g, 'игрока 2'], [/Соперник/g, 'Игрок 2'], [/соперник/g, 'игрок 2'],
    ];
    function neutralize(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((n) => {
        const t = MIRROR_WORDS.reduce((x, [re, to]) => x.replace(re, to), n.nodeValue);
        if (t !== n.nodeValue) n.nodeValue = t;
      });
    }

    function pushMirror() {
      mirrorTimer = 0;
      if (!watchers.length || !api.active) return;
      const m = mirrorPayload();
      if (!m) return;
      const key = m.h + m.s;
      if (key === lastMirror) return;
      lastMirror = key;
      toWatchers(m);
    }

    function startMirror() {
      if (mirrorObs || opts.watch) return;
      const stage = document.querySelector('.game-stage');
      if (!stage) return;
      const schedule = () => {
        if (!mirrorTimer) mirrorTimer = setTimeout(pushMirror, 200);
      };
      mirrorObs = new MutationObserver(schedule);
      mirrorObs.observe(stage, { subtree: true, childList: true, attributes: true, characterData: true });
      const stats = document.querySelector('.game-head .stats');
      if (stats) mirrorObs.observe(stats, { subtree: true, childList: true, characterData: true });
      // холсты меняются без событий DOM — обновляем их раз в полсекунды
      if (stage.querySelector('canvas')) mirrorObs.canvasTimer = setInterval(schedule, 500);
      lastMirror = '';
      schedule();
    }

    function stopMirror() {
      if (mirrorObs) {
        clearInterval(mirrorObs.canvasTimer);
        mirrorObs.disconnect();
      }
      mirrorObs = null;
      clearTimeout(mirrorTimer);
      mirrorTimer = 0;
    }

    // у зрителя: служебные сообщения трансляции
    function handleAsWatcher(msg) {
      if (msg.t === '_whello') {
        if (msg.game !== opts.game) return true;
        if (!helloDone) {
          helloDone = true;
          api.active = true;
          closeDialog();
          markMode(true);
          renderBar('on');
          SG.sound.play('match');
          history.replaceState(null, '', baseUrl());
          if (msg.mode === 'watch' && opts.watch && opts.onConnect) opts.onConnect('watcher');
          if (msg.mode === 'mirror') document.body.classList.add('sg-watching');
        }
        return true;
      }
      if (msg.t === '_wfull') {
        teardown();
        dialog('<h2 id="net-title">Зрительный зал полон</h2><p>У этой партии уже ' + MAX_WATCHERS + ' зрителей. Попробуйте зайти чуть позже.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>')
          .querySelector('[data-close]').addEventListener('click', cancel);
        return true;
      }
      if (msg.t === '_wseries') {
        const x = msg.s || {};
        series.me = x.me | 0;
        series.them = x.them | 0;
        series.draw = x.draw | 0;
        updateBar();
        return true;
      }
      if (msg.t === '_wwait') {
        showMirrorNote('Игроки ещё не начали — трансляция начнётся, как только соперник подключится.');
        return true;
      }
      if (msg.t === '_mirror') {
        renderMirror(msg);
        return true;
      }
      if (msg.t === '_sync') {
        showMirrorNote('');
        if (opts.watch) opts.watch.onSync(msg.d);
        return true;
      }
      if (msg.t === '_fw') {
        if (msg.m && msg.m.t === 'new') newGameSeen();
        if (opts.watch && msg.m) opts.watch.onForward(msg.m, msg.from);
        return true;
      }
      return false;
    }

    function mirrorBox() {
      let box = document.querySelector('.net-mirror');
      if (!box) {
        box = document.createElement('div');
        box.className = 'net-mirror';
        // в конец сцены: элементы с теми же id у самой игры остаются первыми в документе
        const stage = document.querySelector('.game-stage');
        if (stage) stage.appendChild(box);
      }
      return box;
    }

    function showMirrorNote(text) {
      let note = document.querySelector('.net-watch-note');
      if (!text) {
        if (note) note.remove();
        return;
      }
      if (!note) {
        note = document.createElement('p');
        note.className = 'net-watch-note';
        if (bar) bar.after(note);
      }
      note.textContent = text;
    }

    function renderMirror(msg) {
      showMirrorNote('');
      document.body.classList.add('sg-watching');
      mirrorBox().innerHTML = msg.h;
      const stats = document.querySelector('.game-head .stats');
      if (stats && msg.s) stats.innerHTML = msg.s;
    }

