/* UNDEAD PROTOCOL — audio.js
   Fully procedural WebAudio engine. Every sound (gunshots, groans, ambience,
   UI, machines) is synthesized — no audio files. Spatial audio via PannerNodes. */
'use strict';
window.UP = window.UP || {};
(function () {
  const A = {
    ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
    _groans: 0, _amb: null,

    init() {
      if (A.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        A.ctx = new AC();
        A.master = A.ctx.createGain();
        A.master.connect(A.ctx.destination);
        A.sfx = A.ctx.createGain(); A.sfx.connect(A.master);
        A.music = A.ctx.createGain(); A.music.connect(A.master);
        // shared noise buffer (2s white noise)
        const len = A.ctx.sampleRate * 2;
        A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
        const d = A.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        A.applyVolumes();
      } catch (e) { console.warn('Audio unavailable:', e); }
    },
    resume() { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); },
    ok() { return !!A.ctx; },
    now() { return A.ctx.currentTime; },
    applyVolumes() {
      const s = UP.Settings.values;
      if (!A.ctx) return;
      A.master.gain.value = s.master;
      A.sfx.gain.value = s.sfx;
      A.music.gain.value = s.music;
    },

    /* Spatial panner. Returns {input, connect()} or a passthrough. */
    _spatial(pos, bus) {
      if (!pos) return bus;
      const p = A.ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'exponential';
      p.refDistance = 3; p.rolloffFactor = 1.4; p.maxDistance = 70;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      p.connect(bus);
      return p;
    },
    updateListener(pos, fwd) {
      if (!A.ctx) return;
      const l = A.ctx.listener;
      const t = A.now();
      try {
        if (l.positionX) {
          l.positionX.linearRampToValueAtTime(pos.x, t); l.positionY.linearRampToValueAtTime(pos.y, t);
          l.positionZ.linearRampToValueAtTime(pos.z, t);
          if (l.forwardX) {
            l.forwardX.linearRampToValueAtTime(fwd.x, t); l.forwardY.linearRampToValueAtTime(fwd.y, t);
            l.forwardZ.linearRampToValueAtTime(fwd.z, t);
            l.upX && (l.upX.value = 0, l.upY.value = 1, l.upZ.value = 0);
          }
        } else {
          l.setPosition(pos.x, pos.y, pos.z);
          l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
        }
      } catch (e) { /* Safari quirks */ }
    },

    /* ---------------- primitives ---------------- */
    noise({ dur = 0.1, freq = 1200, q = 1, type = 'lowpass', gain = 0.5,
             pos = null, attack = 0.002, rate = 1, delay = 0, slide = 0, music = false }) {
      if (!A.ctx) return;
      const t0 = A.now() + delay;
      const src = A.ctx.createBufferSource();
      src.buffer = A.noiseBuf; src.playbackRate.value = rate;
      src.loop = true;
      const f = A.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g);
      g.connect(A._spatial(pos, music ? A.music : A.sfx));
      src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
    },
    tone({ freq = 440, end = 0, dur = 0.2, type = 'sine', gain = 0.3,
           pos = null, attack = 0.004, delay = 0, music = false, detune = 0 }) {
      if (!A.ctx) return;
      const t0 = A.now() + delay;
      const o = A.ctx.createOscillator();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (detune) o.detune.value = detune;
      if (end > 0) o.frequency.exponentialRampToValueAtTime(end, t0 + dur);
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(A._spatial(pos, music ? A.music : A.sfx));
      o.start(t0); o.stop(t0 + dur + 0.05);
    },

    /* ---------------- weapons ---------------- */
    shoot(kind) {
      if (!A.ctx) return;
      const P = {
        pistol:  { f: 2400, d: 0.14, g: 0.55, th: 0.25, rate: 1.4 },
        smg:     { f: 2800, d: 0.10, g: 0.42, th: 0.16, rate: 1.7 },
        rifle:   { f: 2200, d: 0.16, g: 0.62, th: 0.30, rate: 1.0 },
        shotgun: { f: 1100, d: 0.30, g: 0.85, th: 0.55, rate: 0.7 },
        sniper:  { f: 900,  d: 0.40, g: 0.9,  th: 0.6,  rate: 0.55 },
        lmg:     { f: 1700, d: 0.15, g: 0.66, th: 0.34, rate: 0.9 },
        dmr:     { f: 2000, d: 0.22, g: 0.7,  th: 0.4,  rate: 0.85 },
        energy:  { energy: true },
        launcher:{ f: 500, d: 0.5, g: 1.0, th: 0.7, rate: 0.5 },
      }[kind] || {};
      if (P.energy) {
        A.tone({ freq: 1400, end: 180, dur: 0.22, type: 'sawtooth', gain: 0.4 });
        A.tone({ freq: 2200, end: 400, dur: 0.14, type: 'square', gain: 0.14 });
        A.noise({ dur: 0.08, freq: 5000, type: 'highpass', gain: 0.12 });
        return;
      }
      A.noise({ dur: P.d, freq: P.f, gain: P.g, rate: P.rate, q: 0.8 });
      A.noise({ dur: P.d * 2.2, freq: 350, gain: P.g * 0.4, rate: 0.8 });
      A.tone({ freq: 120, end: 45, dur: P.th * 0.5, type: 'triangle', gain: P.th });
      A.noise({ dur: 0.03, freq: 6000, type: 'highpass', gain: 0.12 }); // mech action
    },
    dry() { A.noise({ dur: 0.04, freq: 3200, type: 'highpass', gain: 0.2 }); },
    reload(kind) {
      const n = kind === 'shotgun' ? 3 : kind === 'sniper' ? 3 : 2;
      for (let i = 0; i < n; i++)
        A.noise({ dur: 0.05, freq: 2400 + Math.random() * 1600, type: 'bandpass', q: 3,
                  gain: 0.22, delay: 0.12 + i * 0.22 });
      A.noise({ dur: 0.06, freq: 1800, type: 'bandpass', q: 4, gain: 0.3, delay: 0.12 + n * 0.22 });
    },
    weaponSwitch() { A.noise({ dur: 0.06, freq: 2000, type: 'bandpass', q: 3, gain: 0.2 }); },

    /* ---------------- zombies ---------------- */
    groan(pos) {
      if (!A.ctx || A._groans >= 4) return;
      A._groans++;
      setTimeout(() => A._groans--, 900);
      const f0 = 55 + Math.random() * 45;
      const t0 = A.now();
      const o = A.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t0);
      // wobbling pitch — the "voice"
      o.frequency.setValueAtTime(f0 * (0.8 + Math.random() * 0.5), t0 + 0.25);
      o.frequency.setValueAtTime(f0 * (0.65 + Math.random() * 0.4), t0 + 0.6);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + 1.1);
      const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2;
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.18);
      g.gain.setValueAtTime(0.28, t0 + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
      o.connect(f); f.connect(g); g.connect(A._spatial(pos, A.sfx));
      o.start(t0); o.stop(t0 + 1.25);
    },
    zStep(pos) { A.noise({ dur: 0.07, freq: 240, gain: 0.16, rate: 0.6, pos }); },
    zAttack(pos) {
      A.noise({ dur: 0.16, freq: 900, type: 'bandpass', q: 1.5, gain: 0.35, pos });
      A.tone({ freq: 200, end: 90, dur: 0.15, type: 'sawtooth', gain: 0.12, pos });
    },
    zDie(pos) {
      A.tone({ freq: 110, end: 35, dur: 0.5, type: 'sawtooth', gain: 0.22, pos });
      A.noise({ dur: 0.3, freq: 500, gain: 0.18, pos, rate: 0.7 });
    },
    zHit(pos) { A.noise({ dur: 0.09, freq: 700, type: 'bandpass', q: 2, gain: 0.28, pos }); },
    exploderBeep(pos) { for (let i = 0; i < 3; i++) A.tone({ freq: 1200, dur: 0.07, type: 'square', gain: 0.16, pos, delay: i * 0.16 }); },
    explosion(pos, big = false) {
      A.noise({ dur: big ? 1.0 : 0.55, freq: 140, gain: big ? 1.0 : 0.7, rate: 0.5, pos });
      A.tone({ freq: 90, end: 28, dur: 0.5, type: 'triangle', gain: 0.7, pos });
      A.noise({ dur: 0.2, freq: 3000, type: 'highpass', gain: 0.3, pos, delay: 0.02 });
    },
    bossRoar(pos) {
      A.tone({ freq: 60, end: 30, dur: 1.6, type: 'sawtooth', gain: 0.8, pos, detune: 30 });
      A.tone({ freq: 44, end: 24, dur: 1.8, type: 'sawtooth', gain: 0.7, pos, detune: -40 });
      A.noise({ dur: 1.4, freq: 300, gain: 0.5, rate: 0.4, pos });
      A.tone({ freq: 200, end: 60, dur: 0.5, type: 'square', gain: 0.25, pos, delay: 0.2 });
    },

    /* ---------------- player ---------------- */
    step(sprint) { A.noise({ dur: 0.05, freq: sprint ? 380 : 300, gain: sprint ? 0.16 : 0.09, rate: 0.7 }); },
    jump() { A.noise({ dur: 0.06, freq: 500, gain: 0.1, rate: 0.8 }); },
    land() { A.noise({ dur: 0.09, freq: 200, gain: 0.2, rate: 0.6 }); },
    hurt() { A.tone({ freq: 180, end: 70, dur: 0.22, type: 'triangle', gain: 0.45 }); A.noise({ dur: 0.12, freq: 400, gain: 0.2 }); },
    heal() { A.tone({ freq: 500, end: 900, dur: 0.35, type: 'sine', gain: 0.2 }); },

    /* ---------------- UI / world machines ---------------- */
    ui() { A.tone({ freq: 800, dur: 0.05, type: 'square', gain: 0.06 }); },
    purchase() {
      A.tone({ freq: 880, dur: 0.09, type: 'square', gain: 0.18 });
      A.tone({ freq: 1318, dur: 0.14, type: 'square', gain: 0.16, delay: 0.09 });
      A.noise({ dur: 0.04, freq: 5000, type: 'highpass', gain: 0.1, delay: 0.02 });
    },
    deny() { A.tone({ freq: 160, dur: 0.12, type: 'square', gain: 0.22 }); A.tone({ freq: 120, dur: 0.16, type: 'square', gain: 0.22, delay: 0.13 }); },
    door(pos) { A.noise({ dur: 0.5, freq: 300, gain: 0.4, pos, slide: 2200 }); A.noise({ dur: 0.14, freq: 90, gain: 0.5, pos, delay: 0.55 }); },
    plank(pos) { A.noise({ dur: 0.07, freq: 800, type: 'bandpass', q: 2, gain: 0.4, pos }); A.noise({ dur: 0.06, freq: 600, type: 'bandpass', q: 2, gain: 0.3, pos, delay: 0.12 }); },
    plankBreak(pos) { A.noise({ dur: 0.2, freq: 1400, type: 'bandpass', q: 1.2, gain: 0.5, pos }); A.tone({ freq: 220, end: 80, dur: 0.15, type: 'triangle', gain: 0.25, pos }); },
    generator(pos) {
      A.tone({ freq: 45, end: 110, dur: 1.6, type: 'sawtooth', gain: 0.5, pos });
      A.noise({ dur: 1.2, freq: 900, gain: 0.2, pos, slide: 4000 });
      for (let i = 0; i < 3; i++) A.noise({ dur: 0.08, freq: 2500, type: 'bandpass', q: 4, gain: 0.25, pos, delay: 1.3 + i * 0.25 });
      A.tone({ freq: 120, dur: 0.3, type: 'triangle', gain: 0.4, delay: 1.7 });
    },
    perkJingle(idx) {
      const melodies = [[392, 523, 659, 784], [523, 659, 784, 1046], [440, 587, 659, 880],
        [659, 784, 988, 1318], [349, 466, 523, 698], [587, 740, 880, 1174], [330, 392, 494, 587], [466, 587, 698, 932]];
      (melodies[idx % 8] || melodies[0]).forEach((f, i) => {
        A.tone({ freq: f, dur: 0.14, type: 'square', gain: 0.12, delay: i * 0.11 });
        A.tone({ freq: f * 2, dur: 0.1, type: 'sine', gain: 0.06, delay: i * 0.11 });
      });
    },
    papDone() {
      A.tone({ freq: 200, end: 800, dur: 0.5, type: 'sawtooth', gain: 0.25 });
      A.noise({ dur: 0.4, freq: 4000, type: 'highpass', gain: 0.15, delay: 0.1 });
      A.tone({ freq: 1200, dur: 0.25, type: 'square', gain: 0.12, delay: 0.5 });
    },
    papWork() { A.tone({ freq: 90, end: 300, dur: 2.2, type: 'sawtooth', gain: 0.25 }); A.noise({ dur: 2.0, freq: 2400, type: 'bandpass', q: 2, gain: 0.12 }); },
    boxOpen() {
      A.tone({ freq: 260, end: 90, dur: 0.7, type: 'sawtooth', gain: 0.2 });
      for (let i = 0; i < 6; i++) A.tone({ freq: 900 + Math.random() * 2200, dur: 0.3, type: 'sine', gain: 0.06, delay: 0.3 + i * 0.35 });
    },
    boxTick() { A.tone({ freq: 1000 + Math.random() * 900, dur: 0.04, type: 'square', gain: 0.08 }); },
    boxRare() { [880, 1108, 1318, 1760, 2217].forEach((f, i) => A.tone({ freq: f, dur: 0.3, type: 'sine', gain: 0.14, delay: i * 0.1 })); },
    boxMoved() { A.tone({ freq: 500, end: 1500, dur: 0.8, type: 'sine', gain: 0.15 }); A.noise({ dur: 0.4, freq: 2000, gain: 0.1, delay: 0.3 }); },

    /* ---------------- game flow ---------------- */
    roundStart() {
      A.tone({ freq: 55, dur: 1.7, type: 'sawtooth', gain: 0.5, detune: 12 });
      A.tone({ freq: 55.8, dur: 1.7, type: 'sawtooth', gain: 0.45, detune: -12 });
      A.tone({ freq: 110, dur: 1.2, type: 'triangle', gain: 0.25, delay: 0.25 });
      A.noise({ dur: 1.4, freq: 220, gain: 0.2, rate: 0.5 });
    },
    roundClear() { [523, 659, 784].forEach((f, i) => A.tone({ freq: f, dur: 0.25, type: 'sine', gain: 0.16, delay: i * 0.13 })); },
    powerupPick(kind) {
      const map = { INSTA: [1046, 1318, 1568], DOUBLE: [784, 1046, 1318], MAXAMMO: [659, 880, 1046],
        NUKE: [110, 165, 220], HEALTH: [880, 1108, 1318], FIRE: [587, 740, 880], CARPENTER: [523, 698, 880] };
      (map[kind] || map.HEALTH).forEach((f, i) => A.tone({ freq: f, dur: 0.18, type: 'square', gain: 0.16, delay: i * 0.09 }));
      A.noise({ dur: 0.25, freq: 5000, type: 'highpass', gain: 0.08 });
    },
    powerupDrop() { A.tone({ freq: 400, end: 900, dur: 0.4, type: 'sine', gain: 0.15 }); },
    nuke() { A.tone({ freq: 70, end: 25, dur: 1.6, type: 'triangle', gain: 0.8 }); A.noise({ dur: 1.3, freq: 180, gain: 0.6, rate: 0.5 }); },
    instaSting() { A.tone({ freq: 1568, end: 392, dur: 0.6, type: 'sawtooth', gain: 0.2 }); },
    eventAlarm() { for (let i = 0; i < 2; i++) { A.tone({ freq: 620, dur: 0.18, type: 'square', gain: 0.14, delay: i * 0.28 }); A.tone({ freq: 470, dur: 0.18, type: 'square', gain: 0.14, delay: i * 0.28 + 0.14 }); } },
    hitTick(head) {
      A.tone({ freq: head ? 1600 : 2100, dur: 0.035, type: 'square', gain: head ? 0.12 : 0.07 });
    },

    /* ---------------- ambience ---------------- */
    startAmbience() {
      if (!A.ctx || A._amb) return;
      const t0 = A.now();
      // wind
      const wind = A.ctx.createBufferSource();
      wind.buffer = A.noiseBuf; wind.loop = true; wind.playbackRate.value = 0.35;
      const wf = A.ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.6;
      const wg = A.ctx.createGain(); wg.gain.value = 0.05;
      const lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = A.ctx.createGain(); lg.gain.value = 0.035;
      lfo.connect(lg); lg.connect(wg.gain);
      wind.connect(wf); wf.connect(wg); wg.connect(A.music);
      wind.start(t0); lfo.start(t0);
      // low drone
      const d1 = A.ctx.createOscillator(); d1.type = 'sine'; d1.frequency.value = 52.3;
      const d2 = A.ctx.createOscillator(); d2.type = 'sine'; d2.frequency.value = 52.9; d2.detune.value = 6;
      const dg = A.ctx.createGain(); dg.gain.value = 0.035;
      d1.connect(dg); d2.connect(dg); dg.connect(A.music);
      d1.start(t0); d2.start(t0);
      // scheduled distant moans
      A._amb = { wind, lfo, d1, d2, moanTimer: 6 };
    },
    stopAmbience() {
      if (!A._amb) return;
      try {
        A._amb.wind.stop(); A._amb.lfo.stop(); A._amb.d1.stop(); A._amb.d2.stop();
      } catch (e) {}
      A._amb = null;
    },
    /* called each frame with dt: distant sounds + tension by round */
    updateAmbience(dt, round) {
      if (!A._amb) return;
      A._amb.moanTimer -= dt;
      if (A._amb.moanTimer <= 0) {
        A._amb.moanTimer = 7 + Math.random() * 14;
        const p = { x: UP.rand(-40, 40), y: 2, z: UP.rand(-40, 40) };
        A.noise({ dur: 1.8, freq: 300, gain: 0.06, rate: 0.5, pos: p });
      }
    },
  };
  window.UP.Audio = A;
})();
