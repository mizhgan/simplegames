    // ---------- хозяин: комната через PeerJS ----------

    async function host(srvIdx, fixedRoom, fixedTry) {
      teardown();
      api.role = 'host';
      const servers = serverList();
      const idx = srvIdx || 0;
      const which = servers[idx];
      // свой сервер не ответил — пробуем следующий, и только потом ручной режим;
      // у матча турнира код комнаты задан заранее, поэтому сервер менять нельзя
      const fallback = (reason) => (fixedRoom ? fail(reason + ' Откройте матч из турнира ещё раз.') : idx + 1 < servers.length ? host(idx + 1) : manualHost(reason));
      const room = fixedRoom || code();
      const box = dialog(
        '<h2 id="net-title">Игра по сети</h2><p class="net-status">Создаём комнату…</p>' +
          '<div class="net-actions"><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
      );
      box.querySelector('[data-cancel]').addEventListener('click', cancel);
      if (!(await loadPeer())) return manualHost('Не удалось загрузить модуль связи.');
      if (api.role !== 'host' || !SG.modal.isOpen()) return;
      let opened = false;
      const timer = setTimeout(() => !opened && fallback('Сервер знакомств не отвечает.'), SERVER_TIMEOUT);
      try {
        peer = new window.Peer(roomPeerId(room), peerOptions(which));
      } catch (e) {
        clearTimeout(timer);
        return fallback('Сервер знакомств недоступен.');
      }
      const myPeer = peer;
      const token = roomToken(room, which);
      myRoom = room;
      myToken = token;
      peer.on('open', () => {
        opened = true;
        clearTimeout(timer);
        const url = baseUrl() + '#join=' + token;
        const b = dialog(
          '<h2 id="net-title">Игра по сети</h2>' +
            nameField() +
            linkBlock(url, 'Отправьте другу эту ссылку:') +
            `<p class="net-code">Или продиктуйте код комнаты: <b>${token}</b></p>` +
            '<p class="net-status"><span class="net-spinner"></span>Ждём соперника…</p>' +
            '<p class="net-note">Отправив ссылку, вернитесь на эту страницу: пока она свёрнута, браузер может её «усыпить».</p>' +
            `<details class="net-join"><summary>Ссылка для зрителей</summary><p class="net-note">По ней можно смотреть партию, не играя.</p><div class="net-link"><input type="text" readonly value="${baseUrl()}#watch=${token}" aria-label="Ссылка для зрителей"><button class="btn btn-ghost" type="button" data-wcopy>Скопировать</button></div></details>` +
            '<details class="net-join"><summary>У меня есть код от друга</summary><div class="net-link"><input type="text" maxlength="8" autocomplete="off" placeholder="Код комнаты" aria-label="Код комнаты"><button class="btn btn-primary" type="button" data-join>Войти</button></div></details>' +
            '<div class="net-lobby" hidden><label class="net-public"><input type="checkbox"> Ищу соперника — показать мою комнату всем</label>' +
            '<p class="net-label">Открытые игры</p><ul class="net-rooms"></ul></div>' +
            '<div class="net-actions"><button class="btn btn-ghost" type="button" data-manual>Ручной режим</button><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
        );
        bindLink(b, url);
        bindName(b);
        rivalsBlock(b, url, gameTitle(), () => peer);
        b.querySelector('[data-wcopy]').addEventListener('click', (e) => copy(baseUrl() + '#watch=' + token, e.currentTarget));
        b.querySelector('[data-cancel]').addEventListener('click', cancel);
        b.querySelector('[data-manual]').addEventListener('click', () => manualHost('Соединимся без сервера знакомств.'));
        const joinInput = b.querySelector('.net-join input');
        const go = () => {
          const v = joinInput.value.trim().toLowerCase();
          if (parseToken(v) && v !== token) join(v);
          else joinInput.focus();
        };
        b.querySelector('[data-join]').addEventListener('click', go);
        joinInput.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        lobbyBlock(b, room, which === 'own');
      });
      peer.on('connection', (c) => {
        if (c.metadata && c.metadata.watch) return acceptWatcher(c);
        // прежняя попытка так и не поздоровалась (друг закрыл вкладку посреди соединения) — уступаем место новой
        if (conn && !helloDone && pendingClose) pendingClose();
        if (conn) {
          // комната уже занята — прямо говорим об этом опоздавшему, а не молча закрываем
          c.on('open', () => {
            try {
              c.send(JSON.stringify({ t: '_busy' }));
            } catch (e) {
              /* ignore */
            }
            setTimeout(() => c.close(), 1500);
          });
          return;
        }
        let mine = false;
        const status = SG.modal.isOpen() && document.querySelector('.sg-modal .net-status');
        if (status) status.innerHTML = '<span class="net-spinner"></span>Друг подключается…';
        const diag = newDiag();
        diag.server = true;
        diag.answered = true;
        watchPc(c.peerConnection, diag, async (d, st) => {
          if (conn || !status) return;
          if (st === 'checking') status.innerHTML = '<span class="net-spinner"></span>Друг подключается, проверяем прямую связь…';
          if (st === 'failed') {
            await collectStats(d);
            status.innerHTML = NO_DIRECT + '<br><small class="net-diag">' + diagText(d) + '</small>';
          }
        });
        c.on('open', () => {
          mine = true;
          attach(wrapPeerConn(c));
          pendingClose = () => {
            pendingClose = null;
            try {
              c.close();
            } catch (e) {
              /* ignore */
            }
            dropped();
          };
          // гость здоровается сразу; молчание — значит, попытка оборвалась
          setTimeout(() => mine && !helloDone && pendingClose && pendingClose(), 6000);
        });
        c.on('data', (x) => mine && handle(x));
        // оборвавшаяся попытка до начала игры не должна закрывать комнату — ждём следующую
        const dropped = () => {
          if (!mine) return;
          mine = false;
          if (api.active) return lost(false);
          conn = null;
          clearInterval(pingTimer);
          if (status) status.innerHTML = '<span class="net-spinner"></span>Ждём соперника…';
        };
        c.on('close', dropped);
        c.on('error', dropped);
      });
      peer.on('error', (err) => {
        if (peer !== myPeer) return;
        if (err.type === 'unavailable-id') {
          // комната турнира ещё занята прежней вкладкой — немного ждём
          if (fixedRoom) return (fixedTry || 0) < 5 ? setTimeout(() => host(idx, fixedRoom, (fixedTry || 0) + 1), 2500) : fail('Комната матча занята. Закройте другие вкладки с этой игрой.');
          return host(idx);
        }
        if (!opened || ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) {
          clearTimeout(timer);
          if (!api.active && !opened) fallback('Сервер знакомств недоступен.');
        }
      });
      peer.on('disconnected', () => {
        // связь с сервером знакомств держим и во время игры — через неё приходят зрители
        if (peer === myPeer && !myPeer.destroyed) {
          setTimeout(() => {
            try {
              if (peer === myPeer && !myPeer.destroyed && myPeer.disconnected) myPeer.reconnect();
            } catch (e) {
              /* ignore */
            }
          }, api.active ? 3000 : 0);
        }
      });
    }

    // вкладку свернули (например, чтобы отправить ссылку) и вернулись — восстанавливаем связь с сервером
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && peer && !peer.destroyed && peer.disconnected && (!api.active || api.role === 'host')) {
        try {
          peer.reconnect();
        } catch (e) {
          /* ignore */
        }
      }
    });

    function cancel() {
      teardown();
      closeDialog();
      history.replaceState(null, '', baseUrl());
    }

