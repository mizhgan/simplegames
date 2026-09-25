/* Червячки: две команды по три червяка, разрушаемый рельеф, базука, граната и дробовик */
(() => {
  'use strict';

  const W = 800;
  const H = 450;
  const WATER = H - 22;
  const G = 360;
  const TEAM = 3;
  const TURN = 30;
  const RETREAT = 3;
  const WALK = 42;
  const WR = 8; // «радиус» червяка
  const WEAPONS = [
    { id: 'bazooka', name: 'Базука', icon: '🚀', r: 30, dmg: 48, wind: true },
    { id: 'grenade', name: 'Граната', icon: '💣', r: 34, dmg: 52, fuse: 3 },
    { id: 'shotgun', name: 'Дробовик', icon: '🔫', r: 10, dmg: 25 },
  ];
  const AI = { easy: { ang: 10, pow: 0.14 }, normal: { ang: 4, pow: 0.06 }, hard: { ang: 1.5, pow: 0.02 } };

  function terrain() {
    const k = [0, 1, 2, 3].map(() => [Math.random() * 6.28, 0.6 + Math.random() * 0.8]);
    const g = [];
    const pit = 0.35 + Math.random() * 0.3; // место провала с водой
    for (let x = 0; x < W; x++) {
      const t = x / W;
      let y = H * 0.62;
      y -= Math.sin(t * Math.PI * 2 + k[0][0]) * 50 * k[0][1];
      y -= Math.sin(t * Math.PI * 4.2 + k[1][0]) * 26 * k[1][1];
      y -= Math.sin(t * Math.PI * 9 + k[2][0]) * 9 * k[2][1];
      y += Math.exp(-(((t - pit) / 0.035) ** 2)) * 190;
      // края уходят в воду
      y += Math.max(0, 0.05 - t) * 2000 + Math.max(0, t - 0.95) * 2000;
      g.push(Math.round(Math.max(110, Math.min(H + 20, y))));
    }
    return g;
  }

  const gy = (s, x) => s.ground[Math.max(0, Math.min(W - 1, Math.round(x)))];

  function create() {
    const s = { ground: terrain(), tv: 1, id: Math.floor(Math.random() * 1e9), worms: [], team: 0, cur: [0, 0], active: 0, phase: 'aim', timer: TURN, elev: 0.6, power: 0, charge: 0, weapon: 0, proj: null, boom: null, wind: 0, msg: '', shots: 0, wait: 0 };
    // расставляем червяков вперемешку по суше
    const spots = [];
    for (let k = 0; k < TEAM * 2; k++) {
      let x;
      let tries = 0;
      do {
        x = 50 + Math.random() * (W - 100);
        tries++;
      } while (tries < 200 && (gy(s, x) > WATER - 20 || spots.some((o) => Math.abs(o - x) < 60)));
      spots.push(x);
    }
    spots.sort((a, b) => a - b);
    spots.forEach((x, k) => {
      const team = k % 2 === 0 ? (k < TEAM ? 0 : 1) : k < TEAM ? 1 : 0;
      s.worms.push({ x, y: gy(s, x), vx: 0, vy: 0, hp: 100, team, dead: false, face: x < W / 2 ? 1 : -1, air: false, n: 0 });
    });
    // у каждой команды ровно TEAM червяков
    const cnt = [0, 0];
    s.worms.forEach((w) => cnt[w.team]++);
    s.worms.forEach((w) => {
      if (cnt[w.team] > TEAM) {
        cnt[w.team]--;
        w.team = 1 - w.team;
        cnt[w.team]++;
      }
    });
    const num = [0, 0];
    s.worms.forEach((w) => (w.n = ++num[w.team]));
    s.team = Math.random() < 0.5 ? 0 : 1;
    s.active = pickWorm(s, s.team);
    newWind(s);
    return s;
  }

  function newWind(s) {
    s.wind = Math.round((Math.random() * 2 - 1) * 60);
  }

  function pickWorm(s, team) {
    const list = s.worms.map((w, i) => i).filter((i) => s.worms[i].team === team && !s.worms[i].dead);
    if (!list.length) return -1;
    const i = list[s.cur[team] % list.length];
    s.cur[team]++;
    return i;
  }

  const dirOf = (s, w) => {
    const a = w.face > 0 ? -s.elev : Math.PI + s.elev;
    return { x: Math.cos(a), y: Math.sin(a) };
  };

  // ---------- снаряды (одна и та же модель у игры и у компьютера) ----------

  function projStep(p, s, dt) {
    const wp = WEAPONS[p.w];
    if (wp.wind) p.vx += s.wind * dt;
    p.vy += G * dt;
    const nx = p.x + p.vx * dt;
    const ny = p.y + p.vy * dt;
    if (p.fuse !== undefined) {
      p.fuse -= dt;
      if (p.fuse <= 0) return 'boom';
    }
    if (nx < -30 || nx > W + 30 || ny > H + 10) return 'gone';
    for (let i = 0; i < s.worms.length; i++) {
      const w = s.worms[i];
      if (w.dead || (i === p.from && p.age < 0.25)) continue;
      if (p.fuse === undefined && Math.hypot(nx - w.x, ny - (w.y - WR)) < WR + 3) {
        p.x = nx;
        p.y = ny;
        return 'boom';
      }
    }
    if (nx >= 0 && nx < W && ny >= gy(s, nx)) {
      if (p.fuse === undefined) {
        p.x = nx;
        p.y = ny;
        return 'boom';
      }
      // граната отскакивает от склона
      const sl = (gy(s, nx + 3) - gy(s, nx - 3)) / 6;
      const len = Math.hypot(sl, 1);
      const nX = sl / len;
      const nY = -1 / len;
      const dot = p.vx * nX + p.vy * nY;
      p.vx = (p.vx - 2 * dot * nX) * 0.45;
      p.vy = (p.vy - 2 * dot * nY) * 0.45;
      p.y = gy(s, nx) - 1;
      p.age += dt;
      p.bounce = true;
      return null;
    }
    p.x = nx;
    p.y = ny;
    p.age += dt;
    return null;
  }

  function blast(s, x, y, r, dmg, fx, dry) {
    const hurt = new Array(s.worms.length).fill(0);
    if (!dry) {
      for (let k = Math.max(0, Math.floor(x - r)); k <= Math.min(W - 1, Math.ceil(x + r)); k++) {
        const dy = Math.sqrt(Math.max(0, r * r - (k - x) ** 2));
        if (y + dy > s.ground[k]) s.ground[k] = Math.min(H + 20, Math.round(y + dy));
      }
      s.tv++;
    }
    s.worms.forEach((w, i) => {
      if (w.dead) return;
      const dx = w.x - x;
      const dy = w.y - WR - y;
      const d = Math.hypot(dx, dy);
      if (d >= r + 12) return;
      const k = 1 - d / (r + 12);
      hurt[i] = Math.round(dmg * k + 4);
      if (dry) return;
      w.hp = Math.max(0, w.hp - hurt[i]);
      const n = d || 1;
      w.vx += (dx / n) * 240 * k;
      w.vy += (dy / n) * 240 * k - 140 * k;
      w.air = true;
    });
    if (!dry) {
      s.boom = { x, y, r, t: 0.5 };
      fx && fx('explode');
    }
    return hurt;
  }

  function shotgun(s, w, fx, dry) {
    const d = dirOf(s, w);
    let x = w.x;
    let y = w.y - WR;
    for (let t = 0; t < 220; t++) {
      x += d.x * 2;
      y += d.y * 2;
      if (x < 0 || x >= W || y < -50 || y > H) return new Array(s.worms.length).fill(0);
      const hit = s.worms.findIndex((o) => o !== w && !o.dead && Math.hypot(o.x - x, o.y - WR - y) < WR + 2);
      if (hit >= 0) {
        const hurt = new Array(s.worms.length).fill(0);
        hurt[hit] = WEAPONS[2].dmg;
        if (!dry) {
          const o = s.worms[hit];
          o.hp = Math.max(0, o.hp - hurt[hit]);
          o.vx += d.x * 160;
          o.vy += d.y * 160 - 80;
          o.air = true;
          s.boom = { x, y, r: 8, t: 0.3 };
          fx('hit');
        }
        return hurt;
      }
      if (y >= gy(s, x)) {
        if (dry) return new Array(s.worms.length).fill(0);
        return blast(s, x, y, WEAPONS[2].r, 0, fx);
      }
    }
    return new Array(s.worms.length).fill(0);
  }

  // ---------- ход ----------

  const prev = [{}, {}];
  function wormPhysics(s, dt, fx) {
    let moving = false;
    s.worms.forEach((w) => {
      if (w.dead) return;
      if (w.air) {
        moving = true;
        w.vy += G * dt;
        const nx = Math.max(4, Math.min(W - 4, w.x + w.vx * dt));
        if (gy(s, nx) < w.y - 8 && w.vy > -50) w.vx = -w.vx * 0.3;
        else w.x = nx;
        w.y += w.vy * dt;
        if (w.y >= gy(s, w.x) && w.vy >= 0) {
          if (w.vy > 400) {
            const dmg = Math.round((w.vy - 400) / 9);
            w.hp = Math.max(0, w.hp - dmg);
            fx('drop');
          }
          w.y = gy(s, w.x);
          w.vx = w.vy = 0;
          w.air = false;
        }
      } else if (gy(s, w.x) > w.y + 2) {
        w.air = true;
        w.vx = 0;
        w.vy = 0;
      }
      if (w.y > WATER) {
        w.dead = true;
        w.hp = 0;
        w.air = false;
        fx('drop');
      }
    });
    return moving;
  }

  function endTurn(s) {
    s.worms.forEach((w) => {
      if (!w.dead && w.hp <= 0) w.dead = true;
    });
    s.team = 1 - s.team;
    let a = pickWorm(s, s.team);
    if (a < 0) {
      s.team = 1 - s.team;
      a = pickWorm(s, s.team);
    }
    s.active = a;
    s.phase = 'aim';
    s.timer = TURN;
    s.power = 0;
    s.charge = 0;
    s.elev = 0.6;
    s.msg = '';
    newWind(s);
  }

  function fire(s, fx) {
    const w = s.worms[s.active];
    const wp = WEAPONS[s.weapon];
    s.shots++;
    if (wp.id === 'shotgun') {
      shotgun(s, w, fx, false);
      s.phase = 'settle';
      s.wait = 0.6;
      return;
    }
    const d = dirOf(s, w);
    const v = 120 + s.power * 520;
    s.proj = { x: w.x + d.x * 12, y: w.y - WR + d.y * 12, vx: d.x * v, vy: d.y * v, w: s.weapon, from: s.active, age: 0 };
    if (wp.fuse) s.proj.fuse = wp.fuse;
    s.phase = 'fly';
    fx(wp.id === 'grenade' ? 'flip' : 'hit');
  }

  function step(s, inputs, dt, fx) {
    if (s.boom && (s.boom.t -= dt) <= 0) s.boom = null;
    const inp = inputs[s.team];
    const pv = prev[s.team];
    const w = s.worms[s.active];
    const moving = wormPhysics(s, dt, fx);
    if (s.phase === 'aim' || s.phase === 'retreat') {
      s.timer -= dt;
      if (!w || w.dead) {
        s.phase = 'settle';
        s.wait = 0.8;
      } else {
        if (!w.air) {
          if (inp.l || inp.r) {
            const dir = inp.l ? -1 : 1;
            w.face = dir;
            const nx = Math.max(4, Math.min(W - 4, w.x + dir * WALK * dt));
            const ny = gy(s, nx);
            if (ny >= w.y - 5) {
              w.x = nx;
              if (ny <= w.y + 3) w.y = ny;
            }
          }
          if (inp.j && !pv.j) {
            w.vx = w.face * 110;
            w.vy = -210;
            w.air = true;
            fx('jump');
          }
        }
        if (s.phase === 'aim') {
          if (inp.u) s.elev = Math.min(1.5, s.elev + 1.4 * dt);
          if (inp.d) s.elev = Math.max(-1.4, s.elev - 1.4 * dt);
          if (inp.w && !pv.w) {
            s.weapon = (s.weapon + 1) % WEAPONS.length;
            fx('click');
          }
          if (WEAPONS[s.weapon].id === 'shotgun') {
            if (inp.f && !pv.f) {
              fire(s, fx);
            }
          } else if (inp.f) {
            s.charge += dt;
            s.power = Math.min(1, s.charge / 1.3);
            if (s.power >= 1) fire(s, fx);
          } else if (s.charge > 0) fire(s, fx);
        }
        if (s.phase === 'aim' && s.timer <= 0) {
          s.phase = 'settle';
          s.wait = 0.3;
          s.msg = 'Время вышло';
        }
        if (s.phase === 'retreat' && s.timer <= 0) {
          s.phase = 'settle';
          s.wait = 0.3;
        }
      }
    } else if (s.phase === 'fly') {
      let ev = null;
      for (let k = 0; k < 4 && !ev; k++) ev = projStep(s.proj, s, dt / 4);
      if (s.proj.bounce) {
        s.proj.bounce = false;
        if (Math.hypot(s.proj.vx, s.proj.vy) > 60) fx('bounce');
      }
      if (ev === 'boom') {
        const wp = WEAPONS[s.proj.w];
        blast(s, s.proj.x, s.proj.y, wp.r, wp.dmg, fx);
      }
      if (ev) {
        s.proj = null;
        s.phase = 'retreat';
        s.timer = RETREAT;
      }
    } else if (s.phase === 'settle') {
      s.wait -= dt;
      if (s.wait <= 0 && !moving) endTurn(s);
    }
    prev[s.team] = { f: inp.f, w: inp.w, j: inp.j };
    prev[1 - s.team] = { f: inputs[1 - s.team].f, w: inputs[1 - s.team].w, j: inputs[1 - s.team].j };
  }

  // ---------- компьютер ----------

  function evalHurt(s, hurt, team) {
    let v = 0;
    hurt.forEach((h, i) => {
      const w = s.worms[i];
      if (w.dead || !h) return;
      const real = Math.min(h, w.hp);
      const kill = real >= w.hp ? 40 : 0;
      v += w.team === team ? -(real * 1.6 + kill) : real + kill;
    });
    return v;
  }

  function simShot(s, w, face, elev, power, weapon) {
    const t = { ...s, worms: s.worms, elev, weapon };
    const fw = { ...w, face };
    if (WEAPONS[weapon].id === 'shotgun') return shotgun(t, fw, null, true);
    const d = dirOf(t, fw);
    const v = 120 + power * 520;
    const p = { x: w.x + d.x * 12, y: w.y - WR + d.y * 12, vx: d.x * v, vy: d.y * v, w: weapon, from: s.active, age: 0 };
    if (WEAPONS[weapon].fuse) p.fuse = WEAPONS[weapon].fuse;
    for (let k = 0; k < 1000; k++) {
      const ev = projStep(p, t, 1 / 120);
      if (ev === 'boom') return blast(t, p.x, p.y, WEAPONS[weapon].r, WEAPONS[weapon].dmg, null, true);
      if (ev) break;
    }
    return new Array(s.worms.length).fill(0);
  }

  const plans = [{}, {}];
  function ai(s, side, level) {
    const inp = { u: false, d: false, l: false, r: false, f: false, w: false, j: false, px: null, py: null };
    if (s.team !== side || s.phase !== 'aim') return inp;
    const w = s.worms[s.active];
    if (!w || w.air) return inp;
    const pl = plans[side];
    const key = s.id + ':' + s.shots + ':' + s.active + ':' + s.tv;
    if (pl.key !== key) {
      pl.key = key;
      pl.wait = 0.8 + Math.random() * 0.6;
      let best = { v: -1e9, face: w.face, elev: 0.7, power: 0.5, weapon: 0 };
      for (let weapon = 0; weapon < WEAPONS.length; weapon++) {
        for (const face of [-1, 1]) {
          for (let e = -1.2; e <= 1.45; e += weapon === 2 ? 0.03 : 0.12) {
            for (let p = 0.1; p <= 1.001; p += weapon === 2 ? 2 : 0.07) {
              const v = evalHurt(s, simShot(s, w, face, e, p, weapon), w.team) - (weapon === 2 ? 3 : 0);
              if (v > best.v) best = { v, face, elev: e, power: p, weapon };
            }
          }
        }
      }
      const c = AI[level];
      pl.face = best.face;
      pl.weapon = best.weapon;
      pl.elev = best.elev + ((Math.random() * 2 - 1) * c.ang * Math.PI) / 180;
      pl.power = Math.max(0.05, Math.min(0.99, best.power + (Math.random() * 2 - 1) * c.pow));
      pl.charging = false;
      pl.tog = false;
    }
    if (pl.wait > 0) {
      pl.wait -= 1 / 60;
      return inp;
    }
    if (s.weapon !== pl.weapon) {
      pl.tog = !pl.tog;
      inp.w = pl.tog;
      return inp;
    }
    if (w.face !== pl.face) {
      inp[pl.face < 0 ? 'l' : 'r'] = true;
      return inp;
    }
    if (!pl.charging && Math.abs(s.elev - pl.elev) > 0.03) {
      inp[s.elev < pl.elev ? 'u' : 'd'] = true;
      return inp;
    }
    if (!pl.charging) s.elev = pl.elev;
    if (WEAPONS[s.weapon].id === 'shotgun') {
      pl.tog = !pl.tog;
      inp.f = pl.tog;
      return inp;
    }
    pl.charging = true;
    inp.f = s.power < pl.power;
    return inp;
  }

  // ---------- отрисовка ----------

  const PAL = SG.colors.players; // [0] — синий, [1] — красный
  const BODY = ['#bfdbfe', '#fecaca'];
  function draw(g, s, v) {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#312e81');
    sky.addColorStop(1, '#a5b4fc');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#a16207';
    g.beginPath();
    g.moveTo(0, H);
    s.ground.forEach((y, x) => g.lineTo(x, y));
    g.lineTo(W, H);
    g.fill();
    g.strokeStyle = '#4d7c0f';
    g.lineWidth = 5;
    g.beginPath();
    s.ground.forEach((y, x) => (x ? g.lineTo(x, y + 2) : g.moveTo(x, y + 2)));
    g.stroke();
    g.fillStyle = 'rgba(14,116,144,0.85)';
    g.fillRect(0, WATER, W, H - WATER);
    s.worms.forEach((w, i) => {
      if (w.dead) {
        if (w.y < WATER) {
          g.fillStyle = '#6b7280';
          g.fillRect(w.x - 4, w.y - 14, 8, 14);
          g.fillRect(w.x - 7, w.y - 11, 14, 4);
        }
        return;
      }
      const act = i === s.active && (s.phase === 'aim' || s.phase === 'retreat');
      g.fillStyle = BODY[w.team];
      g.beginPath();
      g.ellipse(w.x, w.y - 7, 6, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(w.x + w.face * 3, w.y - 15, 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = PAL[w.team];
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(w.x, w.y - 7, 6, 8, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(w.x + w.face * 5, w.y - 16, 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(w.x + w.face * 5.8, w.y - 16, 1.1, 0, Math.PI * 2);
      g.fill();
      g.font = '800 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = '#fff';
      g.strokeText(String(w.hp), w.x, w.y - 26);
      g.fillStyle = PAL[w.team];
      g.fillText(String(w.hp), w.x, w.y - 26);
      if (act) {
        g.beginPath();
        g.moveTo(w.x, w.y - 44);
        g.lineTo(w.x - 5, w.y - 51);
        g.lineTo(w.x + 5, w.y - 51);
        g.fill();
      }
      if (act && s.phase === 'aim') {
        const d = dirOf(s, w);
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(w.x + d.x * 40, w.y - WR + d.y * 40, 5, 0, Math.PI * 2);
        g.stroke();
        if (s.power > 0) {
          g.strokeStyle = s.power > 0.8 ? '#ef4444' : '#facc15';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(w.x + d.x * 10, w.y - WR + d.y * 10);
          g.lineTo(w.x + d.x * (10 + 30 * s.power), w.y - WR + d.y * (10 + 30 * s.power));
          g.stroke();
        }
      }
    });
    if (s.proj) {
      g.fillStyle = s.proj.fuse !== undefined ? '#14532d' : '#111';
      g.beginPath();
      g.arc(s.proj.x, s.proj.y, 4, 0, Math.PI * 2);
      g.fill();
      if (s.proj.fuse !== undefined) {
        g.fillStyle = '#fff';
        g.font = '700 11px system-ui, sans-serif';
        g.fillText(String(Math.ceil(s.proj.fuse)), s.proj.x, s.proj.y - 8);
      }
    }
    if (s.boom) {
      g.fillStyle = 'rgba(251,146,60,' + Math.max(0, s.boom.t * 1.6) + ')';
      g.beginPath();
      g.arc(s.boom.x, s.boom.y, s.boom.r * (1.3 - s.boom.t), 0, Math.PI * 2);
      g.fill();
    }
    // панель: оружие, ветер, таймер
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(8, 8, 300, 28);
    g.fillStyle = '#fff';
    g.font = '700 13px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const wp = WEAPONS[s.weapon];
    const wv = s.wind;
    g.fillText(wp.icon + ' ' + wp.name + '   ветер ' + (wv < 0 ? '← ' : '') + Math.abs(wv) + (wv > 0 ? ' →' : ''), 16, 22);
    g.textAlign = 'right';
    if (s.phase === 'aim' || s.phase === 'retreat') {
      g.fillStyle = s.phase === 'retreat' ? '#fde047' : s.timer < 6 ? '#fca5a5' : '#fff';
      g.fillText('⏱ ' + Math.max(0, Math.ceil(s.timer)), 300, 22);
    }
    g.textBaseline = 'alphabetic';
    if (s.msg) {
      g.fillStyle = '#fff';
      g.font = '800 20px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(s.msg, W / 2, 60);
    }
    void v;
  }

  const names = (v) => (v.mode === 'ai' ? ['вы', 'компьютер'] : v.mode === 'net' ? (v.me === 0 ? ['вы', 'соперник'] : ['соперник', 'вы']) : ['синие', 'красные']);
  const hp = (s, t) => s.worms.reduce((a, w) => a + (w.team === t && !w.dead ? w.hp : 0), 0);
  const alive = (s, t) => s.worms.some((w) => w.team === t && !w.dead && w.hp > 0);

  let sent = { id: null, tv: 0 };
  SG.rt({
    game: 'worms',
    W,
    H,
    sides: ['Синие червяки', 'Красные червяки'],
    intro: '← → — ползти, ↑ ↓ — прицел, E — прыжок, Q — сменить оружие, пробел — держать для силы и отпустить.',
    create,
    step,
    ai,
    draw,
    pad: true,
    shared: true,
    keys: { KeyQ: 'w', Tab: 'w', KeyE: 'j', Backspace: 'j' },
    buttons: [{ k: 'w', label: '🔄' }, { k: 'j', label: '⤴' }],
    fireLabel: 'Огонь',
    over(s) {
      if (s.phase !== 'aim' && s.phase !== 'settle') return null;
      if (s.phase === 'settle' && s.wait > 0) return null;
      const a = alive(s, 0);
      const b = alive(s, 1);
      if (a && b) return null;
      return { winner: !a && !b ? null : a ? 0 : 1, text: 'Здоровье команд: ' + hp(s, 0) + ' : ' + hp(s, 1) + '.' };
    },
    hud(s, v) {
      const n = names(v);
      const who = s.phase === 'aim' ? ' · ходят ' + n[s.team] : s.phase === 'retreat' ? ' · отход' : '';
      return 'Синие (' + n[0] + ') ' + hp(s, 0) + ' ❤ · красные (' + n[1] + ') ' + hp(s, 1) + ' ❤' + who;
    },
    snapshot(s, full) {
      const snap = { ...s };
      delete snap.ground;
      if (full || sent.id !== s.id || sent.tv !== s.tv) {
        snap.g = s.ground;
        if (!full) sent = { id: s.id, tv: s.tv };
      }
      return snap;
    },
    restore(x, prevS) {
      const ground = x.g || (prevS && prevS.id === x.id && prevS.ground) || new Array(W).fill(H - 60);
      const s = { ...x, ground };
      delete s.g;
      return s;
    },
  });
})();
