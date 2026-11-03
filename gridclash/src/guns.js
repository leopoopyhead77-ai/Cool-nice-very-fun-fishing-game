// The armory. Every gun is pure data; game.js interprets it.
//
// type     bullet  – travelling projectile, stopped by the first solid tile
//          rocket  – travelling projectile that explodes on impact
//          lob     – arcs over walls to the aimed point, then explodes
//          rail    – instant beam that punches through player builds
// cd       seconds between trigger releases
// burst    rounds fired per release, `gap` seconds apart
// pellets  projectiles per round (shotguns)
// spread   total cone width in radians
// tile     damage multiplier against build tiles
// pref     distance (tiles) the bot likes to hold with this gun

export const GUNS = [
  {
    id: "pistol", name: "Pistol", type: "bullet", tier: "Common",
    dmg: 18, cd: 0.26, burst: 1, gap: 0, pellets: 1, spread: 0.035,
    speed: 32, range: 11, mag: 12, reload: 1.0, tile: 1, pref: 6,
    color: "#ffd27a", desc: "Reliable sidearm. Fast trigger, fast reload.",
  },
  {
    id: "smg", name: "SMG", type: "bullet", tier: "Uncommon",
    dmg: 9, cd: 0.42, burst: 6, gap: 0.055, pellets: 1, spread: 0.11,
    speed: 30, range: 9, mag: 36, reload: 1.4, tile: 1, pref: 4,
    color: "#9ef0a8", desc: "Six-round spray per release. Shreds up close.",
  },
  {
    id: "ar", name: "Assault Rifle", type: "bullet", tier: "Rare",
    dmg: 13, cd: 0.42, burst: 4, gap: 0.085, pellets: 1, spread: 0.045,
    speed: 36, range: 13, mag: 32, reload: 1.8, tile: 1, pref: 7,
    color: "#8fd3ff", desc: "Four-round burst. Good at every range.",
  },
  {
    id: "burst", name: "Burst Rifle", type: "bullet", tier: "Rare",
    dmg: 21, cd: 0.75, burst: 3, gap: 0.045, pellets: 1, spread: 0.018,
    speed: 40, range: 15, mag: 24, reload: 2.0, tile: 1, pref: 8,
    color: "#b9a6ff", desc: "Tight three-round burst. Rewards a clean aim.",
  },
  {
    id: "shotgun", name: "Pump Shotgun", type: "bullet", tier: "Epic",
    dmg: 11, cd: 0.95, burst: 1, gap: 0, pellets: 9, spread: 0.42,
    speed: 26, range: 6.5, mag: 5, reload: 2.2, tile: 1.4, pref: 2.6,
    color: "#ffb36b", desc: "Nine pellets in a wide cone. Devastating in a box fight.",
  },
  {
    id: "sniper", name: "Sniper", type: "bullet", tier: "Legendary",
    dmg: 82, cd: 1.6, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 75, range: 27, mag: 4, reload: 2.6, tile: 1.2, pref: 13,
    color: "#ff7ad9", desc: "One shot, most of a health bar. Zero spread.",
  },
  {
    id: "revolver", name: "Revolver", type: "bullet", tier: "Uncommon",
    dmg: 38, cd: 0.55, burst: 1, gap: 0, pellets: 1, spread: 0.015,
    speed: 42, range: 14, mag: 6, reload: 1.9, tile: 1, pref: 7,
    color: "#e8d9b0", desc: "Heavy single shots with pinpoint accuracy.",
  },
  {
    id: "minigun", name: "Minigun", type: "bullet", tier: "Epic",
    dmg: 7, cd: 0.6, burst: 14, gap: 0.038, pellets: 1, spread: 0.16,
    speed: 34, range: 11, mag: 140, reload: 3.0, tile: 1.6, pref: 6,
    color: "#ffe066", desc: "Fourteen rounds per release. Melts builds.",
  },
  {
    id: "grenade", name: "Grenade Launcher", type: "lob", tier: "Epic",
    dmg: 58, cd: 1.0, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 13, range: 10, mag: 4, reload: 2.4, tile: 2.6, pref: 7,
    radius: 1.6, color: "#a4ff5c", desc: "Lobs over walls and splashes. Aim distance = throw distance.",
  },
  {
    id: "rocket", name: "Rocket Launcher", type: "rocket", tier: "Legendary",
    dmg: 72, cd: 1.3, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 16, range: 19, mag: 1, reload: 2.2, tile: 3.2, pref: 9,
    radius: 1.45, color: "#ff6b4a", desc: "Explodes on contact. Deletes walls.",
  },
  {
    id: "rail", name: "Railgun", type: "rail", tier: "Mythic",
    dmg: 52, cd: 1.8, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 0, range: 30, mag: 3, reload: 2.5, tile: 0.6, pref: 11,
    color: "#5cf6ff", desc: "Instant beam that pierces player builds. Stopped by rock.",
  },
  {
    id: "flamer", name: "Flamethrower", type: "bullet", tier: "Rare",
    dmg: 4.5, cd: 0.5, burst: 12, gap: 0.03, pellets: 1, spread: 0.3,
    speed: 11, range: 4.6, mag: 72, reload: 2.2, tile: 2.2, pref: 2.4,
    flame: true, color: "#ff9a3c", desc: "Short-range torrent. Burns through walls fast.",
  },
];

export const GUN_BY_ID = Object.fromEntries(GUNS.map((g) => [g.id, g]));

export const TIER_COLOR = {
  Common: "#b8c0cc",
  Uncommon: "#6ee07a",
  Rare: "#4fb0ff",
  Epic: "#c37bff",
  Legendary: "#ffb340",
  Mythic: "#ff5cc8",
};

// Normalised 0..1 stats for the loadout screen.
export function gunStats(g) {
  const perRelease = g.dmg * g.burst * g.pellets;
  const dps = perRelease / (g.cd + (g.burst - 1) * g.gap);
  return {
    damage: Math.min(1, perRelease / 100),
    rate: Math.min(1, dps / 160),
    range: Math.min(1, g.range / 27),
    builds: Math.min(1, (dps * g.tile) / 260),
  };
}
