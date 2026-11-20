/* UNDEAD PROTOCOL — weapons.js
   Weapon definitions, procedural 3D view models, Pack-A-Punch upgrade math. */
'use strict';
window.UP = window.UP || {};
(function () {
  const T = window.THREE;

  /* dmg, rpm, mag, reserve, reload(s), head = headshot mult, range = full-dmg range */
  const DEFS = {
    m1911: { id:'m1911', name:'M1911', kind:'pistol', sound:'pistol', dmg:25, head:2.2, rpm:400, auto:false,
      mag:8, reserve:64, reload:1.5, spread:0.016, adsSpread:0.30, recoil:0.022, range:22, adsFov:62,
      model:{ len:0.34, barrel:0.10, color:0x3a3f45, stock:false, magSize:0.05 }, boxWeight:2, cost:0 },
    ranger: { id:'ranger', name:'RANGER CARBINE', kind:'rifle', sound:'rifle', dmg:24, head:2.0, rpm:540, auto:true,
      mag:30, reserve:180, reload:2.3, spread:0.02, adsSpread:0.35, recoil:0.016, range:30, adsFov:58,
      model:{ len:0.62, barrel:0.22, color:0x4a4234, stock:true, magSize:0.13 }, boxWeight:3, cost:0 },
    smg: { id:'smg', name:'KOMPAKT-9 SMG', kind:'smg', sound:'smg', dmg:16, head:1.8, rpm:900, auto:true,
      mag:32, reserve:224, reload:1.9, spread:0.028, adsSpread:0.45, recoil:0.012, range:18, adsFov:60,
      model:{ len:0.48, barrel:0.12, color:0x2e3338, stock:true, magSize:0.16 }, boxWeight:5, cost:1000 },
    shotgun: { id:'shotgun', name:'BRECHER-12', kind:'shotgun', sound:'shotgun', dmg:13, head:1.6, rpm:75, auto:false,
      pellets:8, mag:6, reserve:48, reload:2.8, spread:0.05, adsSpread:0.70, recoil:0.055, range:10, adsFov:62,
      model:{ len:0.66, barrel:0.30, color:0x5a3d24, stock:true, magSize:0.0, pump:true }, boxWeight:4, cost:1200 },
    dmr: { id:'dmr', name:'MARKSMAN DMR', kind:'dmr', sound:'dmr', dmg:62, head:3.0, rpm:260, auto:false,
      mag:12, reserve:96, reload:2.2, spread:0.012, adsSpread:0.15, recoil:0.03, range:45, adsFov:42, scope:true,
      model:{ len:0.74, barrel:0.30, color:0x3b4a3b, stock:true, magSize:0.10 }, boxWeight:4, cost:1400 },
    ak: { id:'ak', name:'AK-74 "FANG"', kind:'rifle', sound:'rifle', dmg:30, head:2.0, rpm:600, auto:true,
      mag:30, reserve:240, reload:2.5, spread:0.024, adsSpread:0.40, recoil:0.02, range:28, adsFov:58,
      model:{ len:0.66, barrel:0.26, color:0x6a4a2a, stock:true, magSize:0.14 }, boxWeight:4, cost:1500 },
    sniper: { id:'sniper', name:'LONGSHOT .50', kind:'sniper', sound:'sniper', dmg:190, head:2.5, rpm:45, auto:false,
      mag:5, reserve:40, reload:3.2, spread:0.004, adsSpread:0.0, recoil:0.09, range:200, adsFov:26, scope:true,
      model:{ len:0.9, barrel:0.42, color:0x2c3136, stock:true, magSize:0.08 }, boxWeight:2, cost:1800 },
    lmg: { id:'lmg', name:'BRUISER LMG', kind:'lmg', sound:'lmg', dmg:27, head:1.9, rpm:650, auto:true,
      mag:75, reserve:300, reload:4.6, spread:0.03, adsSpread:0.5, recoil:0.018, range:32, adsFov:60,
      model:{ len:0.78, barrel:0.30, color:0x33383e, stock:true, magSize:0.20, drum:true }, boxWeight:3, cost:2400 },
    raygun: { id:'raygun', name:'RAY BLASTER', kind:'energy', sound:'energy', dmg:180, head:1.0, rpm:180, auto:false,
      mag:20, reserve:120, reload:2.8, spread:0.01, adsSpread:0.5, recoil:0.03, range:100, adsFov:60,
      projectile:true, projSpeed:38, splash:{ r:3.2, dmg:90 }, projColor:0x39ff6a, glow:true,
      model:{ len:0.5, barrel:0.16, color:0x27222e, stock:false, magSize:0.0, energy:0x39ff6a }, boxWeight:1, cost:0 },
    plasma: { id:'plasma', name:'PLASMA RIFLE', kind:'energy', sound:'energy', dmg:42, head:1.6, rpm:700, auto:true,
      mag:45, reserve:225, reload:2.6, spread:0.02, adsSpread:0.4, recoil:0.012, range:40, adsFov:60,
      projectile:true, projSpeed:55, splash:{ r:1.6, dmg:30 }, projColor:0x55c8ff, glow:true,
      model:{ len:0.68, barrel:0.24, color:0x1e2a33, stock:true, magSize:0.14, energy:0x55c8ff }, boxWeight:3, cost:0 },
    launcher: { id:'launcher', name:'WARHEAD MK-II', kind:'launcher', sound:'launcher', dmg:200, head:1.0, rpm:32, auto:false,
      mag:1, reserve:12, reload:3.4, spread:0.004, adsSpread:0.5, recoil:0.07, range:200, adsFov:62,
      projectile:true, projSpeed:26, gravity:6, splash:{ r:5.0, dmg:300 }, projColor:0xff7733, glow:true, rocket:true,
      model:{ len:0.9, barrel:0.5, color:0x3d4a35, stock:true, magSize:0.0, energy:0xff7733 }, boxWeight:2, cost:0 },
  };

  /* Pack-A-Punch tiers. tier 0 = stock. */
  const PAP_TIERS = [
    { name: '', dmg: 1.0, mag: 1.0, rpm: 1.0, cost: 0 },
    { name: '', dmg: 1.6, mag: 1.5, rpm: 1.08, cost: 2500 },
    { name: ' Mk.II', dmg: 2.4, mag: 1.75, rpm: 1.15, cost: 5000 },
    { name: ' X-TREME', dmg: 3.5, mag: 2.0, rpm: 1.22, cost: 7500 },
  ];
  const PAP_COLORS = [0x000000, 0x63ff7d, 0xffb347, 0xff5fd7];
  const PAP_NAMES = { // first upgrade renames the weapon entirely
    m1911: 'GRUMMEL', ranger: 'HORNET', smg: 'MUTATION', shotgun: 'GRAVEKEEPER',
    dmr: 'VERDICT', ak: 'RETRIBUTION', sniper: 'GALE', lmg: 'JUGGERNAUT',
    raygun: 'PORTALIFIER', plasma: 'IONSTORM', launcher: 'APOCALYPSE',
  };

  /* Resolve effective stats for a weapon instance {def, tier}. */
  function stats(def, tier) {
    const t = PAP_TIERS[tier || 0];
    return {
      name: tier ? (PAP_NAMES[def.id] || def.name) + (tier > 1 ? t.name : '') : def.name,
      dmg: def.dmg * t.dmg,
      head: def.head,
      rpm: def.rpm * t.rpm,
      mag: Math.round(def.mag * t.mag),
      reserve: Math.round(def.reserve * (1 + (tier || 0) * 0.4)),
      tier: tier || 0,
      color: PAP_COLORS[tier || 0],
    };
  }

  /* ---------------- procedural view model ---------------- */
  function _m(color, emissive = 0, metal = 0.45, rough = 0.5) {
    return new T.MeshStandardMaterial({ color, roughness: rough, metalness: metal,
      emissive: emissive ? color : 0x000000, emissiveIntensity: emissive });
  }
  function _glow(color, intensity = 1.6) {
    return new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
  }

  /* Build a weapon 3D model. Local forward axis = -z (camera space).
     Returns Group with userData {muzzle, mag, magHomeY}. */
  function buildModel(def, tier = 0) {
    const g = new T.Group();
    const M = def.model;
    const steel = _m(M.color);
    const dark = _m(0x14161a, 0, 0.35, 0.55);
    const wood = _m(0x6b4a26, 0, 0.05, 0.85);
    const glowColor = PAP_COLORS[tier] || 0x000000;

    const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      g.add(m); return m;
    };
    const cyl = (r1, r2, len, mat, x, y, z, axis = 'z') => {
      const m = new T.Mesh(new T.CylinderGeometry(r1, r2, len, 12), mat);
      if (axis === 'z') m.rotation.x = Math.PI / 2;
      else if (axis === 'x') m.rotation.z = Math.PI / 2;
      m.position.set(x, y, z);
      g.add(m); return m;
    };

    let muzzleZ = -0.3, barrelY = 0.02, mag = null;
    const K = def.kind;

    if (K === 'pistol') {
      box(0.046, 0.05, 0.28, steel, 0, 0.035, -0.06);              // slide
      box(0.05, 0.02, 0.09, dark, 0, 0.04, -0.10);                  // ejection port
      box(0.044, 0.042, 0.24, dark, 0, -0.005, -0.03);              // frame
      cyl(0.011, 0.011, 0.06, dark, 0, 0.035, -0.23);               // barrel tip
      box(0.042, 0.14, 0.06, dark, 0, -0.085, 0.055, 0.30);         // grip
      box(0.048, 0.11, 0.02, wood, 0, -0.09, 0.055, 0.30);          // grip plates
      box(0.012, 0.01, 0.1, dark, 0, -0.048, -0.05);                // trigger guard bottom
      box(0.012, 0.035, 0.012, dark, 0, -0.03, -0.09);             // guard front
      box(0.014, 0.022, 0.02, steel, 0, 0.058, 0.08);               // hammer
      box(0.02, 0.014, 0.016, dark, 0, 0.066, 0.06);                 // rear sight
      box(0.008, 0.016, 0.012, dark, 0, 0.066, -0.185);             // front sight
      mag = box(0.036, 0.02, 0.05, steel, 0, -0.03, 0.05, 0.3);     // mag base
      muzzleZ = -0.26; barrelY = 0.035;
    } else if (K === 'smg') {
      box(0.052, 0.07, 0.36, steel, 0, 0, -0.10);                   // receiver
      box(0.03, 0.012, 0.32, dark, 0, 0.044, -0.09);                // top rail
      cyl(0.02, 0.024, 0.14, dark, 0, 0.005, -0.33);                // handguard
      cyl(0.011, 0.011, 0.12, dark, 0, 0.005, -0.44);               // barrel
      cyl(0.015, 0.015, 0.035, steel, 0, 0.005, -0.50);             // muzzle
      mag = box(0.03, 0.19, 0.05, dark, 0, -0.125, -0.17, 0.12);     // long mag
      box(0.04, 0.11, 0.05, dark, 0, -0.09, 0.03, 0.28);            // grip
      box(0.04, 0.05, 0.15, steel, 0, -0.005, 0.16);                // stock
      box(0.014, 0.025, 0.12, dark, 0, 0.015, 0.16);                // stock strut
      box(0.012, 0.02, 0.012, dark, 0, 0.062, -0.28);               // front post
      cyl(0.012, 0.012, 0.02, dark, 0, 0.058, 0.05, 'x');           // rear drum
      muzzleZ = -0.52; barrelY = 0.005;
    } else if (K === 'shotgun') {
      box(0.055, 0.075, 0.28, steel, 0, 0, -0.06);                  // receiver
      cyl(0.016, 0.016, 0.34, dark, 0, 0.025, -0.37);               // barrel
      cyl(0.021, 0.021, 0.05, steel, 0, 0.025, -0.525);             // muzzle brake
      cyl(0.012, 0.012, 0.3, steel, 0, -0.028, -0.3);               // tube magazine
      box(0.055, 0.05, 0.14, wood, 0, -0.028, -0.3);                // pump
      box(0.045, 0.09, 0.2, wood, 0, -0.035, 0.2, 0.12);            // stock
      box(0.02, 0.05, 0.05, dark, 0, -0.06, 0.05, 0.3);             // grip area
      box(0.012, 0.012, 0.09, dark, 0, -0.05, -0.06);               // trigger guard
      const bead = new T.Mesh(new T.SphereGeometry(0.006, 8, 6), _glow(0xffd76a, 1.2));
      bead.position.set(0, 0.055, -0.5); g.add(bead);
      box(0.02, 0.012, 0.03, dark, 0, 0.048, 0.02);                  // rear sight
      mag = null;
      muzzleZ = -0.56; barrelY = 0.025;
    } else if (K === 'rifle') {
      const isAK = def.id === 'ak';
      const woodMat = isAK ? wood : dark;
      box(0.052, 0.075, 0.34, steel, 0, 0, -0.08);                   // receiver
      box(0.05, 0.05, 0.16, woodMat, 0, 0.004, -0.32);               // handguard
      cyl(0.011, 0.011, 0.22, dark, 0, 0.012, -0.49);                // barrel
      if (isAK) box(0.02, 0.03, 0.05, steel, 0, 0.012, -0.585, 0, 0, 0.35); // slant brake
      else cyl(0.015, 0.015, 0.04, steel, 0, 0.012, -0.595);         // flash hider
      cyl(0.008, 0.008, 0.16, steel, 0, 0.05, -0.32);                // gas tube
      if (isAK) {
        mag = box(0.032, 0.1, 0.05, steel, 0, -0.075, -0.10, 0.35);  // curved mag upper
        box(0.032, 0.1, 0.05, steel, 0, -0.15, -0.135, 0.72);        // curved mag lower
      } else {
        mag = box(0.035, 0.16, 0.055, dark, 0, -0.11, -0.12, 0.12);
      }
      box(0.04, 0.11, 0.045, dark, 0, -0.085, 0.04, 0.3);            // grip
      box(0.042, 0.075, 0.2, woodMat, 0, -0.02, 0.22, isAK ? 0.14 : 0.06); // stock
      box(0.02, 0.014, 0.035, dark, 0, 0.052, -0.22);                // front sight
      box(0.022, 0.014, 0.03, dark, 0, 0.052, 0.04);                 // rear sight
      box(0.012, 0.012, 0.02, steel, 0.032, 0.03, 0.05);             // charging handle
      muzzleZ = isAK ? -0.61 : -0.62; barrelY = 0.012;
    } else if (K === 'dmr') {
      box(0.05, 0.07, 0.38, steel, 0, 0, -0.10);                     // receiver
      box(0.045, 0.05, 0.2, dark, 0, 0.004, -0.35);                  // handguard
      cyl(0.012, 0.012, 0.24, dark, 0, 0.012, -0.5);                 // barrel
      cyl(0.016, 0.016, 0.04, steel, 0, 0.012, -0.62);               // muzzle
      cyl(0.022, 0.022, 0.15, dark, 0, 0.082, -0.08);                // scope tube
      cyl(0.026, 0.026, 0.02, dark, 0, 0.082, -0.155);              // scope bell
      const lens = new T.Mesh(new T.CircleGeometry(0.02, 12), _glow(0x2a4a8a, 0.8));
      lens.position.set(0, 0.082, -0.166); lens.rotation.y = Math.PI; g.add(lens);
      box(0.014, 0.03, 0.02, dark, 0, 0.055, -0.04);                 // scope mounts
      box(0.014, 0.03, 0.02, dark, 0, 0.055, -0.13);
      mag = box(0.03, 0.13, 0.05, dark, 0, -0.095, -0.10, 0.1);
      box(0.04, 0.11, 0.045, dark, 0, -0.08, 0.05, 0.3);             // grip
      box(0.042, 0.06, 0.2, steel, 0, -0.025, 0.24, 0.06);           // stock
      box(0.042, 0.03, 0.12, dark, 0, 0.025, 0.2);                   // cheek riser
      muzzleZ = -0.64; barrelY = 0.012;
    } else if (K === 'sniper') {
      box(0.055, 0.08, 0.44, steel, 0, 0, -0.12);                    // receiver
      cyl(0.015, 0.015, 0.38, dark, 0, 0.015, -0.53);                // heavy barrel
      cyl(0.023, 0.023, 0.07, steel, 0, 0.015, -0.73);               // muzzle brake
      cyl(0.03, 0.03, 0.2, dark, 0, 0.095, -0.06);                   // big scope
      cyl(0.034, 0.034, 0.02, dark, 0, 0.095, -0.16);
      const lens = new T.Mesh(new T.CircleGeometry(0.026, 12), _glow(0x2a4a8a, 0.8));
      lens.position.set(0, 0.095, -0.172); lens.rotation.y = Math.PI; g.add(lens);
      box(0.016, 0.04, 0.025, dark, 0, 0.06, -0.02);                 // scope rings
      box(0.016, 0.04, 0.025, dark, 0, 0.06, -0.12);
      cyl(0.008, 0.008, 0.06, steel, 0.045, 0.02, 0.02, 'x');         // bolt handle
      const knob = new T.Mesh(new T.SphereGeometry(0.014, 8, 6), steel);
      knob.position.set(0.075, 0.02, 0.02); g.add(knob);
      mag = box(0.032, 0.1, 0.06, dark, 0, -0.08, -0.06);
      box(0.04, 0.11, 0.045, dark, 0, -0.08, 0.08, 0.3);             // grip
      box(0.045, 0.09, 0.24, steel, 0, -0.03, 0.26, 0.1);            // stock
      box(0.045, 0.035, 0.14, dark, 0, 0.025, 0.22);                 // cheek riser
      muzzleZ = -0.77; barrelY = 0.015;
    } else if (K === 'lmg') {
      box(0.06, 0.095, 0.42, steel, 0, 0, -0.12);                    // receiver
      cyl(0.017, 0.017, 0.3, dark, 0, 0.015, -0.48);                 // thick barrel
      cyl(0.022, 0.022, 0.06, steel, 0, 0.015, -0.63);               // muzzle
      box(0.022, 0.03, 0.14, dark, 0, 0.078, -0.06);                 // carry handle
      box(0.02, 0.025, 0.02, dark, 0, 0.062, -0.13);                 // handle posts
      box(0.02, 0.025, 0.02, dark, 0, 0.062, 0.01);
      mag = cyl(0.075, 0.075, 0.055, dark, 0, -0.115, -0.06);        // drum
      box(0.04, 0.11, 0.05, dark, 0, -0.09, 0.06, 0.28);            // grip
      box(0.014, 0.008, 0.18, dark, 0.018, -0.055, -0.42, -0.35);    // folded bipod L
      box(0.014, 0.008, 0.18, dark, -0.018, -0.055, -0.42, 0.35);    // folded bipod R
      box(0.05, 0.08, 0.16, steel, 0, -0.02, 0.22);                  // stock
      box(0.02, 0.014, 0.03, dark, 0, 0.055, 0.02);                  // rear sight
      muzzleZ = -0.66; barrelY = 0.015;
    } else if (def.id === 'raygun') {
      const glow = _glow(0x39ff6a, 1.8);
      box(0.05, 0.062, 0.18, _m(0x2a1a24, 0, 0.2, 0.6), 0, 0.005, 0.06); // rear body
      cyl(0.02, 0.022, 0.24, dark, 0, 0.012, -0.20);                 // barrel housing
      for (let i = 0; i < 3; i++) {                                   // coil rings
        const ring = new T.Mesh(new T.TorusGeometry(0.03, 0.007, 8, 14), dark);
        ring.position.set(0, 0.012, -0.12 - i * 0.08);
        g.add(ring);
      }
      cyl(0.014, 0.014, 0.2, glow, 0, 0.012, -0.26);                 // glowing core
      const tip = new T.Mesh(new T.SphereGeometry(0.024, 10, 8), glow);
      tip.position.set(0, 0.012, -0.36); g.add(tip);
      cyl(0.01, 0.01, 0.07, glow, 0.038, -0.005, 0.02);              // side vials
      cyl(0.01, 0.01, 0.07, glow, -0.038, -0.005, 0.02);
      box(0.036, 0.13, 0.05, dark, 0, -0.08, 0.09, 0.32);            // grip
      box(0.012, 0.028, 0.012, dark, 0, -0.03, -0.02);              // trigger
      box(0.02, 0.016, 0.03, dark, 0, 0.05, 0.13);                    // rear sight
      mag = null;
      muzzleZ = -0.39; barrelY = 0.012;
    } else if (def.id === 'plasma') {
      const glow = _glow(0x55c8ff, 1.8);
      box(0.055, 0.08, 0.4, _m(0x18212b, 0, 0.3, 0.6), 0, 0, -0.10); // receiver
      box(0.03, 0.012, 0.34, dark, 0, 0.05, -0.10);                 // top rail
      cyl(0.013, 0.013, 0.28, glow, 0.036, 0.012, -0.22);            // side tubes
      cyl(0.013, 0.013, 0.28, glow, -0.036, 0.012, -0.22);
      cyl(0.019, 0.019, 0.14, dark, 0, 0.005, -0.4);                 // barrel shroud
      const tip = new T.Mesh(new T.SphereGeometry(0.017, 10, 8), glow);
      tip.position.set(0, 0.005, -0.475); g.add(tip);
      box(0.02, 0.018, 0.02, glow, 0, 0.065, -0.02);                  // dot sight
      mag = box(0.034, 0.14, 0.06, dark, 0, -0.1, -0.13, 0.08);
      box(0.04, 0.11, 0.045, dark, 0, -0.085, 0.05, 0.3);            // grip
      box(0.014, 0.05, 0.16, dark, 0, 0.01, 0.2);                     // skeleton stock
      box(0.03, 0.012, 0.14, dark, 0, 0.04, 0.2);
      muzzleZ = -0.49; barrelY = 0.005;
    } else { // launcher
      const body = _m(0x3d4a35, 0, 0.3, 0.7);
      cyl(0.052, 0.052, 0.58, body, 0, 0.02, -0.18);                 // main tube
      cyl(0.052, 0.03, 0.1, dark, 0, 0.02, 0.17);                    // rear blast cone
      cyl(0.058, 0.058, 0.05, dark, 0, 0.02, -0.47);                 // front ring
      box(0.03, 0.09, 0.045, dark, 0, -0.06, 0.02, 0.15);            // rear grip
      box(0.03, 0.08, 0.04, dark, 0, -0.055, -0.22, 0.05);           // front grip
      box(0.018, 0.05, 0.06, dark, 0, 0.075, -0.02);                 // rear sight
      box(0.03, 0.05, 0.04, dark, 0, 0.08, -0.3);                    // front sight
      const dot = new T.Mesh(new T.SphereGeometry(0.008, 8, 6), _glow(0xff5533, 1.2));
      dot.position.set(0, 0.085, -0.31); g.add(dot);
      box(0.016, 0.016, 0.4, dark, 0.056, 0.02, -0.18);              // side rail
      mag = null;
      muzzleZ = -0.5; barrelY = 0.02;
    }

    // Pack-A-Punch modifications
    if (tier > 0) {
      const strip = new T.Mesh(new T.BoxGeometry(0.012, 0.014, 0.3),
        _glow(glowColor, 1.8));
      strip.position.set(0, (K === 'pistol' || def.id === 'raygun') ? 0.058 : 0.045, -0.08);
      g.add(strip);
      const mRing = new T.Mesh(new T.TorusGeometry(0.017, 0.005, 8, 14), _glow(glowColor, 2));
      mRing.position.set(0, barrelY, muzzleZ + 0.05);
      g.add(mRing);
    }

    // shadows + anchors
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    const muzzle = new T.Object3D();
    muzzle.position.set(0, barrelY, muzzleZ);
    g.add(muzzle);
    g.userData.muzzle = muzzle;
    g.userData.mag = mag;
    g.userData.magHomeY = mag ? mag.position.y : 0;
    g.userData.sightY = SIGHT_Y[K] || (def.id === 'raygun' ? 0.05 : def.id === 'plasma' ? 0.065 : 0.06);
    g.userData.body = g.children[0];
    return g;
  }

  /* Height of the aiming line above the model origin, for ADS alignment. */
  const SIGHT_Y = {
    pistol: 0.066, smg: 0.058, shotgun: 0.05, rifle: 0.052, dmr: 0.082,
    sniper: 0.095, lmg: 0.055, launcher: 0.075,
  };

  /* Mystery box roll table: [weaponId, weight] */
  function boxRoll() {
    const entries = [
      ['raygun', 3], ['plasma', 4], ['launcher', 3],
      ['smg', 5], ['shotgun', 4], ['dmr', 4], ['ak', 4], ['sniper', 2], ['lmg', 3],
      ['ranger', 3], ['m1911', 2],
    ];
    return UP.weightedChoice(entries);
  }

  /* ---------------- Fortnite-style rarity ---------------- */
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const RARITY_HEX = { common: '#9aa4ac', uncommon: '#38c832', rare: '#2f9bff', epic: '#b03fe0', legendary: '#ff9d2e' };
  const RARITY_BASE = { m1911: 'common', ranger: 'common', smg: 'common', shotgun: 'uncommon',
    ak: 'uncommon', dmr: 'rare', sniper: 'rare', lmg: 'rare', raygun: 'legendary',
    plasma: 'epic', launcher: 'epic' };

  function rarity(def, tier = 0) {
    const idx = Math.max(RARITY_ORDER.indexOf(RARITY_BASE[def.id] || 'common'), tier);
    return RARITY_ORDER[Math.min(idx, 4)];
  }

  /* ---------------- offscreen weapon icons (loadout UI) ---------------- */
  let _iconR = null, _iconScene = null, _iconCam = null;
  const _iconCache = new Map();

  function iconFor(defId, tier = 0) {
    const key = defId + ':' + tier;
    if (_iconCache.has(key)) return _iconCache.get(key);
    try {
      if (!_iconR) {
        _iconR = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        _iconR.setSize(190, 76);
        _iconR.outputEncoding = T.sRGBEncoding;
        _iconScene = new T.Scene();
        _iconScene.add(new T.AmbientLight(0xffffff, 0.85));
        const d1 = new T.DirectionalLight(0xffffff, 1.1); d1.position.set(1, 2, 3); _iconScene.add(d1);
        const d2 = new T.DirectionalLight(0x99b7ff, 0.45); d2.position.set(-2, -1, -2); _iconScene.add(d2);
        _iconCam = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 12);
      }
      const def = DEFS[defId];
      const model = buildModel(def, tier);
      model.rotation.y = 1.18; // angled profile like Fortnite item icons
      model.rotation.z = 0.06;
      model.updateMatrixWorld(true);
      _iconScene.add(model);
      const wb = new T.Box3().setFromObject(model);
      const ws = wb.getSize(new T.Vector3());
      const wc = wb.getCenter(new T.Vector3());
      let hw = ws.x / 2 * 1.1 + 0.05, hh = ws.y / 2 * 1.1 + 0.05;
      const aspect = 190 / 76;
      if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
      _iconCam.left = -hw; _iconCam.right = hw; _iconCam.top = hh; _iconCam.bottom = -hh;
      _iconCam.position.set(wc.x, wc.y, 4);
      _iconCam.lookAt(wc.x, wc.y, 0);
      _iconCam.updateProjectionMatrix();
      _iconR.render(_iconScene, _iconCam);
      const url = _iconR.domElement.toDataURL('image/png');
      _iconScene.remove(model);
      model.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      _iconCache.set(key, url);
      return url;
    } catch (e) {
      return '';
    }
  }

  window.UP.Weapons = { DEFS, stats, buildModel, boxRoll, PAP_TIERS, PAP_COLORS, PAP_NAMES,
    rarity, iconFor, RARITY_HEX };
})();
