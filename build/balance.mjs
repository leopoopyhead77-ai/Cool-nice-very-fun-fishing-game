// Simulates a competent player against the real engine to check the pacing
// targets: first catch ~10 s, first rod upgrade ~2-3 min, first rebirth ~20 min.
import { AREAS, BAITS, RODS } from "../src/data.js";
import {
  areaOf,
  baitPrice,
  biteDelay,
  fishValue,
  fmt,
  freshState,
  rebirthThreshold,
  rollFish,
} from "../src/engine.js";

const CAST_UI = 2.0; // sweeping the power bar and tapping SET
const HOOK_UI = 0.5;
const REEL_TIME = [3.5, 4.0, 4.8, 5.6, 6.5, 7.5, 8.5, 10.0]; // by rarity tier
const CATCH_ODDS = [0.99, 0.98, 0.96, 0.93, 0.88, 0.82, 0.76, 0.7]; // skilled player

function run(seedLabel) {
  const s = freshState();
  let t = 0;
  const marks = {};
  const note = (k) => {
    if (marks[k] === undefined) marks[k] = t;
  };

  for (let cast = 0; cast < 40000; cast++) {
    // Buy the best rod we can afford, then bait, then new water.
    for (let i = RODS.length - 1; i >= 0; i--) {
      const rod = RODS[i];
      if (!s.rodsOwned.includes(rod.key) && s.coins >= rod.cost) {
        s.coins -= rod.cost;
        s.rodsOwned.push(rod.key);
        s.rod = rod.key;
        note("rod" + i);
        break;
      }
    }
    for (let i = BAITS.length - 1; i >= 0; i--) {
      const b = BAITS[i];
      const price = baitPrice(s, b);
      // keep bait spend under a fifth of the purse
      if (s.coins > price * 5 && (s.baits[b.key] || 0) === 0) {
        s.coins -= price;
        s.baits[b.key] = b.pack;
        s.bait = b.key;
        break;
      }
    }
    for (let i = AREAS.length - 1; i > s.area; i--) {
      const a = AREAS[i];
      if (!s.areasUnlocked.includes(a.key) && s.coins >= a.cost && s.rebirths >= a.rebirth) {
        s.coins -= a.cost;
        s.areasUnlocked.push(a.key);
        s.area = i;
        note("area" + i);
        break;
      }
    }

    if (s.bait) {
      const left = (s.baits[s.bait] || 0) - 1;
      s.baits[s.bait] = Math.max(0, left);
      if (left <= 0) s.bait = null;
    }

    const quality = Math.random() < 0.45 ? "perfect" : Math.random() < 0.8 ? "good" : "fair";
    t += CAST_UI + biteDelay(s, quality) + HOOK_UI;

    const roll = rollFish(s, quality);
    t += REEL_TIME[roll.tier];
    if (Math.random() > CATCH_ODDS[roll.tier]) continue; // lost it

    note("firstCatch");
    s.coins += fishValue(s, roll);

    if (s.coins >= rebirthThreshold(s.rebirths)) {
      note("rebirth" + s.rebirths);
      if (s.rebirths >= 2) break;
      s.coins = 0;
      s.rod = "twine";
      s.rodsOwned = ["twine"];
      s.rebirths += 1;
      s.tokens += 3;
    }
    if (t > 60 * 240) break;
  }
  return { marks, t, state: s };
}

const mins = (sec) => (sec === undefined ? "—" : `${(sec / 60).toFixed(1)} min`);
const runs = Array.from({ length: 40 }, () => run());
const median = (key) => {
  const xs = runs.map((r) => r.marks[key]).filter((x) => x !== undefined).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : undefined;
};

console.log("median time to:");
console.log(`  first catch     ${median("firstCatch")?.toFixed(1)} s   (target ~10 s)`);
console.log(`  Birchwood Rod   ${mins(median("rod1"))}   (target 2–3 min)`);
console.log(`  Harbor Compos.  ${mins(median("rod2"))}`);
console.log(`  Sablewash Delta ${mins(median("area1"))}`);
console.log(`  Grayharbor Pier ${mins(median("area2"))}`);
console.log(`  Ember Atoll     ${mins(median("area3"))}`);
console.log(`  rebirth 1       ${mins(median("rebirth0"))}   (target ~20 min)`);
console.log(`  rebirth 2       ${mins(median("rebirth1"))}`);
console.log(`  rebirth 3       ${mins(median("rebirth2"))}`);
console.log(`\nrebirth thresholds: ${[0, 1, 2, 3].map((n) => fmt(rebirthThreshold(n))).join(" · ")}`);
