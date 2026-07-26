// Screenshots every area's scene plus the key UI states.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.addInitScript(() => {
  localStorage.setItem("sounding-line/save/v1", JSON.stringify({
    coins: 5e8, rebirths: 5, tokens: 9, rod: "prism",
    rodsOwned: ["twine","prism"], baits: { chum: 30 }, bait: "chum", area: 0,
    areasUnlocked: ["pond","cove","lake","lagoon","marsh","falls","fjord"],
    upgrades: { fortune: 4 }, inventory: [], bestiary: {},
    stats: { casts: 0, catches: 0, escapes: 0, earned: 0, best: 0 },
  }));
});
await p.goto("file:///home/user/Cool-nice-very-fun-fishing-game/dist/index.html");
await p.waitForSelector(".action-main");
await p.waitForTimeout(1500);
for (let i = 0; i < 7; i++) {
  if (i > 0) {
    await p.locator('.tab:has-text("Shop")').click();
    await p.locator(".seg button").nth(2).click();
    await p.waitForTimeout(150);
    await p.locator('.btn:has-text("Travel")').nth(i - 1).click();
    await p.locator('.tab:has-text("Fish")').click();
  }
  await p.waitForTimeout(1400);
  const name = await p.locator(".scene-place").textContent();
  await p.locator(".scene").screenshot({ path: `dist/scene-${i}.png` });
  console.log(`scene ${i}: ${name}`);
}
await p.screenshot({ path: "dist/shot-full.png" });
await b.close();
