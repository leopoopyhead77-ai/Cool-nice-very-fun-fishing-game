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
    dmg: 66, cd: 1.95, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 75, range: 27, mag: 3, reload: 2.9, tile: 1.2, pref: 13,
    color: "#ff7ad9", desc: "Huge single shots at any range. Slow to cycle.",
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
    dmg: 42, cd: 1.3, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 10.5, range: 9.5, mag: 3, reload: 2.6, tile: 1.9, pref: 7, supply: 6,
    radius: 1.3, color: "#a4ff5c", desc: "Lobs over walls and splashes. Only 6 grenades per round.",
  },
  {
    id: "rocket", name: "Rocket Launcher", type: "rocket", tier: "Legendary",
    dmg: 72, cd: 1.3, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 16, range: 19, mag: 1, reload: 2.2, tile: 3.2, pref: 9,
    radius: 1.45, color: "#ff6b4a", desc: "Explodes on contact. Deletes walls.",
  },
  {
    id: "rail", name: "Railgun", type: "rail", tier: "Mythic",
    dmg: 42, cd: 2.2, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 0, range: 30, mag: 2, reload: 2.9, tile: 0.6, pref: 11, pierceLoss: 0.3,
    color: "#5cf6ff", desc: "Instant beam that blasts through ONE wall (30% weaker after). The next wall or rock stops it.",
  },
  {
    id: "flamer", name: "Flamethrower", type: "bullet", tier: "Rare",
    dmg: 4.5, cd: 0.5, burst: 12, gap: 0.03, pellets: 1, spread: 0.3,
    speed: 11, range: 4.6, mag: 72, reload: 2.2, tile: 2.2, pref: 2.4,
    flame: true, burn: 7, color: "#ff9a3c", desc: "Short-range torrent that sets targets on fire. Burns through walls fast.",
  },
  {
    id: "akimbo", name: "Akimbo Pistols", type: "bullet", tier: "Uncommon",
    dmg: 12, cd: 0.36, burst: 4, gap: 0.065, pellets: 1, spread: 0.07,
    speed: 32, range: 10, mag: 24, reload: 1.6, tile: 1, pref: 5,
    color: "#ffe08a", desc: "Two pistols, four quick shots per release.",
  },
  {
    id: "dmr", name: "Marksman Rifle", type: "bullet", tier: "Rare",
    dmg: 24, cd: 0.48, burst: 1, gap: 0, pellets: 1, spread: 0.016,
    speed: 50, range: 18, mag: 8, reload: 2.2, tile: 1, pref: 10,
    color: "#9fe6c6", desc: "Fast, accurate single shots at long range.",
  },
  {
    id: "crossbow", name: "Crossbow", type: "bullet", tier: "Rare",
    dmg: 56, cd: 0.25, burst: 1, gap: 0, pellets: 1, spread: 0.01,
    speed: 27, range: 16, mag: 1, reload: 0.95, tile: 1.3, pref: 8,
    color: "#d9a066", desc: "Slow, heavy bolts. Lead your target.",
  },
  {
    id: "dbarrel", name: "Double Barrel", type: "bullet", tier: "Epic",
    dmg: 9, cd: 0.9, burst: 2, gap: 0.12, pellets: 8, spread: 0.5,
    speed: 24, range: 5.2, mag: 2, reload: 2.0, tile: 1.3, pref: 2.2,
    color: "#c98a5a", desc: "Both barrels back to back. Point-blank devastation.",
  },
  {
    id: "frost", name: "Frost Ray", type: "bullet", tier: "Rare",
    dmg: 6, cd: 0.55, burst: 8, gap: 0.045, pellets: 1, spread: 0.08,
    speed: 20, range: 8, mag: 48, reload: 2.0, tile: 0.7, pref: 5, slow: 1.4,
    color: "#9fe8ff", desc: "Chilling stream. Hit players are slowed by 40%.",
  },
  {
    id: "ricochet", name: "Ricochet Blaster", type: "bullet", tier: "Epic",
    dmg: 19, cd: 0.55, burst: 2, gap: 0.1, pellets: 1, spread: 0.03,
    speed: 30, range: 20, mag: 16, reload: 1.7, tile: 0.8, pref: 6, bounce: 2,
    color: "#ff9ff0", desc: "Energy bolts bounce off walls twice — hit people behind cover.",
  },
  {
    id: "cluster", name: "Cluster Launcher", type: "lob", tier: "Legendary",
    dmg: 30, cd: 1.7, burst: 1, gap: 0, pellets: 1, spread: 0,
    speed: 10.5, range: 9, mag: 2, reload: 2.8, tile: 1.5, pref: 7, supply: 4,
    radius: 0.95, cluster: 4, color: "#ffb04a", desc: "Lobbed bomb that bursts into 4 bomblets. Only 4 per round.",
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
