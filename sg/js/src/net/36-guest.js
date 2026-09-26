    // ---------- гость: вход по коду комнаты ----------

    async function join(token, asWatcher) {
      const parsed = parseToken(token);
      if (!parsed) return fail('Неверный код комнаты.');
      const room = parsed.room;
      token = String(token).toLowerCase();
      teardown();
      api.role = asWatcher ? 'watcher' : 'guest';
      joinKey = room;
      myToken = token;
      const box = dialog(
        '<h2 id="net-title">' + (asWatcher ? 'Просмотр игры' : 'Игра по сети') + '</h2><p class="net-status"><span class="net-spinner"></span>Подключаемся к комнате <b>' +
          room +
          '</b>…</p><p class="net-note" hidden></p>' +
          (asWatcher ? '' : nameField()) +
          '<div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
      );
      box.querySelector('[data-cancel]').addEventListener('click', cancel);
      bindName(box, () => api.active && rawSend({ t: '_me', me: profile.card(opts.game) }));
      const statusEl = box.querySelector('.net-status');
      const noteEl = box.querySelector('.net-note');
      const setStatus = (html) => (statusEl.innerHTML = '<span class="net-spinner"></span>' + html);
      if (!(await loadPeer())) return fail('Не удалось загрузить модуль связи.', token);
      if (!SG.modal.isOpen()) return;

      const diag = newDiag();
      const myPeer = new window.Peer(peerOptions(parsed.which));
      peer = myPeer;
      let retryTimer = 0;
      let hintTimer = 0;
      let unavailable = 0;
      let attempts = [];
      const stop = () => {
        clearTimeout(retryTimer);
        clearTimeout(hintTimer);
        clearTimeout(giveUp);
      };
      const giveUp = setTimeout(async () => {
        if (api.active || peer !== myPeer) return;
        stop();
        await collectStats(diag);
        let why;
        if (!diag.server) why = 'Не удалось связаться с сервером знакомств. Проверьте интернет или попросите друга включить «Ручной режим» в окне приглашения.';
        else if (!diag.answered) why = 'Друг не отвечает: похоже, он закрыл окно приглашения или страницу игры (или она свёрнута). Попросите его открыть страницу или прислать новую ссылку — и нажмите «Повторить».';
        else why = NO_DIRECT;
        fail(why + '<br><small class="net-diag">' + diagText(diag) + '</small>', token);
      }, JOIN_TIMEOUT);

      // попытка соединения; если долго нет ответа — пробуем ещё раз (хозяин мог вернуться на страницу)
      const attempt = () => {
        if (api.active || peer !== myPeer || myPeer.destroyed) return;
        if (myPeer.disconnected) {
          try {
            myPeer.reconnect();
          } catch (e) {
            /* ignore */
          }
        }
        // зависшие без ответа попытки закрываем, чтобы не держать ретранслятор
        attempts = attempts.filter((a) => {
          const pc = a.peerConnection;
          const stuck = !pc || !pc.remoteDescription || pc.iceConnectionState === 'failed';
          if (stuck) {
            try {
              a.close();
            } catch (e) {
              /* ignore */
            }
          }
          return !stuck;
        });
        const c = myPeer.connect(roomPeerId(room), asWatcher ? { reliable: true, metadata: { watch: 1 } } : { reliable: true });
        attempts.push(c);
        let mine = false;
        watchPc(c.peerConnection, diag, (d, st) => {
          if (conn) return;
          if (st === 'checking') setStatus('Друг найден, проверяем прямую связь…');
          else if (d.answered && st !== 'failed') setStatus('Друг найден, устанавливаем соединение…');
        });
        c.on('open', () => {
          if (conn) return c.close();
          mine = true;
          clearTimeout(retryTimer);
          // остальные попытки больше не нужны
          attempts.forEach((a) => a !== c && a.close());
          attempts = [c];
          attach(wrapPeerConn(c));
        });
        c.on('data', (x) => {
          if (!mine) return;
          let msg = x;
          try {
            if (typeof x === 'string') msg = JSON.parse(x);
          } catch (e) {
            /* ignore */
          }
          if (msg && msg.t === '_busy' && !api.active) {
            stop();
            return busy(room);
          }
          handle(x);
        });
        c.on('close', () => {
          if (!mine) return;
          mine = false;
          if (api.active) return lost(false);
          // канал закрылся до начала игры — пробуем снова
          conn = null;
          clearInterval(pingTimer);
          clearTimeout(retryTimer);
          retryTimer = setTimeout(attempt, 1000);
        });
        retryTimer = setTimeout(attempt, RETRY_EVERY);
      };

      myPeer.on('open', () => {
        diag.server = true;
        setStatus('Ищем друга в комнате <b>' + room + '</b>…');
        attempt();
        hintTimer = setTimeout(() => {
          if (api.active) return;
          noteEl.hidden = false;
          noteEl.textContent = 'Друг пока не ответил. Если он отправлял ссылку с телефона, попросите его вернуться на страницу игры — мы подождём.';
        }, 8000);
      });
      myPeer.on('error', (err) => {
        if (api.active || peer !== myPeer) return;
        if (err.type === 'peer-unavailable') {
          // комнаты на сервере нет: хозяин закрыл приглашение или страницу. Один раз перепроверяем —
          // вдруг он как раз переподключается к серверу, — и сразу говорим как есть
          unavailable++;
          if (unavailable >= 2) {
            stop();
            fail('Приглашение больше не действует: друг закрыл окно ожидания или страницу игры. Попросите у него новую ссылку.', token);
          } else {
            setStatus('Комната не отвечает, проверяем ещё раз…');
            clearTimeout(retryTimer);
            retryTimer = setTimeout(attempt, 2500);
          }
          return;
        }
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type) && !diag.server) {
          stop();
          fail('Сервер знакомств недоступен. Попросите друга нажать «Ручной режим» в окне приглашения и прислать новую ссылку.', token);
        }
      });
      myPeer.on('disconnected', () => {
        if (!api.active && peer === myPeer && !myPeer.destroyed) {
          try {
            myPeer.reconnect();
          } catch (e) {
            /* ignore */
          }
        }
      });
    }

    // в комнате уже идёт игра — ссылку открыл кто-то ещё из чата
    function busy(room) {
      teardown();
      const b = dialog(
        '<h2 id="net-title">Комната уже занята</h2><p>В комнате <b>' +
          room +
          '</b> уже играют двое — вы опоздали. Создайте свою игру и отправьте ссылку тому, с кем хотите сыграть.</p>' +
          '<div class="net-actions"><button class="btn btn-primary" type="button" data-host>Создать свою игру</button>' +
          '<button class="btn btn-ghost" type="button" data-close>Закрыть</button></div>'
      );
      b.querySelector('[data-close]').addEventListener('click', cancel);
      b.querySelector('[data-host]').addEventListener('click', () => {
        history.replaceState(null, '', baseUrl());
        host();
      });
      SG.sound.play('error');
    }

    function fail(text, room) {
      lastJoinWatch = api.role === 'watcher';
      teardown();
      const b = dialog(
        '<h2 id="net-title">Не получилось подключиться</h2><p>' +
          text +
          '</p><div class="net-actions">' +
          (room ? '<button class="btn btn-primary" type="button" data-retry>Повторить</button>' : '') +
          '<button class="btn btn-ghost" type="button" data-close>Закрыть</button></div>'
      );
      b.querySelector('[data-close]').addEventListener('click', cancel);
      const r = b.querySelector('[data-retry]');
      if (r) r.addEventListener('click', () => join(room, api.role === 'watcher' || lastJoinWatch));
    }
    let lastJoinWatch = false;

