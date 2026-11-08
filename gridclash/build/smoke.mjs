// End-to-end check of the local app (Grid Clash) in phone viewports, driven
// by real touch PointerEvents:
//   vs bot: item pick → buff card pick → shield → move / aim / fire / cancel →
//           one-touch building (tap, aimed drag, cancel) → edit / restore → swap
//   2 players (upright phone): both pick items, both pick cards, both play
// Screenshots land in gridclash/build/shots/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shots = resolve(root, "build/shots");
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("file://" + resolve(root, "dist/index.html"));
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(shots, "1-menu.png") });
let failuresEarly = 0;
const btns = await page.locator("#buildStyle button").count();
if (btns !== 2) failuresEarly++;
console.log(`${btns === 2 ? "ok  " : "FAIL"} menu offers Build: Stick / Classic`);

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

async function touch(type, id, x, y) {
  await page.evaluate(({ type, id, x, y }) => {
    document.getElementById("cv").dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: "touch", clientX: x, clientY: y,
      bubbles: true, cancelable: true, isPrimary: id === 1, button: 0,
    }));
  }, { type, id, x, y });
}
const tap = async (id, x, y) => {
  await touch("pointerdown", id, x, y);
  await touch("pointerup", id, x, y);
};
const G = (expr) => page.evaluate(`(() => { const g = window.__clash.game; return ${expr}; })()`);
const freeze = () => page.evaluate(() => window.__clash.setPaused(true));
const unfreeze = () => page.evaluate(() => window.__clash.setPaused(false));
const stepN = (n) => page.evaluate((n) => window.__clash.step(n), n);
const pads = () => page.evaluate(() => window.__clash.layout.pads.map((p) => ({
  team: p.team, rot: p.rot, move: p.move, aim: p.aim, build: p.build, edit: p.edit, reset: p.reset,
  slot0: { x: p.slot0.cx, y: p.slot0.cy }, slot1: { x: p.slot1.cx, y: p.slot1.cy },
})));
const cardRects = () => page.evaluate(() => window.__clash.cardRects());

// ---------------------------------------------------------------- vs bot
await page.click("#play");
await page.waitForTimeout(200);
check(await page.locator("#select").isVisible(), "PLAY vs BOT opens the item pick screen");
check((await page.locator("#selP0 .item").count()) === 12, "all 12 items are on the pick screen");
check((await page.locator("#selP0 .item img").count()) === 12, "every item has a drawn icon");
await page.click('#selP0 .item[data-id="sniper"]');
await page.click('#selP0 .item[data-id="smg"]');
check((await page.locator("#selP0 .item.on").count()) === 2, "picking a third item swaps out the oldest (2 max)");
await page.screenshot({ path: resolve(shots, "2-item-pick.png") });
await page.click("#selP0 .sel-ready");
await page.waitForTimeout(200);
check(await page.evaluate(() => !!window.__clash.game), "FIGHT starts the match");
check(JSON.stringify(await G("g.players[0].loadout")) === JSON.stringify(["sniper", "smg"]), "the match uses the picked items");

// buff cards before round 1
await freeze();
check((await G("g.state")) === "cards", "a buff-card pick comes before the round");
check((await G("g.offers[0].length")) === 3, "the player is offered 3 cards");
await unfreeze();
await page.waitForTimeout(250);
await page.screenshot({ path: resolve(shots, "3-cards.png") });
await freeze();
const rects = await cardRects();
await tap(5, rects[0][1].cx, rects[0][1].cy);
await stepN(1);
check((await G("g.picks[0]")) === 1, "tapping a card picks it");
await stepN(60 * 4); // the bot thinks, then the round sets up
check((await G("g.players[0].cards.length")) === 1 && (await G("g.players[1].cards.length")) === 1, "both players (the bot too) keep one card");
console.log("     cards:", await G("g.players.map((p) => p.cards.join(','))"));

