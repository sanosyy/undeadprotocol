/* UNDEAD PROTOCOL — settings.js
   Persisted settings + best survival stats (localStorage). */
'use strict';
window.UP = window.UP || {};
(function () {
  const DEFAULTS = {
    sens: 1.0, fov: 75,
    master: 0.8, music: 0.5, sfx: 0.9,
    quality: 'medium', blood: true,
  };
  const S = {
    values: { ...DEFAULTS },
    best: { round: 0, kills: 0, points: 0, headshots: 0, time: 0 },
    load() {
      try {
        const s = JSON.parse(localStorage.getItem('up_settings') || 'null');
        if (s) Object.assign(this.values, DEFAULTS, s);
        const b = JSON.parse(localStorage.getItem('up_best') || 'null');
        if (b) Object.assign(this.best, b);
      } catch (e) { /* corrupted storage — keep defaults */ }
    },
    save() {
      try {
        localStorage.setItem('up_settings', JSON.stringify(this.values));
      } catch (e) {}
    },
    saveBest(stats) {
      // stats: {round, kills, points, headshots, time}
      let improved = false;
      for (const k of ['round', 'kills', 'points', 'headshots', 'time']) {
        if ((stats[k] || 0) > (this.best[k] || 0)) { this.best[k] = stats[k] | 0; improved = true; }
      }
      if (improved) {
        try { localStorage.setItem('up_best', JSON.stringify(this.best)); } catch (e) {}
      }
      return improved;
    },
  };
  window.UP.Settings = S;
})();
