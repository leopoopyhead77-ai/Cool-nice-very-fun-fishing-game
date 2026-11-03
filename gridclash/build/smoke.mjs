// End-to-end check of the built page in a landscape phone viewport:
// menu → match, real touch-pointer joysticks (aim/release fires, build mode
// places a wall, edit cuts and restores a tile), plus fast bot-vs-bot matches
// to shake out runtime errors. Screenshots land in gridclash/build/shots/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shots = resolve(root, "build/shots");
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("file://" + resolve(root, "dist/index.html"));
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(shots, "1-menu.png") });

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};

await page.click("#openLoadout");
await page.waitForTimeout(200);
await page.screenshot({ path: resolve(shots, "2-loadout.png") });
check((await page.locator(".gun").count()) >= 10, `armory lists ${await page.locator(".gun").count()} guns`);
await page.click("#loBack");

await page.click("#play");
await page.waitForTimeout(100);

// touch helpers: dispatch real PointerEvents of type "touch"
async function touch(type, id, x, y) {
  await page.evaluate(({ type, id, x, y }) => {
    const cv = document.getElementById("cv");
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: "touch", clientX: x, clientY: y,
      bubbles: true, cancelable: true, isPrimary: id === 1, button: 0,
    }));
  }, { type, id, x, y });
}
const G = (expr) => page.evaluate(`(() => { const g = window.__clash.game; return ${expr}; })()`);
const freeze = () => page.evaluate(() => window.__clash.setPaused(true));
const unfreeze = () => page.evaluate(() => window.__clash.setPaused(false));
const stepN = (n) => page.evaluate((n) => window.__clash.step(n), n);

// skip countdown; park the bot so it doesn't interfere with the scripted checks
await freeze();
await page.evaluate(() => {
  const g = window.__clash.game;
  g.state = "fight";
  g.controllers[1] = { poll: () => ({ mx: 0, my: 0, aiming: false, actions: [] }) };
});

const L = await page.evaluate(() => {
  const l = window.__clash.layout;
  const c = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  return { W: innerWidth, H: innerHeight, u: l.u, aim: l.aim, build: l.build, slot0: c(l.slot0), slot1: c(l.slot1) };
});

// 1. move stick (left half) walks the player right
const x0 = await G("g.players[0].x");
await touch("pointerdown", 1, 130, L.H - 110);
await touch("pointermove", 1, 185, L.H - 110);
await stepN(40);
const x1 = await G("g.players[0].x");
check(x1 > x0 + 1.5, `move joystick walks the player (x ${x0.toFixed(2)} → ${x1.toFixed(2)})`);

// 2. aim stick: drag shows aiming, release fires
await touch("pointerdown", 2, L.aim.x, L.aim.y);
await touch("pointermove", 2, L.aim.x + 50, L.aim.y - 6);
await stepN(2);
check(await G("g.players[0].aiming"), "dragging the aim stick enters aiming (trajectory line shown)");
await unfreeze();
await page.waitForTimeout(120);
await page.screenshot({ path: resolve(shots, "3-aiming.png") });
await freeze();
const shotsBefore = await G("g.players[0].stats.shots");
await touch("pointerup", 2, L.aim.x + 50, L.aim.y - 6);
await stepN(30);
const shotsAfter = await G("g.players[0].stats.shots");
check(shotsAfter > shotsBefore, `release fires (${shotsAfter - shotsBefore} rounds)`);
await touch("pointerup", 1, 185, L.H - 110);
await stepN(20);

// 3. cancel: drag out, come back to centre, release → no shot
await stepN(60);
const s0 = await G("g.players[0].stats.shots");
await touch("pointerdown", 2, L.aim.x, L.aim.y);
await touch("pointermove", 2, L.aim.x + 50, L.aim.y);
await touch("pointermove", 2, L.aim.x + 3, L.aim.y);
await touch("pointerup", 2, L.aim.x + 3, L.aim.y);
await stepN(20);
check((await G("g.players[0].stats.shots")) === s0, "dragging back to centre cancels the shot");

// park the player somewhere with open floor ahead
await page.evaluate(() => { const p = window.__clash.game.players[0]; p.x = 4.5; p.y = 10; p.vx = p.vy = 0; });
await stepN(1);

