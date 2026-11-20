/* UNDEAD PROTOCOL — main.js
   Bootstrap: renderer, scene, camera, menu wiring, settings, pause,
   quality presets, error handling, main loop. */
'use strict';
(function () {
  const Main = {
    renderer: null, scene: null, camera: null,
    clock: null,
  };
  window.UP = window.UP || {};
  window.UP.Main = Main;
  // exposed for diagnostics
  Main._webglProbe = () => webglProbe();
  Main._createRenderer = createRenderer;

  function fail(msg, title = 'ERROR') {
    const ov = document.getElementById('err-overlay');
    const txt = document.getElementById('err-text');
    ov.hidden = false;
    txt.textContent = String(msg);
    ov.querySelector('h2').textContent = title;
    document.getElementById('loading').hidden = true;
  }
  window.addEventListener('error', (e) => {
    // only surface errors after load (initial boot has its own handler)
    if (Main._booted) fail(e.message + '\n' + (e.filename || '') + ':' + (e.lineno || ''));
  });

  /* Is WebGL available at all in this browser? */
  function webglProbe() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* Create the renderer, falling back through attribute combos that some
     GPU drivers reject (antialias / power hints are the usual culprits). */
  function createRenderer(canvas) {
    const attempts = [
      { antialias: true, powerPreference: 'high-performance' },
      { antialias: false, powerPreference: 'high-performance' },
      { antialias: false, powerPreference: 'default' },
    ];
    let lastErr = null;
    for (const opts of attempts) {
      try { return new THREE.WebGLRenderer(Object.assign({ canvas }, opts)); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Error creating WebGL context.');
  }

  const WEBGL_HELP = [
    'YOUR BROWSER COULD NOT CREATE A 3D (WEBGL) CONTEXT.',
    '',
    'Most common fixes:',
    '  1. Enable hardware acceleration, then fully restart the browser',
    '     (Chrome/Edge: Settings > System > "Use graphics acceleration when available")',
    '  2. Make sure WebGL is not blocked:',
    '     (Chrome: open chrome://gpu - WebGL should say "Hardware accelerated";',
    '      Firefox: about:config -> webgl.disabled must be false)',
    '  3. Update your graphics drivers',
    '  4. Try another desktop browser (Chrome, Edge or Firefox)',
    '',
    'Technical detail:',
  ].join('\n');

  function boot() {
    if (!window.THREE) { fail('Three.js failed to load. Check your internet connection or js/vendor/three.min.js.'); return; }
    try {
      const canvas = document.getElementById('c');
      Main.renderer = createRenderer(canvas);
      Main.renderer.outputEncoding = THREE.sRGBEncoding;
      Main.renderer.shadowMap.enabled = true;
      Main.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      Main.renderer.setSize(window.innerWidth, window.innerHeight);

      Main.scene = new THREE.Scene();
      Main.camera = new THREE.PerspectiveCamera(UP.Settings.values.fov, window.innerWidth / window.innerHeight, 0.08, 320);
      Main.scene.add(Main.camera); // so weapon view-models (children of camera) render

      UP.Settings.load();
      UP.Settings.save(); // persist defaults on first boot
      UP.HUD.init();
      UP.Map.build(Main.scene);
      UP.Machines.build(Main.scene);
      UP.Zombies.init(Main.scene);
      UP.Powerups.init(Main.scene);
      UP.Player.init(Main.camera, Main.scene);
      UP.Game.init();
      applyQuality(UP.Settings.values.quality);
      bindMenus();
      bindSettings();

      // if the GPU driver drops the context mid-game, show why instead of a black screen
      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();
        fail('The graphics driver dropped the 3D context (GPU reset or memory pressure).\nReload the page to keep playing.', 'GRAPHICS CONTEXT LOST');
      });

      window.addEventListener('resize', () => {
        Main.camera.aspect = window.innerWidth / window.innerHeight;
        Main.camera.updateProjectionMatrix();
        Main.renderer.setSize(window.innerWidth, window.innerHeight);
      });

      // menu idle camera drift
      UP.Player.pos.set(0, 0, 2);
      UP.Player.yaw = Math.PI * 0.85;

      document.getElementById('loading').hidden = true;
      refreshBestStats();
      Main.clock = new THREE.Clock();
      Main._booted = true;
      requestAnimationFrame(loop);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/webgl|3d context/i.test(msg) || !webglProbe()) {
        fail(WEBGL_HELP + '\n' + (e.stack || msg), 'COULD NOT START 3D');
      } else {
        fail(e.stack || e.message);
      }
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    let dt = Main.clock.getDelta();
    if (dt > 0.05) dt = 0.05; // avoid huge steps after tab switch
    try {
      UP.Game.update(dt);
      // menu idle drift
      if (UP.Game.state === 'menu') {
        UP.Player.yaw += dt * 0.05;
        UP.Player.camera.position.set(Math.sin(UP.Player.yaw) * 0.5, 1.66, 2 + Math.cos(UP.Player.yaw) * 0.3);
        UP.Player.camera.rotation.set(0, 0, 0);
        UP.Player.camera.rotateY(UP.Player.yaw);
        UP.Player.camera.rotateX(-0.02);
      }
      Main.renderer.render(Main.scene, Main.camera);
    } catch (e) {
      // non-fatal: surface the first error, keep the loop alive
      if (!Main._errShown) { Main._errShown = true; fail(e.stack || e.message); }
    }
  }

  /* ---------------- quality ---------------- */
  function applyQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') {
      Main.renderer.setPixelRatio(Math.min(dpr, 0.8));
      Main.renderer.shadowMap.enabled = false;
      UP.Game.aliveCap = 13;
    } else if (q === 'high') {
      Main.renderer.setPixelRatio(Math.min(dpr, 2));
      Main.renderer.shadowMap.enabled = true;
      UP.Game.aliveCap = 26;
    } else {
      Main.renderer.setPixelRatio(Math.min(dpr, 1.25));
      Main.renderer.shadowMap.enabled = true;
      UP.Game.aliveCap = 19;
    }
    if (UP.Map.moonLight) UP.Map.moonLight.castShadow = Main.renderer.shadowMap.enabled;
  }

  /* ---------------- menus ---------------- */
  const $ = id => document.getElementById(id);

  function showMenu(id) {
    $('menu-root').hidden = false;
    for (const m of ['main-menu', 'settings-menu', 'pause-menu', 'gameover-menu']) $(m).hidden = (m !== id);
  }
  function hideMenus() { $('menu-root').hidden = true; }

  function refreshBestStats() {
    const b = UP.Settings.best;
    const el = $('beststats');
    if (b.round > 0) {
      el.textContent = `BEST — ROUND ${b.round} · ${b.kills} KILLS · ${UP.fmtTime(b.time)}`;
    } else {
      el.textContent = '';
    }
  }

  let settingsReturn = 'main-menu';

  function bindMenus() {
    const G = UP.Game;
    $('btn-play').addEventListener('click', () => {
      UP.Audio.init(); UP.Audio.resume();
      hideMenus();
      UP.HUD.show(true);
      G.start();
      lockPointer();
    });
    $('btn-settings').addEventListener('click', () => {
      settingsReturn = 'main-menu';
      showMenu('settings-menu');
      UP.Audio.init(); UP.Audio.resume(); UP.Audio.ui();
    });
    $('btn-credits').addEventListener('click', () => {
      const c = $('credits');
      c.hidden = !c.hidden;
      UP.Audio.init(); UP.Audio.resume(); UP.Audio.ui();
    });

    $('btn-set-back').addEventListener('click', () => {
      UP.Settings.save();
      UP.Audio.applyVolumes();
      if (settingsReturn === 'pause-menu') showMenu('pause-menu');
      else { refreshBestStats(); showMenu('main-menu'); }
      UP.Audio.ui();
    });

    $('btn-resume').addEventListener('click', () => { UP.Audio.ui(); lockPointer(); });
    $('btn-psettings').addEventListener('click', () => {
      settingsReturn = 'pause-menu';
      showMenu('settings-menu');
      UP.Audio.ui();
    });
    $('btn-restart').addEventListener('click', () => {
      UP.Audio.ui();
      hideMenus();
      UP.HUD.show(true);
      UP.HUD.show(true);
      G.start();
      lockPointer();
    });
    $('btn-quit').addEventListener('click', () => {
      UP.Audio.ui();
      UP.Audio.stopAmbience();
      G.state = 'menu';
      UP.Zombies.clear();
      UP.Powerups.clear();
      UP.HUD.show(false);
      refreshBestStats();
      showMenu('main-menu');
    });

    $('btn-again').addEventListener('click', () => {
      UP.Audio.init(); UP.Audio.resume(); UP.Audio.ui();
      hideMenus();
      UP.HUD.show(true);
      G.start();
      lockPointer();
    });
    $('btn-gomenu').addEventListener('click', () => {
      UP.Audio.ui();
      G.state = 'menu';
      refreshBestStats();
      showMenu('main-menu');
    });

    // pause when pointer lock is lost (Esc)
    document.addEventListener('pointerlockchange', () => {
      const canvas = $('c');
      if (document.pointerLockElement === canvas) {
        if (G.state === 'paused') {
          G.state = G._pausedFrom || 'playing';
          hideMenus();
        }
      } else if (G.state === 'playing' || G.state === 'intermission') {
        G._pausedFrom = G.state;
        G.state = 'paused';
        showMenu('pause-menu');
      }
    });

    // click on canvas resumes from pause OR re-locks if lock was lost
    $('c').addEventListener('click', () => {
      if (G.state === 'paused' || G.state === 'playing' || G.state === 'intermission') lockPointer();
    });
    // Chrome blocks re-lock for ~1.25s after Esc — retry once shortly after
    document.addEventListener('pointerlockerror', () => {
      setTimeout(() => {
        if (G.state === 'paused' || G.state === 'playing' || G.state === 'intermission') lockPointer();
      }, 1400);
    });
  }

  function lockPointer() {
    const canvas = $('c');
    try { canvas.requestPointerLock(); } catch (e) {}
  }

  /* ---------------- settings panel ---------------- */
  function bindSettings() {
    const S = UP.Settings;
    const bind = (id, key, fmt) => {
      const el = $(id);
      el.value = S.values[key];
      const val = $(id.replace('set-', 'v'));
      const show = () => { if (val) val.textContent = fmt(S.values[key]); };
      show();
      el.addEventListener('input', () => {
        S.values[key] = el.type === 'range' ? parseFloat(el.value) : el.value;
        show();
        if (key === 'quality') applyQuality(S.values.quality);
        if (key === 'fov') { Main.camera.fov = S.values.fov; Main.camera.updateProjectionMatrix(); }
        if (key === 'fov' || key === 'master' || key === 'music' || key === 'sfx') UP.Audio.applyVolumes();
        S.save();
      });
    };
    bind('set-sens', 'sens', v => Number(v).toFixed(1));
    bind('set-fov', 'fov', v => String(v));
    bind('set-master', 'master', v => Math.round(v * 100) + '%');
    bind('set-music', 'music', v => Math.round(v * 100) + '%');
    bind('set-sfx', 'sfx', v => Math.round(v * 100) + '%');
    bind('set-quality', 'quality', v => String(v).toUpperCase());
    bind('set-blood', 'blood', v => String(v).toUpperCase());
  }

  // boot after DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
