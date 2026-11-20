/* UNDEAD PROTOCOL — powerups.js
   Floating power-up drops from kills, timed effects, ammo drops (scavenger). */
'use strict';
window.UP = window.UP || {};
(function () {
  const T = window.THREE;

  const KINDS = {
    INSTA:    { color: 0xff3b3b, label: 'INSTA-KILL',  icon: 'X' },
    DOUBLE:   { color: 0xffd73b, label: 'DOUBLE POINTS', icon: '$' },
    MAXAMMO:  { color: 0x7fd4ff, label: 'MAX AMMO',    icon: 'A' },
    NUKE:     { color: 0x9aff5a, label: 'NUKE',         icon: 'N' },
    HEALTH:   { color: 0xff7ad4, label: 'FULL HEALTH', icon: '+' },
    FIRE:     { color: 0x3be2c8, label: 'FIRE SALE',   icon: 'F' },
    CARPENTER:{ color: 0xd4893b, label: 'CARPENTER',   icon: 'C' },
    AMMO:     { color: 0x9aa4ac, label: 'AMMO',        icon: 'r' },
  };

  const PU = {
    scene: null, drops: [],
    lastDropT: 0, time: 0, dropCooldown: 0,
  };

  PU.init = function (scene) { PU.scene = scene; };

  /* Weighted random roll for kill drops. */
  PU.rollTable = [
    ['INSTA', 3], ['DOUBLE', 3], ['MAXAMMO', 3], ['NUKE', 2], ['HEALTH', 2],
    ['FIRE', 1.2], ['CARPENTER', 1.4],
  ];

  PU.maybeDrop = function (x, y, z) {
    if (PU.dropCooldown > 0) return false;
    if (PU.drops.length >= 2) return false;
    const kind = UP.weightedChoice(PU.rollTable);
    PU.spawn(kind, x, y + 1.1, z);
    PU.dropCooldown = 14; // fairness pacing
    return true;
  };

  PU.spawn = function (kind, x, y, z) {
    const info = KINDS[kind];
    const g = new T.Group();
    const core = new T.Mesh(new T.OctahedronGeometry(0.28, 0),
      new T.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: 1.4, roughness: 0.3 }));
    core.position.y = 0.5;
    g.add(core);
    const label = new T.Mesh(new T.PlaneGeometry(0.66, 0.33),
      new T.MeshBasicMaterial({ map: UP.Tex.text(info.label, { size: 44, color: '#fff', bg: null, glow: info.color }), transparent: true, depthWrite: false }));
    label.position.y = 1.05;
    g.add(label);
    const light = new T.PointLight(info.color, 0.8, 4.5, 2);
    light.position.y = 0.5;
    g.add(light);
    g.position.set(x, y, z);
    PU.scene.add(g);
    PU.drops.push({ kind, g, core, label, t: 25, x, y, z });
    UP.Audio.powerupDrop();
  };

  PU.spawnAmmo = function (x, y, z) {
    const g = new T.Group();
    const box = new T.Mesh(new T.BoxGeometry(0.34, 0.2, 0.24),
      new T.MeshStandardMaterial({ color: 0x4a5a3a, emissive: 0x2a3a1a, emissiveIntensity: 0.6, roughness: 0.7 }));
    box.position.y = 0.35;
    g.add(box);
    const light = new T.PointLight(0x9aff5a, 0.5, 3, 2);
    light.position.y = 0.4;
    g.add(light);
    g.position.set(x, y, z);
    PU.scene.add(g);
    PU.drops.push({ kind: 'AMMO', g, core: box, label: null, t: 30, x, y, z });
  };

  PU.apply = function (kind) {
    const P = UP.Player, G = UP.Game;
    UP.Audio.powerupPick(kind);
    switch (kind) {
      case 'INSTA':
        G.effects.INSTA = 30; UP.Zombies.instaKill = true;
        UP.Audio.instaSting();
        document.body.classList.add('insta');
        break;
      case 'DOUBLE': G.effects.DOUBLE = 30; break;
      case 'MAXAMMO':
        for (const w of P.slots) if (w) { w.reserve = w.stats.reserve; }
        break;
      case 'NUKE':
        G.nuke();
        break;
      case 'HEALTH':
        P.health = P.maxHealth;
        UP.Audio.heal();
        break;
      case 'FIRE':
        G.effects.FIRE = 60;
        break;
      case 'CARPENTER':
        for (const w of UP.Map.windows) {
          w.count = 5;
          for (const p of w.planks) { p.broken = false; p.mesh.visible = true; p.mesh.position.set(p.homeX, p.homeY, p.homeZ); }
        }
        P.addPoints(200);
        break;
      case 'AMMO':
        for (const w of P.slots) if (w) w.reserve = Math.min(w.stats.reserve, w.reserve + Math.ceil(w.stats.mag * 1.5));
        UP.Audio.purchase();
        break;
    }
    UP.HUD.refreshPowerupHUD();
  };

  PU.update = function (dt) {
    PU.time += dt;
    PU.dropCooldown = Math.max(0, PU.dropCooldown - dt);
    const P = UP.Player;
    for (let i = PU.drops.length - 1; i >= 0; i--) {
      const d = PU.drops[i];
      d.t -= dt;
      d.core.rotation.y += dt * 2.5;
      d.g.position.y = d.y + Math.sin(PU.time * 2.2 + i) * 0.14;
      if (d.label) { d.label.lookAt(P.camera.position); }
      const blink = d.t < 5 && Math.sin(PU.time * 10) < 0;
      d.g.visible = !blink;
      const dist = Math.hypot(P.pos.x - d.x, P.pos.z - d.z);
      if (dist < 1.6 && Math.abs(P.pos.y - d.y) < 2.2 && !P.dead) {
        PU.apply(d.kind);
        PU.scene.remove(d.g);
        PU.drops.splice(i, 1);
        continue;
      }
      if (d.t <= 0) {
        PU.scene.remove(d.g);
        PU.drops.splice(i, 1);
      }
    }
  };

  PU.clear = function () {
    for (const d of PU.drops) PU.scene.remove(d.g);
    PU.drops.length = 0;
    document.body.classList.remove('insta');
  };

  PU.KINDS = KINDS;
  window.UP.Powerups = PU;
})();