// 4. build mode: button over the stick, drag shows preview, release places a 3-tile wall
await touch("pointerdown", 3, L.build.x, L.build.y);
await touch("pointerup", 3, L.build.x, L.build.y);
await stepN(1);
check((await G("g.players[0].mode")) === "build", "BUILD button switches the attack stick to build");
const walls0 = await G("g.world.walls.length");
await touch("pointerdown", 2, L.aim.x, L.aim.y);
await touch("pointermove", 2, L.aim.x + 30, L.aim.y);
await stepN(2);
await unfreeze();
await page.waitForTimeout(100);
await page.screenshot({ path: resolve(shots, "4-build-preview.png") });
await freeze();
await touch("pointerup", 2, L.aim.x + 30, L.aim.y);
await stepN(2);
const walls1 = await G("g.world.walls.length");
const cells = await G("g.world.walls.at(-1)?.cells.length");
check(walls1 === walls0 + 1 && cells === 3, `release builds a 3-tile wall (walls ${walls0} → ${walls1})`);

// 5. edit: aim at the wall, release opens one tile; release again restores it
const { slot0, slot1 } = L;
await touch("pointerdown", 3, slot0.x, slot0.y);
await touch("pointerup", 3, slot0.x, slot0.y);
await stepN(1);
check((await G("g.players[0].mode")) === "edit", "EDIT button enters edit mode");
await touch("pointerdown", 2, L.aim.x, L.aim.y);
await touch("pointermove", 2, L.aim.x + 50, L.aim.y);
await stepN(2);
await unfreeze();
await page.waitForTimeout(100);
await page.screenshot({ path: resolve(shots, "5-edit-target.png") });
await freeze();
await touch("pointerup", 2, L.aim.x + 50, L.aim.y);
await stepN(2);
const edit1 = await G("g.world.walls.at(-1).edit");
check(edit1 >= 0, `edit opens tile #${edit1} of the wall`);
await unfreeze();
await page.waitForTimeout(80);
await page.screenshot({ path: resolve(shots, "6-edited.png") });
await freeze();
// RESET restores it
await touch("pointerdown", 3, slot1.x, slot1.y);
await touch("pointerup", 3, slot1.x, slot1.y);
await stepN(2);
check((await G("g.world.walls.at(-1).edit")) === -1, "RESET restores the edited wall");
// open again, and editing the same tile toggles it back
await touch("pointerdown", 2, L.aim.x, L.aim.y);
await touch("pointermove", 2, L.aim.x + 50, L.aim.y);
await touch("pointerup", 2, L.aim.x + 50, L.aim.y);
await stepN(2);
await touch("pointerdown", 2, L.aim.x, L.aim.y);
await touch("pointermove", 2, L.aim.x + 50, L.aim.y);
await touch("pointerup", 2, L.aim.x + 50, L.aim.y);
await stepN(2);
check((await G("g.world.walls.at(-1).edit")) === -1, "editing the open tile again restores it");

// back to combat
await touch("pointerdown", 3, L.build.x, L.build.y);
await touch("pointerup", 3, L.build.x, L.build.y);
await stepN(1);
check((await G("g.players[0].mode")) === "combat", "BUILD button again returns to combat");

// 6. tapping a weapon slot swaps
const slotCombat1 = slot1;
await touch("pointerdown", 3, slotCombat1.x, slotCombat1.y);
await touch("pointerup", 3, slotCombat1.x, slotCombat1.y);
await stepN(1);
check((await G("g.players[0].slot")) === 1, "tapping slot 2 switches weapon");

// 7. live play against the real bot, screenshot mid-fight
await page.evaluate(() => {
  window.__clash.settings.loadout = ["ar", "grenade"];
  window.__clash.startMatch();
});
await page.waitForTimeout(5500);
await touch("pointerdown", 2, L.aim.x, L.aim.y);
await touch("pointermove", 2, L.aim.x + 55, L.aim.y - 4);
await page.waitForTimeout(60);
await page.evaluate(() => window.__clash.game.players[0].slot === 0 && null);
await page.screenshot({ path: resolve(shots, "7-fight.png") });
await touch("pointerup", 2, L.aim.x + 55, L.aim.y - 4);

// 8. the results screen
await page.evaluate(() => {
  const g = window.__clash.game;
  g.score = [2, 1];
  g.state = "fight";
  g.players[1].hp = 1;
  g.bullets.push({ kind: "bullet", owner: 0, def: g.players[0].guns[0].def, x: g.players[1].x - 1, y: g.players[1].y, px: 0, py: 0, dx: 1, dy: 0, speed: 30, left: 3, dmg: 50, age: 0 });
});
await page.waitForTimeout(4500);
check(await page.locator("#results").isVisible(), "match end shows the results screen");
await page.screenshot({ path: resolve(shots, "8-results.png") });

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
