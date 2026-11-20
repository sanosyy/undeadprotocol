/* UNDEAD PROTOCOL — utils.js
   Helpers: math, RNG, procedural canvas textures, text signs, pooling. */
'use strict';
window.UP = window.UP || {};
const UP = window.UP;

UP.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
UP.lerp  = (a, b, t) => a + (b - a) * t;
UP.damp  = (a, b, lam, dt) => UP.lerp(a, b, 1 - Math.exp(-lam * dt));
UP.rand  = (a = 1, b) => (b === undefined) ? Math.random() * a : a + Math.random() * (b - a);
UP.randInt = (a, b) => Math.floor(UP.rand(a, b + 1));
UP.choice = (arr) => arr[(Math.random() * arr.length) | 0];
UP.dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
UP.fmtTime = (s) => { s = Math.max(0, s | 0); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };

/* Weighted choice: entries [[item, weight], ...] */
UP.weightedChoice = (entries) => {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = Math.random() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
};

/* ------------------------------------------------------------------ */
/* AABB collision helpers. Box = {x1,y1,z1, x2,y2,z2}                    */
UP.boxOverlap = (a, b) =>
  a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1 && a.z1 < b.z2 && a.z2 > b.z1;

/* 2D segment vs AABB (x/z plane) — used for simple ground checks. */
UP.segHitsAABB = (x1, z1, x2, z2, b) => {
  // Quick accept/reject
  if (Math.max(x1, x2) < b.x1 || Math.min(x1, x2) > b.x2) return false;
  if (Math.max(z1, z2) < b.z1 || Math.min(z1, z2) > b.z2) return false;
  const dx = x2 - x1, dz = z2 - z1;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else       { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, x1 - b.x1) && clip(dx, b.x2 - x1) &&
         clip(-dz, z1 - b.z1) && clip(dz, b.z2 - z1) && t0 <= t1;
};

/* 3D segment vs AABB — Liang-Barsky over all three axes. Eye-height aware,
   so props below a walkway (e.g. the lab bench under the roof) no longer
   falsely block sight between characters standing above them. */
UP.segHitsAABB3D = (x1, y1, z1, x2, y2, z2, b) => {
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else       { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-(x2 - x1), x1 - b.x1) && clip(x2 - x1, b.x2 - x1) &&
         clip(-(y2 - y1), y1 - b.y1) && clip(y2 - y1, b.y2 - y1) &&
         clip(-(z2 - z1), z1 - b.z1) && clip(z2 - z1, b.z2 - z1) && t0 <= t1;
};

/* ------------------------------------------------------------------ */
/* Procedural textures (canvas) — no external assets.                   */
const _texCache = new Map();

function _canvas(w, h, painter) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  painter(ctx, w, h);
  return cv;
}

function _finish(cv, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}

/* Speckled grunge base used by most surfaces. */
function _grunge(ctx, w, h, base, dark, light, density) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * density; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = Math.random() * 2 + 0.4;
    ctx.fillStyle = Math.random() < 0.5 ? dark : light;
    ctx.globalAlpha = Math.random() * 0.22;
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;
  // grime streaks
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * w;
    ctx.globalAlpha = 0.05 + Math.random() * 0.07;
    ctx.fillStyle = dark;
    ctx.fillRect(x, Math.random() * h * 0.5, 2 + Math.random() * 8, h);
  }
  ctx.globalAlpha = 1;
}

