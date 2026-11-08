// Tests the web version in <repo>/docs the way an iPhone uses it: served over
// HTTP (like GitHub Pages), iPhone Safari user agent, touch, landscape.
//   - landing page links both games
//   - iOS "Add to Home Screen" hint, web-app manifest and icons
//   - service worker caches the game so it loads with no connection
//   - touch play works
//   - cross-platform online: an iPhone (web) hosts, an Android (APK page) joins by PIN
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = resolve(root, "../docs");
const shots = resolve(root, "build/shots");
mkdirSync(shots, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(docs, p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch (_) {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
// "localhost" so service workers are allowed without https
const base = `http://localhost:${server.address().port}`;

// Two browsers: one talks to the local server directly (site, offline cache,
// touch); the other reaches the internet relay for the online match and gets
// the site files by request interception (an outbound proxy, if any, would
// otherwise swallow localhost).
const exe = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: exe });
const netBrowser = process.env.HTTPS_PROXY
  ? await chromium.launch({ executablePath: exe, proxy: { server: process.env.HTTPS_PROXY } })
  : browser;
const SITE = "https://gridclash.test";
async function serveSite(ctx) {
  await ctx.route(SITE + "/**", async (route) => {
    let p = new URL(route.request().url()).pathname;
    if (p.endsWith("/")) p += "index.html";
    try {
      route.fulfill({ status: 200, contentType: TYPES[extname(p)] || "application/octet-stream", body: await readFile(join(docs, p)) });
    } catch (_) {
      route.fulfill({ status: 404, body: "not found" });
    }
  });
}

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const errors = [];

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
async function iphone(name, net = false) {
  const ctx = await (net ? netBrowser : browser).newContext({
    userAgent: IPHONE_UA, viewport: { width: 844, height: 390 }, deviceScaleFactor: 2,
    hasTouch: true, isMobile: true, ignoreHTTPSErrors: true,
    serviceWorkers: net ? "block" : "allow",
  });
  if (net) await serveSite(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("console", (m) => m.type() === "error" && !/WebSocket|ERR_|net::|favicon/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  return page;
}

// landing page
const land = await iphone("landing");
await land.setViewportSize({ width: 390, height: 844 });
await land.goto(base + "/");
check((await land.locator('a[href="play/"]').count()) === 1 && (await land.locator('a[href="online/"]').count()) === 1, "landing page links both games");
check(await land.locator("text=Add to Home Screen").count() > 0, "landing page explains Add to Home Screen");
await land.screenshot({ path: resolve(shots, "20-web-landing.png") });

// local game as an iPhone in Safari
const pg = await iphone("play");
await pg.goto(base + "/play/");
await pg.waitForTimeout(800);
check(await pg.locator(".ios-hint").isVisible(), "iPhone Safari shows the 'Add to Home Screen' hint");
const man = await pg.evaluate(async () => {
  const href = document.querySelector('link[rel="manifest"]').href;
  const m = await (await fetch(href)).json();
  const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, href))).ok));
  const touch = (await fetch(document.querySelector('link[rel="apple-touch-icon"]').href)).ok;
  return { name: m.name, display: m.display, icons: icons.every(Boolean), touch, ios: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]') };
});
check(man.name === "Grid Clash" && man.display === "fullscreen" && man.icons && man.touch && man.ios, "web-app manifest, home-screen icons and iOS full-screen tags are in place");
const sw = await pg.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return !!reg.active;
});
check(sw, "service worker installed (offline cache)");
await pg.screenshot({ path: resolve(shots, "21-web-iphone-menu.png") });

// offline: reload with no network
await pg.reload();
await pg.waitForTimeout(500);
await pg.context().setOffline(true);
await pg.reload();
await pg.waitForTimeout(800);
check(await pg.locator("#play").isVisible(), "game still loads with no connection (from the offline cache)");
await pg.context().setOffline(false);

// touch play
await pg.click("#play");
await pg.waitForTimeout(200);
await pg.click("#selP0 .sel-ready"); // item pick → FIGHT
await pg.waitForTimeout(300);
await pg.evaluate(() => {
  window.__clash.setPaused(true);
  window.__clash.game.state = "fight";
});
const L = await pg.evaluate(() => window.__clash.layout.pads[0]);
const touch = (type, id, x, y) => pg.evaluate(({ type, id, x, y }) => {
  document.getElementById("cv").dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true }));
}, { type, id, x, y });
const x0 = await pg.evaluate(() => window.__clash.game.players[0].x);
await touch("pointerdown", 1, L.move.x, L.move.y);
await touch("pointermove", 1, L.move.x + 50, L.move.y);
await pg.evaluate(() => window.__clash.step(40));
await touch("pointerup", 1, L.move.x + 50, L.move.y);
const x1 = await pg.evaluate(() => window.__clash.game.players[0].x);
check(x1 > x0 + 1.5, `touch controls work on the iPhone web version (x ${x0.toFixed(1)} → ${x1.toFixed(1)})`);

// cross-platform: iPhone (web) hosts, Android (APK page) joins
const ip = await iphone("online-iphone", true);
await ip.goto(SITE + "/online/");
await ip.waitForTimeout(500);
await ip.click("#online");
await ip.fill("#netName", "iPhone");
await ip.click("#netCreate");
let pin = null;
try {
  await ip.waitForFunction(() => /^\d{6}$/.test(document.getElementById("lbCode").textContent), null, { timeout: 30000 });
  pin = await ip.textContent("#lbCode");
} catch (_) { /* reported below */ }
check(!!pin, "iPhone (web) hosts an online room");
if (pin) {
  const actx = await netBrowser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const android = await actx.newPage();
  android.on("pageerror", (e) => errors.push(`android: ${e}`));
  await android.goto("file://" + resolve(root, "dist/online/index.html"));
  await android.waitForTimeout(300);
  await android.click("#online");
  await android.fill("#netName", "Android");
  await android.fill("#netCode", pin);
  await android.click("#netJoin");
  let joined = false;
  try {
    await ip.waitForFunction(() => [...document.querySelectorAll("#lbSlots .sname")].some((e) => e.textContent.includes("Android")), null, { timeout: 30000 });
    joined = true;
  } catch (_) { /* reported below */ }
  check(joined, "Android app joins the iPhone's room with the PIN");
  await ip.click("#lbStart");
  let playing = false;
  try {
    await android.waitForFunction(() => window.__clash.mode === "guest" && window.__clash.game, null, { timeout: 20000 });
    playing = true;
  } catch (_) { /* reported below */ }
  check(playing, "iPhone and Android are in the same match");
  await ip.waitForTimeout(4500);
  await ip.screenshot({ path: resolve(shots, "22-web-iphone-hosting.png") });
  await actx.close();
}

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 4).join(" | ") : ""}`);
await browser.close();
if (netBrowser !== browser) await netBrowser.close();
server.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall web checks passed");
