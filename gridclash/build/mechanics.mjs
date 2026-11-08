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
// ---- maps -----------------------------------------------------------------------
{
  const { MAPS } = await import("../src/maps.js");
  const { isRock } = await import("../src/world.js");
  for (const m of Object.values(MAPS)) {
    const g = createGame({ loadouts: [["ar", "ar"], ["ar", "ar"]], names: ["a", "b"], controllers: [idle, idle], seed: 2, map: m.id });
    const pts = [...g.players.map((p) => ({ x: p.x, y: p.y })), ...g.medkits, ...(m.teleporters || []).flat()];
    for (const n of [3, 4]) if (m.ffa) pts.push(...m.ffa[n]);
    const bad = pts.filter((p) => isRock(g.world, Math.floor(p.x), Math.floor(p.y)));
    check(bad.length === 0, `${m.name}: spawns, medkits and teleporters are on open floor`);
  }
}
// teleporters
{
  const g = createGame({ loadouts: [["ar", "ar"], ["ar", "ar"]], names: ["a", "b"], controllers: [idle, idle], seed: 2, map: "arena" });
  g.state = "fight";
  const p = g.players[0];
  p.x = 2.5; p.y = 1.5;
  g.controllers[0] = { poll: () => ({ mx: -1, my: 0, aiming: false, actions: [] }) };
  for (let i = 0; i < 60 && p.x < 20; i++) step(g, 1 / 60);
  g.controllers[0] = idle;
  p.vx = p.vy = 0;
  check(Math.hypot(p.x - 28.5, p.y - 18.5) < 1, `stepping on a teleporter sends you to its partner (now at ${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  for (let i = 0; i < 120; i++) step(g, 1 / 60);
  check(Math.hypot(p.x - 28.5, p.y - 18.5) < 1, "standing on the exit pad doesn't bounce you back");
}
// Pac-Men: bite, knock back, and can be shot down
{
  const g = createGame({ loadouts: [["ar", "ar"], ["ar", "ar"]], names: ["a", "b"], controllers: [idle, idle], seed: 2, map: "pac" });
  g.state = "fight";
  const pc = g.pacs[0];
  pc.release = 0;
  const p = g.players[0];
  p.x = pc.x + 0.5; p.y = pc.y;
  const hp = p.hp;
  for (let i = 0; i < 10; i++) step(g, 1 / 60);
  check(p.hp < hp, `a Pac-Man bites a player it touches (${hp} → ${p.hp})`);
  pc.hp = 1;
  const g2 = g;
  g2.bullets.push({ kind: "bullet", owner: 1, def: g.players[1].guns[0].def, x: pc.x - 1.5, y: pc.y, px: 0, py: 0, dx: 1, dy: 0, speed: 30, left: 4, dmg: 20, age: 0 });
  p.x = 1.5; p.y = 0.5;
  for (let i = 0; i < 10; i++) step(g, 1 / 60);
  check(!pc.alive, "Pac-Men can be shot down");
}
// trains: hit players on the track and smash walls on the rails
{
  const g = createGame({ loadouts: [["ar", "ar"], ["ar", "ar"]], names: ["a", "b"], controllers: [idle, idle], seed: 2, map: "desert" });
  g.state = "fight";
  const p = g.players[0];
  p.x = 15; p.y = 12;
  const pl = wallPlacement(g.world, g.players, 13, 6, 0, 0);
  pl.cells = [[14, 5], [15, 5], [16, 5]];
  placeWall(g.world, 0, pl, 0, 0);
  g.train.phase = "warn"; g.train.t = 0.01;
  const hp = p.hp;
  let ran = false;
  for (let i = 0; i < 60 * 4; i++) {
    step(g, 1 / 60);
    if (g.train.phase === "run") ran = true;
  }
  check(ran && p.hp <= hp - 55 + 0.5, `a train hits a player on the tracks (${hp} → ${p.hp})`);
  check(Math.abs(p.x - 15) > 1.2, "and knocks them off the line");
  check(!g.world.wallAt[5 * 30 + 14] && !g.world.wallAt[5 * 30 + 15], "walls on the rails get smashed");
}

process.exit(ok ? 0 : 1);
