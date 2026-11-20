/* UNDEAD PROTOCOL — player.js
   First-person controller: pointer lock, WASD/sprint/jump/crouch, collision,
   health/armor, two-weapon loadout, ADS, reloads, hitscan + projectile firing,
   muzzle flash, tracers, recoil, view models. */
'use strict';
window.UP = window.UP || {};
(function () {
  const T = window.THREE;

  const P = {
    camera: null, scene: null,
    pos: new T.Vector3(0, 0, 2), // feet position
    vel: new T.Vector3(),
    yaw: 0, pitch: 0,
    onGround: true,
    crouch: false, crouchT: 0,
    sprinting: false, stamina: 4, staminaMax: 4,
    health: 100, maxHealth: 100, armor: 0,
    lastHurt: -10,
    perks: {}, reviveUsed: false,
    points: 500, pointsEarned: 0,
    kills: 0, headshots: 0,
    slots: [null, null], cur: 0,
    nextShot: 0, reloading: 0, reloadDur: 0, switching: 0,
    ads: 0, adsHeld: false,
    fireHeld: false, semiLatch: false,
    bobPhase: 0, recoilP: 0, recoilY: 0, kickBack: 0,
    stepT: 0,
    viewRoot: null, // holds weapon models, attached to camera
    time: 0,
    dead: false,
  };

  const EYE = 1.66, EYE_CROUCH = 1.06, RADIUS = 0.34;

  const keys = {};
  let mouseDX = 0, mouseDY = 0;
  const inGame = () => UP.Game && (UP.Game.state === 'playing' || UP.Game.state === 'intermission');

  /* ---------------- weapons as instances ---------------- */
  function makeWeapon(defId, tier = 0) {
    const def = UP.Weapons.DEFS[defId];
    const st = UP.Weapons.stats(def, tier);
    const model = UP.Weapons.buildModel(def, tier);
    P.viewRoot.add(model);
    model.visible = false;
    model.position.set(0.24, -0.25, -0.48);
    model.rotation.y = 0.05;
    const sightY = model.userData.sightY || 0.06;
    return {
      def, tier, stats: st,
      mag: st.mag, reserve: st.reserve,
      model, muzzle: model.userData.muzzle,
      basePos: new T.Vector3(0.24, -0.25, -0.48),
      adsPos: new T.Vector3(0, -sightY, -0.36),
    };
  }

  P.giveWeapon = function (defId, tier = 0) {
    // returns slot index replaced
    let slot;
    if (P.slots[P.cur] === null) slot = P.cur;
    else if (P.slots[0] === null) slot = 0;
    else if (P.slots[1] === null) slot = 1;
    else slot = P.cur; // replace current
    if (P.slots[slot]) {
      P.scene.remove(P.slots[slot].model);
      P.viewRoot.remove(P.slots[slot].model);
    }
    P.slots[slot] = makeWeapon(defId, tier);
    P.switchTo(slot, true);
    return slot;
  };

  P.upgradeWeapon = function (slot) {
    const w = P.slots[slot];
    if (!w) return null;
    P.viewRoot.remove(w.model);
    w.tier += 1;
    w.stats = UP.Weapons.stats(w.def, w.tier);
    w.mag = w.stats.mag;
    w.reserve = Math.max(w.reserve, Math.round(w.stats.reserve * 0.5));
    w.model = UP.Weapons.buildModel(w.def, w.tier);
    w.model.visible = false;
    w.basePos = new T.Vector3(0.24, -0.25, -0.48);
    w.adsPos = new T.Vector3(0, -(w.model.userData.sightY || 0.06), -0.36);
    P.viewRoot.add(w.model);
    if (P.cur === slot) w.model.visible = true;
    return w;
  };

  P.hasWeapon = function (defId) {
    return P.slots.some(w => w && w.def.id === defId);
  };
  P.findWeapon = function (defId) {
    return P.slots.find(w => w && w.def.id === defId) || null;
  };

  /* Pack-A-Punch: blocks firing & dips the model for t seconds. */
  P.beginPap = function (t) { P.busy = t; };

  P.switchTo = function (slot, force = false) {
    if (slot === P.cur && !force) return;
    if (P.reloading > 0) { P.reloading = 0; P.curWeapon().model.visible = false; }
    if (!P.slots[slot]) return;
    P.switching = 0.32;
    P._switchTarget = slot;
    P.reloading = 0;
    UP.Audio.weaponSwitch();
  };

  P.curWeapon = function () { return P.slots[P.cur]; };

  /* ---------------- lifecycle ---------------- */
  P.init = function (camera, scene) {
    P.camera = camera; P.scene = scene;
    P.viewRoot = new T.Group();
    camera.add(P.viewRoot);

    // effects pools
    initFX();

    document.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (inGame()) {
        if (e.code === 'KeyR') startReload();
        if (e.code === 'Digit1') P.switchTo(0);
        if (e.code === 'Digit2') P.switchTo(1);
        if (e.code === 'KeyQ') P.switchTo(P.cur === 0 ? 1 : 0);
        if (e.code === 'Space' && P.onGround) { P.vel.y = 4.9; P.onGround = false; UP.Audio.jump(); }
      }
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });
    document.addEventListener('mousedown', e => {
      if (!inGame() || !document.pointerLockElement) return;
      if (e.button === 0) { P.fireHeld = true; P.semiLatch = false; }
      if (e.button === 2) P.adsHeld = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) P.fireHeld = false;
      if (e.button === 2) P.adsHeld = false;
    });
    document.addEventListener('mousemove', e => {
      if (!document.pointerLockElement || !inGame()) return;
      const s = 0.0022 * UP.Settings.values.sens * (P.ads > 0.5 ? 0.65 : 1);
      mouseDX += e.movementX * s;
      mouseDY += e.movementY * s;
    });
    document.addEventListener('wheel', () => {
      if (inGame()) P.switchTo(P.cur === 0 ? 1 : 0);
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
  };

  P.reset = function () {
    P.pos.set(0, 0, 2); P.vel.set(0, 0, 0);
    P.yaw = Math.PI; P.pitch = 0;
    P.health = 100; P.maxHealth = 100; P.armor = 0;
    P.perks = {}; P.reviveUsed = false;
    P.points = 500; P.pointsEarned = 0;
    P.kills = 0; P.headshots = 0;
    P.staminaMax = 4; P.stamina = 4;
    P.dead = false;
    P.reloading = 0; P.switching = 0; P.ads = 0; P.fireHeld = false; P.busy = 0;
    P.lastHurt = -10;
    for (let i = 0; i < 2; i++) {
      if (P.slots[i]) { P.viewRoot.remove(P.slots[i].model); P.slots[i] = null; }
    }
    P.cur = 0;
    P.giveWeapon('m1911', 0);
    P.giveWeapon('ranger', 0);
    clearProjectiles();
  };

  /* ---------------- points ---------------- */
  P.addPoints = function (n, silent = false) {
    const mult = UP.Game.effects.DOUBLE > 0 ? 2 : 1;
    P.points += n * mult;
    P.pointsEarned += n * mult;
    if (!silent) UP.HUD.floatPoints(n * mult);
  };
  P.spend = function (n) {
    if (P.points < n) return false;
    P.points -= n;
    UP.HUD.floatPoints(-n);
    return true;
  };
  P.canAfford = n => P.points >= n;

  /* ---------------- health ---------------- */
  P.damage = function (amount, from) {
    if (P.dead || !inGame()) return;
    if (P.armor > 0) {
      const absorbed = Math.min(P.armor, amount * 0.6);
      P.armor -= absorbed;
      amount -= absorbed;
    }
    P.health -= amount;
    P.lastHurt = P.time;
    UP.Audio.hurt();
    UP.HUD.damageFlash(Math.min(0.9, amount / 40 + 0.25));
    if (P.health <= 0) {
      if (P.perks.revive && !P.reviveUsed) {
        P.reviveUsed = true;
        P.perks.revive = false;
        P.health = P.maxHealth * 0.5;
        UP.HUD.refreshPerks();
        UP.HUD.announce('SECOND WIND', 1.6);
        UP.Audio.heal();
        UP.Game && UP.Game.powerupBlast && UP.Game.powerupBlast(from);
      } else {
        P.health = 0;
        P.dead = true;
        UP.Game.gameOver();
      }
    }
  };

  /* ---------------- reload ---------------- */
  function startReload() {
    const w = P.curWeapon();
    if (!w || P.reloading > 0 || P.switching > 0) return;
    if (w.mag >= w.stats.mag || w.reserve <= 0) return;
    P.reloading = w.def.reload * (P.perks.quick ? 0.55 : 1);
    P.reloadDur = P.reloading;
    UP.Audio.reload(w.def.sound);
  }
  function finishReload(w) {
    const need = w.stats.mag - w.mag;
    const take = Math.min(need, w.reserve);
    w.mag += take; w.reserve -= take;
  }

  /* ---------------- firing ---------------- */
  const _ray = new T.Raycaster();
  const _dir = new T.Vector3();
  const _origin = new T.Vector3();
  const _spreadV = new T.Vector3();

  P.tryFire = function (dt) {
    const w = P.curWeapon();
    if (!w || P.reloading > 0 || P.switching > 0 || P.dead || P.busy > 0) return;
    const st = w.stats;
    const auto = w.def.auto;
    if (!P.fireHeld) return;
    if (!auto && P.semiLatch) return;
    if (P.time < P.nextShot) return;
    if (w.mag <= 0) {
      UP.Audio.dry();
      P.nextShot = P.time + 0.25;
      P.semiLatch = true;
      startReload();
      return;
    }
    P.semiLatch = true;
    const rpm = st.rpm * (P.perks.rapid ? 1.3 : 1);
    P.nextShot = P.time + 60 / rpm;
    w.mag--;

    const pellets = w.def.pellets || 1;
    const muzzleWorld = w.muzzle.getWorldPosition(new T.Vector3());

    for (let i = 0; i < pellets; i++) {
      const spread = w.def.spread * (P.ads > 0.6 ? w.def.adsSpread : 1) *
        (P.sprinting ? 1.6 : 1) * (P.movingFast ? 1.35 : 1);
      P.camera.getWorldDirection(_dir);
      // random cone
      _spreadV.set(UP.rand(-1, 1), UP.rand(-1, 1), UP.rand(-1, 1)).normalize().multiplyScalar(spread * Math.random());
      _dir.add(_spreadV).normalize();
      _origin.copy(P.camera.getWorldPosition(new T.Vector3()));

      if (w.def.projectile) {
        fireProjectile(w, _origin, _dir, muzzleWorld);
      } else {
        castShot(_origin, _dir, w);
      }
    }
    // feedback
    const kick = w.def.recoil * (P.ads > 0.6 ? 0.6 : 1);
    P.recoilP += kick * UP.rand(0.8, 1.3);
    P.recoilY += kick * UP.rand(-0.4, 0.4);
    P.kickBack = Math.min(P.kickBack + 0.045, 0.09);
    UP.Audio.shoot(w.def.sound);
    muzzleFlash(muzzleWorld);
    UP.Zombies.alert(P.pos.x, P.pos.z, 28);
  };

  function castShot(origin, dir, w) {
    _ray.set(origin, dir);
    _ray.far = 300;
    const targets = UP.Zombies.hitMeshes().concat(UP.Map.raycastStatics);
    const hits = _ray.intersectObjects(targets, false);
    let result = null;
    for (const h of hits) {
      const ud = h.object.userData;
      if (ud && ud.z) {
        const z = ud.z;
        if (z.dead || z.state === 'die') continue;
        const dist = h.distance;
        let dmg = w.stats.dmg;
        // damage falloff by range
        const range = w.def.range || 25;
        if (dist > range) dmg *= Math.max(0.35, 1 - (dist - range) / (range * 2));
        if (P.perks.dblDmg) dmg *= 1.5;
        let headMult = w.def.head;
        if (P.perks.deadeye && ud.part === 'head') headMult *= 1.5;
        const killed = UP.Zombies.damage(z, dmg, ud.part, headMult);
        // feedback & points
        UP.Audio.hitTick(ud.part === 'head');
        UP.HUD.hitmarker(ud.part === 'head', killed);
        if (ud.part === 'head' && killed) UP.HUD.headshotPop();
        P.addPoints(10);
        impactFX(h.point, true, ud.part === 'head');
        if (killed) UP.Game.onZombieKilled(z, ud.part === 'head', false, w);
        result = { zombie: z, part: ud.part };
        tracer(origin, h.point);
        break;
      } else {
        // wall / prop hit
        impactFX(h.point, false, false);
        tracer(origin, h.point);
        result = { wall: true };
        break;
      }
    }
    if (!hits.length) tracer(origin, _dir.clone().multiplyScalar(80).add(origin));
    return result;
  }

  /* ---------------- projectiles (raygun, plasma, launcher) ---------------- */
  const projectiles = [];
  function fireProjectile(w, origin, dir, muzzleWorld) {
    let mesh;
    if (w.def.rocket) {
      mesh = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.3, 8),
        new T.MeshStandardMaterial({ color: 0x333333, emissive: w.def.projColor, emissiveIntensity: 0.6 }));
      mesh.rotation.x = Math.PI / 2;
    } else {
      mesh = new T.Mesh(new T.SphereGeometry(0.09, 8, 6),
        new T.MeshStandardMaterial({ color: w.def.projColor, emissive: w.def.projColor, emissiveIntensity: 2.2 }));
    }
    const light = new T.PointLight(w.def.projColor, 0.8, 5);
    mesh.add(light);
    mesh.position.copy(muzzleWorld);
    P.scene.add(mesh);
    projectiles.push({
      mesh, def: w.def, tier: w.stats,
      vel: dir.clone().multiplyScalar(w.def.projSpeed),
      t: 4, splashDmg: w.stats.dmg,
    });
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.t -= dt;
      if (p.def.gravity) p.vel.y -= p.def.gravity * dt;
      const step = p.vel.clone().multiplyScalar(dt);
      p.mesh.position.add(step);
      const pos = p.mesh.position;
      let boom = p.t <= 0 || pos.y < UP.Map.floorHeightAt(pos.x, pos.z, pos.y);
      if (!boom) {
        // zombie proximity
        for (const z of UP.Zombies.alive) {
          if (z.dead) continue;
          const d = UP.dist2(pos.x, pos.z, z.x, z.zc);
          if (d < 0.7 && Math.abs(pos.y - (z.y + 1)) < 1.6) {
            // direct hit
            const killed = UP.Zombies.damage(z, p.splashDmg * 1.2, 'body', 1);
            UP.Audio.hitTick(false);
            if (killed) UP.Game.onZombieKilled(z, false, false, null);
            boom = true;
            break;
          }
        }
      }
      if (!boom) {
        // wall hit — cheap point test
        const pb = { x1: pos.x - 0.15, y1: pos.y - 0.15, z1: pos.z - 0.15, x2: pos.x + 0.15, y2: pos.y + 0.15, z2: pos.z + 0.15 };
        for (const c of UP.Map.colliders) {
          if (UP.boxOverlap(pb, c)) { boom = true; break; }
        }
      }
      if (boom) {
        UP.Game.explosion(pos, p.def.splash.r, p.def.splash.dmg * (p.tier.tier >= 1 ? 1.5 : 1), false, p.def.projColor);
        P.scene.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }
  }
  function clearProjectiles() {
    for (const p of projectiles) P.scene.remove(p.mesh);
    projectiles.length = 0;
  }

  /* ---------------- FX (pooled) ---------------- */
  let flashes = [], tracers = [], impacts = [], flashLight;
  function initFX() {
    flashLight = new T.PointLight(0xffc76a, 0, 9, 2);
    P.scene.add(flashLight);
    const flashMat = new T.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const m = new T.Mesh(new T.PlaneGeometry(0.5, 0.5), flashMat.clone());
      m.visible = false; P.scene.add(m);
      flashes.push({ mesh: m, t: 0 });
    }
    for (let i = 0; i < 10; i++) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const l = new T.Line(g, new T.LineBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0 }));
      l.visible = false; P.scene.add(l);
      tracers.push({ line: l, t: 0 });
    }
    for (let i = 0; i < 14; i++) {
      const m = new T.Mesh(new T.SphereGeometry(0.06, 6, 5),
        new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
      m.visible = false; P.scene.add(m);
      impacts.push({ mesh: m, t: 0, vy: 0 });
    }
  }

  function muzzleFlash(pos) {
    flashLight.position.copy(pos);
    flashLight.intensity = 2.6;
    const f = flashes.find(f => f.t <= 0) || flashes[0];
    f.t = 0.05;
    f.mesh.visible = true;
    f.mesh.position.copy(pos);
    f.mesh.material.opacity = 0.9;
    f.mesh.rotation.z = Math.random() * Math.PI;
    const s = UP.rand(0.7, 1.2);
    f.mesh.scale.set(s, s, s);
    f.mesh.quaternion.copy(P.camera.quaternion);
  }
  function tracer(from, to) {
    const tr = tracers.find(t => t.t <= 0) || tracers[0];
    tr.t = 0.07;
    tr.line.visible = true;
    tr.line.material.opacity = 0.55;
    const a = tr.line.geometry.attributes.position.array;
    a[0] = from.x; a[1] = from.y; a[2] = from.z;
    a[3] = to.x; a[4] = to.y; a[5] = to.z;
    tr.line.geometry.attributes.position.needsUpdate = true;
  }
  function impactFX(point, flesh, head) {
    const im = impacts.find(i => i.t <= 0);
    if (!im) return;
    im.t = 0.3;
    im.mesh.visible = true;
    im.mesh.position.copy(point);
    im.mesh.material.color.setHex(flesh ? (UP.Settings.values.blood ? (head ? 0xc21818 : 0x8a1010) : 0x9aa0a8) : 0xb0a488);
    im.mesh.material.opacity = 0.9;
    im.vy = UP.rand(0.5, 1.6);
    const s = flesh ? UP.rand(0.9, 1.4) : UP.rand(0.5, 0.8);
    im.mesh.scale.set(s, s, s);
  }

  function updateFX(dt) {
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 40);
    for (const f of flashes) {
      if (f.t > 0) { f.t -= dt; f.mesh.material.opacity = Math.max(0, f.t / 0.05) * 0.9; if (f.t <= 0) f.mesh.visible = false; }
    }
    for (const tr of tracers) {
      if (tr.t > 0) { tr.t -= dt; tr.line.material.opacity = Math.max(0, tr.t / 0.07) * 0.55; if (tr.t <= 0) tr.line.visible = false; }
    }
    for (const im of impacts) {
      if (im.t > 0) {
        im.t -= dt;
        im.mesh.material.opacity = Math.max(0, im.t / 0.3) * 0.9;
        im.mesh.position.y += im.vy * dt;
        im.vy -= 3 * dt;
        if (im.t <= 0) im.mesh.visible = false;
      }
    }
  }

  /* ---------------- movement + collision ---------------- */
  function collideMove(dt) {
    const Map = UP.Map;
    let speed = 4.3;
    if (P.crouch) speed = 2.1;
    else if (P.sprinting && P.stamina > 0) speed = 6.6;
    if (P.perks.stamin) speed *= 1.15;
    if (P.ads > 0.5) speed *= 0.62;

    let ix = 0, iz = 0;
    if (keys['KeyW']) iz -= 1;
    if (keys['KeyS']) iz += 1;
    if (keys['KeyA']) ix -= 1;
    if (keys['KeyD']) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    P.movingFast = moving && !P.crouch;
    const len = Math.hypot(ix, iz) || 1;

    // sprint state
    P.sprinting = !!keys['ShiftLeft'] && iz < 0 && !P.crouch && P.stamina > 0.05 && !P.adsHeld;
    if (P.sprinting) { P.stamina -= dt; if (P.stamina <= 0) { P.stamina = 0; P.sprinting = false; } }
    else P.stamina = Math.min(P.staminaMax, P.stamina + dt * 1.2);

    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    // forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
    // move = forward * (-iz) + right * ix   [iz is -1 when W is held]
    const wx = (iz * sin + ix * cos) / len * speed;
    const wz = (iz * cos - ix * sin) / len * speed;

    // desired velocity damping
    P.vel.x = UP.damp(P.vel.x, moving ? wx : 0, 12, dt);
    P.vel.z = UP.damp(P.vel.z, moving ? wz : 0, 12, dt);
    P.vel.y -= 15 * dt;

    // crouch height
    P.crouch = !!keys['ControlLeft'];
    P.crouchT = UP.damp(P.crouchT, P.crouch ? 1 : 0, 10, dt);

    // horizontal collision (axis separated)
    const h = 1.75 - P.crouchT * 0.65;
    const feet = P.pos.y;
    let nx = P.pos.x + P.vel.x * dt;
    if (!boxBlocked(nx, P.pos.z, feet, h)) P.pos.x = nx; else P.vel.x *= 0.1;
    let nz = P.pos.z + P.vel.z * dt;
    if (!boxBlocked(P.pos.x, nz, feet, h)) P.pos.z = nz; else P.vel.z *= 0.1;

    // vertical
    const wasOnGround = P.onGround;
    P.pos.y += P.vel.y * dt;
    const gy = Map.floorHeightAt(P.pos.x, P.pos.z, feet + 0.6);
    if (P.pos.y <= gy + 0.02) {
      if (!P.onGround && P.vel.y < -3) UP.Audio.land();
      P.pos.y = gy;
      P.vel.y = 0;
      P.onGround = true;
    } else if (wasOnGround && P.vel.y <= 0 && P.pos.y - gy < 0.5) {
      // walking down a ramp — snap to floor instead of micro-falling
      P.pos.y = gy;
      P.vel.y = 0;
      P.onGround = true;
    } else {
      P.onGround = false;
    }

    // footsteps
    const spd2 = Math.hypot(P.vel.x, P.vel.z);
    if (P.onGround && spd2 > 1.2) {
      P.bobPhase += dt * spd2 * 1.9;
      P.stepT -= dt;
      if (P.stepT <= 0) { P.stepT = 0.38; UP.Audio.step(P.sprinting); }
    }
  }

  function boxBlocked(x, z, feet, h) {
    const b = { x1: x - RADIUS, y1: feet + 0.25, z1: z - RADIUS, x2: x + RADIUS, y2: feet + h, z2: z + RADIUS };
    for (const c of UP.Map.colliders) if (UP.boxOverlap(b, c)) return true;
    return false;
  }

  /* ---------------- main update ---------------- */
  P.update = function (dt) {
    P.time += dt;
    const active = inGame();
    // mouse look
    P.yaw -= mouseDX;
    P.pitch = UP.clamp(P.pitch - mouseDY, -1.45, 1.45);
    mouseDX = 0; mouseDY = 0;
    // recoil recovery
    P.recoilP = UP.damp(P.recoilP, 0, 8, dt);
    P.recoilY = UP.damp(P.recoilY, 0, 8, dt);
    P.kickBack = UP.damp(P.kickBack, 0, 10, dt);

    if (active && !P.dead) collideMove(dt);

    // ADS
    const wantAds = P.adsHeld && P.reloading <= 0 && P.switching <= 0 && !P.sprinting;
    P.ads = UP.damp(P.ads, wantAds ? 1 : 0, 12, dt);

    // reload timer
    P.busy = Math.max(0, P.busy - dt);
    if (P.reloading > 0) {
      P.reloading -= dt;
      if (P.reloading <= 0) { P.reloading = 0; finishReload(P.curWeapon()); }
    }
    if (P.switching > 0) {
      P.switching -= dt;
      if (P.switching <= 0.16 && P._switchTarget !== undefined) {
        const w = P.curWeapon();
        if (w) w.model.visible = false;
        P.cur = P._switchTarget;
        const nw = P.curWeapon();
        if (nw) nw.model.visible = true;
        P._switchTarget = undefined;
      }
    }

    // firing
    if (active && !P.dead) P.tryFire(dt);

    // health regen
    if (P.time - P.lastHurt > 4 && P.health < P.maxHealth && !P.dead) {
      P.health = Math.min(P.maxHealth, P.health + 14 * dt);
    }

    /* camera transform */
    const eye = UP.lerp(EYE, EYE_CROUCH, P.crouchT);
    const bobY = Math.sin(P.bobPhase * 2) * 0.028 * (P.ads > 0.5 ? 0.25 : 1);
    const bobX = Math.cos(P.bobPhase) * 0.02 * (P.ads > 0.5 ? 0.25 : 1);
    P.camera.position.set(P.pos.x + bobX, P.pos.y + eye + bobY, P.pos.z);
    P.camera.rotation.set(0, 0, 0);
    P.camera.rotateY(P.yaw + P.recoilY);
    P.camera.rotateX(P.pitch + P.recoilP);

    /* weapon model animation */
    const w = P.curWeapon();
    if (w) {
      const target = P.ads > 0.5 ? w.adsPos : w.basePos;
      const lower = P.switching > 0 ? Math.min(P.switching * 2.2, 1) : 0;
      const busyDip = P.busy > 0 ? 0.22 : 0;
      const reloadDip = P.reloading > 0 ? Math.sin((1 - P.reloading / Math.max(P.reloadDur, 0.01)) * Math.PI) : 0;
      w.model.position.set(
        UP.damp(w.model.position.x, target.x, 12, dt),
        UP.damp(w.model.position.y, target.y - lower * 0.35 - busyDip - reloadDip * 0.14 + bobY * 0.6, 12, dt),
        UP.damp(w.model.position.z, target.z + P.kickBack, 12, dt)
      );
      const sway = Math.sin(P.bobPhase) * 0.015 * (1 - P.ads * 0.8);
      w.model.rotation.z = UP.damp(w.model.rotation.z, sway + (busyDip ? 0.3 : 0) + reloadDip * 0.5, 10, dt);
      w.model.rotation.x = UP.damp(w.model.rotation.x, reloadDip * 0.6 - P.kickBack * 0.5, 10, dt);
      if (w.model.userData.mag) {
        const mag = w.model.userData.mag;
        mag.position.y = (w.model.userData.magHomeY ?? (w.model.userData.magHomeY = mag.position.y)) -
          reloadDip * 0.18;
      }
    }

    /* FOV */
    const baseFov = UP.Settings.values.fov;
    const w0 = P.curWeapon();
    const adsFov = w0 ? (w0.def.scope ? 26 : (w0.def.adsFov || 58)) : baseFov;
    const sprintFov = P.sprinting ? 6 : 0;
    const targetFov = UP.lerp(baseFov, adsFov, P.ads) + sprintFov * (1 - P.ads);
    P.camera.fov = UP.damp(P.camera.fov, targetFov, 10, dt);
    P.camera.updateProjectionMatrix();

    // scope: hide the view model so the player actually sees THROUGH the scope
    const scopeOn = w0 && w0.def.scope && P.ads > 0.82;
    UP.HUD.setScope(scopeOn);
    if (w) w.model.visible = !scopeOn;
    // crosshair spread
    const chSpread = 5 + (P.movingFast ? 8 : 0) + (1 - P.ads) * 5 + (P.sprinting ? 10 : 0);
    UP.HUD.setCrosshair(scopeOn ? 0 : chSpread);

    updateFX(dt);
    updateProjectiles(dt);

    // audio listener
    const fwd = new T.Vector3(); P.camera.getWorldDirection(fwd);
    UP.Audio.updateListener(P.camera.position, fwd);
  };

  P.isSprinting = () => P.sprinting;

  window.UP.Player = P;
})();
