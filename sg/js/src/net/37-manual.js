    // ---------- ручной режим: обмен кодами ----------

    function setupChannel(ch) {
      ch.onopen = () => attach({ send: (s) => ch.send(s), close: () => ch.close() });
      ch.onmessage = (e) => handle(e.data);
      ch.onclose = () => lost(false);
    }

    // ручной режим: следим за соединением и честно сообщаем, если оно не удалось
    function watchManual(p, diag) {
      watchPc(p, diag, (d, st) => {
        if (api.active || pc !== p) return;
        if (st === 'failed') manualFailed(p, diag);
        else if (st === 'checking' && modal) {
          const el = modal.querySelector('.net-error, .net-status');
          if (el) el.innerHTML = (el.classList.contains('net-status') ? '<span class="net-spinner"></span>' : '') + 'Друг ввёл код, проверяем прямую связь…';
        }
      });
      p.addEventListener('connectionstatechange', () => {
        if (p.connectionState === 'failed' && api.active) lost(false);
      });
    }

    async function manualFailed(p, diag) {
      if (api.active || pc !== p) return;
      await collectStats(diag);
      if (api.active || pc !== p) return;
      fail(NO_DIRECT + '<br><small class="net-diag">' + diagText(diag).replace('Сервер знакомств ✗ · ', 'Ручной режим · ') + '</small>');
    }

    async function manualHost(reason) {
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
      api.role = 'host';
      stopLobby();
      myRoom = '';
      dialog('<h2 id="net-title">Игра по сети</h2><p class="net-status"><span class="net-spinner"></span>Готовим приглашение…</p>');
      try {
        pc = new RTCPeerConnection(ICE);
        const myPc = pc;
        const diag = newDiag();
        diag.answered = false;
        watchManual(myPc, diag);
        setupChannel(pc.createDataChannel('sg'));
        await pc.setLocalDescription(await pc.createOffer());
        await waitIce(pc);
        const packed = await pack({ g: opts.game, s: pc.localDescription.sdp });
        const url = baseUrl() + '#offer=' + packed;
        const b = dialog(
          '<h2 id="net-title">Ручное подключение</h2>' +
            `<p class="net-note">${reason} Соединимся напрямую — нужно обменяться кодами.</p>` +
            linkBlock(url, '1. Отправьте другу эту ссылку:') +
            '<label class="net-label" for="net-answer">2. Друг пришлёт в ответ код — вставьте его сюда:</label>' +
            '<textarea id="net-answer" class="net-textarea" rows="3" placeholder="Код ответа"></textarea>' +
            '<p class="net-error" hidden></p>' +
            '<div class="net-actions"><button class="btn btn-primary" type="button" data-go>Подключить</button><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
        );
        bindLink(b, url);
        b.querySelector('[data-cancel]').addEventListener('click', cancel);
        b.querySelector('[data-go]').addEventListener('click', async () => {
          const err = b.querySelector('.net-error');
          try {
            const ans = await unpack(b.querySelector('#net-answer').value);
            await pc.setRemoteDescription({ type: 'answer', sdp: ans.s });
            b.querySelector('[data-go]').disabled = true;
            err.hidden = false;
            err.textContent = 'Соединяемся…';
            // без ответа за 30 секунд считаем, что напрямую не достучаться
            setTimeout(() => pc === myPc && !api.active && manualFailed(myPc, diag), 30000);
          } catch (e) {
            err.hidden = false;
            err.textContent = 'Код не подходит. Скопируйте его целиком.';
          }
        });
      } catch (e) {
        fail('Этот браузер не поддерживает соединение напрямую.');
      }
    }

    async function manualGuest(packed) {
      teardown();
      api.role = 'guest';
      dialog('<h2 id="net-title">Игра по сети</h2><p class="net-status"><span class="net-spinner"></span>Готовим ответ…</p>');
      try {
        const offer = await unpack(packed);
        if (offer.g !== opts.game) return fail('Ссылка ведёт в другую игру.');
        pc = new RTCPeerConnection(ICE);
        pc.ondatachannel = (e) => setupChannel(e.channel);
        const diag = newDiag();
        diag.answered = true;
        watchManual(pc, diag);
        await pc.setRemoteDescription({ type: 'offer', sdp: offer.s });
        await pc.setLocalDescription(await pc.createAnswer());
        await waitIce(pc);
        const answer = await pack({ s: pc.localDescription.sdp });
        const b = dialog(
          '<h2 id="net-title">Ручное подключение</h2>' +
            '<p class="net-note">Отправьте этот код другу, который прислал ссылку, — он вставит его у себя.</p>' +
            '<textarea class="net-textarea" rows="4" readonly></textarea>' +
            '<p class="net-status"><span class="net-spinner"></span>Ждём, пока друг введёт код…</p>' +
            '<div class="net-actions"><button class="btn btn-primary" type="button" data-copy>Скопировать код</button><button class="btn btn-ghost" type="button" data-cancel>Отмена</button></div>'
        );
        const ta = b.querySelector('textarea');
        ta.value = answer;
        ta.addEventListener('focus', () => ta.select());
        b.querySelector('[data-copy]').addEventListener('click', (e) => copy(answer, e.currentTarget));
        b.querySelector('[data-cancel]').addEventListener('click', cancel);
      } catch (e) {
        fail('Ссылка-приглашение повреждена. Попросите друга прислать её ещё раз.');
      }
    }

    window.addEventListener('beforeunload', () => api.active && rawSend({ t: '_bye' }));
    // уходя со страницы, сразу снимаем комнату с сервера — иначе гость ждал бы, пока сервер заметит пропажу
    window.addEventListener('pagehide', () => {
      stopLobby();
      if (peer && !peer.destroyed) {
        const p = peer;
        peer = null;
        try {
          p.destroy();
        } catch (e) {
          /* ignore */
        }
      }
    });

    // вход по ссылке-приглашению
    const m = location.hash.match(/^#(join|offer|watch)=(.+)$/);
    if (m) setTimeout(() => (m[1] === 'offer' ? manualGuest(m[2]) : join(decodeURIComponent(m[2]), m[1] === 'watch')), 50);
    // матч турнира: комната с заранее известным кодом, итог уходит во вкладку турнира
    const tm = location.hash.match(/^#t(host|join)=([a-z0-9]{6})$/);
    if (tm) {
      try {
        sessionStorage.setItem('sg-tmatch', tm[2]);
      } catch (e) {
        /* ignore */
      }
      setTimeout(() => (tm[1] === 'host' ? host(0, tm[2]) : join(tm[2])), 50);
    }

    function tourReport(r) {
      let room = '';
      try {
        room = sessionStorage.getItem('sg-tmatch') || '';
      } catch (e) {
        return;
      }
      if (!room) return;
      const msg = { room, r, game: opts.game, at: Date.now() };
      try {
        const ch = new BroadcastChannel('sg-tour');
        ch.postMessage(msg);
        ch.close();
      } catch (e) {
        /* ignore */
      }
      SG.store.set('tour-report', msg);
    }

    startInbox(() => api.active);

    api.host = host;
    api.join = join;
    api.series = series;
    api.watchUrl = () => (myToken ? watchUrl() : '');
    return api;
  }

