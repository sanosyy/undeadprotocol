/* UNDEAD PROTOCOL — hud.js
   In-game HUD: round, points, health/armor, ammo, perks, power-ups,
   hit markers, prompts, announcements, boss bar. DOM is cached; updates
   only touch elements when values change. */
'use strict';
window.UP = window.UP || {};
(function () {
  const $ = id => document.getElementById(id);

  const H = {
    el: {}, last: {},
    dmgOpacity: 0, dmgTarget: 0,
    annT: 0, subT: 0, eventT: 0,
    hmT: 0,
  };

  H.init = function () {
    const ids = ['hud', 'round-num', 'z-count', 'kill-count', 'points', 'pfloat', 'perk-list',
      'hp-fill', 'ar-fill', 'st-fill', 'wname', 'wtag', 'ammo-mag', 'ammo-res', 'loadout',
      'crosshair', 'hitmarker', 'hs-pop', 'interact', 'announce', 'subann', 'event-banner',
      'boss-wrap', 'boss-fill', 'boss-name', 'pu-list', 'unstuck-ind', 'dmg', 'nuke-flash', 'scope',
      'ch-t', 'ch-b', 'ch-l', 'ch-r', 'ch-dot'];
    for (const id of ids) H.el[id] = $(id);
  };

  H.show = v => { H.el.hud.hidden = !v; };

  /* ---------------- points floaters ---------------- */
  H.floatPoints = function (n) {
    if (!n) return;
    const span = document.createElement('span');
    span.className = 'pf ' + (n > 0 ? 'gain' : 'loss');
    span.textContent = (n > 0 ? '+' : '') + n;
    span.style.left = UP.rand(0, 60) + 'px';
    H.el.pfloat.appendChild(span);
    setTimeout(() => span.remove(), 1200);
  };

  /* ---------------- feedback ---------------- */
  H.hitmarker = function (head, killed) {
    H.el.hitmarker.className = killed ? 'hs' : (head ? 'hs' : '');
    H.el.hitmarker.style.opacity = '1';
    H.hmT = 0.1;
  };
  H.headshotPop = function () {
    H.el['hs-pop'].style.opacity = '1';
    setTimeout(() => { H.el['hs-pop'].style.opacity = '0'; }, 550);
  };
  H.damageFlash = function (v) {
    H.dmgTarget = Math.max(H.dmgTarget, v);
  };
  H.setScope = function (on) {
    H.el.scope.hidden = !on;
    H.el.crosshair.style.opacity = on ? '0' : '1';
  };
  H.setCrosshair = function (px) {
    const e = H.el;
    e['ch-t'].style.top = (-px - 9) + 'px';
    e['ch-b'].style.top = px + 'px';
    e['ch-l'].style.left = (-px - 9) + 'px';
    e['ch-r'].style.left = px + 'px';
  };
  H.nukeFlash = function () {
    H.el['nuke-flash'].style.transition = 'none';
    H.el['nuke-flash'].style.opacity = '0.85';
    setTimeout(() => {
      H.el['nuke-flash'].style.transition = 'opacity .9s';
      H.el['nuke-flash'].style.opacity = '0';
    }, 60);
  };

  /* ---------------- announcements ---------------- */
  H.announce = function (text, dur = 1.6) {
    H.el.announce.textContent = text;
    H.el.announce.style.opacity = '1';
    H.annT = dur;
  };
  H.subAnnounce = function (text, dur = 2) {
    H.el.subann.textContent = text;
    H.el.subann.style.opacity = '1';
    H.subT = dur;
  };
  H.eventBanner = function (text, dur = 3) {
    H.el['event-banner'].textContent = text;
    H.el['event-banner'].style.opacity = '1';
    H.eventT = dur;
    UP.Audio.eventAlarm();
  };

  /* ---------------- prompts ---------------- */
  H.prompt = function (text, deny = false) {
    H.el.interact.innerHTML = text;
    H.el.interact.style.opacity = '1';
    H.el.interact.classList.toggle('deny', deny);
  };
  H.hidePrompt = function () { H.el.interact.style.opacity = '0'; };
  H.promptDeny = function () {
    H.el.interact.classList.add('deny');
    setTimeout(() => H.el.interact.classList.remove('deny'), 600);
  };

  /* ---------------- perks & power-ups ---------------- */
  H.refreshPerks = function () {
    const P = UP.Player;
    const list = H.el['perk-list'];
    list.innerHTML = '';
    const defs = UP.Machines.PERK_DEFS;
    for (const d of defs) {
      if (P.perks[d.id]) {
        const ico = document.createElement('div');
        ico.className = 'perk-ico' + (d.id === 'revive' && P.reviveUsed ? ' used' : '');
        ico.textContent = d.letter;
        ico.style.background = '#' + new THREE.Color(d.color).getStyle();
        ico.title = d.name;
        list.appendChild(ico);
      }
    }
  };
  H.refreshPowerupHUD = function () {
    const G = UP.Game;
    const list = H.el['pu-list'];
    list.innerHTML = '';
    for (const k of ['INSTA', 'DOUBLE', 'FIRE']) {
      const t = G.effects[k];
      if (t > 0) {
        const info = UP.Powerups.KINDS[k];
        const item = document.createElement('div');
        item.className = 'pu-item';
        item.innerHTML = `<i style="background:#${new THREE.Color(info.color).getHexString()}"></i>` +
          `${info.label} <b>${Math.ceil(t)}s</b>`;
        list.appendChild(item);
      }
    }
  };

  /* ---------------- boss ---------------- */
  H.bossBar = function (show, frac, name) {
    H.el['boss-wrap'].hidden = !show;
    if (show) {
      H.el['boss-fill'].style.width = (frac * 100).toFixed(1) + '%';
      if (name) H.el['boss-name'].textContent = name;
    }
  };

  /* ---------------- Fortnite-style loadout ---------------- */
  H.refreshLoadout = function () {
    const P = UP.Player;
    const el = H.el.loadout;
    let html = '';
    for (let i = 0; i < 2; i++) {
      const w = P.slots[i];
      if (!w) {
        html += `<div class="lo-slot empty" data-slot="${i}"><span class="lo-key">${i + 1}</span>` +
          `<span class="lo-name">EMPTY</span></div>`;
        continue;
      }
      const rar = UP.Weapons.rarity(w.def, w.tier);
      const hex = UP.Weapons.RARITY_HEX[rar];
      const icon = UP.Weapons.iconFor(w.def.id, w.tier);
      html += `<div class="lo-slot" data-slot="${i}"` +
        ` style="background:linear-gradient(180deg, ${hex}d8 0%, ${hex}55 34%, rgba(10,12,16,.94) 92%)">` +
        `<span class="lo-key">${i + 1}</span>` +
        (icon ? `<img class="lo-icon" src="${icon}" draggable="false">` : '') +
        `<span class="lo-count" id="lo-ammo-${i}">${w.mag}</span>` +
        `<span class="lo-name">${w.stats.name}</span></div>`;
    }
    el.innerHTML = html;
    H._loSig = H._loadoutSignature();
  };

  H._loadoutSignature = function () {
    const P = UP.Player;
    return P.slots.map(w => w ? w.def.id + ':' + w.tier : '-').join('|') + '#' + P.cur;
  };

  /* ---------------- per-frame ---------------- */
  const _cache = {};
  function setText(id, v) {
    if (_cache[id] === v) return;
    _cache[id] = v;
    H.el[id].textContent = v;
  }

  H.update = function (dt) {
    const P = UP.Player, G = UP.Game;
    // round
    setText('round-num', G.round);
    // zombies remaining
    setText('z-count', G.remainingZombies());
    setText('kill-count', P.kills);
    // points
    const pts = String(P.points);
    if (_cache.points !== pts) {
      _cache.points = pts;
      H.el.points.textContent = pts;
      H.el.points.style.transform = 'scale(1.15)';
      setTimeout(() => { H.el.points.style.transform = ''; }, 90);
    }
    // bars
    const hpFrac = UP.clamp(P.health / P.maxHealth, 0, 1);
    H.el['hp-fill'].style.width = (hpFrac * 100) + '%';
    H.el['hp-fill'].classList.toggle('low', hpFrac < 0.35);
    H.el['ar-fill'].style.width = UP.clamp(P.armor, 0, 100) + '%';
    H.el['st-fill'].style.width = (UP.clamp(P.stamina / P.staminaMax, 0, 1) * 100) + '%';
    // weapon
    const w = P.curWeapon();
    if (w) {
      setText('wname', w.stats.name);
      setText('ammo-mag', w.mag);
      H.el['ammo-mag'].classList.toggle('empty', w.mag === 0);
      setText('ammo-res', ' / ' + w.reserve);
      setText('wtag', w.tier > 0 ? '★'.repeat(w.tier) + ' PACK-A-PUNCH' : (P.reloading > 0 ? 'RELOADING…' : ''));
    }
    // loadout slots (rebuild on weapon change, then just tick selection/ammo)
    const loSig = H._loadoutSignature();
    if (loSig !== H._loSig) H.refreshLoadout();
    for (let i = 0; i < 2; i++) {
      const slot = H.el.loadout.querySelector(`[data-slot="${i}"]`);
      if (!slot) continue;
      slot.classList.toggle('selected', P.cur === i && !!P.slots[i]);
      const cnt = document.getElementById('lo-ammo-' + i);
      const wi = P.slots[i];
      if (cnt && wi) {
        const t = String(wi.mag);
        if (cnt.textContent !== t) cnt.textContent = t;
        cnt.classList.toggle('low', wi.mag === 0);
      }
    }
    // damage overlay decay
    if (H.dmgTarget > 0) {
      H.dmgOpacity = Math.max(H.dmgOpacity, H.dmgTarget);
      H.dmgTarget = 0;
    }
    if (H.dmgOpacity > 0) {
      H.dmgOpacity = Math.max(0, H.dmgOpacity - dt * 1.8);
      H.el.dmg.style.opacity = H.dmgOpacity.toFixed(3);
    }
    // hitmarker decay
    if (H.hmT > 0) {
      H.hmT -= dt;
      if (H.hmT <= 0) H.el.hitmarker.style.opacity = '0';
    }
    // announcement timers
    if (H.annT > 0) { H.annT -= dt; if (H.annT <= 0) H.el.announce.style.opacity = '0'; }
    if (H.subT > 0) { H.subT -= dt; if (H.subT <= 0) H.el.subann.style.opacity = '0'; }
    if (H.eventT > 0) { H.eventT -= dt; if (H.eventT <= 0) H.el['event-banner'].style.opacity = '0'; }
    // intermission countdown
    if (G.state === 'intermission' && G.intermission > 0) {
      H.subAnnounce(`NEXT WAVE IN ${Math.ceil(G.intermission)}s — SPEND YOUR POINTS`, 0.5);
    }
    // powerup timers refresh ~4x/s
    H._puT = (H._puT || 0) - dt;
    if (H._puT <= 0) { H._puT = 0.25; H.refreshPowerupHUD(); }
    // unstuck cooldown indicator (top right)
    const cd = UP.Game.unstuckCd || 0;
    const ui = H.el['unstuck-ind'];
    if (cd > 0) {
      const txt = 'UNSTUCK [K] ' + Math.ceil(cd) + 's';
      if (_cache.unstuck !== txt) { _cache.unstuck = txt; ui.textContent = txt; ui.className = ''; }
    } else {
      if (_cache.unstuck !== 'ready') {
        _cache.unstuck = 'ready';
        ui.textContent = 'UNSTUCK [K] READY';
        ui.className = 'ready';
      }
    }
    // boss bar
    const boss = UP.Zombies.boss;
    if (boss && !boss.dead) H.bossBar(true, UP.clamp(boss.hp / boss.maxHp, 0, 1), 'PATIENT ZERO');
    else H.bossBar(false, 0);
  };

  window.UP.HUD = H;
})();
