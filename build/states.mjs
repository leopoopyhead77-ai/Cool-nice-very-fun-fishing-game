// Screenshots the fresh-start view, a fight in progress, and a result card.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("file:///home/user/Cool-nice-very-fun-fishing-game/dist/index.html");
await p.waitForSelector(".action-main");
await p.waitForTimeout(1400);
await p.screenshot({ path: "dist/state-fresh.png" });

const a = p.locator(".action");
const tap = async () => { await a.dispatchEvent("pointerdown", { pointerId: 1 }); await a.dispatchEvent("pointerup", { pointerId: 1 }); };
await tap();
await p.waitForTimeout(420);
await p.screenshot({ path: "dist/state-cast.png" });
await tap();
await p.waitForFunction(() => document.querySelector(".action-main")?.textContent === "Hook!", null, { timeout: 15000 });
await p.waitForTimeout(150);
await p.screenshot({ path: "dist/state-bite.png" });
await tap();
await p.waitForTimeout(180);
await a.dispatchEvent("pointerdown", { pointerId: 1 });
await p.waitForTimeout(160);
await p.screenshot({ path: "dist/state-reel.png" });
await a.dispatchEvent("pointerup", { pointerId: 1 });

let holding = false;
const start = Date.now();
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
await p.waitForTimeout(400);
await p.screenshot({ path: "dist/state-result.png" });
console.log("captured");
await b.close();