// park the bot; give player 1 a shield and check it soaks damage first
await page.evaluate(() => {
  const g = window.__clash.game;
  g.controllers[1] = { poll: () => ({ mx: 0, my: 0, aiming: false, actions: [] }) };
  const p = g.players[0];
  p.maxShield = 50;
  p.shield = 50;
  g.state = "fight";
});
const hp0 = await G("g.players[0].hp");
await page.evaluate(() => {
  const g = window.__clash.game;
  g.bullets.push({ kind: "bullet", owner: 1, def: g.players[1].guns[0].def, x: g.players[0].x - 1.2, y: g.players[0].y, px: 0, py: 0, dx: 1, dy: 0, speed: 30, left: 3, dmg: 20, age: 0 });
});
await stepN(20);
check((await G("g.players[0].shield")) < 50 && (await G("g.players[0].hp")) === hp0, "damage hits the blue shield before health");

// move
const P = (await pads())[0];
const x0 = await G("g.players[0].x");
await touch("pointerdown", 1, P.move.x, P.move.y);
await touch("pointermove", 1, P.move.x + 55, P.move.y);
await stepN(40);
await touch("pointerup", 1, P.move.x + 55, P.move.y);
const x1 = await G("g.players[0].x");
check(x1 > x0 + 1.5, `move stick walks the player (x ${x0.toFixed(2)} → ${x1.toFixed(2)})`);

// aim + fire, cancel
await stepN(80);
await touch("pointerdown", 2, P.aim.x, P.aim.y);
await touch("pointermove", 2, P.aim.x + 50, P.aim.y - 6);
await stepN(2);
check(await G("g.players[0].aiming"), "aim stick shows the aim line");
const s0 = await G("g.players[0].stats.shots");
await touch("pointerup", 2, P.aim.x + 50, P.aim.y - 6);
await stepN(40);
check((await G("g.players[0].stats.shots")) > s0, "release fires");
await stepN(120);
const s1 = await G("g.players[0].stats.shots");
await touch("pointerdown", 2, P.aim.x, P.aim.y);
await touch("pointermove", 2, P.aim.x + 50, P.aim.y);
await touch("pointermove", 2, P.aim.x + 3, P.aim.y);
await touch("pointerup", 2, P.aim.x + 3, P.aim.y);
await stepN(20);
check((await G("g.players[0].stats.shots")) === s1, "dragging back to centre cancels");

// one-touch building
await page.evaluate(() => {
  const p = window.__clash.game.players[0];
  p.x = 4.5; p.y = 10; p.vx = p.vy = 0; p.facing = 0; p.mats = 300;
});
await stepN(1);
const w0 = await G("g.world.walls.length");
await tap(3, P.build.x, P.build.y);
await stepN(2);
const w1 = await G("g.world.walls.length");
check(w1 === w0 + 1 && (await G("g.players[0].mode")) === "combat", "tap BUILD: a wall drops in front, no mode switch");
console.log("     quick wall at", await G("g.world.walls.at(-1).cells.map((c) => c.x + ',' + c.y).join(' ')"));
// aimed: drag up from BUILD
await touch("pointerdown", 3, P.build.x, P.build.y);
await touch("pointermove", 3, P.build.x, P.build.y - 70);
await stepN(2);
check(!!(await G("g.players[0].buildAim")), "dragging from BUILD shows a placement preview");
await unfreeze();
await page.waitForTimeout(120);
await page.screenshot({ path: resolve(shots, "4-build-drag.png") });
await freeze();
await touch("pointerup", 3, P.build.x, P.build.y - 70);
await stepN(2);
check((await G("g.world.walls.length")) === w1 + 1 && (await G("g.world.walls.at(-1).vertical")) === false, "release places the aimed wall (across the drag)");
// cancel
await touch("pointerdown", 3, P.build.x, P.build.y);
await touch("pointermove", 3, P.build.x - 80, P.build.y);
await touch("pointermove", 3, P.build.x + 4, P.build.y);
await touch("pointerup", 3, P.build.x + 4, P.build.y);
await stepN(2);
check((await G("g.world.walls.length")) === w1 + 1, "dragging back onto BUILD cancels");

