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

// 2v2: four bots, every team member must be able to fight, build and die
let w2 = [0, 0];
for (let k = 0; k < 6; k++) {
  const lo = [0, 1, 2, 3].map((i) => [ids[(k * 4 + i) % ids.length], ids[(k * 4 + i + 5) % ids.length]]);
  const g = createGame({
    loadouts: lo,
    names: ["A1", "B1", "A2", "B2"],
    controllers: [0, 1, 2, 3].map((i) => createBot(i % 2 === 0 ? "hard" : "normal")),
    seed: 500 + k,
  });
  let t = 0;
  while (g.state !== "matchEnd" && t < 60 * 60 * 16) {
    step(g, DT);
    g.events.length = 0;
    t++;
    for (const p of g.players) {
      if (!Number.isFinite(p.x) || p.x < 0 || p.x > 30 || p.y < 0 || p.y > 20) throw new Error(`2v2 match ${k}: bad position`);
    }
  }
  if (g.state !== "matchEnd") throw new Error(`2v2 match ${k} never finished`);
  if (g.matchWinner >= 0) w2[g.matchWinner]++;
  const dmg = g.players.map((p) => p.stats.dmg);
  console.log(`2v2 ${k}  score ${g.score.join("-")}  ${(t / 60).toFixed(0)}s  dmg ${dmg.join("/")}  walls ${g.players.map((p) => p.stats.walls).join("/")}`);
  if (dmg.some((d) => d === 0) && t > 60 * 60) console.warn("  (a player dealt no damage)");
}
console.log("2v2 wins (hard team vs normal team):", w2);

// free-for-all: 3 and 4 players, every bot on its own team
for (const n of [3, 4]) {
  for (let k = 0; k < 3; k++) {
    const g = createGame({
      loadouts: Array.from({ length: n }, (_, i) => [ids[(k * 3 + i) % ids.length], ids[(k * 3 + i + 6) % ids.length]]),
      names: Array.from({ length: n }, (_, i) => "P" + i),
      teams: Array.from({ length: n }, (_, i) => i),
      controllers: Array.from({ length: n }, () => createBot("normal")),
      seed: 900 + n * 10 + k,
    });
    if (g.numTeams !== n || g.score.length !== n) throw new Error("FFA team count wrong");
    let t = 0;
    let rounds = 0;
    while (g.state !== "matchEnd" && t < 60 * 60 * 16) {
      step(g, DT);
      for (const e of g.events) if (e.t === "roundEnd") rounds++;
      g.events.length = 0;
      t++;
      for (const p of g.players) {
        if (!Number.isFinite(p.x) || p.x < 0 || p.x > 30 || p.y < 0 || p.y > 20) throw new Error(`FFA ${n}: bad position`);
      }
    }
    if (g.state !== "matchEnd") throw new Error(`FFA ${n} match ${k} never finished`);
    console.log(`1v1${"v1".repeat(n - 2)} ${k}  score ${g.score.join("-")}  winner ${g.matchWinner}  rounds ${rounds}  ${(t / 60).toFixed(0)}s  dmg ${g.players.map((p) => p.stats.dmg).join("/")}`);
  }
}

// buff cards: a card phase before every round; picks stack; shield absorbs first
{
  const { CARD_BY_ID } = await import("../src/cards.js");
  let shieldSoaked = 0;
  const rar = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let k = 0; k < 8; k++) {
    const g = createGame({
      loadouts: [[ids[k % 12], ids[(k + 4) % 12]], [ids[(k + 7) % 12], ids[(k + 2) % 12]]],
      names: ["A", "B"], controllers: [createBot("normal"), createBot("normal")], seed: 300 + k, cards: true,
    });
    if (g.state !== "cards" || g.offers.length !== 2 || g.offers[0].length !== 3) throw new Error("no card phase at match start");
    let t = 0;
    let phases = 0;
    let wasCards = true;
    while (g.state !== "matchEnd" && t < 60 * 60 * 16) {
      const shieldsBefore = g.players.map((p) => p.shield);
      const hpBefore = g.players.map((p) => p.hp);
      step(g, DT);
      g.players.forEach((p, i) => {
        if (p.shield < shieldsBefore[i] && p.hp > hpBefore[i] - 1e-6 - 0) shieldSoaked++;
      });
      if (g.state === "cards" && !wasCards) phases++;
      wasCards = g.state === "cards";
      g.events.length = 0;
      t++;
    }
    if (g.state !== "matchEnd") throw new Error(`card match ${k} never finished`);
    const rounds = g.round;
    for (const p of g.players) {
      if (p.cards.length !== rounds) throw new Error(`player has ${p.cards.length} cards after ${rounds} rounds`);
      for (const c of p.cards) rar[CARD_BY_ID[c].rarity]++;
    }
    console.log(`cards ${k}  score ${g.score.join("-")}  rounds ${rounds}  A: ${g.players[0].cards.join(",")}  B: ${g.players[1].cards.join(",")}`);
  }
  console.log("cards kept by rarity:", rar, " shield hits soaked:", shieldSoaked);
  if (shieldSoaked === 0) throw new Error("shield never absorbed damage");
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
