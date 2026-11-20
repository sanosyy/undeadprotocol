/* UNDEAD PROTOCOL — machines.js
   Interactable economy: wall weapon buys, perk vending machines, mystery box,
   Pack-A-Punch, generator (power), armor station, barricade repair + doors. */
'use strict';
window.UP = window.UP || {};
(function () {
  const T = window.THREE;

  const MAC = {
    scene: null,
    interactables: [],
    perks: [],
    wallBuys: [],
    box: null,
    pap: null,
    generator: null,
    armor: null,
    boxModels: {},
  };

  const _v = new T.Vector3();

  /* ===================  PERK MACHINE  =================== */
  const PERK_DEFS = [
    { id: 'revive', name: 'SECOND WIND', letter: 'V', color: 0x7fd4ff, cost: 500, idx: 0,
      desc: 'Auto-revive once' },
    { id: 'jug', name: 'JUGGER-NOG', letter: 'J', color: 0xe23b3b, cost: 2500, idx: 1,
      desc: '+150 max health' },
    { id: 'quick', name: 'QUICK HANDS', letter: 'Q', color: 0x62e262, cost: 2500, idx: 2,
      desc: 'Faster reloads' },
    { id: 'rapid', name: 'RAPID FIRE', letter: 'D', color: 0xffc23b, cost: 2500, idx: 3,
      desc: '+30% fire rate' },
    { id: 'overcharge', name: 'OVERCHARGE', letter: 'O', color: 0xb03be2, cost: 3000, idx: 4,
      desc: '+50% damage' },
    { id: 'stamin', name: 'STAMIN-UP', letter: 'S', color: 0xff8f3b, cost: 2000, idx: 5,
      desc: 'Move faster' },
    { id: 'deadeye', name: 'DEADEYE', letter: 'E', color: 0x3b6be2, cost: 2500, idx: 6,
      desc: '+50% headshots' },
    { id: 'scav', name: 'SCAVENGER', letter: 'G', color: 0x9ec23b, cost: 1500, idx: 7,
      desc: 'More ammo drops' },
  ];

  function buildPerkMachine(def, x, y, z, ry, needsPower = true) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const bodyMat = new T.MeshStandardMaterial({ color: 0x191c20, roughness: 0.6, metalness: 0.3 });
    const body = new T.Mesh(new T.BoxGeometry(0.95, 1.95, 0.65), bodyMat);
    body.position.y = 0.98;
    body.castShadow = true;
    g.add(body);
    const panelMat = new T.MeshStandardMaterial({ color: def.color, emissive: def.color,
      emissiveIntensity: 0.15, roughness: 0.4 });
    const panel = new T.Mesh(new T.BoxGeometry(0.78, 1.15, 0.06), panelMat);
    panel.position.set(0, 1.05, 0.34);
    g.add(panel);
    // icon letter
    const iconTex = UP.Tex.text([def.letter, def.name.split('-')[0]], { size: 64, color: '#0b0d10', bg: null, glow: def.color });
    const icon = new T.Mesh(new T.PlaneGeometry(0.5, 0.5),
      new T.MeshBasicMaterial({ map: iconTex, transparent: true }));
    icon.position.set(0, 1.35, 0.38);
    g.add(icon);
    const nameSign = new T.Mesh(new T.PlaneGeometry(1.6, 0.5),
      new T.MeshBasicMaterial({ map: UP.Tex.text([def.name, `${def.cost}`], { size: 30, color: '#' + new T.Color(def.color).getHexString(), glow: def.color }), transparent: true }));
    nameSign.position.set(0, 2.35, 0.1);
    g.add(nameSign);
    const light = new T.PointLight(def.color, 0, 5.5, 2);
    light.position.set(0, 1.7, 0.5);
    g.add(light);
    const bottleMat = new T.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.4 });
    const bottle = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.34, 8), bottleMat);
    bottle.position.set(0.28, 2.05, 0);
    g.add(bottle);
    MAC.scene.add(g);

    const machine = { def, group: g, panelMat, light, needsPower };
    MAC.perks.push(machine);
    MAC.interactables.push({
      x, y: y + 1, z, r: 2.1,
      machine,
      label() {
        const P = UP.Player;
        if (P.perks[def.id] && def.id !== 'revive') return `OWNED — ${def.name}`;
        if (def.id === 'revive' && P.perks.revive) return `OWNED — SECOND WIND`;
        const count = Object.keys(P.perks).length - (P.reviveUsed ? 1 : 0);
        if (count >= 4) return `PERK LIMIT REACHED`;
        if (needsPower && !UP.Map.powerOn) return `${def.name} — REQUIRES POWER`;
        return `BUY ${def.name} [${def.cost}]`;
      },
      use() {
        const P = UP.Player;
        if (P.perks[def.id] && def.id !== 'revive') return;
        const count = Object.keys(P.perks).length - (P.reviveUsed ? 1 : 0);
        if (count >= 4) { UP.Audio.deny(); return; }
        if (needsPower && !UP.Map.powerOn) { UP.Audio.deny(); return; }
        if (!P.spend(def.cost)) { UP.Audio.deny(); UP.HUD.promptDeny(); return; }
        applyPerk(def.id);
        UP.Audio.perkJingle(def.idx);
        UP.HUD.refreshPerks();
        UP.HUD.announce(def.name, 1.4);
        pulse(machine);
      },
    });
    return machine;
  }

  function applyPerk(id) {
    const P = UP.Player;
    P.perks[id] = true;
    switch (id) {
      case 'revive': P.reviveUsed = false; break;
      case 'jug': P.maxHealth = 250; P.health = 250; break;
      case 'stamin': P.staminaMax = 8; P.stamina = 8; break;
    }
  }

  function pulse(machine) {
    machine.panelMat.emissiveIntensity = 1.5;
  }

  /* ===================  WALL BUY  =================== */
  function buildWallBuy(defId, x, y, z, ry) {
    const def = UP.Weapons.DEFS[defId];
    const g = new T.Group();
    g.position.set(x, y + 1.35, z);
    g.rotation.y = ry;
    // chalk outline sign
    const sign = new T.Mesh(new T.PlaneGeometry(2.4, 0.85),
      new T.MeshBasicMaterial({ map: UP.Tex.text([def.name, def.cost ? `${def.cost} POINTS` : ''],
        { size: 40, color: '#ffe9b0', bg: 'rgba(20,16,8,.6)', glow: '#ffb84d' }), transparent: true }));
    g.add(sign);
    // mini weapon model — laid diagonally, pointing out into the room
    const model = UP.Weapons.buildModel(def, 0);
    model.scale.set(1.6, 1.6, 1.6);
    model.position.set(0, -0.48, 0.2);
    model.rotation.set(0.05, Math.PI - 0.45, 0.12);
    g.add(model);
    MAC.scene.add(g);
    MAC.wallBuys.push(g);

    MAC.interactables.push({
      x, y: y + 1, z, r: 2.0,
      label() {
        const P = UP.Player;
        const owned = P.findWeapon(def.id);
        if (owned) {
          if (owned.reserve >= owned.stats.reserve) return `${def.name} — AMMO FULL`;
          return `AMMO ${def.name} [${def.cost / 2}]`;
        }
        return `BUY ${def.name} [${def.cost}]`;
      },
      use() {
        const P = UP.Player;
        const owned = P.findWeapon(def.id);
        if (owned) {
          if (owned.reserve >= owned.stats.reserve) { UP.Audio.deny(); return; }
          if (!P.spend(def.cost / 2)) { UP.Audio.deny(); UP.HUD.promptDeny(); return; }
          owned.reserve = owned.stats.reserve;
          UP.Audio.purchase();
        } else {
          if (!P.spend(def.cost)) { UP.Audio.deny(); UP.HUD.promptDeny(); return; }
          P.giveWeapon(def.id, 0);
          UP.Audio.purchase();
          UP.HUD.announce(def.name, 1.2);
        }
      },
    });
  }

  /* ===================  MYSTERY BOX  =================== */
  const BOX_SPOTS = [
    { x: 19, y: -3, z: 21.5 },   // containment vault
    { x: -4, y: 0, z: -17 },     // laboratory
    { x: 6, y: -3, z: 28 },      // tunnels
  ];

  function buildMysteryBox() {
    const g = new T.Group();
    const woodMat = new T.MeshStandardMaterial({ map: UP.Tex.wood(1, 1), roughness: 0.85 });
    const base = new T.Mesh(new T.BoxGeometry(1.5, 0.75, 0.9), woodMat);
    base.position.y = 0.38; base.castShadow = true;
    g.add(base);
    const lid = new T.Group();
    lid.position.set(0, 0.76, -0.45);
    const lidMesh = new T.Mesh(new T.BoxGeometry(1.5, 0.18, 0.9), woodMat);
    lidMesh.position.set(0, 0.09, 0.45);
    lid.add(lidMesh);
    g.add(lid);
    // glow seams
    const seamMat = new T.MeshStandardMaterial({ color: 0x3be2c8, emissive: 0x3be2c8, emissiveIntensity: 1.2 });
    const seam = new T.Mesh(new T.BoxGeometry(1.54, 0.05, 0.94), seamMat);
    seam.position.y = 0.75;
    g.add(seam);
    // "?" sign
    const q = new T.Mesh(new T.PlaneGeometry(0.6, 0.6),
      new T.MeshBasicMaterial({ map: UP.Tex.text('?', { size: 90, color: '#3be2c8', bg: null, glow: '#3be2c8' }), transparent: true }));
    q.position.set(0, 1.9, 0);
    g.add(q);
    const beam = new T.PointLight(0x3be2c8, 0.9, 6, 2);
    beam.position.set(0, 1.4, 0);
    g.add(beam);
    MAC.scene.add(g);

    // pre-build offer models
    for (const id in UP.Weapons.DEFS) {
      const m = UP.Weapons.buildModel(UP.Weapons.DEFS[id], 0);
      m.visible = false;
      m.position.set(0, 1.2, 0);
      m.scale.set(2.2, 2.2, 2.2);
      g.add(m);
      MAC.boxModels[id] = m;
    }

    MAC.box = {
      g, lid, seam, q, beam, spotIdx: 0, uses: 0,
      state: 'closed', t: 0, offerId: null, cycleT: 0, cycleN: 0, offerT: 0,
      moveT: 0, fromSpot: null, toSpot: null,
    };
    MAC.box.g.position.set(BOX_SPOTS[0].x, BOX_SPOTS[0].y, BOX_SPOTS[0].z);

    MAC.interactables.push({
      dynamic: true,
      get x() { return MAC.box.g.position.x; },
      get y() { return MAC.box.g.position.y + 1; },
      get z() { return MAC.box.g.position.z; },
      r: 2.3,
      label() {
        const b = MAC.box;
        if (b.state === 'closed') {
          const cost = UP.Game.effects.FIRE > 0 ? 10 : 500;
          return `MYSTERY BOX [${cost}]`;
        }
        if (b.state === 'offer') {
          const st = UP.Weapons.stats(UP.Weapons.DEFS[b.offerId], 0);
          return `TAKE ${st.name}`;
        }
        return null;
      },
      use() {
        const b = MAC.box;
        const P = UP.Player;
        if (b.state === 'closed') {
          const cost = UP.Game.effects.FIRE > 0 ? 10 : 500;
          if (!P.spend(cost)) { UP.Audio.deny(); UP.HUD.promptDeny(); return; }
          b.state = 'spinning';
          b.t = 0; b.cycleT = 0; b.cycleN = 0;
          b.uses++;
          b.offerId = UP.Weapons.boxRoll();
          UP.Audio.boxOpen();
        } else if (b.state === 'offer') {
          const slot = P.giveWeapon(b.offerId, 0);
          b.state = 'closing';
          b.t = 0;
          UP.Audio.purchase();
          const st = UP.Weapons.stats(UP.Weapons.DEFS[b.offerId], 0);
          UP.HUD.announce(st.name, 1.4);
          hideOffer();
        }
      },
    });
  }

  function hideOffer() {
    const b = MAC.box;
    if (b.offerId && MAC.boxModels[b.offerId]) MAC.boxModels[b.offerId].visible = false;
    b.offerId = null;
  }

  /* ===================  PACK-A-PUNCH  =================== */
  function buildPap(x, y, z, ry) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const bodyMat = new T.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.5, metalness: 0.6 });
    const body = new T.Mesh(new T.BoxGeometry(1.5, 1.15, 0.9), bodyMat);
    body.position.y = 0.58; body.castShadow = true;
    g.add(body);
    const slotMat = new T.MeshStandardMaterial({ color: 0xff5fd7, emissive: 0xff5fd7, emissiveIntensity: 0.4 });
    const slot = new T.Mesh(new T.BoxGeometry(0.9, 0.22, 0.1), slotMat);
    slot.position.set(0, 0.55, 0.47);
    g.add(slot);
    const top = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.5, 10), bodyMat);
    top.position.set(-0.5, 1.35, 0);
    g.add(top);
    const gear = new T.Mesh(new T.TorusGeometry(0.3, 0.07, 8, 16), slotMat);
    gear.position.set(0.5, 1.35, 0);
    gear.rotation.x = Math.PI / 2;
    g.add(gear);
    const sign = new T.Mesh(new T.PlaneGeometry(2.0, 0.7),
      new T.MeshBasicMaterial({ map: UP.Tex.text(['PACK-A-PUNCH', 'UPGRADE WEAPON'], { size: 34, color: '#ff5fd7', glow: '#ff5fd7' }), transparent: true }));
    sign.position.set(0, 1.9, 0);
    g.add(sign);
    const light = new T.PointLight(0xff5fd7, 0, 5, 2);
    light.position.set(0, 1.6, 0.5);
    g.add(light);
    MAC.scene.add(g);
    MAC.pap = { g, slotMat, gear, light };

    MAC.interactables.push({
      x, y: y + 1, z, r: 2.1,
      label() {
        const P = UP.Player;
        const w = P.curWeapon();
        if (!UP.Map.powerOn) return 'PACK-A-PUNCH — REQUIRES POWER';
        if (!w) return null;
        if (MAC.papPending) return 'UPGRADING...';
        if (w.tier >= 3) return `${w.stats.name} — MAX TIER`;
        const cost = UP.Weapons.PAP_TIERS[w.tier + 1].cost;
        return `UPGRADE ${w.stats.name} [${cost}]`;
      },
      use() {
        const P = UP.Player;
        if (!UP.Map.powerOn) { UP.Audio.deny(); return; }
        if (MAC.papPending) return;
        const w = P.curWeapon();
        if (!w || w.tier >= 3) return;
        const cost = UP.Weapons.PAP_TIERS[w.tier + 1].cost;
        if (!P.spend(cost)) { UP.Audio.deny(); UP.HUD.promptDeny(); return; }
        MAC.papPending = { slot: P.cur, t: 2.4 };
        UP.Audio.papWork();
        P.beginPap(2.4);
      },
    });
  }

  /* ===================  GENERATOR  =================== */
  function buildGenerator(x, y, z) {
    const g = new T.Group();
    g.position.set(x, y, z);
    const bodyMat = new T.MeshStandardMaterial({ map: UP.Tex.metal(2, 2), roughness: 0.55, metalness: 0.65 });
    const body = new T.Mesh(new T.BoxGeometry(2.6, 1.7, 1.6), bodyMat);
    body.position.y = 0.85; body.castShadow = true;
    g.add(body);
    const pipe1 = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 1.2, 10), bodyMat);
    pipe1.position.set(0.9, 2.2, 0);
    g.add(pipe1);
    const leverBase = new T.Mesh(new T.BoxGeometry(0.4, 1.0, 0.3), bodyMat);
    leverBase.position.set(-1.05, 1.9, 0);
    g.add(leverBase);
    const lever = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.9, 8),
      new T.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.4 }));
    lever.position.set(-1.05, 2.0, 0.35);
    lever.rotation.x = -0.9;
    g.add(lever);
    const lampMat = new T.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 1 });
    const lamp = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), lampMat);
    lamp.position.set(0, 1.78, 0.85);
    g.add(lamp);
    const sign = new T.Mesh(new T.PlaneGeometry(2.0, 0.55),
      new T.MeshBasicMaterial({ map: UP.Tex.text(['MAIN GENERATOR'], { size: 38, color: '#ffd76a', glow: '#ff9d2e' }), transparent: true }));
    sign.position.set(0, 1.2, 0.85);
    g.add(sign);
    MAC.scene.add(g);
    MAC.generator = { g, lever, lampMat };

    MAC.interactables.push({
      x, y: y + 1, z, r: 2.6,
      label() {
        if (UP.Map.powerOn) return 'GENERATOR ONLINE';
        return 'ACTIVATE GENERATOR';
      },
      use() {
        if (UP.Map.powerOn) return;
        UP.Map.setPower(true);
        MAC.generator.lever.rotation.x = 0.9;
        MAC.generator.lampMat.emissive.setHex(0x22ff44);
        UP.Audio.generator({ x, y, z });
        setPoweredVisuals(true);
        UP.HUD.announce('POWER RESTORED', 2.2);
      },
    });
  }

  /* ===================  ARMOR STATION  =================== */
  function buildArmor(x, y, z, ry) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const bodyMat = new T.MeshStandardMaterial({ color: 0x25303a, roughness: 0.6, metalness: 0.4 });
    const bench = new T.Mesh(new T.BoxGeometry(1.6, 0.9, 0.7), bodyMat);
    bench.position.y = 0.45; bench.castShadow = true;
    g.add(bench);
    const vestMat = new T.MeshStandardMaterial({ color: 0x2c4a66, emissive: 0x1c3a55, emissiveIntensity: 0.5, roughness: 0.5 });
    const vest = new T.Mesh(new T.BoxGeometry(0.55, 0.6, 0.3), vestMat);
    vest.position.y = 1.05;
    g.add(vest);
    const sign = new T.Mesh(new T.PlaneGeometry(1.7, 0.55),
      new T.MeshBasicMaterial({ map: UP.Tex.text(['BODY ARMOR', '500 — FULL PLATE'], { size: 34, color: '#7ecbff', glow: '#7ecbff' }), transparent: true }));
    sign.position.set(0, 1.75, 0);
    g.add(sign);
    MAC.scene.add(g);
    MAC.armor = { g, vestMat };

    MAC.interactables.push({
      x, y: y + 1, z, r: 2.0,
      label() {
        const P = UP.Player;
        if (P.armor >= 100) return 'ARMOR AT FULL';
        return `BODY ARMOR [500]`;
      },
      use() {
        const P = UP.Player;
        if (P.armor >= 100) { UP.Audio.deny(); return; }
        if (!P.spend(500)) { UP.Audio.deny(); UP.HUD.promptDeny(); return; }
        P.armor = 100;
        UP.Audio.purchase();
        UP.HUD.announce('ARMOR EQUIPPED', 1.2);
      },
    });
  }

  /* ===================  DOORS + BARRICADES (prompts)  =================== */
  function registerDoors() {
    for (const door of UP.Map.doors) {
      MAC.interactables.push({
        x: door.x, y: door.yBase + 1, z: door.z, r: 2.4,
        label() {
          if (door.opened) return null;
          if (door.needsPower && !UP.Map.powerOn) return `${door.name} — REQUIRES POWER`;
          return `OPEN ${door.name} [${door.cost}]`;
        },
        use() {
          if (door.opened) return;
          if (door.needsPower && !UP.Map.powerOn) { UP.Audio.deny(); return; }
          if (!UP.Player.spend(door.cost)) { UP.Audio.deny(); UP.HUD.promptDeny(); return; }
          UP.Map.openDoor(door);
          UP.Audio.door({ x: door.x, y: 1, z: door.z });
          UP.HUD.announce(door.name, 1.2);
        },
      });
    }
  }

  /* Barricade repair is a hold-interaction handled by game, expose helper */
  MAC.nearestWindow = function (px, py, pz) {
    let best = null, bd = 3.2;
    for (const w of UP.Map.windows) {
      const d = Math.hypot(w.cx - px, w.cz - pz);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  };
  MAC.repairPlank = function (win) {
    // find first broken plank from top
    for (let i = 4; i >= 0; i--) {
      const p = win.planks[i];
      if (p.broken) {
        p.broken = false;
        p.mesh.visible = true;
        p.mesh.position.set(p.homeX, p.homeY, p.homeZ);
        win.count++;
        UP.Audio.plank({ x: win.cx, y: 1, z: win.cz });
        UP.Player.addPoints(10);
        return true;
      }
    }
    return false;
  };

  /* ===================  build all  =================== */
  MAC.build = function (scene) {
    MAC.scene = scene;
    buildPerkMachine(PERK_DEFS[0], 4.6, 0, -5.2, 0.5, false);   // revive — spawn (works w/o power)
    buildPerkMachine(PERK_DEFS[1], 12.5, 0, -27.1, 0);         // jug — lab
    buildPerkMachine(PERK_DEFS[2], 20.9, 0, -2.2, 0);          // quick — storage
    buildPerkMachine(PERK_DEFS[3], 27.0, 0, -19.4, -Math.PI / 2); // rapid — generator
    buildPerkMachine(PERK_DEFS[4], 23.2, -3, 17.2, 0);      // overcharge — vault
    buildPerkMachine(PERK_DEFS[5], 7.6, -3, 30.9, Math.PI);     // stamin — tunnels
    buildPerkMachine(PERK_DEFS[6], 12.0, 5, -26.8, 0);          // deadeye — roof
    buildPerkMachine(PERK_DEFS[7], -19.4, 0, -2.2, 0);          // scav — medical

    buildWallBuy('smg', 12.5, 0, -2.8, 0);
    buildWallBuy('shotgun', 12.5, 0, 2.8, Math.PI);
    buildWallBuy('lmg', 21.8, 0, 0, -Math.PI / 2);
    buildWallBuy('dmr', -13.8, 0, -16, Math.PI / 2);
    buildWallBuy('ak', 13.8, 0, -26, -Math.PI / 2);
    buildWallBuy('sniper', 27.8, 0, -23, -Math.PI / 2);
    buildWallBuy('smg', -9.7, -3, 24, Math.PI / 2);

    buildMysteryBox();
    buildPap(21.0, 0, -21.5, Math.PI / 2);
    buildGenerator(23, 0, -23);
    buildArmor(-16.5, 0, 2.3, Math.PI);
    registerDoors();
  };

  function setPoweredVisuals(on) {
    for (const m of MAC.perks) {
      if (!m.needsPower) continue;
      m.light.intensity = on ? 1.1 : 0;
      m.panelMat.emissiveIntensity = on ? 0.7 : 0.12;
    }
    if (MAC.pap) {
      MAC.pap.light.intensity = on ? 1.1 : 0;
      MAC.pap.slotMat.emissiveIntensity = on ? 1.0 : 0.15;
    }
  }
  MAC.setPoweredVisuals = setPoweredVisuals;

  MAC.reset = function () {
    const b = MAC.box;
    b.state = 'closed'; b.t = 0; b.uses = 0; b.offerId = null; b.spotIdx = 0;
    hideOffer();
    b.g.position.set(BOX_SPOTS[0].x, BOX_SPOTS[0].y, BOX_SPOTS[0].z);
    b.lid.rotation.x = 0;
    b.beam.intensity = 0.9;
    MAC.papPending = null;
    MAC.generator.lever.rotation.x = -0.9;
    MAC.generator.lampMat.emissive.setHex(0xff2222);
    for (const m of MAC.perks) { m.panelMat.emissiveIntensity = m.needsPower ? 0.12 : 0.7; m.light.intensity = m.needsPower ? 0 : 0.9; }
    MAC.pap.light.intensity = 0;
    MAC.pap.slotMat.emissiveIntensity = 0.15;
    if (MAC.armor) MAC.armor.vestMat.emissiveIntensity = 0.5;
  };

  /* ===================  per-frame  =================== */
  MAC.update = function (dt, time) {
    const b = MAC.box;
    // perk machine subtle pulse
    for (const m of MAC.perks) {
      if (m.panelMat.emissiveIntensity > (m.needsPower && !UP.Map.powerOn ? 0.12 : 0.7)) {
        m.panelMat.emissiveIntensity = Math.max(m.panelMat.emissiveIntensity - dt * 1.5,
          (m.needsPower && !UP.Map.powerOn ? 0.12 : 0.7));
      }
      if (!m.needsPower || UP.Map.powerOn) {
        m.light.intensity = 0.75 + Math.sin(time * 2.4 + m.def.idx) * 0.25;
      }
    }
    // pap gear spin
    if (UP.Map.powerOn) MAC.pap.gear.rotation.z += dt * 1.2;

    // mystery box animation
    if (b.state === 'spinning') {
      b.t += dt;
      b.lid.rotation.x = -Math.min(b.t * 3, 1.9); // negative = lid swings up and back
      b.beam.intensity = 1.4 + Math.sin(b.t * 12) * 0.5;
      b.cycleT -= dt;
      if (b.cycleT <= 0) {
        b.cycleT = 0.13;
        b.cycleN++;
        const ids = Object.keys(UP.Weapons.DEFS);
        const id = ids[b.cycleN % ids.length];
        for (const k in MAC.boxModels) MAC.boxModels[k].visible = false;
        MAC.boxModels[id].visible = true;
        b.shownId = id;
        b.offerId2 = id;
        UP.Audio.boxTick();
      }
      if (b.t > 2.6) {
        b.state = 'offer';
        b.offerT = 8;
        for (const k in MAC.boxModels) MAC.boxModels[k].visible = false;
        MAC.boxModels[b.offerId].visible = true;
        MAC.boxModels[b.offerId].position.y = 1.0;
        const def = UP.Weapons.DEFS[b.offerId];
        if (def.boxWeight <= 1) UP.Audio.boxRare(); // legendary!
        UP.HUD.announce(UP.Weapons.stats(def, 0).name, 1.6);
      }
    } else if (b.state === 'offer') {
      b.offerT -= dt;
      const m = MAC.boxModels[b.offerId];
      if (m) {
        m.position.y = 1.0 + Math.sin(time * 2) * 0.1;
        m.rotation.y += dt * 0.8;
      }
      b.beam.intensity = 1.2 + Math.sin(time * 6) * 0.3;
      if (b.offerT <= 0) {
        b.state = 'closing';
        b.t = 0;
        hideOffer();
      }
    } else if (b.state === 'closing') {
      b.t += dt;
      b.lid.rotation.x = -Math.max(0, 1.9 - b.t * 3);
      b.beam.intensity = Math.max(0.9, 1.4 - b.t);
      if (b.t > 0.8) {
        b.state = 'closed';
        b.lid.rotation.x = 0;
        b.beam.intensity = 0.9;
        // relocate?
        if (b.uses > 0 && b.uses % 8 === 0) relocateBox();
      }
    } else {
      b.beam.intensity = 0.9 + Math.sin(time * 2) * 0.15;
      b.q.rotation.y = Math.sin(time) * 0.4;
    }

    // pack-a-punch pending
    if (MAC.papPending) {
      MAC.papPending.t -= dt;
      MAC.pap.slotMat.emissiveIntensity = 0.6 + Math.sin(time * 20) * 0.4;
      if (MAC.papPending.t <= 0) {
        const P = UP.Player;
        const slot = MAC.papPending.slot;
        const old = P.slots[slot];
        P.upgradeWeapon(slot);
        MAC.papPending = null;
        MAC.pap.slotMat.emissiveIntensity = 1.0;
        UP.Audio.papDone();
        UP.HUD.announce('WEAPON UPGRADED', 1.8);
      }
    }
  };

  function relocateBox() {
    const b = MAC.box;
    let idx = b.spotIdx;
    while (idx === b.spotIdx) idx = Math.floor(Math.random() * BOX_SPOTS.length);
    b.spotIdx = idx;
    b.g.position.set(BOX_SPOTS[idx].x, BOX_SPOTS[idx].y, BOX_SPOTS[idx].z);
    UP.Audio.boxMoved();
    UP.HUD.announce('THE BOX HAS MOVED', 2);
  }
  MAC.forceRelocate = function () {
    if (MAC.box.state === 'closed') relocateBox();
  };

  MAC.PERK_DEFS = PERK_DEFS;
  window.UP.Machines = MAC;
})();
