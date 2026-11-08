// Weapon mechanic checks: ricochet bounces, frost slows, flamer burns, cluster splits, rail loses damage through walls
import { createGame, step } from "../src/game.js";
import { placeWall, wallPlacement } from "../src/world.js";
const idle = { poll: () => ({ mx: 0, my: 0, aiming: false, actions: [] }) };
function mk(gun) {
  const g = createGame({ loadouts: [[gun, gun], ["pistol", "pistol"]], names: ["a", "b"], controllers: [idle, idle], seed: 5 });
  g.state = "fight";
  const [a, b] = g.players;
  a.x = 4.5; a.y = 16.5; b.x = 10.5; b.y = 16.5;
  return g;
}
const fire = (g, angle, mag = 1) => { g.controllers[0] = { poll: () => ({ mx: 0, my: 0, aiming: false, actions: [{ t: "fire", angle, mag }] }) }; step(g, 1 / 60); g.controllers[0] = idle; };
let ok = true; const check = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) ok = false; };
// frost
{ const g = mk("frost"); fire(g, 0); let slowed = false; for (let i = 0; i < 60; i++) { step(g, 1 / 60); if (g.players[1].slowT > 0) slowed = true; } check(slowed, "Frost Ray slows its target"); }
// flamer burn
{ const g = mk("flamer"); g.players[1].x = 7.5; fire(g, 0); let burned = false; for (let i = 0; i < 40; i++) { step(g, 1 / 60); if (g.players[1].burnT > 0) burned = true; } const hp = g.players[1].hp; for (let i = 0; i < 90; i++) step(g, 1 / 60); check(burned && g.players[1].hp < hp, `Flamethrower sets targets on fire (burn ticks: ${hp} → ${g.players[1].hp})`); }
// ricochet: wall between, enemy reachable only via bounce off the arena edge? just check bounces happen
{ const g = mk("ricochet"); const evs = []; fire(g, -Math.PI / 2); for (let i = 0; i < 90; i++) { step(g, 1 / 60); evs.push(...g.events); g.events.length = 0; } check(evs.some((e) => e.t === "bounce"), "Ricochet bolts bounce off walls"); }
// cluster
{ const g = mk("cluster"); fire(g, 0, 0.6); let booms = 0; for (let i = 0; i < 120; i++) { step(g, 1 / 60); booms += g.events.filter((e) => e.t === "boom").length; g.events.length = 0; } check(booms >= 5, `Cluster Launcher bursts into bomblets (${booms} explosions)`); }
// rail through walls
{
  const dmgThrough = (walls) => { const g = mk("rail"); for (let k = 0; k < walls; k++) { const pl = wallPlacement(g.world, g.players, 5.5 + k * 1.0, 16.5, 0, 0); pl.cells = [[6 + k, 15], [6 + k, 16], [6 + k, 17]]; placeWall(g.world, 1, pl, 0, 1); } const hp = g.players[1].hp; fire(g, 0); step(g, 1 / 60); return hp - g.players[1].hp; };
  const d0 = dmgThrough(0), d2 = dmgThrough(2);
  check(d0 === 42 && d2 < d0 * 0.6, `Railgun loses damage per wall (open ${d0}, through 2 walls ${d2})`);
}
process.exit(ok ? 0 : 1);
