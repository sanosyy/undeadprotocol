# UNDEAD PROTOCOL

A round-based zombie survival FPS that runs entirely in the browser. Built with
HTML5, CSS3, JavaScript and Three.js (r128). Inspired by Call of Duty: Zombies
and Killing Floor.

## Run it

Just open `index.html` in any modern desktop browser (Chrome / Edge / Firefox).
No server, build step or internet connection required — Three.js is vendored
in `js/vendor/` and every texture, model and sound is generated procedurally at
runtime.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look (click to lock pointer) |
| Left Mouse | Fire |
| Right Mouse | Aim down sights |
| Shift | Sprint |
| Space | Jump |
| Ctrl | Crouch |
| R | Reload |
| 1 / 2 / Q / Wheel | Switch weapon |
| F | Interact — buy weapons/perks, open doors, use machines, take box weapons |
| Hold F | Rebuild barricades (+10 points per plank) |
| K | Unstuck — teleport to spawn (2 minute cooldown, shown top right) |
| Esc | Pause |

## Gameplay loop

- Survive endless rounds; every round brings more, faster, tougher zombies.
- Earn points: **+10** per hit, **+100** per kill, **+50** headshot bonus,
  **+10** per plank repaired. Spend them on doors, wall weapons, perks, the
  Mystery Box, Pack-A-Punch upgrades and armor.
- Activate the **generator** (Generator Room) to restore power — this unlocks
  perk machines, Pack-A-Punch and the power doors to the Containment Vault
  and Rooftop.
- Rounds divisible by 5 bring heavy **Brute** assaults; rounds divisible by 10
  spawn **Patient Zero**, a boss with a health bar, ranged acid spit and a big
  reward.
- Power-ups (Insta-Kill, Double Points, Max Ammo, Nuke, Fire Sale, Carpenter,
  Full Health) drop from kills. Watch for random events: blackouts, hordes,
  golden loot zombies, ammo supply drops and Mystery Box relocations.

## Map

Blacksite-7, an abandoned research facility in a forest at night:
Security Quarters (spawn) → Main Laboratory → Maintenance Tunnels →
Containment Vault, plus Weapon Storage, Medical Bay, Generator Room and a
Rooftop reached through the west stairwell. Zombies break through boarded
windows — repair them for points.

## Tech notes

- Modular source in `js/` — map, zombies, player, machines, powerups, audio,
  HUD and game-round logic are separate modules behind the `UP` namespace.
- All audio is synthesized with WebAudio (spatial panners for zombie groans,
  footsteps and explosions).
- Zombies are pooled (30 bodies) with a navigation graph + line-of-sight
  steering; rounds cap concurrent zombies per graphics quality.
- Settings and best-run stats persist in `localStorage`.
