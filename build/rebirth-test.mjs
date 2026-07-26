// Exercises the meta loop: rebirth resets the run, keeps charts and bestiary,
// grants tokens, and tokens buy permanent upgrades. Also checks the hard reset.
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

await p.addInitScript(() => {
  localStorage.setItem("sounding-line/save/v1", JSON.stringify({
    coins: 200000, rebirths: 0, tokens: 0, rod: "sounder",
    rodsOwned: ["twine", "birchwood", "composite", "sounder"],
    baits: { worm: 12 }, bait: "worm", area: 2,
    areasUnlocked: ["creek", "delta", "pier"],
    upgrades: {}, inventory: [],
    bestiary: { "Moss Bass": { count: 4, best: 3.1, bestMut: 1, tier: 2 } },
    stats: { casts: 60, catches: 48, escapes: 12, earned: 260000, best: 9000 },
  }));
});
await p.goto("file://" + resolve(root, "dist/index.html"));
await p.waitForSelector(".action-main");

const save = () => p.evaluate(() => JSON.parse(localStorage.getItem("sounding-line/save/v1")));
const strip = (i) => p.locator(".strip-value").nth(i).textContent();

await p.locator('.tab:has-text("Rebirth")').click();
await p.locator('.btn:has-text("Rebirth ·")').click();
await p.locator('.btn:has-text("Confirm reset")').click();
await p.waitForTimeout(500);

let s = await save();
if (s.coins !== 0) throw new Error("coins survived rebirth: " + s.coins);
if (s.rebirths !== 1) throw new Error("rebirth count wrong: " + s.rebirths);
if (s.tokens !== 3) throw new Error("tokens wrong: " + s.tokens);
if (s.rod !== "twine" || s.rodsOwned.length !== 1) throw new Error("rods not reset");
if (s.areasUnlocked.length !== 3) throw new Error("charts lost on rebirth");
if (!s.bestiary["Moss Bass"]) throw new Error("bestiary lost on rebirth");
console.log(`  rebirth: coins 0, cycle ${s.rebirths}, ${s.tokens} tokens, charts kept`);

// Spend a token.
await p.locator('.btn:has-text("Buy · 2 tokens")').first().click();
await p.waitForTimeout(400);
s = await save();
if (s.tokens !== 1) throw new Error("token not spent: " + s.tokens);
if (s.upgrades.fortune !== 1) throw new Error("upgrade level not applied");
console.log(`  upgrade: Fortune LV${s.upgrades.fortune}, ${s.tokens} token left`);

// Fortune must actually reach the cast: luck readout is +25 on a Twine rod.
await p.locator('.tab:has-text("Fish")').click();
const luck = await p.locator(".readout .v").nth(2).textContent();
if (luck !== "34") throw new Error(`luck readout should be 25 fortune + 9 worm = 34, got ${luck}`);
console.log(`  luck readout reflects upgrade + bait: ${luck}`);

// Hard reset.
await p.locator('.tab:has-text("Rebirth")').click();
await p.locator('.btn:has-text("Reset save")').click();
await p.locator('.btn:has-text("Erase everything")').click();
await p.waitForTimeout(500);
if (await p.evaluate(() => localStorage.getItem("sounding-line/save/v1"))) {
  const after = await save();
  if (after.rebirths !== 0 || after.tokens !== 0 || Object.keys(after.bestiary).length)
    throw new Error("hard reset left state behind");
}
if ((await strip(0)) !== "0") throw new Error("coins not cleared by reset");
console.log("  hard reset cleared everything");

await b.close();
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
console.log("rebirth: OK");