UP.Tex = {
  concrete(rx = 4, ry = 2) {
    const key = `con|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(256, 256, (c, w, h) => {
      _grunge(c, w, h, '#4a4d50', '#26282a', '#6a6e72', 0.03);
      // cracks
      c.strokeStyle = 'rgba(20,20,22,.6)'; c.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        let x = Math.random() * w, y = Math.random() * h;
        c.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += (Math.random() - .5) * 40; y += Math.random() * 25; c.lineTo(x, y); }
        c.stroke();
      }
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
  wallPanel(rx = 3, ry = 1) {
    const key = `wp|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(256, 256, (c, w, h) => {
      _grunge(c, w, h, '#3d4348', '#1c1f22', '#565d63', 0.025);
      c.strokeStyle = 'rgba(15,17,19,.8)'; c.lineWidth = 3;
      for (let y = 0; y <= h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      for (let x = 0; x <= w; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      // rivets
      c.fillStyle = 'rgba(20,22,25,.9)';
      for (let y = 8; y < h; y += 64) for (let x = 8; x < w; x += 128) c.fillRect(x, y, 3, 3);
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
  labTile(rx = 6, ry = 6) {
    const key = `lt|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(256, 256, (c, w, h) => {
      _grunge(c, w, h, '#5a6067', '#33383d', '#788087', 0.02);
      c.strokeStyle = 'rgba(25,28,31,.85)'; c.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke();
        c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke();
      }
      // stains
      c.fillStyle = 'rgba(40,50,30,.25)';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.ellipse(Math.random() * w, Math.random() * h, Math.random() * 30 + 8, Math.random() * 18 + 4, Math.random() * 3, 0, 7);
        c.fill();
      }
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
  metal(rx = 2, ry = 2) {
    const key = `mt|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(128, 128, (c, w, h) => {
      _grunge(c, w, h, '#474e55', '#20252a', '#666f78', 0.02);
      for (let i = 0; i < 20; i++) { // scratches
        c.strokeStyle = `rgba(120,130,140,${Math.random() * .25})`;
        c.beginPath();
        const x = Math.random() * w, y = Math.random() * h;
        c.moveTo(x, y); c.lineTo(x + Math.random() * 40 - 20, y + Math.random() * 10 - 5);
        c.stroke();
      }
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
  rust(rx = 1, ry = 1) {
    const key = `rt|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(128, 128, (c, w, h) => {
      _grunge(c, w, h, '#4d3a28', '#2a1e12', '#6e5236', 0.05);
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
  wood(rx = 1, ry = 1) {
    const key = `wd|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(128, 128, (c, w, h) => {
      _grunge(c, w, h, '#6b543a', '#3d2f1e', '#8a7050', 0.02);
      c.strokeStyle = 'rgba(50,38,24,.5)';
      for (let i = 0; i < 9; i++) {
        c.lineWidth = 1 + Math.random() * 2;
        c.beginPath();
        const y = (i + Math.random() * .5) * h / 9;
        c.moveTo(0, y); c.bezierCurveTo(w * .3, y + 6, w * .6, y - 6, w, y + 2);
        c.stroke();
      }
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
  grass(rx = 40, ry = 40) {
    const key = `gr|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(256, 256, (c, w, h) => {
      _grunge(c, w, h, '#1a2617', '#0c130b', '#2b3a24', 0.06);
      for (let i = 0; i < 400; i++) { // grass blades
        const x = Math.random() * w, y = Math.random() * h;
        c.strokeStyle = `rgba(${40 + Math.random() * 40 | 0},${60 + Math.random() * 50 | 0},30,.5)`;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.random() * 3 - 1.5, y - 4 - Math.random() * 4); c.stroke();
      }
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
  hazard(rx = 4, ry = 1) {
    const key = `hz|${rx}|${ry}`;
    if (_texCache.has(key)) return _texCache.get(key);
    const cv = _canvas(128, 128, (c, w, h) => {
      c.fillStyle = '#b5a323'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#191919';
      for (let i = -2; i < 8; i++) {
        c.save(); c.translate(i * 32, 0); c.rotate(-0.5);
        c.fillRect(0, -20, 16, h + 60); c.restore();
      }
      c.globalAlpha = .25; c.fillStyle = '#000';
      for (let i = 0; i < 300; i++) c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      c.globalAlpha = 1;
    });
    const t = _finish(cv, rx, ry); _texCache.set(key, t); return t;
  },
};

/* Text sign texture. opts: {color, bg, size, font, align, glow} */
UP.Tex.text = (lines, opts = {}) => {
  const o = Object.assign({ color: '#ffd76a', bg: 'rgba(10,12,15,.92)', font: 'Impact',
    size: 48, glow: '#ffd76a', align: 'center' }, opts);
  const arr = Array.isArray(lines) ? lines : [lines];
  const w = 512, h = 64 + arr.length * o.size * 1.15;
  const cv = _canvas(w, h, (c) => {
    if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, w, h); }
    c.textAlign = o.align; c.textBaseline = 'middle';
    arr.forEach((ln, i) => {
      c.font = `${o.size}px "${o.font}", Arial`;
      c.shadowColor = o.glow; c.shadowBlur = 18;
      c.fillStyle = o.color;
      c.fillText(ln, w / 2, 32 + i * o.size * 1.15 + o.size / 2, w - 24);
    });
  });
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
};

/* ------------------------------------------------------------------ */
/* Generic object pool. */
UP.Pool = class {
  constructor(n, factory) {
    this.items = [];
    for (let i = 0; i < n; i++) this.items.push({ obj: factory(), free: true });
  }
  get() {
    for (const it of this.items) if (it.free) { it.free = false; return it.obj; }
    const it = { obj: null, free: false };
    it.obj = this._extra ? this._extra() : null;
    if (!it.obj) { it.free = true; return null; }
    this.items.push(it);
    return it.obj;
  }
  release(o) {
    for (const it of this.items) if (it.obj === o) { it.free = true; return; }
  }
  setOverflowFactory(f) { this._extra = f; }
};
