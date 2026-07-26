// End-to-end smoke test: drives a real cast → hook → reel → catch → sell cycle
// in a phone-sized Chromium and fails on any console error.
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("file://" + resolve(root, "dist/index.html"));
await page.waitForSelector(".action-main");

const action = page.locator(".action");
const mainText = () => page.locator(".action-main").textContent();

const step = async (label) => console.log("  " + label);

// --- one full fishing cycle ------------------------------------------------
async function cycle(n) {
  await action.dispatchEvent("pointerdown", { pointerId: 1 });
  await action.dispatchEvent("pointerup", { pointerId: 1 });
  if ((await mainText()) !== "Set") throw new Error("cast did not start: " + (await mainText()));

  await page.waitForTimeout(300);
  await action.dispatchEvent("pointerdown", { pointerId: 1 });
  await action.dispatchEvent("pointerup", { pointerId: 1 });
  if ((await mainText()) !== "Waiting") throw new Error("cast did not lock");

  await page.waitForFunction(
    () => document.querySelector(".action-main")?.textContent === "Hook!",
    null,
    { timeout: 15000 }
  );
  await action.dispatchEvent("pointerdown", { pointerId: 1 });
  await action.dispatchEvent("pointerup", { pointerId: 1 });
  if ((await mainText()) !== "Hold") throw new Error("hook failed");

  // Reel: hold whenever the fish is right of the bracket.
  const start = Date.now();
  let holding = false;
  while (Date.now() - start < 30000) {
    const st = await page.evaluate(() => {
      const b = document.querySelector(".bracket");
      const f = document.querySelector(".blip");
      const m = document.querySelector(".meter-fill");
      if (!b || !f) return null;
      const tr = document.querySelector(".track").getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      return {
        bracket: (br.left + br.width / 2 - tr.left) / tr.width,
        fish: (fr.left + fr.width / 2 - tr.left) / tr.width,
        fill: parseFloat(m.style.width) || 0,
      };
    });
    if (!st) break; // phase changed
    const want = st.fish > st.bracket + 0.01;
    if (want !== holding) {
      await action.dispatchEvent(want ? "pointerdown" : "pointerup", { pointerId: 1 });
      holding = want;
    }
    await page.waitForTimeout(24);
  }
  await action.dispatchEvent("pointerup", { pointerId: 1 });
  const label = await mainText();
  if (label !== "Cast again") throw new Error("reel never resolved: " + label);
  const landed = (await page.locator(".result-name").count()) > 0;
  await step(`cycle ${n}: ${landed ? "landed " + (await page.locator(".result-name").first().textContent()) : "escaped"}`);
  return landed;
}

let landed = 0;
for (let i = 1; i <= 4; i++) if (await cycle(i)) landed += 1;
if (!landed) throw new Error("four cycles, zero fish landed — reel is unwinnable");

// --- selling ---------------------------------------------------------------
await page.locator('.tab:has-text("Hold")').click();
await page.waitForSelector(".item");
const before = await page.locator(".strip-value").first().textContent();
await page.locator('.btn:has-text("Sell all")').click();
await page.waitForTimeout(250);
const after = await page.locator(".strip-value").first().textContent();
if (before === after) throw new Error("selling did not change the coin readout");
await step(`sold: coins ${before} -> ${after}`);

// --- other tabs render -----------------------------------------------------
for (const t of ["Shop", "Log", "Rebirth", "Fish"]) {
  await page.locator(`.tab:has-text("${t}")`).click();
  await page.waitForTimeout(120);
}
await page.locator('.tab:has-text("Shop")').click();
for (const i of [1, 2, 0]) {
  await page.locator(".seg button").nth(i).click();
  await page.waitForSelector(".panel");
  await page.waitForTimeout(120);
}
await step("all tabs rendered");

// --- persistence -----------------------------------------------------------
const coins = await page.locator(".strip-value").first().textContent();
await page.reload();
await page.waitForSelector(".action-main");
const coinsAfter = await page.locator(".strip-value").first().textContent();
if (coins !== coinsAfter) throw new Error(`save lost on reload: ${coins} -> ${coinsAfter}`);
await step(`persisted across reload at ${coinsAfter}`);

await page.locator('.tab:has-text("Fish")').click();
await page.screenshot({ path: resolve(root, "dist/shot-fish.png") });
await page.locator('.tab:has-text("Shop")').click();
await page.screenshot({ path: resolve(root, "dist/shot-shop.png") });

await browser.close();

if (errors.length) {
  console.error("console errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("smoke: OK");
