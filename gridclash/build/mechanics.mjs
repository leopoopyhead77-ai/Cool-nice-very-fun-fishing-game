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
// railgun: through ONE wall (destroying it on the beam's path), stopped by a second
{
  const shot = (walls) => {
    const g = mk("rail");
    for (let k = 0; k < walls; k++) {
      const pl = wallPlacement(g.world, g.players, 5.5, 16.5, 0, 0);
      pl.cells = [[6 + k * 2, 15], [6 + k * 2, 16], [6 + k * 2, 17]];
      placeWall(g.world, 1, pl, 0, 1);
    }
    const hp = g.players[1].hp;
    fire(g, 0);
    step(g, 1 / 60);
    const firstGone = !g.world.wallAt[16 * 30 + 6];
    return { dmg: hp - g.players[1].hp, firstGone, walls: g.world.walls.length };
  };
  const open = shot(0), one = shot(1), two = shot(2);
  check(open.dmg === 42, `Railgun hits for 42 in the open (${open.dmg})`);
  check(one.dmg > 0 && one.dmg < 42 && one.firstGone, `Railgun blasts through one wall, destroying it, 30% weaker (${one.dmg})`);
  check(two.dmg === 0 && two.firstGone, `Railgun is stopped by a second wall (${two.dmg} dmg)`);
}
// grenade launcher: limited supply per round, then it switches to the other gun
{
  const g = createGame({ loadouts: [["grenade", "pistol"], ["pistol", "pistol"]], names: ["a", "b"], controllers: [idle, idle], seed: 5 });
  g.state = "fight";
  const p = g.players[0];
  p.x = 4.5; p.y = 3.5;
  g.players[1].x = 25.5; g.players[1].y = 16.5;
  let fired = 0;
  for (let k = 0; k < 40 && p.slot === 0; k++) {
    const before = p.stats.shots;
    fire(g, -Math.PI / 2, 0.3);
    for (let i = 0; i < 60 * 3; i++) step(g, 1 / 60);
    fired += p.stats.shots - before;
  }
  check(fired === 6, `Grenade Launcher fires exactly 6 grenades per round (${fired})`);
  check(p.slot === 1, "when it runs out you switch to your other gun");
  g.state = "roundEnd"; g.stateT = 0.01; g.score = [0, 1];
  for (let i = 0; i < 10; i++) step(g, 1 / 60);
  check(p.guns[0].ammo + p.guns[0].reserve === 6, "the supply refills next round");
}
process.exit(ok ? 0 : 1);
