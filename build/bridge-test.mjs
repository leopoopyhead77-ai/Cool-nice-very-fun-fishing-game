// Verifies the game persists through the Android SaveBridge contract
// (window.AndroidStore) rather than localStorage, using the exact HTML that
// ships inside the APK.
import { chromium } from "playwright";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Stage the current bundle exactly as apk.sh does, so this always exercises
// what would ship rather than whatever the last APK build left behind.
mkdirSync(resolve(root, "android/assets"), { recursive: true });
copyFileSync(resolve(root, "dist/index.html"), resolve(root, "android/assets/index.html"));

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));

// Stand in for SharedPreferences, and make localStorage throw so any
// accidental fallback is caught rather than silently masking the bridge.
await p.addInitScript(() => {
  // Backed by sessionStorage so it survives a reload the way
  // SharedPreferences survives an app relaunch.
  window.AndroidStore = {
    get: (k) => sessionStorage.getItem("prefs:" + k),
    set: (k, v) => sessionStorage.setItem("prefs:" + k, v),
    remove: (k) => sessionStorage.removeItem("prefs:" + k),
  };
  Object.defineProperty(window, "localStorage", {
    get() { throw new Error("localStorage must not be used when AndroidStore exists"); },
  });
});

await p.goto("file://" + resolve(root, "android/assets/index.html"));
await p.waitForSelector(".action-main");

const a = p.locator(".action");
const txt = () => p.locator(".action-main").textContent();
await a.dispatchEvent("pointerdown", { pointerId: 1 }); await a.dispatchEvent("pointerup", { pointerId: 1 });
await p.waitForTimeout(300);
await a.dispatchEvent("pointerdown", { pointerId: 1 }); await a.dispatchEvent("pointerup", { pointerId: 1 });
await p.waitForFunction(() => document.querySelector(".action-main")?.textContent === "Hook!", null, { timeout: 15000 });
await a.dispatchEvent("pointerdown", { pointerId: 1 }); await a.dispatchEvent("pointerup", { pointerId: 1 });
const start = Date.now(); let holding = false;
while (Date.now() - start < 30000) {
  const st = await p.evaluate(() => {
    const bb = document.querySelector(".bracket"), f = document.querySelector(".blip"), tr = document.querySelector(".track");
    if (!bb || !f) return null;
    const t = tr.getBoundingClientRect(), br = bb.getBoundingClientRect(), fr = f.getBoundingClientRect();
    return { bracket: (br.left + br.width / 2 - t.left) / t.width, fish: (fr.left + fr.width / 2 - t.left) / t.width };
  });
  if (!st) break;
  const want = st.fish > st.bracket + 0.01;
  if (want !== holding) { await a.dispatchEvent(want ? "pointerdown" : "pointerup", { pointerId: 1 }); holding = want; }
  await p.waitForTimeout(24);
}
await a.dispatchEvent("pointerup", { pointerId: 1 });
await p.waitForTimeout(600);

const saved = await p.evaluate(() => sessionStorage.getItem("prefs:sounding-line/save/v1"));
if (!saved) throw new Error("nothing written through AndroidStore");
const parsed = JSON.parse(saved);
console.log(`  bridge holds save: casts=${parsed.stats.casts} hold=${parsed.inventory.length}`);

const label = await (async () => {
  await p.locator('.tab:has-text("Rebirth")').click();
  return p.locator(".panel").last().locator(".panel-note").textContent();
})();
if (label !== "device storage") throw new Error("storage label wrong: " + label);

// A relaunch must restore from the bridge.
await p.reload();
await p.waitForSelector(".action-main");
await p.locator('.tab:has-text("Bucket")').click();
const items = await p.locator(".item").count();
if (items !== parsed.inventory.length) throw new Error(`restore mismatch: ${items} vs ${parsed.inventory.length}`);
console.log(`  relaunch restored ${items} fish from the bridge`);

await b.close();
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
console.log("bridge: OK");
