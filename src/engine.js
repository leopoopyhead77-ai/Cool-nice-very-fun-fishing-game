// ---------------------------------------------------------------------------
// Pure game logic: rolls, formulas, formatting, save-state shape.
// No React, no DOM — everything here is testable in isolation.
// ---------------------------------------------------------------------------

import {
  AREAS,
  BAITS,
  LUCK_K,
  MUTATIONS,
  RARITIES,
  REBIRTH_BASE,
  REBIRTH_GROWTH,
  RODS,
  UPGRADES,
} from "./data.js";

// --- numbers ---------------------------------------------------------------

const UNITS = [
  [1e15, "Q"],
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

export function fmt(n) {
  if (!isFinite(n)) return "∞";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  for (const [size, suffix] of UNITS) {
    if (n >= size) {
      const v = n / size;
      const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
      // trim trailing zeros only after a decimal point (250000 -> "250K")
      return sign + s.replace(/\.0+$|(\.\d*?)0+$/, "$1") + suffix;
    }
  }
  return sign + Math.floor(n).toLocaleString("en-US");
}

export function fmtKg(kg) {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + " t";
  if (kg >= 10) return kg.toFixed(1) + " kg";
  if (kg >= 1) return kg.toFixed(2) + " kg";
  return (kg * 1000).toFixed(0) + " g";
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// --- save state ------------------------------------------------------------

export function freshState() {
  return {
    v: 1,
    coins: 0,
    rebirths: 0,
    tokens: 0,
    rod: "twine",
    rodsOwned: ["twine"],
    baits: {},
    bait: null,
    area: 0,
    areasUnlocked: ["creek"],
    upgrades: {},
    inventory: [],
    bestiary: {},
    stats: { casts: 0, catches: 0, escapes: 0, earned: 0, best: 0 },
  };
}

export function migrate(saved) {
  const base = freshState();
  if (!saved || typeof saved !== "object") return base;
  const s = { ...base, ...saved };
  s.stats = { ...base.stats, ...(saved.stats || {}) };
  s.upgrades = { ...(saved.upgrades || {}) };
  s.baits = { ...(saved.baits || {}) };
  s.bestiary = { ...(saved.bestiary || {}) };
  s.inventory = Array.isArray(saved.inventory) ? saved.inventory : [];
  s.rodsOwned = Array.isArray(saved.rodsOwned) && saved.rodsOwned.length ? saved.rodsOwned : ["twine"];
  s.areasUnlocked =
    Array.isArray(saved.areasUnlocked) && saved.areasUnlocked.length ? saved.areasUnlocked : ["creek"];
  if (!RODS.some((r) => r.key === s.rod)) s.rod = "twine";
  if (s.bait && !BAITS.some((b) => b.key === s.bait)) s.bait = null;
  s.area = clamp(Math.floor(s.area) || 0, 0, AREAS.length - 1);
  if (!s.areasUnlocked.includes(AREAS[s.area].key)) s.area = 0;
  return s;
}

// --- derived stats ---------------------------------------------------------

export const rodOf = (state) => RODS.find((r) => r.key === state.rod) || RODS[0];
export const baitOf = (state) => BAITS.find((b) => b.key === state.bait) || null;
export const areaOf = (state) => AREAS[state.area] || AREAS[0];
export const lvl = (state, key) => state.upgrades[key] || 0;

export function upgradeCost(key, level) {
  const u = UPGRADES.find((x) => x.key === key);
  return Math.ceil(u.base * Math.pow(u.growth, level));
}

export function rebirthThreshold(rebirths) {
  return Math.floor(REBIRTH_BASE * Math.pow(REBIRTH_GROWTH, rebirths));
}

export function rebirthTokens(rebirths) {
  return 3 + rebirths * 2;
}

export function baitPrice(state, bait) {
  const disc = Math.pow(0.94, lvl(state, "tackle"));
  return Math.max(1, Math.ceil(bait.cost * bait.pack * disc));
}

/** Total luck going into a rarity roll, before cast quality. */
export function baseLuck(state) {
  const bait = baitOf(state);
  return rodOf(state).luck + lvl(state, "fortune") * 25 + (bait ? bait.luck : 0);
}

export function mutationChance(state) {
  const bait = baitOf(state);
  return bait ? bait.mut : 0;
}

export function coinMultiplier(state) {
  const prosperity = 1 + lvl(state, "prosperity") * 0.12;
  const rebirthBonus = 1 + state.rebirths * 0.3;
  return rodOf(state).value * prosperity * rebirthBonus;
}

export function bracketWidth(state) {
  return clamp(0.19 * rodOf(state).control * (1 + lvl(state, "steady") * 0.06), 0.08, 0.46);
}

export function biteDelay(state, castQuality) {
  const hunger = 1 + lvl(state, "hunger") * 0.07;
  const raw = (1.6 + Math.random() * 3.0) / (rodOf(state).lure * hunger);
  // A clean cast lands the bait where fish already are.
  return Math.max(0.5, raw * (castQuality === "perfect" ? 0.7 : castQuality === "poor" ? 1.3 : 1));
}

export function twinChance(state) {
  return lvl(state, "twin") * 0.04;
}

// --- cast quality ----------------------------------------------------------

export const SWEET_SPOT = 0.78;

export function castQuality(marker) {
  const d = Math.abs(marker - SWEET_SPOT);
  if (d < 0.03) return "perfect";
  if (d < 0.09) return "good";
  if (d < 0.2) return "fair";
  return "poor";
}

export const CAST_LABEL = {
  perfect: "PERFECT CAST",
  good: "GOOD CAST",
  fair: "FAIR CAST",
  poor: "SLOPPY CAST",
};

export function castLuck(luck, quality) {
  if (quality === "perfect") return luck * 1.5 + 60;
  if (quality === "good") return luck * 1.2 + 10;
  if (quality === "poor") return luck * 0.6;
  return luck;
}

// --- rolls -----------------------------------------------------------------

function weightedPick(entries) {
  let total = 0;
  for (const e of entries) total += e.w;
  if (total <= 0) return entries[0]?.item ?? null;
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

export function rollRarity(area, luck) {
  const entries = [];
  for (let i = 0; i < RARITIES.length; i++) {
    const base = area.weights[i];
    if (!base) continue;
    entries.push({ item: i, w: base * (1 + luck * LUCK_K[i]) });
  }
  return weightedPick(entries);
}

export function rollMutation(mutBonus) {
  const boost = 1 + mutBonus * 10;
  const entries = MUTATIONS.map((m, i) => ({
    item: i,
    w: i === 0 ? m.weight : m.weight * boost,
  }));
  return weightedPick(entries);
}

/** Rolls the whole fish: species, mutation and weight. */
export function rollFish(state, quality) {
  const area = areaOf(state);
  const luck = castLuck(baseLuck(state), quality);
  let tier = rollRarity(area, luck);
  let pool = area.fish.filter((f) => f.r === tier);
  if (!pool.length) {
    // Defensive: fall back to the closest tier that exists in this area.
    let best = area.fish[0];
    for (const f of area.fish) if (Math.abs(f.r - tier) < Math.abs(best.r - tier)) best = f;
    pool = area.fish.filter((f) => f.r === best.r);
    tier = best.r;
  }
  const species = pool[Math.floor(Math.random() * pool.length)];
  const mut = rollMutation(mutationChance(state));
  // Weight skews small: cube of a uniform roll makes trophies genuinely rare.
  const t = Math.pow(Math.random(), 2.2);
  const weight = species.wmin + (species.wmax - species.wmin) * t;
  return { species, tier, mut, weight, areaKey: area.key, t };
}

export function fishValue(state, roll) {
  const weightFactor = 0.55 + 1.55 * roll.t;
  const raw =
    roll.species.v * weightFactor * MUTATIONS[roll.mut].mult * coinMultiplier(state);
  return Math.max(1, Math.round(raw));
}

let idCounter = 0;
export function makeCatch(state, roll) {
  idCounter += 1;
  return {
    id: `${Date.now().toString(36)}-${idCounter}`,
    name: roll.species.n,
    tier: roll.tier,
    mut: roll.mut,
    weight: Math.round(roll.weight * 1000) / 1000,
    value: fishValue(state, roll),
    area: roll.areaKey,
  };
}

// --- bestiary --------------------------------------------------------------

export function recordBestiary(bestiary, entry) {
  const prev = bestiary[entry.name];
  const next = prev
    ? {
        count: prev.count + 1,
        best: Math.max(prev.best, entry.weight),
        bestMut: MUTATIONS[entry.mut].mult > MUTATIONS[prev.bestMut ?? 0].mult ? entry.mut : prev.bestMut ?? 0,
        tier: entry.tier,
      }
    : { count: 1, best: entry.weight, bestMut: entry.mut, tier: entry.tier };
  return { ...bestiary, [entry.name]: next };
}

// --- helpers for the UI ----------------------------------------------------

export const rarityOf = (tier) => RARITIES[tier] || RARITIES[0];
export const mutationOf = (m) => MUTATIONS[m] || MUTATIONS[0];

export function inventoryValue(inv) {
  let t = 0;
  for (const f of inv) t += f.value;
  return t;
}
