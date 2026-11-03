// Headless bot-vs-bot matches across every gun and difficulty. Catches runtime
// errors, stuck matches and dead guns without a browser.
import { GUNS } from "../src/guns.js";
import { createGame, step } from "../src/game.js";
import { createBot } from "../src/bot.js";

const DT = 1 / 60;
const ids = GUNS.map((g) => g.id);
const diffs = ["easy", "normal", "hard"];
const fired = Object.fromEntries(ids.map((id) => [id, 0]));
const wins = { easy: 0, normal: 0, hard: 0 };
let totalWalls = 0;
let totalEdits = 0;
let matches = 0;
let frames = 0;

for (let k = 0; k < ids.length * 2; k++) {
  const a = [ids[k % ids.length], ids[(k * 5 + 3) % ids.length]];
  const b = [ids[(k * 7 + 1) % ids.length], ids[(k + 6) % ids.length]];
  const dA = diffs[k % 3];
  const dB = "normal";
  const g = createGame({
    loadouts: [a, b],
    names: ["A", "B"],
    controllers: [createBot(dA), createBot(dB)],
    seed: k + 1,
  });
  let t = 0;
  while (g.state !== "matchEnd" && t < 60 * 60 * 16) {
    step(g, DT);
    for (const e of g.events) if (e.t === "shot") fired[e.gun]++;
    g.events.length = 0;
    t++;
    for (const p of g.players) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`NaN position in match ${k}`);
      if (p.x < 0 || p.y < 0 || p.x > 30 || p.y > 20) throw new Error(`player out of arena in match ${k}`);
    }
  }
  frames += t;
  matches++;
  if (g.state !== "matchEnd") throw new Error(`match ${k} never finished`);
  if (g.matchWinner === 0) wins[dA]++;
  totalWalls += g.players[0].stats.walls + g.players[1].stats.walls;
  totalEdits += g.players[0].stats.edits + g.players[1].stats.edits;
  console.log(
    `match ${String(k).padStart(2)}  ${dA.padEnd(6)} [${a.join("+")}] vs normal [${b.join("+")}]  ` +
      `${g.score.join("-")}  ${(t / 60).toFixed(0)}s  walls ${g.players[0].stats.walls}/${g.players[1].stats.walls}  edits ${g.players[0].stats.edits}/${g.players[1].stats.edits}`
  );
}

// every gun alone, so short-range guns the bot rarely picks still get exercised
const dmgBy = {};
for (const id of ids) {
  const g = createGame({
    loadouts: [[id, id], ["pistol", "pistol"]],
    names: ["A", "B"],
    controllers: [createBot("hard"), createBot("easy")],
    seed: 99,
  });
  for (let t = 0; t < 60 * 90 && g.state !== "matchEnd"; t++) {
    step(g, DT);
    for (const e of g.events) if (e.t === "shot") fired[e.gun]++;
    g.events.length = 0;
  }
  dmgBy[id] = g.players[0].stats.dmg;
}
console.log("\ndamage dealt in 90s, solo-gun hard bot vs easy pistol bot:", dmgBy);
const harmless = ids.filter((id) => dmgBy[id] === 0);
if (harmless.length) {
  console.error("guns that never dealt damage:", harmless);
  process.exit(1);
}

console.log(`\n${matches} matches, ${(frames / 60 / 60).toFixed(1)} sim-minutes`);
console.log(`walls built: ${totalWalls}, edits: ${totalEdits}`);
console.log("rounds fired per gun:", fired);
console.log("wins vs normal by difficulty:", wins);
const dead = ids.filter((id) => fired[id] === 0);
if (dead.length) {
  console.error("guns that never fired:", dead);
  process.exit(1);
}
if (totalWalls === 0 || totalEdits === 0) {
  console.error("bots never built or edited");
  process.exit(1);
}
console.log("sim ok");