// edit: tap EDIT cuts the wall in front; ↺ restores; drag picks a wall
await page.evaluate(() => { window.__clash.game.players[0].facing = 0; });
await tap(4, P.edit.x, P.edit.y);
await stepN(2);
check((await G("g.world.walls.filter((w) => w.edit >= 0).length")) === 1, "tap EDIT cuts a gap in your wall in front");
await unfreeze();
await page.waitForTimeout(100);
await page.screenshot({ path: resolve(shots, "5-edited.png") });
await freeze();
await tap(6, P.reset.x, P.reset.y);
await stepN(2);
check((await G("g.world.walls.filter((w) => w.edit >= 0).length")) === 0, "↺ restores the edit");
await touch("pointerdown", 4, P.edit.x, P.edit.y);
await touch("pointermove", 4, P.edit.x, P.edit.y - 70);
await stepN(1);
await touch("pointerup", 4, P.edit.x, P.edit.y - 70);
await stepN(2);
check((await G("g.world.walls.filter((w) => w.edit >= 0).length")) === 1, "drag from EDIT picks which wall to cut");

// weapons are always one tap away
await tap(7, P.slot1.x, P.slot1.y);
await stepN(1);
check((await G("g.players[0].slot")) === 1, "weapon slot 2 switches gun");

// build reach: one tile shorter (max 3.75 tiles)
await page.evaluate(() => { const p = window.__clash.game.players[0]; p.x = 4.5; p.y = 6.5; p.facing = 0; });
await stepN(1);
await touch("pointerdown", 3, P.build.x, P.build.y);
await touch("pointermove", 3, P.build.x + 200, P.build.y);
await stepN(1);
await touch("pointerup", 3, P.build.x + 200, P.build.y);
await stepN(2);
const far = await G("g.world.walls.at(-1).cells[1].x + 0.5 - g.players[0].x");
check(far <= 4.1, `full-length drag lands about 3.75 tiles away (${far.toFixed(2)})`);

// Classic (OG) build controls, picked on the menu
await page.evaluate(() => { window.__clash.settings.buildStyle = "classic"; });
await page.evaluate(() => {
  const g = window.__clash.game;
  const p = g.players[0];
  p.x = 3.5; p.y = 13.5; p.vx = p.vy = 0; p.facing = 0; p.mats = 300; p.mode = "combat";
});
await stepN(1);
await tap(3, P.build.x, P.build.y);
await stepN(1);
check((await G("g.players[0].mode")) === "build", "Classic: BUILD switches to build mode");
const cw0 = await G("g.world.walls.length");
await touch("pointerdown", 2, P.aim.x, P.aim.y);
await touch("pointermove", 2, P.aim.x + 30, P.aim.y);
await stepN(2);
await unfreeze();
await page.waitForTimeout(120);
await page.screenshot({ path: resolve(shots, "6b-classic-build.png") });
await freeze();
await touch("pointerup", 2, P.aim.x + 30, P.aim.y);
await stepN(2);
check((await G("g.world.walls.length")) === cw0 + 1, "Classic: the aim stick places the wall in build mode");
await tap(7, P.slot0.x, P.slot0.y);
await stepN(1);
check((await G("g.players[0].mode")) === "edit", "Classic: the EDIT slot enters edit mode");
await touch("pointerdown", 2, P.aim.x, P.aim.y);
await touch("pointermove", 2, P.aim.x + 40, P.aim.y);
await touch("pointerup", 2, P.aim.x + 40, P.aim.y);
await stepN(2);
check((await G("g.world.walls.at(-1).edit")) >= 0, "Classic: releasing on your wall cuts a tile");
await tap(7, P.slot1.x, P.slot1.y);
await stepN(2);
check((await G("g.world.walls.at(-1).edit")) === -1, "Classic: RESET restores it");
await tap(3, P.build.x, P.build.y);
await stepN(1);
check((await G("g.players[0].mode")) === "combat", "Classic: BUILD again goes back to shooting");
await page.evaluate(() => { window.__clash.settings.buildStyle = "stick"; });
await unfreeze();
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(shots, "6-fight.png") });

