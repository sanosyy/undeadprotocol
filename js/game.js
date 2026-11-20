/* UNDEAD PROTOCOL — game.js
   Game state machine: rounds, zombie spawning, boss rounds, random events,
   timed effects, interactions, explosions, game over + stats. */
'use strict';
window.UP = window.UP || {};
(function () {
  const T = window.THREE;

  const G = {
    state: 'menu', // menu | intermission | playing | paused | over
    round: 0,
    kills: 0,
    startTime: 0,
    intermission: 0,
    toSpawn: 0,
    aliveCap: 20,
    spawnTimer: 0,
    spawnInterval: 2,
    effects: { INSTA: 0, DOUBLE: 0, FIRE: 0 },
    hordeT: 0,
    eventTimer: 45,
    pendingLoot: false,
    bossRound: false,
    time: 0,
    _timeouts: [],
    _explosions: [],
    _keyF: false,
    _repairT: 0,
    _promptTarget: null,
    _supply: null,
  };

  /* ---------------- helpers ---------------- */
  G.after = function (t, fn) { G._timeouts.push({ t, fn }); };
  G.remainingZombies = function () {
    return G.toSpawn + UP.Zombies.countAlive();
  };

  /* ---------------- explosions ---------------- */
  let expPool = null;
  function getExplosionMesh() {
    if (!expPool) expPool = [];
    for (const e of expPool) if (e.t <= 0) return e;
    const mesh = new T.Mesh(new T.SphereGeometry(1, 10, 8),
      new T.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.7, depthWrite: false }));
    mesh.visible = false;
    UP.Main.scene.add(mesh);
    const light = new T.PointLight(0xffaa44, 0, 10, 2);
    mesh.add(light);
    const e = { mesh, light, t: 0, r: 3 };
    expPool.push(e);
    return e;
  }

  /* Splash damage + visual. hurtPlayer also applies falloff damage to player. */
  G.explosion = function (pos, radius, dmg, hurtPlayer, color = 0xffaa44) {
    const e = getExplosionMesh();
    e.t = 0.45; e.r = radius;
    e.mesh.visible = true;
    e.mesh.position.copy(pos);
    e.mesh.scale.set(0.2, 0.2, 0.2);
    e.mesh.material.color.setHex(color);
    e.mesh.material.opacity = 0.75;
    e.light.color.setHex(color);
    e.light.intensity = 3;
    UP.Audio.explosion(pos, radius > 4);

    const P = UP.Player;
    for (const z of [...UP.Zombies.alive]) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - pos.x, z.zc - pos.z);
      if (d < radius && Math.abs(z.y + 1 - pos.y) < radius + 1.5) {
        const fall = 1 - d / radius * 0.7;
        const killed = UP.Zombies.damage(z, dmg * fall, 'body', 1);
        if (killed) G.onZombieKilled(z, false, false, null);
      }
    }
    if (hurtPlayer) {
      const d = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
      if (d < radius) P.damage(Math.min(30, dmg * 0.25 * (1 - d / radius)), pos);
    }
  };

  /* Knockback burst (Second Wind revive). */
  G.powerupBlast = function (from) {
    const P = UP.Player;
    G.explosion(new T.Vector3(P.pos.x, P.pos.y + 1, P.pos.z), 6, 200, false, 0x7fd4ff);
  };

  /* ---------------- kill handling ---------------- */
  G.onZombieKilled = function (z, headshot, exploded, weapon) {
    const P = UP.Player;
    P.kills++;
    if (headshot) P.headshots++;
    P.addPoints(100 + (headshot ? 50 : 0));
    // boss reward
    if (z.cfg.boss) {
      P.addPoints(500);
      UP.Powerups.spawn('MAXAMMO', z.x, z.y, z.zc);
      UP.HUD.announce('BOSS DEFEATED', 2.4);
      UP.HUD.bossBar(false, 0);
      G.bossRound = false;
    }
    if (z.loot) {
      P.addPoints(300);
      UP.Powerups.spawn(UP.choice(['MAXAMMO', 'NUKE', 'DOUBLE', 'INSTA']), z.x, z.y, z.zc);
      UP.HUD.announce('LOOT RECOVERED', 1.6);
      G.pendingLoot = false;
    }
    if (!exploded) {
      // drops
      const roll = Math.random();
      const ammoChance = P.perks.scav ? 0.22 : 0.07;
      if (roll < ammoChance) UP.Powerups.spawnAmmo(z.x, z.y, z.zc);
      else if (roll < ammoChance + 0.035) UP.Powerups.maybeDrop(z.x, z.y, z.zc);
    }
  };

  /* ---------------- nuke ---------------- */
  G.nuke = function () {
    const P = UP.Player;
    UP.HUD.nukeFlash();
    UP.Audio.nuke();
    let n = 0;
    for (const z of [...UP.Zombies.alive]) {
      if (z.dead || z.cfg.boss) continue;
      n++;
      z.dead = true;
      z.state = 'die'; z.stateT = 0.6 + Math.random() * 0.4;
      if (z.stateT < 0.35) z.group.rotation.x = -Math.PI / 2;
    }
    P.addPoints(400);
    UP.HUD.announce('NUKE', 2);
  };

  /* ---------------- rounds ---------------- */
  G.startRound = function (r) {
    G.round = r;
    G.state = 'playing';
    const isBoss = r % 10 === 0;
    let count = Math.round(4 + r * 2.2 + r * r * 0.08);
    count = Math.min(count, 50);
    if (isBoss) {
      count = Math.max(6, Math.round(count * 0.5));
      G.bossRound = true;
      UP.HUD.announce(`ROUND ${r}`, 2.4);
      G.after(1.2, () => {
        UP.HUD.announce('PATIENT ZERO APPROACHES', 2.6);
        spawnBoss();
      });
    } else if (r % 5 === 0) {
      UP.HUD.announce(`ROUND ${r} — HEAVY ASSAULT`, 2.4);
    } else {
      UP.HUD.announce(`ROUND ${r}`, 2.2);
    }
    G.toSpawn = count;
    G.spawnInterval = Math.max(0.5, 2.3 - r * 0.08);
    G.spawnTimer = 1.2;
    UP.Audio.roundStart();
  };

  G.endRound = function () {
    G.state = 'intermission';
    G.intermission = 9;
    UP.Audio.roundClear();
    UP.HUD.announce('AREA CLEAR', 2);
  };

  /* ---------------- spawning ---------------- */
  function pickSpawnPoint() {
    const Map = UP.Map, P = UP.Player;
    const entries = [];
    for (const w of Map.windows) {
      if (!Map.rooms[w.roomId].accessible) continue;
      const d = UP.dist2(w.cx, w.cz, P.pos.x, P.pos.z);
      let weight = 1.4;
      if (d > 42) weight = 0.25;
      if (d < 7) weight = 0.5;
      if (w.queue >= 2) weight = 0.08;
      entries.push([{ win: w }, weight]);
    }
    for (const v of Map.vents) {
      if (!Map.rooms[v.roomId].accessible) continue;
      entries.push([{ vent: v }, 0.55]);
    }
    if (!entries.length) return null;
    return UP.weightedChoice(entries);
  }

  function spawnOne() {
    const Z = UP.Zombies;
    if (Z.countAlive() >= G.aliveCap) return false;
    const pt = pickSpawnPoint();
    if (!pt) return false;
    let type = Z.rollType(G.round);
    let loot = false;
    if (G.pendingLoot) { loot = true; G.pendingLoot = false; }
    if (pt.win) Z.spawnAtWindow(pt.win, type, G.round, loot);
    else Z.spawnAtVent(pt.vent, type, G.round, loot);
    return true;
  }

  function spawnBoss() {
    const Map = UP.Map, P = UP.Player;
    // prefer a vent in an accessible room, else a window room
    const vents = Map.vents.filter(v => Map.rooms[v.roomId].accessible);
    let vent = null;
    if (vents.length) {
      vents.sort((a, b) => UP.dist2(b.x, b.z, P.pos.x, P.pos.z) - UP.dist2(a.x, a.z, P.pos.x, P.pos.z));
      vent = vents[0];
    } else {
      vent = { x: P.pos.x + 6, y: P.pos.y, z: P.pos.z };
    }
    const z = UP.Zombies.spawnBoss(vent, G.round);
    if (z) {
      UP.Audio.bossRoar({ x: vent.x, y: vent.y + 1, z: vent.z });
      UP.HUD.eventBanner('WARNING: CONTAINMENT BREACH — PATIENT ZERO ACTIVE', 4);
    }
  }

  /* ---------------- random events ---------------- */
  function rollEvent() {
    const events = ['blackout', 'horde', 'loot', 'supply', 'bonus', 'boxmove'];
    const e = UP.choice(events);
    switch (e) {
      case 'blackout':
        UP.Map.setBlackout(true);
        UP.HUD.eventBanner('EVENT: POWER FLUCTUATION — LIGHTS FAILING', 3);
        G.after(12, () => UP.Map.setBlackout(false));
        break;
      case 'horde':
        G.hordeT = 22;
        UP.HUD.eventBanner('EVENT: HORDE DETECTED — SPAWN RATE SURGE', 3);
        break;
      case 'loot':
        G.pendingLoot = true;
        UP.HUD.eventBanner('EVENT: SPECIAL CARRIER SPOTTED — GOLDEN ZOMBIE', 3);
        break;
      case 'supply':
        spawnSupplyCrate();
        break;
      case 'bonus':
        UP.Player.addPoints(200);
        UP.HUD.eventBanner('EVENT: BONUS SUPPLY DROP — +200 POINTS', 3);
        break;
      case 'boxmove':
        if (UP.Machines.box.uses > 0 && UP.Machines.box.state === 'closed') {
          UP.Machines.forceRelocate();
          UP.HUD.eventBanner('EVENT: ANOMALY — THE BOX HAS MOVED', 3);
        } else {
          UP.Player.addPoints(150);
          UP.HUD.eventBanner('EVENT: SECURITY REFUND — +150 POINTS', 3);
        }
        break;
    }
  }

  function spawnSupplyCrate() {
    const P = UP.Player;
    if (G._supply) { UP.Main.scene.remove(G._supply.group); G._supply = null; }
    const g = new T.Group();
    const box = new T.Mesh(new T.BoxGeometry(0.8, 0.6, 0.6),
      new T.MeshStandardMaterial({ color: 0x3a4a35, emissive: 0x1a2a15, emissiveIntensity: 0.5, roughness: 0.8 }));
    box.position.y = 0.3;
    g.add(box);
    const light = new T.PointLight(0x9aff5a, 0.9, 5, 2);
    light.position.y = 0.8;
    g.add(light);
    const fwd = new T.Vector3(); UP.Main.camera.getWorldDirection(fwd);
    g.position.set(P.pos.x + fwd.x * 1.8, UP.Map.floorHeightAt(P.pos.x + fwd.x * 1.8, P.pos.z + fwd.z * 1.8, P.pos.y + 1), P.pos.z + fwd.z * 1.8);
    UP.Main.scene.add(g);
    G._supply = {
      group: g,
      interactable: {
        x: g.position.x, y: g.position.y + 0.5, z: g.position.z, r: 2.2,
        label() { return 'FREE AMMO SUPPLY'; },
        use() {
          const P2 = UP.Player;
          for (const w of P2.slots) if (w) w.reserve = w.stats.reserve;
          UP.Audio.purchase();
          UP.HUD.announce('AMMO REPLENISHED', 1.4);
          UP.Main.scene.remove(g);
          G._supply = null;
        },
      },
    };
    UP.HUD.eventBanner('EVENT: AMMUNITION SUPPLY DROP INBOUND', 3);
  }

  /* ---------------- interactions ---------------- */
  function updateInteractions(dt) {
    const P = UP.Player;
    const M = UP.Machines;
    // find nearest interactable
    let best = null, bestD = 1e9;
    const all = M.interactables.concat(G._supply ? [G._supply.interactable] : []);
    for (const it of all) {
      const ix = it.dynamic ? it.x : it.x;
      const iy = it.y, iz = it.dynamic ? it.z : it.z;
      const d = Math.hypot(ix - P.pos.x, iz - P.pos.z);
      if (d < (it.r || 2.2) && d < bestD) {
        const label = it.label();
        if (label !== null && label !== undefined) { best = it; bestD = d; }
      }
    }
    // barricade repair check
    const win = M.nearestWindow(P.pos.x, P.pos.y, P.pos.z);
    const canRepair = win && win.count < 5 && P.pos.y < 3;

    if (best && (!canRepair || bestD < 2.0)) {
      const label = best.label();
      const deny = /(REQUIRES POWER|LIMIT|FULL|OWNED)/.test(label) || /REQUIRES POWER/.test(label);
      UP.HUD.prompt(`<b>«F»</b>&nbsp; ${label}`, deny && !label.includes('['));
      G._promptTarget = best;
    } else if (canRepair) {
      UP.HUD.prompt(win.count === 0 ? `<b>Hold «F»</b>&nbsp; REBUILD BARRICADE` : `<b>Hold «F»</b>&nbsp; REINFORCE BARRICADE [${win.count}/5] +10`);
      G._promptTarget = { window: win };
    } else {
      UP.HUD.hidePrompt();
      G._promptTarget = null;
    }

    // hold-to-repair
    if (G._keyF && G._promptTarget && G._promptTarget.window) {
      G._repairT -= dt;
      if (G._repairT <= 0) {
        G._repairT = 0.42;
        UP.Machines.repairPlank(G._promptTarget.window);
      }
    } else {
      G._repairT = 0;
    }
  }

  G.init = function () {
    G.unstuckCd = 0;
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyF' && (G.state === 'playing' || G.state === 'intermission')) {
        G._keyF = true;
        if (!e.repeat && G._promptTarget && G._promptTarget.use && !G._promptTarget.window) {
          G._promptTarget.use();
        }
      }
      if (e.code === 'KeyK' && !e.repeat && (G.state === 'playing' || G.state === 'intermission')) {
        G.tryUnstuck();
      }
    });
    document.addEventListener('keyup', e => { if (e.code === 'KeyF') G._keyF = false; });
  };

  /* Emergency unstuck: teleport the player to the spawn room.
     120 second cooldown, shown on the HUD. */
  G.tryUnstuck = function () {
    const P = UP.Player;
    if (G.unstuckCd > 0 || P.dead) return;
    P.pos.set(0, 0, 2);
    P.vel.set(0, 0, 0);
    P.onGround = true;
    G.unstuckCd = 120;
    UP.Audio.door({ x: 0, y: 1, z: 2 });
    UP.HUD.announce('RETURNED TO SPAWN', 1.6);
  };

  /* ---------------- run lifecycle ---------------- */
  G.start = function () {
    UP.Map.resetDynamic();
    UP.Machines.reset();
    UP.Zombies.clear();
    UP.Powerups.clear();
    UP.Player.reset();
    G.state = 'intermission';
    G.intermission = 5;
    G.round = 0;
    G.toSpawn = 0;
    G.hordeT = 0;
    G.eventTimer = 55;
    G.pendingLoot = false;
    G.bossRound = false;
    G.unstuckCd = 0;
    G.effects = { INSTA: 0, DOUBLE: 0, FIRE: 0 };
    G._timeouts.length = 0;
    G.startTime = G.time;
    document.body.classList.remove('insta');
    UP.Zombies.instaKill = false;
    UP.HUD.refreshPerks();
    UP.HUD.announce('SURVIVE', 2.5);
    UP.Audio.startAmbience();
  };

  G.gameOver = function () {
    if (G.state === 'over') return;
    G.state = 'over';
    const P = UP.Player;
    const stats = {
      round: G.round, kills: P.kills, points: P.pointsEarned,
      headshots: P.headshots, time: G.time - G.startTime,
    };
    const improved = UP.Settings.saveBest({
      round: stats.round, kills: stats.kills, points: stats.points,
      headshots: stats.headshots, time: Math.floor(stats.time),
    });
    document.exitPointerLock && document.exitPointerLock();
    UP.Audio.stopAmbience();
    // fill game over screen
    document.getElementById('go-round').textContent = stats.round;
    document.getElementById('go-kills').textContent = stats.kills;
    document.getElementById('go-hs').textContent = stats.headshots;
    document.getElementById('go-points').textContent = stats.points;
    document.getElementById('go-time').textContent = UP.fmtTime(stats.time);
    document.getElementById('go-best').textContent = improved ? 'NEW PERSONAL BEST!' : '';
    document.getElementById('menu-root').hidden = false;
    UP.HUD.show(false);
    const goMenu = document.getElementById('gameover-menu');
    for (const id of ['main-menu', 'settings-menu', 'pause-menu']) {
      document.getElementById(id).hidden = true;
    }
    goMenu.hidden = false;
  };

  /* ---------------- main update ---------------- */
  G.update = function (dt) {
    if (G.state === 'menu' || G.state === 'over' || G.state === 'paused') return;
    G.time += dt;

    // timeouts
    for (let i = G._timeouts.length - 1; i >= 0; i--) {
      G._timeouts[i].t -= dt;
      if (G._timeouts[i].t <= 0) { const fn = G._timeouts[i].fn; G._timeouts.splice(i, 1); fn(); }
    }

    // effects timers
    for (const k of ['INSTA', 'DOUBLE', 'FIRE']) {
      if (G.effects[k] > 0) G.effects[k] = Math.max(0, G.effects[k] - dt);
    }
    if (G.effects.INSTA <= 0 && UP.Zombies.instaKill) {
      UP.Zombies.instaKill = false;
      document.body.classList.remove('insta');
    }
    if (G.unstuckCd > 0) G.unstuckCd = Math.max(0, G.unstuckCd - dt);
    if (G.hordeT > 0) G.hordeT -= dt;

    // intermission countdown
    if (G.state === 'intermission') {
      G.intermission -= dt;
      if (G.intermission <= 0) G.startRound(G.round + 1);
    }

    // spawner
    if (G.state === 'playing' && G.toSpawn > 0) {
      G.spawnTimer -= dt * (G.hordeT > 0 ? 2.2 : 1);
      if (G.spawnTimer <= 0) {
        if (spawnOne()) G.toSpawn--;
        G.spawnTimer = G.spawnInterval;
      }
    }

    // round complete
    if (G.state === 'playing' && G.toSpawn === 0 && UP.Zombies.countAlive() === 0) {
      G.endRound();
    }

    // random events
    if (G.round >= 3 && G.state === 'playing') {
      G.eventTimer -= dt;
      if (G.eventTimer <= 0) {
        G.eventTimer = UP.rand(50, 95);
        rollEvent();
      }
    }

    // systems
    const P = UP.Player;
    P.update(dt);
    UP.Zombies.update(dt, P, G);
    UP.Machines.update(dt, G.time);
    UP.Powerups.update(dt);
    UP.Map.update(dt, G.time);
    updateInteractions(dt);
    UP.HUD.update(dt);
    UP.Audio.updateAmbience(dt, G.round);

    // explosions anim
    for (const e of (expPool || [])) {
      if (e.t > 0) {
        e.t -= dt;
        const f = 1 - e.t / 0.45;
        e.mesh.scale.setScalar(0.2 + f * e.r);
        e.mesh.material.opacity = 0.75 * (1 - f);
        e.light.intensity = 3 * (1 - f);
        if (e.t <= 0) e.mesh.visible = false;
      }
    }
  };

  window.UP.Game = G;
})();
