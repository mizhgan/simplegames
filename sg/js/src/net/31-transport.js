    // ---------- транспорт ----------

    function handle(raw) {
      let msg = raw;
      if (typeof raw === 'string') {
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          return;
        }
      }
      if (!msg || typeof msg !== 'object') return;
      lastSeen = Date.now();
      if (msg.t === '_ping') return;
      if (msg.t === '_bye') return lost(true);
      if (msg.t === '_react') {
        if (!api.active || !REACTIONS[msg.v]) return;
        const who = api.role === 'host' ? 'guest' : msg.who || 'host';
        bubble(REACTIONS[msg.v], false, who);
        if (api.role === 'host') toWatchers({ t: '_react', v: msg.v, who: 'guest' });
        return;
      }
      if (msg.t === '_watchers') {
        watcherCount = msg.n | 0;
        updateBar();
        return;
      }
      if (api.role === 'watcher' && handleAsWatcher(msg)) return;
      if (msg.t === '_rematch') {
        if (!api.active) return;
        rematchTheirs = true;
        checkRematch();
        return;
      }
      if (msg.t === '_denied') {
        teardown();
        dialog('<h2 id="net-title">Не та комната</h2><p>Код комнаты не подошёл. Попросите друга прислать ссылку ещё раз.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>')
          .querySelector('[data-close]').addEventListener('click', cancel);
        return;
      }
      if (msg.t === '_me') {
        const r = profile.clean(msg.me);
        if (r && api.role !== 'watcher') {
          rival = r;
          if (api.active) profile.remember(rival, opts.game, gameTitle());
          updateBar();
        }
        return;
      }
      if (msg.t === '_hello') {
        // в комнату на сервере знакомств пускаем только знающих код (в ручном режиме код не нужен)
        if (!helloDone && api.role === 'host' && myRoom && msg.key !== myRoom) {
          rawSend({ t: '_denied' });
          const c = conn;
          setTimeout(() => c && c.close(), 800);
          return;
        }
        if (msg.game !== opts.game) {
          dialog('<h2 id="net-title">Другая игра</h2><p>Соперник открыл другую игру. Попросите его перейти по вашей ссылке ещё раз.</p><div class="net-actions"><button class="btn btn-primary" type="button" data-close>Понятно</button></div>')
            .querySelector('[data-close]').addEventListener('click', closeDialog);
          return teardown();
        }
        if (!msg.watch && api.role !== 'watcher') rival = profile.clean(msg.me);
        if (!helloDone) {
          helloDone = true;
          rawSend({ t: '_hello', game: opts.game, key: joinKey, me: profile.card(opts.game) });
          connected();
        }
        return;
      }
      if (msg.t === 'new') newGameSeen();
      if (api.role === 'host' && api.active) forwardToWatchers(msg, 'guest');
      if (api.active && opts.onMessage) opts.onMessage(msg);
    }

    function rawSend(obj) {
      if (conn) {
        try {
          conn.send(JSON.stringify(obj));
        } catch (e) {
          /* канал закрыт */
        }
      }
    }

    function send(obj) {
      if (!api.active || api.role === 'watcher') return;
      if (obj && obj.t === 'new') newGameSeen();
      rawSend(obj);
      if (api.role === 'host') forwardToWatchers(obj, 'host');
    }

    function attach(c) {
      conn = c;
      lastSeen = Date.now();
      // гость первым здоровается, хозяин отвечает
      if (api.role === 'guest') rawSend({ t: '_hello', game: opts.game, key: joinKey, me: profile.card(opts.game) });
      if (api.role === 'watcher') rawSend({ t: '_hello', game: opts.game, key: joinKey, watch: 1 });
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        rawSend({ t: '_ping' });
        if (helloDone && Date.now() - lastSeen > 15000) lost(false);
      }, 4000);
    }

    function connected() {
      api.active = true;
      stopLobby();
      series.me = series.them = series.draw = 0;
      resultLocked = finishedGame = rematchMine = rematchTheirs = false;
      closeDialog();
      markMode(true);
      renderBar('on');
      SG.sound.play('match');
      history.replaceState(null, '', baseUrl());
      if (rival && api.role !== 'watcher') {
        profile.remember(rival, opts.game, gameTitle());
        startInbox();
      }
      eloNote = '';
      updateBar();
      if (opts.onConnect) opts.onConnect(api.role);
      // партия началась — зрители, пришедшие заранее, получают её с начала
      if (api.role === 'host') {
        watchers.forEach(syncWatcher);
        sendCount();
        if (!opts.watch && watchers.length) startMirror();
      }
    }

    function lost(byPeer) {
      const was = api.active;
      const watcher = api.role === 'watcher';
      teardown();
      if (was) {
        renderBar('off');
        if (bar && watcher) bar.querySelector('.net-text').textContent = 'Трансляция закончилась: игроки вышли';
        else if (bar && byPeer) bar.querySelector('.net-text').textContent = 'Соперник вышел из игры';
        SG.sound.play('error');
        if (opts.onDisconnect) opts.onDisconnect();
      }
    }

    function teardown() {
      clearInterval(pingTimer);
      stopLobby();
      closeWatchers();
      stopMirror();
      document.body.classList.remove('sg-watching');
      const mirror = document.querySelector('.net-mirror');
      if (mirror) mirror.remove();
      watcherCount = 0;
      rival = null;
      myRoom = '';
      myToken = '';
      api.active = false;
      helloDone = false;
      const c = conn;
      conn = null;
      if (c) {
        try {
          c.close();
        } catch (e) {
          /* ignore */
        }
      }
      if (peer) {
        // сначала отпускаем ссылку: при destroy() PeerJS шлёт «disconnected», и обработчик не должен переподключаться
        const p = peer;
        peer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
      if (pc) {
        try {
          pc.close();
        } catch (e) {
          /* ignore */
        }
        pc = null;
      }
      markMode(false);
    }

    function leave() {
      if (api.active) rawSend({ t: '_bye' });
      const was = api.active;
      setTimeout(() => {
        teardown();
        if (bar) bar.hidden = true;
        if (was && opts.onDisconnect) opts.onDisconnect(true);
      }, 60);
    }

    const wrapPeerConn = (c) => ({ send: (s) => c.send(s), close: () => c.close() });

