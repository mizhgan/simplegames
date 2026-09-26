  // ---------- диагностика соединения ----------

  // следит за RTCPeerConnection попыток и запоминает, до какого этапа дошли
  const newDiag = () => ({ server: false, answered: false, states: [], local: new Set(), remote: new Set(), pcs: [] });

  function watchPc(pc, diag, onChange) {
    if (!pc || pc.__sgWatched) return;
    pc.__sgWatched = true;
    diag.pcs.push(pc);
    const upd = () => {
      const st = pc.iceConnectionState;
      if (st !== 'new' && diag.states[diag.states.length - 1] !== st) diag.states.push(st);
      if (pc.remoteDescription) diag.answered = true;
      if (onChange) onChange(diag, st);
    };
    pc.addEventListener('iceconnectionstatechange', upd);
    pc.addEventListener('signalingstatechange', upd);
    pc.addEventListener('icecandidate', (e) => {
      const m = e.candidate && e.candidate.candidate.match(/ typ (host|srflx|prflx|relay)/);
      if (m) diag.local.add(m[1]);
    });
  }

  // типы адресов из SDP (в ручном режиме все кандидаты лежат прямо в описании)
  function sdpTypes(sdp, set) {
    (sdp || '').replace(/a=candidate:.* typ (host|srflx|prflx|relay)/g, (_, t) => set.add(t));
  }

  // досчитываем адреса друга по статистике соединений
  async function collectStats(diag) {
    for (const pc of diag.pcs) {
      try {
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === 'remote-candidate' && r.candidateType) diag.remote.add(r.candidateType);
          if (r.type === 'local-candidate' && r.candidateType) diag.local.add(r.candidateType);
        });
      } catch (e) {
        /* соединение уже закрыто */
      }
      if (pc.remoteDescription) sdpTypes(pc.remoteDescription.sdp, diag.remote);
      if (pc.localDescription) sdpTypes(pc.localDescription.sdp, diag.local);
    }
  }

  const TYPE_NAMES = { host: 'локальный', srflx: 'внешний', prflx: 'внешний', relay: 'TURN' };
  const typeList = (set) => [...new Set([...set].map((t) => TYPE_NAMES[t]))].join(', ') || 'нет';

  function diagText(diag) {
    const yes = '✓';
    const no = '✗';
    const relay = diag.local.has('relay') || diag.remote.has('relay');
    return (
      'Сервер знакомств ' + (diag.server ? yes : no) +
      ' · друг ответил ' + (diag.answered ? yes : no) +
      ' · проверка связи: ' + (diag.states.length ? diag.states.join(' → ') : 'не началась') +
      ' · ваши адреса: ' + typeList(diag.local) +
      ' · адреса друга: ' + typeList(diag.remote) +
      ' · ретранслятор TURN: ' + (relay ? 'есть' : 'недоступен')
    );
  }

  const NO_DIRECT =
    'Браузеры обменялись адресами, но не смогли достучаться друг до друга. Так бывает, когда кто-то из игроков в мобильном интернете или за «строгим» роутером, а ретранслятор (TURN) недоступен. Попробуйте обоим подключиться к Wi-Fi (лучше к одной сети) — надёжно проблему решает свой TURN-сервер у владельца сайта.';

