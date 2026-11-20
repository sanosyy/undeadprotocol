/* UNDEAD PROTOCOL — map.js
   The Blacksite-7 research facility: geometry, doors, barricaded windows,
   ramps, collision, navigation graph, lights and atmosphere. */
'use strict';
window.UP = window.UP || {};
(function () {
  const T = window.THREE;

  const M = {
    scene: null,
    colliders: [],       // {x1,y1,z1,x2,y2,z2}
    losBlockers: [],     // subset used for AI line-of-sight
    raycastStatics: [],  // meshes bullets can hit
    floors: [],          // {x1,z1,x2,z2,y} | {x1,z1,x2,z2,axis,from,to,y0,y1}
    doors: [],
    windows: [],
    vents: [],
    nodes: [], edges: [],
    rooms: {},
    lights: [],
    blackout: false,
    powerOn: false,
    flickerT: 0,
  };

  /* -------------------------------------------------- helpers */
  let _wallMatA, _wallMatB, _wallMatC, _floorA, _floorB, _floorC, _floorD, _ceilMat;

  function addBoxCollider(x1, y1, z1, x2, y2, z2, los = true) {
    const c = { x1: Math.min(x1, x2), y1: Math.min(y1, y2), z1: Math.min(z1, z2),
                x2: Math.max(x1, x2), y2: Math.max(y1, y2), z2: Math.max(z1, z2) };
    M.colliders.push(c);
    if (los) M.losBlockers.push(c);
    return c;
  }

  /* Solid wall chunk. */
  function wallBox(x1, z1, x2, z2, y1, y2, mat) {
    const w = Math.max(Math.abs(x2 - x1), 0.3), d = Math.max(Math.abs(z2 - z1), 0.3);
    const g = new T.BoxGeometry(w, y2 - y1, d);
    const m = new T.Mesh(g, mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.castShadow = true; m.receiveShadow = true;
    M.scene.add(m);
    M.raycastStatics.push(m);
    addBoxCollider(x1 - 0.15, y1, z1 - 0.15, x2 + 0.15, y2, z2 + 0.15);
    return m;
  }

  function slab(x1, z1, x2, z2, y1, y2, mat, collide = false, ray = true) {
    const m = new T.Mesh(new T.BoxGeometry(Math.abs(x2 - x1), y2 - y1, Math.abs(z2 - z1)), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.receiveShadow = true;
    M.scene.add(m);
    if (ray) M.raycastStatics.push(m);
    if (collide) addBoxCollider(x1, y1, z1, x2, y2, z2);
    return m;
  }

  function roomFloor(x1, z1, x2, z2, y, mat) {
    M.floors.push({ x1, z1, x2, z2, y });
    const m = slab(x1, z1, x2, z2, y - 0.1, y, mat, false, true);
    m.material.map && (m.material.map.repeat.set(Math.abs(x2 - x1) / 4, Math.abs(z2 - z1) / 4));
    return m;
  }

  function rampFloor(x1, z1, x2, z2, axis, from, to, y0, y1, mat) {
    M.floors.push({ x1, z1, x2, z2, axis, from, to, y0, y1 });
    const len = axis === 'z' ? Math.abs(z2 - z1) : Math.abs(x2 - x1);
    const m = new T.Mesh(new T.BoxGeometry(axis === 'x' ? len : Math.abs(x2 - x1), 0.25,
      axis === 'z' ? len : Math.abs(z2 - z1)), mat);
    // slope so the mesh surface matches the height function:
    // +z end goes DOWN with positive rotation.x; +x end goes DOWN with negative rotation.z
    const ang = Math.atan2(Math.abs(y1 - y0), Math.abs(to - from));
    if (axis === 'z') m.rotation.x = (to > from ? 1 : -1) * (y1 < y0 ? ang : -ang);
    else m.rotation.z = (to > from ? 1 : -1) * (y1 < y0 ? -ang : ang);
    m.position.set((x1 + x2) / 2, (y0 + y1) / 2 - 0.12, (z1 + z2) / 2);
    m.receiveShadow = true;
    M.scene.add(m);
    M.raycastStatics.push(m);
    return m;
  }

  /* Text sign plane in world. */
  function sign(text, x, y, z, ry, scale = 1, opts = {}) {
    const tex = UP.Tex.text(text, opts);
    const m = new T.Mesh(new T.PlaneGeometry(2.2 * scale, 0.55 * scale * (text.length > 18 ? 1.5 : 1)),
      new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.position.set(x, y, z); m.rotation.y = ry;
    M.scene.add(m);
    return m;
  }

  /* Room point light with lamp mesh. */
  function roomLight(x, y, z, colorOn = 0xffd9a0, intensityOn = 0.9, flicker = false) {
    const l = new T.PointLight(0xff2211, 0.28, 16, 2);
    l.position.set(x, y, z);
    M.scene.add(l);
    const lamp = new T.Mesh(new T.BoxGeometry(0.5, 0.12, 0.5),
      new T.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2211, emissiveIntensity: 0.7 }));
    lamp.position.set(x, y + 0.1, z);
    M.scene.add(lamp);
    M.lights.push({ light: l, lamp, colorOn, intensityOn, flicker, seed: Math.random() * 10 });
    return l;
  }

  /* -------------------------------------------------- doors */
  /* w = opening width, h = door height, side = which face the sign renders on,
     wallTop = top of the wall containing this door; a lintel is built above
     the opening so there's no see-through gap over the door. */
  function makeDoor(id, name, cost, needsPower, x, z, along, yBase, nodeA, nodeB, roomId, roomsOpen, w = 4, h = 2.6, side = -1, wallTop = 0) {
    const group = new T.Group();
    const mat = new T.MeshStandardMaterial({ map: UP.Tex.hazard(2, 2), roughness: 0.7, metalness: 0.4 });
    const panel = new T.Mesh(new T.BoxGeometry(along === 'z' ? w : 0.24, h, along === 'z' ? 0.24 : w), mat);
    panel.position.set(x, yBase + h / 2, z);
    panel.castShadow = true;
    group.add(panel);
    // frame
    const fMat = new T.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.6, metalness: 0.6 });
    for (const s of [-1, 1]) {
      const post = new T.Mesh(new T.BoxGeometry(along === 'z' ? 0.28 : 0.5, h + 0.5, along === 'z' ? 0.5 : 0.28), fMat);
      post.position.set(along === 'z' ? x + s * (w / 2 + 0.14) : x, yBase + (h + 0.5) / 2,
                        along === 'z' ? z : z + s * (w / 2 + 0.14));
      group.add(post);
      M.raycastStatics.push(post);
    }
    // status light
    const lampMat = new T.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 1.2 });
    const lamp = new T.Mesh(new T.BoxGeometry(0.12, 0.12, 0.12), lampMat);
    lamp.position.set(x + (along === 'z' ? w / 2 - 0.4 : 0.35), yBase + h + 0.2,
                      z + (along === 'z' ? 0.35 : w / 2 - 0.4));
    group.add(lamp);
    // price sign
    const stex = UP.Tex.text([name, needsPower ? `${cost} — REQUIRES POWER` : `${cost} POINTS`],
      { size: 34, color: '#ffd76a', glow: '#ff9d2e' });
    const s = new T.Mesh(new T.PlaneGeometry(2.0, 0.8),
      new T.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false }));
    const off = w / 2 - 0.05;
    if (along === 'z') { s.position.set(x, yBase + h - 0.45, z + 0.42 * side); s.rotation.y = side > 0 ? 0 : Math.PI; }
    else { s.position.set(x + 0.42 * side, yBase + h - 0.45, z); s.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
    group.add(s);
    // lintel: fill the gap between the top of the door opening and the top
    // of the wall it sits in (otherwise there's a see-through slot)
    if (wallTop > yBase + h + 0.01) {
      const lh = wallTop - (yBase + h);
      const lintel = new T.Mesh(new T.BoxGeometry(along === 'z' ? w + 0.3 : 0.3, lh, along === 'z' ? 0.3 : w + 0.3), fMat);
      lintel.position.set(x, yBase + h + lh / 2, z);
      group.add(lintel);
      M.raycastStatics.push(lintel);
      addBoxCollider(along === 'z' ? x - w / 2 - 0.15 : x - 0.15, yBase + h,
                     along === 'z' ? z - 0.15 : z - w / 2 - 0.15,
                     along === 'z' ? x + w / 2 + 0.15 : x + 0.15,
                     wallTop,
                     along === 'z' ? z + 0.15 : z + w / 2 + 0.15);
    }
    M.scene.add(group);

    const collider = { x1: x - (along === 'z' ? w / 2 : 0.25), y1: yBase, z1: z - (along === 'z' ? 0.25 : w / 2),
                       x2: x + (along === 'z' ? w / 2 : 0.25), y2: yBase + h, z2: z + (along === 'z' ? 0.25 : w / 2) };
    M.colliders.push(collider);
    M.losBlockers.push(collider);
    M.raycastStatics.push(panel);

    const door = { id, name, cost, needsPower, x, z, yBase, h, nodeA, nodeB, roomId,
      roomsOpen: roomsOpen || [], panel, lampMat, collider, opened: false, anim: 0, dir: 0 };
    M.doors.push(door);
    return door;
  }

  function windowHole(cx, cz, along, width, sillH = 1.2) {
    // sill collider (player can't climb out; zombies vault scripted)
    const half = width / 2;
    if (along === 'z') { // wall runs along x
      addBoxCollider(cx - half, 0, cz - 0.15, cx + half, sillH, cz + 0.15);
      const sill = slab(cx - half, cz - 0.15, cx + half, cz + 0.15, 0, sillH, _wallMatA, false, true);
      sill.castShadow = true;
    } else {
      addBoxCollider(cx - 0.15, 0, cz - half, cx + 0.15, sillH, cz + half);
      const sill = slab(cx - 0.15, cz - half, cx + 0.15, cz + half, 0, sillH, _wallMatA, false, true);
      sill.castShadow = true;
    }
  }

  /* Barricaded window (zombies spawn outside, break planks, vault in). */
  function makeWindow(id, roomId, cx, cz, along, outX, outZ, width) {
    windowHole(cx, cz, along, width);
    const win = { id, roomId, cx, cz, along, outX, outZ, width, count: 5, queue: 0, planks: [] };
    const plankMat = new T.MeshStandardMaterial({ map: UP.Tex.wood(1, 1), roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const long = width + 0.7;
      const p = new T.Mesh(new T.BoxGeometry(along === 'z' ? long : 0.1, 0.22, along === 'z' ? 0.1 : long), plankMat);
      p.position.set(cx - outX * 0.12, 0.55 + i * 0.34, cz - outZ * 0.12);
      p.rotation.z = (Math.random() - 0.5) * 0.12;
      p.rotation.x = (Math.random() - 0.5) * 0.08;
      p.castShadow = true;
      M.scene.add(p);
      win.planks.push({ mesh: p, broken: false, homeY: p.position.y, homeX: p.position.x, homeZ: p.position.z });
    }
    // outside spawn position
    win.spawnX = cx + outX * 3.2;
    win.spawnZ = cz + outZ * 3.2;
    M.windows.push(win);
    return win;
  }

  /* Open vent — zombies crawl out directly (no barricade). */
  function makeVent(id, roomId, x, y, z) {
    const m = new T.Mesh(new T.BoxGeometry(1.0, 0.7, 1.0),
      new T.MeshStandardMaterial({ color: 0x14171a, roughness: 0.8, metalness: 0.5 }));
    m.position.set(x, y + 0.35, z);
    M.scene.add(m);
    const glow = new T.Mesh(new T.PlaneGeometry(0.8, 0.5),
      new T.MeshBasicMaterial({ color: 0x050607 }));
    glow.position.set(x, y + 0.36, z + 0.51);
    M.scene.add(glow);
    M.vents.push({ id, roomId, x, y, z });
  }

  /* -------------------------------------------------- build */
  M.build = function (scene) {
    M.scene = scene;
    _wallMatA = new T.MeshStandardMaterial({ map: UP.Tex.wallPanel(2, 1), roughness: 0.85 });
    _wallMatB = new T.MeshStandardMaterial({ map: UP.Tex.concrete(3, 1), roughness: 0.9 });
    _wallMatC = new T.MeshStandardMaterial({ map: UP.Tex.rust(2, 1), roughness: 0.95 });
    _floorA = new T.MeshStandardMaterial({ map: UP.Tex.labTile(1, 1), roughness: 0.6 });
    _floorB = new T.MeshStandardMaterial({ map: UP.Tex.concrete(1, 1), roughness: 0.9 });
    _floorC = new T.MeshStandardMaterial({ map: UP.Tex.metal(1, 1), roughness: 0.55, metalness: 0.6 });
    _floorD = new T.MeshStandardMaterial({ map: UP.Tex.wood(1, 1), roughness: 0.9 });
    _ceilMat = new T.MeshStandardMaterial({ map: UP.Tex.wallPanel(4, 4), roughness: 0.9, color: 0x8a8f96 });

    scene.background = new T.Color(0x05070c);
    scene.fog = new T.FogExp2(0x05070c, 0.018);

    /* rooms registry */
    M.rooms = { A: { name: 'SECURITY QUARTERS', accessible: true }, AB: { name: '', accessible: false },
      B: { name: 'MAIN LABORATORY', accessible: false }, AC: { name: '', accessible: false },
      C: { name: 'WEAPON STORAGE', accessible: false }, AD: { name: '', accessible: false },
      D: { name: 'MEDICAL BAY', accessible: false }, BE: { name: '', accessible: false },
      E: { name: 'GENERATOR ROOM', accessible: false }, AF: { name: '', accessible: false },
      F: { name: 'MAINTENANCE TUNNELS', accessible: false }, FG: { name: '', accessible: false },
      G: { name: 'CONTAINMENT VAULT', accessible: false }, S: { name: 'WEST STAIRWELL', accessible: false },
      R: { name: 'ROOFTOP', accessible: false } };

    buildGroundAndSky();
    buildSpawn();
    buildLab();
    buildStorage();
    buildMedical();
    buildGenerator();
    buildTunnels();
    buildStairwellAndRoof();
    buildNavGraph();
    buildDoors();
  };

  /* ---------- outdoor ---------- */
  function buildGroundAndSky() {
    const gMat = new T.MeshStandardMaterial({ map: UP.Tex.grass(30, 30), roughness: 1 });
    const rects = [ [-70, -70, 70, -26], [-14, -26, 70, 6], [-70, -26, -26, 6],
                    [-26, -20, -14, 6], [-70, 6, -2, 70], [2, 6, 70, 70] ];
    for (const r of rects) slab(r[0], r[1], r[2], r[3], -0.02, 0.02, gMat, false, true);

    // moonlight
    const moon = new T.DirectionalLight(0x8fa3cc, 0.4);
    moon.position.set(40, 70, -60);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -50; moon.shadow.camera.right = 50;
    moon.shadow.camera.top = 50; moon.shadow.camera.bottom = -50;
    moon.shadow.camera.far = 200;
    moon.shadow.bias = -0.0005;
    scene().add(moon);
    M.moonLight = moon;
    scene().add(new T.HemisphereLight(0x232f45, 0x0a0c10, 0.35));

    // moon disc
    const md = new T.Mesh(new T.CircleGeometry(7, 24),
      new T.MeshBasicMaterial({ color: 0xdde4f0, fog: false }));
    md.position.set(80, 100, -140);
    md.lookAt(0, 0, 0);
    scene().add(md);

    // stars
    const starGeo = new T.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 320; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI * 0.48;
      const r = 230;
      pos.push(r * Math.cos(b) * Math.cos(a), r * Math.sin(b) + 8, r * Math.cos(b) * Math.sin(a));
    }
    starGeo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    scene().add(new T.Points(starGeo, new T.PointsMaterial({ color: 0x99a5c0, size: 0.8, fog: false })));

    // instanced forest
    const trunkGeo = new T.CylinderGeometry(0.25, 0.4, 3.2, 6);
    const crownGeo = new T.ConeGeometry(1.7, 5.5, 7);
    const trunkMat = new T.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
    const crownMat = new T.MeshStandardMaterial({ color: 0x121e12, roughness: 1 });
    const N = 130;
    const trunks = new T.InstancedMesh(trunkGeo, trunkMat, N);
    const crowns = new T.InstancedMesh(crownGeo, crownMat, N);
    const m4 = new T.Matrix4();
    let placed = 0, guard = 0;
    while (placed < N && guard++ < 800) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 38;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (x > -30 && x < 34 && z > -33 && z < 36) continue; // facility footprint
      const s = 0.8 + Math.random() * 1.1;
      m4.makeScale(s, s, s); m4.setPosition(x, 1.6 * s, z);
      trunks.setMatrixAt(placed, m4);
      m4.makeScale(s, s, s); m4.setPosition(x, (3.2 + 2.7) * s, z);
      crowns.setMatrixAt(placed, m4);
      placed++;
    }
    trunks.count = crowns.count = placed;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.castShadow = crowns.castShadow = true;
    scene().add(trunks); scene().add(crowns);
  }
  function scene() { return M.scene; }

  /* ---------- spawn room A ---------- */
  function buildSpawn() {
    const H = 3.2;
    roomFloor(-6, -6, 6, 6, 0, _floorB);
    slab(-6, -6, 6, 6, H, H + 0.2, _ceilMat, false, true);
    wallBox(-6, -6, -2, -6, 0, H, _wallMatA); wallBox(2, -6, 6, -6, 0, H, _wallMatA);
    wallBox(-6, 6, -2, 6, 0, H, _wallMatA); wallBox(2, 6, 6, 6, 0, H, _wallMatA);
    // west/east walls: door hole z[-1,1], window hole z[3.5,5.5] (moved north so
    // outside spawn points can't wedge zombies into the medical bay's south wall)
    wallBox(-6, -6, -6, -1, 0, H, _wallMatA); wallBox(-6, 1, -6, 3.5, 0, H, _wallMatA); wallBox(-6, 5.5, -6, 6, 0, H, _wallMatA);
    wallBox(6, -6, 6, -1, 0, H, _wallMatA); wallBox(6, 1, 6, 3.5, 0, H, _wallMatA); wallBox(6, 5.5, 6, 6, 0, H, _wallMatA);
    makeWindow('w0a', 'A', -6, 4.5, 'x', -1, 0, 2);
    makeWindow('w0b', 'A', 6, 4.5, 'x', 1, 0, 2);
    roomLight(0, 3.0, 0, 0xffd9a0, 0.9, false);
    sign('SECURITY QUARTERS', 0, 2.7, -5.8, 0, 1.2, { size: 40, color: '#cfd6de' });
    // AB corridor
    wallBox(-2, -14, -2, -6, 0, 2.4, _wallMatB);
    wallBox(2, -14, 2, -6, 0, 2.4, _wallMatB);
    roomFloor(-2, -14, 2, -6, 0, _floorB);
    slab(-2, -14, 2, -6, 2.4, 2.6, _ceilMat, false, true);
    // AD corridor
    wallBox(-10, -1, -6, -1, 0, 2.4, _wallMatB); wallBox(-10, 1, -6, 1, 0, 2.4, _wallMatB);
    roomFloor(-10, -1, -6, 1, 0, _floorB);
    slab(-10, -1, -6, 1, 2.4, 2.6, _ceilMat, false, true);
    // AC corridor
    wallBox(6, -1, 10, -1, 0, 2.4, _wallMatB); wallBox(6, 1, 10, 1, 0, 2.4, _wallMatB);
    roomFloor(6, -1, 10, 1, 0, _floorB);
    slab(6, -1, 10, 1, 2.4, 2.6, _ceilMat, false, true);
    // BE corridor ceiling
    slab(14, -24, 18, -20, 2.6, 2.8, _ceilMat, false, true);
    // props: crates + lockers (kept clear of window vault landing zones)
    propBox(-4.5, 0, -4.5, 1.2, 0.9, 1.2, _floorD);
    propBox(-3.9, 0, -4.7, 0.9, 1.6, 0.9, _wallMatC);
    propBox(5.2, 0, -2.6, 1.0, 1.0, 1.6, _floorD);
    propBox(3.9, 0, -5.5, 1.4, 1.9, 0.6, _wallMatC); // lockers against north wall
  }

  /* ---------- lab B ---------- */
  function buildLab() {
    const H = 3.8;
    roomFloor(-14, -28, 14, -14, 0, _floorA);
    // south wall with two windows + corridor mouth lintel
    wallBox(-14, -14, -2, -14, 0, H, _wallMatA); wallBox(2, -14, 14, -14, 0, H, _wallMatA);
    wallBox(-2, -14, 2, -14, 2.6, H, _wallMatA); // lintel over the AB corridor mouth
    // north wall with two windows
    wallBox(-14, -28, -8, -28, 0, H, _wallMatA); wallBox(-4, -28, 4, -28, 0, H, _wallMatA); wallBox(8, -28, 14, -28, 0, H, _wallMatA);
    makeWindow('w1', 'B', -6, -28, 'z', 0, -1, 4);
    makeWindow('w2', 'B', 6, -28, 'z', 0, -1, 4);
    // east wall (BE hole)
    wallBox(14, -28, 14, -24, 0, H, _wallMatA); wallBox(14, -20, 14, -14, 0, H, _wallMatA);
    // west wall (tall, stairwell doors)
    wallBox(-14, -28, -14, -26, 0, 6.4, _wallMatA);
    wallBox(-14, -26, -14, -24, 0, 5.0, _wallMatA);   // below roof door
    wallBox(-14, -26, -14, -24, 7.2, 8.5, _wallMatA); // above roof door
    wallBox(-14, -24, -14, -23, 0, 8.5, _wallMatA);
    wallBox(-14, -21, -14, -20, 0, 8.5, _wallMatA);
    wallBox(-14, -20, -14, -14, 0, H, _wallMatA);
    // roof slab over lab (also its ceiling)
    slab(-14, -28, 14, -14, 3.8, 5.0, _wallMatC, false, true);
    // BE corridor
    wallBox(14, -24, 18, -24, 0, 2.6, _wallMatB); wallBox(14, -20, 18, -20, 0, 2.6, _wallMatB);
    roomFloor(14, -24, 18, -20, 0, _floorB);
    sign('MAIN LABORATORY', 0, 3.3, -14.2, 0, 1.3, { size: 40, color: '#9fd0a0' });
    // lights
    roomLight(0, 3.5, -18, 0xd8f0e0, 0.8, true);
    roomLight(-9, 3.5, -24, 0xffd9a0, 0.8, false);
    roomLight(9, 3.5, -24, 0xffd9a0, 0.8, true);
    // props: lab tables, tanks, racks
    propBox(-6, 0, -18, 5, 0.9, 1.6, _floorC);          // bench — kept clear of the
    // nav corridor (n2->n3 runs through x=0; a bench at (0,-18) made zombies
    // grind into it forever when the player stood on the far side)
    propBox(-10, 0, -20, 1.5, 1.8, 1.0, _wallMatC);     // server rack
    propBox(-10, 0, -22.2, 1.5, 1.8, 1.0, _wallMatC);
    propBox(-10, 0, -24.4, 1.5, 1.8, 1.0, _wallMatC);
    propBox(11.5, 0, -16, 1.2, 1.2, 1.2, _floorD);      // crates
    propBox(12.6, 0, -17.2, 1.2, 0.9, 1.2, _floorD);
    // specimen tanks (glass) — placed between the windows, never under the
    // vault-in landing points (-6,-26.7) and (6,-26.7)
    for (const [tx, tz] of [[0.6, -26.3], [3, -26.3], [11, -26.3]]) {
      const glass = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 2.2, 12),
        new T.MeshStandardMaterial({ color: 0x8fd0b8, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.2 }));
      glass.position.set(tx, 1.1, tz); glass.castShadow = true;
      scene().add(glass);
      const fluid = new T.Mesh(new T.CylinderGeometry(0.48, 0.48, 1.7, 10),
        new T.MeshStandardMaterial({ color: 0x1a4a38, emissive: 0x1a4a38, emissiveIntensity: 0.5, transparent: true, opacity: 0.55 }));
      fluid.position.set(tx, 0.85, tz);
      scene().add(fluid);
      M.raycastStatics.push(glass);
      addBoxCollider(tx - 0.6, 0, tz - 0.6, tx + 0.6, 2.2, tz + 0.6);
    }
    // dust motes
    const dg = new T.BufferGeometry();
    const dp = [];
    for (let i = 0; i < 70; i++) dp.push(UP.rand(-13, 13), UP.rand(0.4, 3.4), UP.rand(-27, -15));
    dg.setAttribute('position', new T.Float32BufferAttribute(dp, 3));
    const dust = new T.Points(dg, new T.PointsMaterial({ color: 0x889070, size: 0.03, transparent: true, opacity: 0.5 }));
    scene().add(dust);
  }

  /* ---------- storage C ---------- */
  function buildStorage() {
    const H = 3;
    roomFloor(10, -3, 22, 3, 0, _floorC);
    slab(10, -3, 22, 3, H, H + 0.2, _ceilMat, false, true);
    wallBox(10, -3, 22, -3, 0, H, _wallMatB);
    wallBox(10, 3, 14, 3, 0, H, _wallMatB); wallBox(18, 3, 22, 3, 0, H, _wallMatB);
    makeWindow('w3', 'C', 16, 3, 'z', 0, 1, 4);
    wallBox(22, -3, 22, 3, 0, H, _wallMatB);
    wallBox(10, -3, 10, -1, 0, H, _wallMatB); wallBox(10, 1, 10, 3, 0, H, _wallMatB);
    wallBox(10, -1, 10, 1, 2.6, H, _wallMatB); // lintel over the AC corridor mouth
    roomLight(16, 2.8, 0, 0xffd9a0, 0.85, false);
    sign('WEAPON STORAGE', 16, 2.6, -2.8, 0, 1.1, { size: 38, color: '#d8c892' });
    // gun racks / shelving — x[15,20] so it never covers the SMG wall buy at x=12.5
    propBox(17.5, 0, -2.4, 5, 2.2, 0.5, _wallMatC);
    propBox(19, 0, 2.2, 1.0, 1.1, 1.0, _floorD);
    propBox(20.8, 0, 2.0, 1.2, 0.8, 1.2, _floorD);
  }

  /* ---------- medical D ---------- */
  function buildMedical() {
    const H = 3;
    roomFloor(-20, -3, -8, 3, 0, _floorA);
    slab(-20, -3, -8, 3, H, H + 0.2, _ceilMat, false, true);
    wallBox(-20, -3, -20, 3, 0, H, _wallMatA);
    wallBox(-20, -3, -16, -3, 0, H, _wallMatA); wallBox(-12, -3, -8, -3, 0, H, _wallMatA);
    makeWindow('w4', 'D', -14, -3, 'z', 0, -1, 4);
    wallBox(-20, 3, -8, 3, 0, H, _wallMatA);
    wallBox(-8, -3, -8, -1, 0, H, _wallMatA); wallBox(-8, 1, -8, 3, 0, H, _wallMatA);
    wallBox(-8, -1, -8, 1, 2.6, H, _wallMatA); // lintel over the AD corridor mouth
    roomLight(-14, 2.8, 0, 0xd8e8f0, 0.8, true);
    sign('MEDICAL BAY', -14, 2.6, -2.8, 0, 1.0, { size: 38, color: '#9fc0d0' });
    // beds
    for (const bx of [-18, -15.5]) {
      propBox(bx, 0, 1.6, 1.1, 0.55, 2.4, new T.MeshStandardMaterial({ color: 0x9aa4ac, roughness: 0.7 }));
    }
    propBox(-19.2, 0, -1.6, 1.0, 1.8, 0.6, _wallMatC); // cabinet
  }

  /* ---------- generator E ---------- */
  function buildGenerator() {
    const H = 3.6;
    roomFloor(18, -28, 28, -18, 0, _floorC);
    slab(18, -28, 28, -18, H, H + 0.2, _ceilMat, false, true);
    wallBox(18, -28, 21, -28, 0, H, _wallMatB); wallBox(25, -28, 28, -28, 0, H, _wallMatB);
    makeWindow('w5', 'E', 23, -28, 'z', 0, -1, 4);
    wallBox(18, -18, 28, -18, 0, H, _wallMatB);
    wallBox(28, -28, 28, -18, 0, H, _wallMatB);
    wallBox(18, -28, 18, -24, 0, H, _wallMatB); wallBox(18, -20, 18, -18, 0, H, _wallMatB);
    wallBox(18, -24, 18, -20, 2.8, H, _wallMatB); // lintel over the BE corridor mouth
    roomLight(23, 3.2, -23, 0xffc890, 0.75, true);
    sign('GENERATOR ROOM', 23, 3.0, -18.3, Math.PI, 1.1, { size: 38, color: '#d8a878' });
    makeVent('v4', 'E', 26.4, 0, -20);
    propBox(26.5, 0, -26.5, 1.2, 1.2, 1.2, _floorD);
    propBox(19.2, 0, -26.8, 1.0, 0.9, 1.0, _wallMatC);
    // pipes along south wall (with colliders so the player doesn't clip through)
    const pipeMat = new T.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.5, metalness: 0.7 });
    for (let i = 0; i < 3; i++) {
      const p = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 9.6, 8), pipeMat);
      p.rotation.z = Math.PI / 2;
      p.position.set(23, 1.2 + i * 0.35, -17.6);
      scene().add(p);
      addBoxCollider(18.2, 1.1 + i * 0.35, -17.72, 27.8, 1.32 + i * 0.35, -17.48, false);
    }
  }

  /* ---------- tunnels F + vault G ---------- */
  function buildTunnels() {
    rampFloor(-2, 6, 2, 12, 'z', 6, 12, 0, -3, _floorB);
    wallBox(-2, 6, -2, 12, -3.2, 2.8, _wallMatC);
    wallBox(2, 6, 2, 12, -3.2, 2.8, _wallMatC);
    slab(-2, 6, 2, 12, 2.8, 3.0, _wallMatC, false, true);
    roomLight(0, 2.4, 9, 0xff8844, 0.5, true);

    // tunnels proper
    roomFloor(-10, 12, 10, 32, -3, _floorB);
    wallBox(-10, 12, -10, 32, -3, -0.4, _wallMatC); // west wall — SOLID (was wrongly
    // copy-pasted from the east wall with a phantom hole at z[18,22] that let
    // players walk out under the map and snap to the surface)
    wallBox(10, 12, 10, 18, -3, -0.4, _wallMatC); wallBox(10, 22, 10, 32, -3, -0.4, _wallMatC);
    wallBox(-10, 32, 10, 32, -3, -0.4, _wallMatC);
    // north wall of the tunnel pit (ramp opening x[-2,2] stays open)
    wallBox(-10, 12, -2, 12, -3, -0.4, _wallMatC);
    wallBox(2, 12, 10, 12, -3, -0.4, _wallMatC);
    slab(-10, 12, 10, 32, -0.4, -0.2, _wallMatC, false, true);
    roomLight(0, -0.7, 17, 0xffa050, 0.5, true);
    roomLight(-2, -0.7, 26, 0xffa050, 0.4, true);
    roomLight(6, -0.7, 29, 0x88ff99, 0.4, false);
    sign('MAINTENANCE TUNNELS', 0, -0.8, 13.5, Math.PI, 1.1, { size: 34, color: '#d8a060' });
    makeVent('v1', 'F', -8.8, -3, 19);
    makeVent('v2', 'F', -8.8, -3, 27);
    // supports (along the east side, clear of the nav path down the middle)
    for (const sz of [16, 22, 28]) propBox(4, -3, sz, 0.35, 2.4, 0.35, _wallMatC);
    // pipes
    const pipeMat = new T.MeshStandardMaterial({ color: 0x40423a, roughness: 0.6, metalness: 0.6 });
    for (let i = 0; i < 2; i++) {
      const p = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 19, 8), pipeMat);
      p.rotation.z = Math.PI / 2; // axis along x
      p.position.set(0, -0.8 + i * 0.35, 12.8 + i);
      scene().add(p);
    }

    // FG corridor + vault G
    wallBox(10, 18, 14, 18, -3, -0.2, _wallMatC); wallBox(10, 22, 14, 22, -3, -0.2, _wallMatC);
    roomFloor(10, 18, 14, 22, -3, _floorB);
    roomFloor(14, 16, 24, 26, -3, _floorA);
    slab(14, 16, 24, 26, -0.2, 0, _wallMatC, false, true);
    wallBox(14, 16, 24, 16, -3, -0.2, _wallMatA);
    wallBox(14, 26, 24, 26, -3, -0.2, _wallMatA);
    wallBox(24, 16, 24, 26, -3, -0.2, _wallMatA);
    wallBox(14, 16, 14, 18, -3, -0.2, _wallMatA); wallBox(14, 22, 14, 26, -3, -0.2, _wallMatA);
    roomLight(19, -0.6, 21, 0xb090ff, 0.7, true);
    sign('CONTAINMENT VAULT', 19, -0.7, 16.3, 0, 1.1, { size: 34, color: '#b090ff' });
    propBox(22.8, -3, 24.6, 1.0, 1.4, 1.0, _wallMatC);
  }

  /* ---------- stairwell S + roof R ---------- */
  function buildStairwellAndRoof() {
    const SH = 8.5;
    // stairwell shell
    wallBox(-26, -20, -14, -20, 0, SH, _wallMatB);
    wallBox(-26, -26, -26, -20, 0, SH, _wallMatB);
    wallBox(-26, -26, -14, -26, 0, SH, _wallMatB);
    slab(-26, -26, -14, -20, SH, SH + 0.2, _wallMatB, false, true);
    // ramp (x -14 y0 -> x -26 y5) over z[-24,-20]
    rampFloor(-26, -24, -14, -20, 'x', -26, -14, 5, 0, _wallMatC);
    // solid base under the y5 landing — nobody can fall/walk underneath it,
    // and it blocks AI line-of-sight so zombies route around the corner, not across
    propBox(-20, 0, -25, 12, 4.5, 2, _wallMatB, true);
    // guard along the ramp's north edge, continuous with the block face so
    // there is no pocket to wedge into. It stops 1m short of the lab wall
    // (no visual overlap, roof door stays clear) and its top (5.2) keeps
    // walkers on the landing funnelled through the roof door — the ramp
    // exit is at the high west end (x < -24.74), where they cross over it.
    // The south edge needs nothing — the stairwell's own south wall covers it.
    wallBox(-24.4, -24.1, -15.2, -23.9, 0, 5.2, _wallMatB);
    // landing floor at y5 over z[-26,-24]
    roomFloor(-26, -26, -14, -24, 5, _wallMatC);
    roomLight(-20, 7.6, -22, 0xffffff, 0.7, true);
    // roof slab is over the lab; railings on roof R
    roomFloor(-14, -28, 14, -14, 5, _wallMatC);
    const railMat = new T.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.6, metalness: 0.5 });
    const rail = (x1, z1, x2, z2) => {
      wallBox(x1, z1, x2, z2, 5, 6.1, railMat);
    };
    rail(-14, -28, -14, -26); rail(-14, -24, -14, -14);
    rail(14, -28, 14, -14);
    rail(-14, -28, 14, -28);
    rail(-14, -14, 14, -14);
    // roof props: AC units
    propBox(-6, 5, -24, 2.2, 1.4, 2.2, _wallMatC);
    propBox(6, 5, -18, 1.6, 1.1, 1.6, _wallMatC);
    makeVent('v3', 'R', 10, 5, -16);
    sign('ROOFTOP', -10, 6.4, -27.7, 0, 1.0, { size: 40, color: '#cfd6de' });
    // floodlight on roof aimed at spawn area
    roomLight(0, 6.4, -20, 0x8fb0ff, 0.5, false);
  }

  function propBox(x, y, z, w, h, d, mat, los = true) { // center x,z; y = base height
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    scene().add(m);
    M.raycastStatics.push(m);
    addBoxCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, los);
    // the top of a prop is a standable surface — players who jump onto it
    // land ON it instead of sinking inside the collider and getting stuck
    M.floors.push({ x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2, y: y + h });
    return m;
  }

  /* ---------- navigation ---------- */
  function buildNavGraph() {
    const N = [
      [0, 0, 0], [0, 0, -10], [0, 0, -16], [0, 0, -21], [-12, 0, -21], [12, 0, -21],
      [16, 0, -22], [20.5, 0, -21], [8, 0, 0], [16, 0, 0], [-8, 0, 0], [-14, 0, 0],
      [0, -1.5, 9], [0, -3, 14], [0, -3, 22], [12, -3, 20], [19, -3, 21],
      [-15, 0, -22], [-20, 2.5, -22], [-20, 5, -25], [-12, 5, -25], [0, 5, -19], [10, 5, -21],
      [7, -3, 29],
      [-25.2, 4.6, -22],   // 24: top of the stairwell ramp (west end)
      [-25.3, 5, -24.8],   // 25: landing NW corner (step-up point)
    ];
    M.nodes = N.map(n => ({ x: n[0], y: n[1], z: n[2], adj: [] }));
    M.edges = [];
    const edge = (a, b, door = null) => {
      M.edges.push({ a, b, door });
      M.nodes[a].adj.push({ to: b, door });
      M.nodes[b].adj.push({ to: a, door });
    };
    // topology (door gating added by buildDoors via door.edgeIndex)
    edge(0, 1); edge(1, 2); edge(2, 3); edge(3, 4); edge(3, 5);
    edge(5, 6); edge(6, 7);
    edge(0, 8); edge(8, 9);
    edge(0, 10); edge(10, 11);
    edge(0, 12); edge(12, 13); edge(13, 14);
    edge(14, 15); edge(15, 16);
    edge(14, 23); // tunnels east wing (Stamin-Up area)
    // stairwell: up the ramp, then around the landing corner (never cut across)
    edge(4, 17); edge(17, 18); edge(18, 24); edge(24, 25); edge(25, 19);
    edge(19, 20); edge(20, 21); edge(21, 22);
    M._edgeFn = edge;
  }

  function buildDoors() {
    // (id, name, cost, power, x, z, along, yBase, nodeA, nodeB, roomId, roomsOpen, w, h, signSide)
    const defs = [
      ['d1', 'LABORATORY', 750, false, 0, -6, 'z', 0, 0, 1, 'B', ['AB', 'B'], 4, 2.6, 1, 3.2],
      ['d2', 'WEAPON STORAGE', 1000, false, 6, 0, 'x', 0, 0, 8, 'C', ['AC', 'C'], 2, 2.6, -1, 3.2],
      ['d3', 'MEDICAL BAY', 750, false, -6, 0, 'x', 0, 0, 10, 'D', ['AD', 'D'], 2, 2.6, -1, 3.2],
      ['d4', 'TUNNELS', 500, false, 0, 6, 'z', 0, 0, 12, 'F', ['AF', 'F'], 4, 2.6, -1, 3.2],
      ['pd1', 'GENERATOR', 1250, false, 14, -22, 'x', 0, 5, 6, 'E', ['BE', 'E'], 4, 2.6, -1, 3.8],
      ['d5', 'STAIRWELL', 1250, true, -14, -22, 'x', 0, 4, 17, 'S', ['S'], 2, 2.6, 1, 8.5],
      ['pd3', 'ROOFTOP', 1500, true, -14, -25, 'x', 5, 19, 20, 'R', ['R'], 2, 2.2, -1, 7.2],
      ['pd2', 'CONTAINMENT VAULT', 1000, true, 14, 20, 'x', -3, 15, 16, 'G', ['FG', 'G'], 4, 2.6, -1, -0.2],
    ];
    for (const d of defs) makeDoor(...d);
    // bind doors to nav edges: find edge spanning the two nodes
    for (const door of M.doors) {
      for (const e of M.edges) {
        if ((e.a === door.nodeA && e.b === door.nodeB) || (e.a === door.nodeB && e.b === door.nodeA)) e.door = door;
      }
    }
  }

  /* -------------------------------------------------- runtime API */
  M.floorHeightAt = function (x, z, refY = 5) {
    let best = 0; // outdoor ground
    let bestY = -100;
    for (const f of M.floors) {
      if (x < f.x1 || x > f.x2 || z < f.z1 || z > f.z2) continue;
      let y;
      if (f.axis) {
        const t = f.axis === 'z' ? (z - f.from) / (f.to - f.from) : (x - f.from) / (f.to - f.from);
        y = UP.lerp(f.y0, f.y1, UP.clamp(t, 0, 1));
      } else y = f.y;
      // 1.5m step window: wide enough that a ramp never becomes "invalid"
      // mid-climb (which used to snap players to the outdoor surface inside
      // the tunnel trench), but still excludes elevated slabs like the roof
      // over the lab (5m up) for players on the floor below.
      if (y <= refY + 1.5 && y > bestY) { bestY = y; best = y; }
    }
    return best;
  };

  M.segmentBlocked = function (x1, z1, x2, z2, y1 = 1.5, y2 = 1.5) {
    for (const c of M.losBlockers) if (UP.segHitsAABB3D(x1, y1, z1, x2, y2, z2, c)) return true;
    return false;
  };

  M.nearestNode = function (x, y, z) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < M.nodes.length; i++) {
      const n = M.nodes[i];
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z) + (n.y - y) * (n.y - y) * 3;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  /* BFS path nodeA -> nodeB through open doors. Returns array of node indices or null. */
  M.findPath = function (a, b) {
    if (a === b) return [b];
    const prev = new Array(M.nodes.length).fill(-1);
    const seen = new Array(M.nodes.length).fill(false);
    const q = [a]; seen[a] = true;
    while (q.length) {
      const cur = q.shift();
      for (const e of M.nodes[cur].adj) {
        if (seen[e.to]) continue;
        if (e.door && !e.door.opened) continue;
        seen[e.to] = true; prev[e.to] = cur;
        if (e.to === b) {
          const path = [b];
          let p = b;
          while (prev[p] !== -1) { p = prev[p]; path.unshift(p); }
          return path;
        }
        q.push(e.to);
      }
    }
    return null;
  };

  M.setPower = function (on) {
    M.powerOn = on;
    for (const L of M.lights) {
      L.light.color.setHex(on ? L.colorOn : 0xff2211);
      L.lamp.material.emissive.setHex(on ? L.colorOn : 0xff2211);
    }
    for (const d of M.doors) {
      if (d.needsPower) d.lampMat.emissive.setHex(on ? 0x22ff44 : 0xff2222);
    }
    if (window.UP.Audio && on) { /* surge sound handled by caller */ }
  };

  M.setBlackout = function (on) {
    M.blackout = on;
    for (const L of M.lights) {
      if (!on && M.powerOn) { L.light.color.setHex(L.colorOn); }
      else if (on) { L.light.color.setHex(0xff2211); }
    }
  };

  M.update = function (dt, time) {
    // light flicker
    M.flickerT -= dt;
    const flick = M.flickerT <= 0;
    if (flick) M.flickerT = 0.05 + Math.random() * 0.1;
    for (const L of M.lights) {
      const base = (M.powerOn && !M.blackout) ? L.intensityOn : 0.45;
      if (L.flicker || !M.powerOn || M.blackout) {
        if (flick) L.light.intensity = base * (0.55 + Math.random() * 0.8);
      } else if (Math.abs(L.light.intensity - base) > 0.05) L.light.intensity = UP.damp(L.light.intensity, base, 6, dt);
      else L.light.intensity = base;
      L.lamp.material.emissiveIntensity = 0.3 + L.light.intensity;
    }
    // door animation
    for (const d of M.doors) {
      if (d.dir !== 0) {
        d.anim += d.dir * dt / 0.9;
        const cl = UP.clamp(d.anim, 0, 1);
        d.panel.position.y = d.yBase + d.h / 2 + cl * (d.h + 0.15);
        if (d.anim >= 1) { d.dir = 0; d.anim = 1; }
      }
    }
  };

  M.openDoor = function (door) {
    door.opened = true;
    door.dir = 1;
    const i = M.colliders.indexOf(door.collider);
    if (i >= 0) M.colliders.splice(i, 1);
    const j = M.losBlockers.indexOf(door.collider);
    if (j >= 0) M.losBlockers.splice(j, 1);
    door.lampMat.emissive.setHex(0x22ff44);
    for (const rid of door.roomsOpen) M.rooms[rid].accessible = true;
    if (door.roomId) M.rooms[door.roomId].accessible = true;
  };

  M.resetDynamic = function () {
    for (const d of M.doors) {
      d.opened = false; d.anim = 0; d.dir = 0;
      d.panel.position.y = d.yBase + d.h / 2;
      if (!M.colliders.includes(d.collider)) M.colliders.push(d.collider);
      if (!M.losBlockers.includes(d.collider)) M.losBlockers.push(d.collider);
      d.lampMat.emissive.setHex(d.needsPower ? 0xff2222 : 0x886622);
    }
    for (const w of M.windows) {
      w.count = 5; w.queue = 0;
      for (const p of w.planks) {
        p.broken = false;
        p.mesh.visible = true;
        p.mesh.position.set(p.homeX, p.homeY, p.homeZ);
        p.mesh.rotation.set(0, 0, (Math.random() - 0.5) * 0.12);
      }
    }
    for (const id in M.rooms) M.rooms[id].accessible = (id === 'A');
    M.powerOn = false;
    M.blackout = false;
    M.setPower(false);
  };

  window.UP.Map = M;
})();