// a stretch of real play against the bot, then the results screen
await page.evaluate(() => window.__clash.startMatch("bot"));
await page.waitForTimeout(400);
for (let i = 0; i < 40 && (await G("g.state")) !== "fight"; i++) {
  if ((await G("g.state")) === "cards" && (await G("g.picks[0]")) < 0) {
    const r = await cardRects();
    await tap(9, r[0][0].cx, r[0][0].cy);
  }
  await page.waitForTimeout(250);
}
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(shots, "7-fight-live.png") });
await page.evaluate(() => {
  const g = window.__clash.game;
  g.score = [2, 1];
  g.players[1].hp = 1;
  g.players[1].shield = 0;
  g.bullets.push({ kind: "bullet", owner: 0, def: g.players[0].guns[0].def, x: g.players[1].x - 0.3, y: g.players[1].y, px: 0, py: 0, dx: 1, dy: 0, speed: 30, left: 3, dmg: 50, age: 0 });
});
await page.waitForTimeout(4500);
console.log("     state:", await G("g.state + ' score ' + g.score.join('-') + ' hp ' + g.players.map((p) => p.hp).join('/') + ' round ' + g.round"));
check(await page.locator("#results").isVisible(), "match end shows the results screen");
await page.screenshot({ path: resolve(shots, "8-results.png") });

// ---------------------------------------------------------------- 2 players, upright phone
await page.click("#toMenu");
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.getElementById("pvp").click());
await page.waitForTimeout(250);
check(await page.locator("#select").isVisible() && (await page.locator(".sel-panel .item").count()) === 24, "2 PLAYERS: both players get an item panel");
const topTransform = await page.evaluate(() => getComputedStyle(document.getElementById("selP1")).transform);
check(topTransform !== "none", "player 2's panel is flipped to face the top end");
for (const id of ["shotgun", "rocket"]) await page.click(`#selP0 .item[data-id="${id}"]`);
for (const id of ["minigun", "rail"]) await page.click(`#selP1 .item[data-id="${id}"]`);
await page.screenshot({ path: resolve(shots, "9-pvp-item-pick.png") });
await page.click("#selP0 .sel-ready");
check(!(await page.evaluate(() => window.__clash.mode === "pvp" && !!window.__clash.game)), "the match waits until both players are ready");
await page.click("#selP1 .sel-ready");
await page.waitForTimeout(200);
check(await page.evaluate(() => window.__clash.mode === "pvp" && !!window.__clash.game), "both ready: the 2-player match starts");
const los = await G("g.players.map((p) => [...p.loadout].sort().join('+')).join(' | ')");
check(los === "rocket+shotgun | minigun+rail", `each player gets their own items (${los})`);
await freeze();
check((await G("g.state")) === "cards", "2 players: card pick before the round");
await unfreeze();
await page.waitForTimeout(250);
await page.screenshot({ path: resolve(shots, "10-pvp-cards.png") });
await freeze();
const prs = await cardRects();
await tap(11, prs[0][1].cx, prs[0][1].cy);
await stepN(1);
check((await G("g.picks[0]")) === 1 && (await G("g.picks[1]")) === -1, "Blue picks; Red is still choosing");
await tap(12, prs[1][2].cx, prs[1][2].cy);
await stepN(1);
check((await G("g.state")) === "countdown" && (await G("g.players[1].cards.length")) === 1, "Red picks; the round starts");
await stepN(200);
const PP = await pads();
await tap(13, PP[1].build.x, PP[1].build.y);
await stepN(2);
check((await G("g.world.walls.filter((w) => w.owner === 1).length")) === 1, "Red's BUILD tap builds for Red");
await unfreeze();
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(shots, "11-pvp-fight.png") });

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
failures += failuresEarly;
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
