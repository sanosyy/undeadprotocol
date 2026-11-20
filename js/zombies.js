/* UNDEAD PROTOCOL — zombies.js
   Pooled zombies with procedural bodies/animation, window-breaching AI,
   pathfinding over the map nav graph, special types and the boss. */
'use strict';
window.UP = window.UP || {};
(function () {
  const T = window.THREE;

  /* type multipliers vs round-scaled base */
  const TYPES = {
    regular: { hp: 1.0, speed: 1.7, dmg: 20, scale: 1.0, skin: 0x7d8a63, cloth: 0x3a3f45, bodyMult: 1.0 },
    runner:  { hp: 0.7, speed: 3.4, dmg: 15, scale: 0.95, skin: 0x8f6a58, cloth: 0x57302a, bodyMult: 1.0 },
    armored: { hp: 1.9, speed: 1.85, dmg: 25, scale: 1.06, skin: 0x6a7a6f, cloth: 0x2f3f5f, bodyMult: 0.6, vest: true },
    crawler: { hp: 0.5, speed: 1.35, dmg: 12, scale: 0.62, skin: 0x9a9263, cloth: 0x4a4238, bodyMult: 1.0, low: true },
    exploder:{ hp: 0.65, speed: 2.75, dmg: 0, scale: 1.0, skin: 0xc2c14a, cloth: 0x6a6a2a, bodyMult: 1.0, explode: true },
    brute:   { hp: 5.5, speed: 1.5, dmg: 40, scale: 1.5, skin: 0x5f6a4a, cloth: 0x2a2f3a, bodyMult: 0.85, wide: true },
    boss:    { hp: 1.0, speed: 2.35, dmg: 50, scale: 2.1, skin: 0x7a3a3a, cloth: 0x24243a, bodyMult: 0.9, boss: true },
  };

  const Z = {
    scene: null, pool: [], alive: [],
    boss: null,
    instaKill: false,
    maxAlive: 22,
    spits: [],
  };

  function hpBase(round) {
    let hp = 60 + 50 * Math.min(round, 12);
    if (round > 12) hp *= Math.pow(1.09, round - 12);
    return hp;
  }
  Z.hpBase = hpBase;

  /* Round-based type mix. Returns [[type, weight], ...] */
  Z.mixForRound = function (r) {
    const mix = [['regular', Math.max(10 - r, 2)]];
    if (r >= 3) mix.push(['runner', 2 + r * 0.9]);
    if (r >= 5) mix.push(['crawler', 1 + r * 0.25]);
    if (r >= 6) mix.push(['armored', 2 + r * 0.5]);
    if (r >= 8) mix.push(['exploder', 1 + r * 0.35]);
    if (r % 5 === 0) mix.push(['brute', 3 + r * 0.4]);
    if (r >= 9) mix.push(['brute', 0.6]);
    return mix;
  };
  Z.rollType = function (r) { return UP.weightedChoice(Z.mixForRound(r)); };

  /* ---------------- procedural zombie body ---------------- */
  function buildZombie() {
    const g = new T.Group();
    const skinMat = new T.MeshStandardMaterial({ color: 0x7d8a63, roughness: 0.95 });
    const clothMat = new T.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.95 });
    const eyeMat = new T.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 1.2 });
    const z = { group: g, mats: { skin: skinMat, cloth: clothMat, eye: eyeMat } };

    const torso = new T.Mesh(new T.BoxGeometry(0.52, 0.66, 0.3), clothMat);
    torso.position.y = 1.1;
    const chest = new T.Mesh(new T.BoxGeometry(0.44, 0.3, 0.26), skinMat);
    chest.position.y = 1.24;
    const hips = new T.Mesh(new T.BoxGeometry(0.42, 0.24, 0.26), clothMat);
    hips.position.y = 0.74;
    const head = new T.Mesh(new T.BoxGeometry(0.28, 0.3, 0.28), skinMat);
    head.position.y = 1.62;
    const eyeL = new T.Mesh(new T.BoxGeometry(0.05, 0.04, 0.02), eyeMat);
    eyeL.position.set(-0.07, 1.66, 0.15);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.07;
    g.add(torso); g.add(chest); g.add(hips); g.add(head); g.add(eyeL); g.add(eyeR);

    // arms (pivot groups at shoulders)
    const armGeo = new T.BoxGeometry(0.13, 0.62, 0.13);
    const arms = [];
    for (const s of [-1, 1]) {
      const pivot = new T.Group();
      pivot.position.set(0.34 * s, 1.36, 0);
      const arm = new T.Mesh(armGeo, skinMat);
      arm.position.y = -0.3;
      pivot.add(arm);
      g.add(pivot);
      arms.push(pivot);
    }
    // legs
    const legGeo = new T.BoxGeometry(0.16, 0.74, 0.16);
    const legs = [];
    for (const s of [-1, 1]) {
      const pivot = new T.Group();
      pivot.position.set(0.13 * s, 0.76, 0);
      const leg = new T.Mesh(legGeo, clothMat);
      leg.position.y = -0.38;
      pivot.add(leg);
      g.add(pivot);
      legs.push(pivot);
    }
    // vest for armored
    const vest = new T.Mesh(new T.BoxGeometry(0.56, 0.4, 0.36),
      new T.MeshStandardMaterial({ color: 0x2f3f5f, roughness: 0.7, metalness: 0.4 }));
    vest.position.y = 1.18;
    vest.visible = false;
    g.add(vest);
    // shoulder spikes for boss
    const spikes = new T.Group();
    for (const s of [-1, 1]) {
      const spike = new T.Mesh(new T.ConeGeometry(0.09, 0.34, 6),
        new T.MeshStandardMaterial({ color: 0x3a1f1f, roughness: 0.8 }));
      spike.position.set(0.4 * s, 1.52, 0);
      spikes.add(spike);
    }
    spikes.visible = false;
    g.add(spikes);

    torso.castShadow = chest.castShadow = head.castShadow = true;
    z.parts = { torso, chest, hips, head, arms, legs, vest, spikes, eye: eyeMat };
    // hit boxes
    torso.userData = { z, part: 'body' };
    chest.userData = { z, part: 'body' };
    hips.userData = { z, part: 'body' };
    head.userData = { z, part: 'head' };
    for (const p of legs) p.children[0].userData = { z, part: 'body' };
    for (const p of arms) p.children[0].userData = { z, part: 'body' };
    g.visible = false;
    Z.scene.add(g);

    // state fields
    Object.assign(z, {
      active: false, type: 'regular', cfg: TYPES.regular, hp: 1, maxHp: 1, round: 1,
      x: 0, y: 0, zc: 0, vy: 0, yaw: 0, speed: 1, dmg: 20,
      state: 'chase', stateT: 0, win: null, vent: null,
      path: null, pathIdx: 0, repathT: 0,
      groanT: 3, stepT: 0, attackCd: 0, flashT: 0, enrageT: 0,
      phase: Math.random() * 10, loot: false, dead: false,
      spitCd: 3,
    });
    return z;
  }

  Z.init = function (scene) {
    Z.scene = scene;
    for (let i = 0; i < 30; i++) Z.pool.push(buildZombie());
    // spit projectile pool
    for (let i = 0; i < 6; i++) {
      const m = new T.Mesh(new T.SphereGeometry(0.16, 8, 6),
        new T.MeshStandardMaterial({ color: 0x4aff5a, emissive: 0x2aff3a, emissiveIntensity: 1.5 }));
      m.visible = false;
      scene.add(m);
      Z.spits.push({ mesh: m, active: false, vx: 0, vy: 0, vz: 0, t: 0 });
    }
  };

  function acquire() {
    for (const z of Z.pool) if (!z.active) return z;
    return null;
  }

  function configure(z, typeName, round, lootGlow = false) {
    const cfg = TYPES[typeName] || TYPES.regular;
    z.type = typeName; z.cfg = cfg; z.round = round;
    const hp = hpBase(round) * cfg.hp * (typeName === 'boss' ? Z.bossHpMult : 1);
    z.maxHp = hp; z.hp = hp;
    z.speed = cfg.speed * (1 + 0.02 * Math.min(round, 15));
    z.dmg = cfg.dmg;
    z.loot = lootGlow;
    z.state = 'rise'; z.stateT = 0;
    z.path = null; z.pathIdx = 0; z.repathT = 0;
    z.attackCd = 0; z.flashT = 0; z.enrageT = 0; z.spitCd = 3;
    z.beeped = false; z.dead = false;
    z.stuckT = 0; z.sideT = 0; z.sideDir = 1; z.sideCount = 0;
    z.lastX = 0; z.lastZ = 0; z.safeX = undefined; z.safeZ = undefined;
    z.groanT = UP.rand(2, 6);
    z.phase = Math.random() * 10;
    // visuals
    z.mats.skin.color.setHex(cfg.skin);
    z.mats.cloth.color.setHex(cfg.cloth);
    z.mats.skin.emissive.setHex(lootGlow ? 0x664400 : 0x000000);
    z.mats.skin.emissiveIntensity = lootGlow ? 0.8 : 0;
    z.parts.vest.visible = !!cfg.vest;
    z.parts.spikes.visible = !!cfg.boss;
    z.parts.eye.emissive.setHex(cfg.boss ? 0xff2aff : cfg.explode ? 0xffff2a : 0xff2a1a);
    const s = cfg.scale;
    z.group.scale.set(s * (cfg.wide ? 1.25 : 1), cfg.low ? s * 0.8 : s, s);
    z.group.rotation.set(cfg.low ? 1.1 : 0, 0, 0);
    // crawler: pitched-forward low pose, but the body stays ABOVE ground
    // (a -0.55m offset previously sank it into the floor)
    z.group.position.y = 0;
    z.group.visible = true;
    z.active = true;
    Z.alive.push(z);
    return z;
  }

  Z.spawnAtWindow = function (win, typeName, round, lootGlow) {
    const z = acquire();
    if (!z) return null;
    configure(z, typeName, round, lootGlow);
    const free = findFreeSpawn(win.spawnX + UP.rand(-1.4, 1.4), win.spawnZ + UP.rand(-1.4, 1.4), 0);
    z.x = free.x; z.y = 0; z.zc = free.z;
    z.lastX = z.x; z.lastZ = z.zc; z.safeX = z.x; z.safeZ = z.zc;
    z.win = win; z.vent = null;
    z.group.position.set(z.x, -1.6, z.zc);
    return z;
  };

  Z.spawnAtVent = function (vent, typeName, round, lootGlow) {
    const z = acquire();
    if (!z) return null;
    configure(z, typeName, round, lootGlow);
    const free = findFreeSpawn(vent.x + UP.rand(-0.6, 0.6), vent.z + UP.rand(-0.6, 0.6), vent.y);
    z.x = free.x; z.y = vent.y; z.zc = free.z;
    z.lastX = z.x; z.lastZ = z.zc; z.safeX = z.x; z.safeZ = z.zc;
    z.win = null; z.vent = vent;
    z.group.position.set(z.x, z.y - 1.6, z.zc);
    return z;
  };

  Z.spawnBoss = function (vent, round) {
    const z = acquire();
    if (!z) return null;
    Z.bossHpMult = 2600 * Math.pow(round / 10, 1.25) / hpBase(round);
    configure(z, 'boss', round);
    const free = findFreeSpawn(vent.x, vent.z, vent.y);
    z.x = free.x; z.y = vent.y; z.zc = free.z;
    z.lastX = z.x; z.lastZ = z.zc;
    z.group.position.set(z.x, z.y - 1.6, z.zc);
    Z.boss = z;
    return z;
  };

  Z.release = function (z) {
    z.active = false;
    z.group.visible = false;
    z.win = null;
    const i = Z.alive.indexOf(z);
    if (i >= 0) Z.alive.splice(i, 1);
    if (Z.boss === z) Z.boss = null;
  };

  Z.clear = function () {
    for (const z of [...Z.alive]) Z.release(z);
    Z.boss = null;
    for (const s of Z.spits) { s.active = false; s.mesh.visible = false; }
  };

  Z.countAlive = function () { return Z.alive.length; };
  Z.hitMeshes = function () {
    const arr = [];
    for (const z of Z.alive) {
      arr.push(z.parts.head, z.parts.torso, z.parts.chest, z.parts.hips,
               z.parts.legs[0].children[0], z.parts.legs[1].children[0]);
    }
    return arr;
  };

  Z.alert = function (x, zpos, radius) {
    for (const z of Z.alive) {
      const d = UP.dist2(z.x, z.zc, x, zpos);
      if (d < radius) z.enrageT = Math.max(z.enrageT, 1.6);
    }
  };

  /* Damage entry point. part 'head'|'body'. Returns true if killed. */
  Z.damage = function (z, dmg, part, headMult) {
    if (!z.active || z.dead) return false;
    const prevState = z.state;
    if (part === 'head' && headMult) dmg *= headMult;
    if (part === 'body') dmg *= z.cfg.bodyMult;
    if (Z.instaKill) dmg = 999999;
    z.hp -= dmg;
    z.flashT = 0.09;
    if (z.hp <= 0) {
      z.dead = true;
      z.state = 'die'; z.stateT = 0;
      z.parts.eye.emissiveIntensity = 0.2;
      UP.Audio.zDie({ x: z.x, y: z.y + 1.2, z: z.zc });
      if (z.win && prevState === 'breakPlank') z.win.queue = Math.max(0, z.win.queue - 1);
      return true;
    }
    return false;
  };

  Z.explodeZombie = function (z) { // exploder self-detonation
    z.dead = true;
    z.state = 'die'; z.stateT = 1.15; // skip fall — sink fast
    z.group.rotation.x = -Math.PI / 2;
  };

  /* Walkable line-of-sight: both a feet-level and a head-level segment must
     be clear, so zombies never "see" through windows, low doorways or gaps
     their bodies can't actually fit through. */
  function bodyClear(ax, az, ay, bx, bz, by) {
    return !UP.Map.segmentBlocked(ax, az, bx, bz, ay + 0.3, by + 0.3) &&
           !UP.Map.segmentBlocked(ax, az, bx, bz, ay + 1.5, by + 1.5);
  }

  /* ---------------- per-frame update ---------------- */
  const _tmpV = { x: 0, z: 0 };

  Z.update = function (dt, player, game) {
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y;

    for (const z of [...Z.alive]) {
      z.stateT += dt;
      z.flashT -= dt; z.enrageT -= dt; z.attackCd -= dt;
      if (z.flashT > 0) { z.mats.skin.emissive.setHex(0xff2020); z.mats.skin.emissiveIntensity = 0.7; }
      else if (z.loot) { z.mats.skin.emissive.setHex(0x664400); z.mats.skin.emissiveIntensity = 0.8; }
      else z.mats.skin.emissiveIntensity = 0;

      /* ---------- states ---------- */
      if (z.state === 'die') {
        if (z.stateT < 0.35 && z.cfg.explode === undefined) {
          z.group.rotation.x = -(z.stateT / 0.35) * Math.PI / 2;
        }
        if (z.stateT > 1.1) z.group.position.y -= dt * 1.4;
        if (z.stateT > 1.9) Z.release(z);
        continue;
      }
      if (z.state === 'rise') {
        const t = Math.min(z.stateT / 0.9, 1);
        const yy = z.group.position.y;
        z.group.position.y = z.y - 1.6 * (1 - t);
        if (t >= 1) {
          z.state = z.win ? 'toWindow' : 'chase';
          z.group.position.y = z.y;
        }
        continue;
      }

      const dx = px - z.x, dz = pz - z.zc;
      const distP = Math.hypot(dx, dz);
      let vx = 0, vz = 0;

      if (z.state === 'toWindow') {
        const w = z.win;
        const tx = w.cx + w.outX * 0.9, tz = w.cz + w.outZ * 0.9;
        const dw = UP.dist2(z.x, z.zc, tx, tz);
        if (dw < 0.55 || w.count === 0) {
          if (w.count > 0 && w.queue < 2) { z.state = 'breakPlank'; z.stateT = 0; w.queue++; }
          else if (w.count === 0) { startVault(z); }
        } else {
          vx = (tx - z.x) / dw; vz = (tz - z.zc) / dw;
        }
      } else if (z.state === 'breakPlank') {
        const w = z.win;
        z.yaw = Math.atan2(-(w.outX), -(w.outZ));
        if (w.count <= 0) {
          w.queue = Math.max(0, w.queue - 1);
          startVault(z);
        } else if (z.stateT > 1.1) {
          z.stateT = 0;
          w.count--;
          const plank = w.planks[w.count];
          if (plank && !plank.broken) {
            plank.broken = true;
            plank.mesh.visible = false;
            UP.Audio.plankBreak({ x: w.cx, y: 1, z: w.cz });
            game.onPlankBroken && game.onPlankBroken(w);
          }
        }
      } else if (z.state === 'vault') {
        const t = Math.min(z.stateT / 1.0, 1);
        z.x = UP.lerp(z.vFromX, z.vToX, t);
        z.zc = UP.lerp(z.vFromZ, z.vToZ, t);
        z.y = UP.lerp(z.vFromY, z.vToY, t) + Math.sin(t * Math.PI) * 0.5;
        z.group.position.set(z.x, z.y, z.zc);
        z.yaw = Math.atan2(z.vToX - z.vFromX, z.vToZ - z.vFromZ);
        z.group.rotation.y = z.yaw;
        if (t >= 1) { z.state = 'chase'; z.win = null; }
        continue;
      } else if (z.state === 'attack') {
        z.yaw = Math.atan2(dx, dz);
        z.group.rotation.y = z.yaw;
        if (z.stateT > 0.3 && !z.hitDone) {
          z.hitDone = true;
          if (distP < 2.3 && Math.abs(py - z.y) < 2.2) {
            player.damage(z.dmg, { x: z.x, z: z.zc });
            UP.Audio.zAttack({ x: z.x, y: 1, z: z.zc });
          }
        }
        if (z.stateT > 0.5) { z.state = 'chase'; z.attackCd = 1.1; }
      } else if (z.state === 'windup') {
        z.yaw = Math.atan2(dx, dz);
        z.group.rotation.y = z.yaw;
        if (!z.beeped) { z.beeped = true; UP.Audio.exploderBeep({ x: z.x, y: 1, z: z.zc }); }
        z.mats.skin.emissive.setHex(0xff4020);
        z.mats.skin.emissiveIntensity = 0.4 + Math.sin(z.stateT * 40) * 0.3;
        if (z.stateT > 0.55) {
          game.explosion({ x: z.x, y: z.y + 0.8, z: z.zc }, 4, 65, true);
          Z.explodeZombie(z);
          game.onZombieKilled(z, false, true);
        }
        continue;
      } else { /* chase */
        if (z.cfg.explode && distP < 3.0) { z.state = 'windup'; z.stateT = 0; continue; }
        if (distP < 1.75 && z.attackCd <= 0 && Math.abs(py - z.y) < 2.2) {
          z.state = 'attack'; z.stateT = 0; z.hitDone = false;
          continue;
        }
        // choose direction: direct if close + LOS, else follow nav path
        let target = null;
        if (distP < 12 && Math.abs(py - z.y) < 2 && bodyClear(z.x, z.zc, z.y, px, pz, py)) {
          target = { x: px, z: pz };
        } else {
          z.repathT -= dt;
          if (z.repathT <= 0 || !z.path) {
            z.repathT = 0.9 + Math.random() * 0.6;
            const a = UP.Map.nearestNode(z.x, z.y, z.zc);
            const b = UP.Map.nearestNode(px, py, pz);
            const oldTarget = z.targetNodeId;
            const newPath = UP.Map.findPath(a, b);
            z.path = newPath;
            z.pathIdx = 0;
            if (newPath) {
              // preserve forward progress: keep walking to the node we were
              // already heading for if it's still on the fresh path
              if (oldTarget !== undefined) {
                const pos = newPath.indexOf(oldTarget);
                if (pos > 0 && pos <= 3) z.pathIdx = pos;
              }
            }
          }
          if (z.path && z.path.length) {
            // string-pulling: jump ahead to visible nodes so the zombie
            // walks straight lines through open rooms instead of being
            // dragged back to the start node on every repath
            let idx = Math.min(z.pathIdx, z.path.length - 1);
            let guard = 0;
            while (idx < z.path.length - 1 && guard++ < 2) {
              const next = UP.Map.nodes[z.path[idx + 1]];
              // pull only between LEVEL nodes (±0.2): any height change
              // (ramps, landings, stairs) must be walked node-to-node,
              // following the actual walkway — never cut diagonally
              if (Math.abs(next.y - z.y) < 0.2 &&
                  bodyClear(z.x, z.zc, z.y, next.x, next.z, next.y)) {
                idx++;
              } else break;
            }
            z.pathIdx = idx;
            z.targetNodeId = z.path[idx];
            let node = UP.Map.nodes[z.path[idx]];
            const dn = UP.dist2(z.x, z.zc, node.x, node.z);
            if (dn < 1.0 && idx < z.path.length - 1) {
              z.pathIdx++;
              node = UP.Map.nodes[z.path[z.pathIdx]];
              z.targetNodeId = z.path[z.pathIdx];
            }
            target = { x: node.x, z: node.z };
          } else {
            target = { x: px, z: pz }; // no path — walk directly
          }
        }
        const spd = z.speed * (z.enrageT > 0 ? 1.2 : 1);
        const tdx = target.x - z.x, tdz = target.z - z.zc;
        const td = Math.hypot(tdx, tdz) || 1;
        vx = tdx / td * spd; vz = tdz / td * spd;
        if (distP < 1.1) { vx *= 0.1; vz *= 0.1; } // don't push through player
        // un-stick: if a zombie made no real progress, sidestep perpendicular.
        // COMMITS to one side (flips only every 3rd trigger) so it can actually
        // get around whatever is in the way instead of dancing left-right.
        z.sideT -= dt;
        z.sideCount = z.sideCount || 0;
        if (z.sideT > 0) {
          const sx = -vz * z.sideDir, sz = vx * z.sideDir;
          vx = vx * 0.3 + sx; vz = vz * 0.3 + sz;
        }
        // boss ranged spit
        if (z.cfg.boss) {
          z.spitCd -= dt;
          if (z.spitCd <= 0 && distP > 4 && distP < 28 &&
              !UP.Map.segmentBlocked(z.x, z.zc, px, pz, z.y + 1.8, py + 1.4)) {
            z.spitCd = 3.2;
            fireSpit(z, player);
          }
        }
      }

      /* ---------- movement + collision ---------- */
      if (vx || vz) {
        const r = 0.34 * z.cfg.scale;
        const nx = z.x + vx * dt, nz = z.zc + vz * dt;
        if (!hitsCollider(nx, z.zc, r, z.y, z.y + 1.7 * z.cfg.scale)) z.x = nx;
        if (!hitsCollider(z.x, nz, r, z.y, z.y + 1.7 * z.cfg.scale)) z.zc = nz;
        // safety net: if we somehow ended up wedged inside geometry,
        // revert to the last position+height that was provably clear
        if (hitsCollider(z.x, z.zc, r, z.y, z.y + 1.7 * z.cfg.scale)) {
          if (z.safeX !== undefined) {
            z.x = z.safeX; z.zc = z.safeZ;
            if (z.safeY !== undefined) z.y = z.safeY;
          }
        } else {
          z.safeX = z.x; z.safeZ = z.zc; z.safeY = z.y;
        }
        z.yaw = Math.atan2(vx, vz);
        z.phase += dt * (2 + z.speed * 1.6);
        // footstep audio
        z.stepT -= dt;
        if (z.stepT <= 0 && UP.dist2(z.x, z.zc, px, pz) < 26) {
          z.stepT = 0.42;
          UP.Audio.zStep({ x: z.x, y: z.y, z: z.zc });
        }
      }

      /* ---------- stuck detection (chase/toWindow) ---------- */
      if (z.state === 'chase' || z.state === 'toWindow') {
        const moved = UP.dist2(z.x, z.zc, z.lastX, z.lastZ);
        // only flag as stuck if nearly stationary — wall-sliding at ~1m/s
        // toward a doorway is real progress and must NOT trigger sidestep
        if (moved < 0.012) z.stuckT += dt; else z.stuckT = 0;
        if (z.stuckT > 1.6) {
          z.stuckT = 0;
          z.sideCount = (z.sideCount || 0) + 1;
          if (z.sideCount % 3 === 0) z.sideDir *= -1; // commit to one side
          z.sideT = 1.4;
          z.repathT = 0; // force fresh path
        }
      }
      z.lastX = z.x; z.lastZ = z.zc;

      /* ---------- separation from other zombies ---------- */
      for (const o of Z.alive) {
        if (o === z || o.state === 'die' || o.state === 'rise') continue;
        const ddx = z.x - o.x, ddz = z.zc - o.zc;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < 0.45 * 0.45 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (0.45 - d) * 0.35;
          const nx2 = z.x + (ddx / d) * push, nz2 = z.zc + (ddz / d) * push;
          // never shove a zombie inside geometry (props, walls)
          if (!hitsCollider(nx2, nz2, 0.34 * z.cfg.scale, z.y, z.y + 1.7 * z.cfg.scale)) {
            z.x = nx2; z.zc = nz2;
          }
        }
      }

      /* ---------- ground height + apply transform ---------- */
      if (z.state !== 'vault') {
        const gy = UP.Map.floorHeightAt(z.x, z.zc, z.y + 0.4);
        z.y = UP.damp(z.y, gy, 10, dt);
      }
      // groans
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = UP.rand(4, 10);
        if (distP < 38) UP.Audio.groan({ x: z.x, y: z.y + 1.4, z: z.zc });
      }

      z.group.position.set(z.x, z.y, z.zc);
      z.group.rotation.y = z.yaw;
      animateWalk(z, dt);
    }

    /* spit projectiles */
    for (const s of Z.spits) {
      if (!s.active) continue;
      s.t -= dt;
      s.vy -= 4 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const p = s.mesh.position;
      const dpx = p.x - px, dpz = p.z - pz, dpy = p.y - (py + 1.2);
      if (dpx * dpx + dpz * dpz + dpy * dpy < 0.9) {
        player.damage(20, { x: p.x, z: p.z });
        s.active = false; s.mesh.visible = false;
      } else if (s.t <= 0 || p.y < UP.Map.floorHeightAt(p.x, p.z, p.y)) {
        s.active = false; s.mesh.visible = false;
      }
    }
  };

  function startVault(z) {
    const w = z.win;
    z.state = 'vault'; z.stateT = 0;
    z.vFromX = z.x; z.vFromZ = z.zc; z.vFromY = z.y;
    // never land inside a prop — probe progressively deeper into the room
    let tx = w.cx - w.outX * 1.3, tz = w.cz - w.outZ * 1.3;
    for (let d = 1.3; d <= 3.7; d += 0.6) {
      const px = w.cx - w.outX * d, pz = w.cz - w.outZ * d;
      if (!hitsCollider(px, pz, 0.42, 0, 2)) { tx = px; tz = pz; break; }
    }
    z.vToX = tx; z.vToZ = tz;
    z.vToY = UP.Map.floorHeightAt(tx, tz, 1);
    UP.Audio.plankBreak({ x: w.cx, y: 1, z: w.cz });
    w.queue = Math.max(0, w.queue - 1);
  }

  function hitsCollider(x, zc, r, y0, y1) {
    const pb = { x1: x - r, y1: y0 + 0.1, z1: zc - r, x2: x + r, y2: y1, z2: zc + r };
    for (const c of UP.Map.colliders) if (UP.boxOverlap(pb, c)) return true;
    return false;
  }

  /* Find a spawn position that isn't embedded in geometry. Probes outward. */
  function findFreeSpawn(x, zc, y) {
    if (!hitsCollider(x, zc, 0.42, y, y + 1.8)) return { x, z: zc };
    for (let i = 1; i <= 6; i++) {
      const off = i * 0.7;
      for (const [dx, dz] of [[off, 0], [-off, 0], [0, off], [0, -off], [off, off], [-off, -off], [off, -off], [-off, off]]) {
        if (!hitsCollider(x + dx, zc + dz, 0.42, y, y + 1.8)) return { x: x + dx, z: zc + dz };
      }
    }
    return { x, z: zc }; // last resort
  }

  function fireSpit(z, player) {
    for (const s of Z.spits) {
      if (s.active) continue;
      s.active = true; s.t = 4;
      s.mesh.visible = true;
      s.mesh.position.set(z.x, z.y + 1.9, z.zc);
      const tx = player.pos.x, ty = player.pos.y + 1.2, tz = player.pos.z;
      const d = { x: tx - z.x, y: ty - z.y - 1.9, z: tz - z.zc };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      const sp = 14;
      s.vx = d.x / len * sp; s.vy = d.y / len * sp + 1.2; s.vz = d.z / len * sp;
      UP.Audio.zAttack({ x: z.x, y: 2, z: z.zc });
      return;
    }
  }

  /* Procedural animation: shamble, arms out, attack swings. */
  function animateWalk(z, dt) {
    const p = z.parts;
    const moving = (z.state !== 'attack' && z.state !== 'breakPlank');
    const s = Math.sin(z.phase);
    const c = Math.cos(z.phase);
    if (z.cfg.low) {
      // crawler drags forward
      p.arms[0].rotation.x = -2.6 + s * 0.3;
      p.arms[1].rotation.x = -2.6 - s * 0.3;
      p.legs[0].rotation.x = -1.2 + s * 0.5;
      p.legs[1].rotation.x = -1.2 - s * 0.5;
    } else if (z.state === 'attack') {
      const t = Math.min(z.stateT / 0.3, 1);
      p.arms[0].rotation.x = UP.lerp(-0.4, -2.2, t);
      p.arms[1].rotation.x = UP.lerp(-1.3, -2.2, t);
    } else if (z.state === 'breakPlank') {
      const t = Math.min(z.stateT / 0.4, 1);
      p.arms[0].rotation.x = -1.3 - Math.sin(t * Math.PI) * 0.9;
      p.arms[1].rotation.x = -1.3 - Math.sin(t * Math.PI) * 0.9;
    } else {
      p.arms[0].rotation.x = -1.35 + s * 0.18;
      p.arms[1].rotation.x = -1.35 - s * 0.18;
      p.arms[0].rotation.z = 0.12; p.arms[1].rotation.z = -0.12;
      p.legs[0].rotation.x = s * 0.55;
      p.legs[1].rotation.x = -s * 0.55;
    }
    p.torso.rotation.z = c * 0.05;
    p.head.rotation.z = Math.sin(z.phase * 0.5) * 0.12;
    z.group.position.y += Math.abs(s) * 0.025;
  }

  window.UP.Zombies = Z;
})();
