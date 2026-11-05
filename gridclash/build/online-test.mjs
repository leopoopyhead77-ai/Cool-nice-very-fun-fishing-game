// End-to-end online test: separate browser "phones" play through the real
// public relay (over the internet), exactly as the app does on mobile data.
//   1v1: create → join by code → start → guest moves / shoots / builds / edits
//   2v2: host + 2 guests (+1 bot) → start → everyone sees 4 players
//   a guest dropping out mid-match is replaced by a bot on the host
// Needs internet access. Set HTTPS_PROXY if your network requires a proxy.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shots = resolve(root, "build/shots");
mkdirSync(shots, { recursive: true });
// the Grid Clash Online app
const url = "file://" + resolve(root, "dist/online/index.html");

const launch = { executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" };
if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY };
const browser = await chromium.launch(launch);

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const errors = [];

// RELAY_ONLY=1 disables WebRTC on every phone, like a carrier NAT that blocks
// direct links: then all traffic must go through the public broker.
const RELAY_ONLY = process.env.RELAY_ONLY === "1";
async function phone(name) {
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true,
  });
  if (RELAY_ONLY) await ctx.addInitScript(() => { delete window.RTCPeerConnection; });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("console", (m) => m.type() === "error" && !/WebSocket|ERR_|net::/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  await page.goto(url);
  await page.waitForTimeout(300);
  return page;
}

async function touch(page, type, id, x, y) {
  await page.evaluate(({ type, id, x, y }) => {
    document.getElementById("cv").dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0,
    }));
  }, { type, id, x, y });
}

const waitFor = async (page, fn, arg, ms = 25000) => {
  try {
    await page.waitForFunction(fn, arg, { timeout: ms, polling: 200 });
    return true;
  } catch (_) {
    return false;
  }
};
const G = (page, expr) => page.evaluate(`(() => { const g = window.__clash.game; return ${expr}; })()`);

async function openOnline(page, name) {
  await page.click("#online");
  await page.fill("#netName", name);
}

// ---------------------------------------------------------------- 1v1
const host = await phone("host");
const gst = await phone("guest");
await openOnline(host, "Hoster");
await host.click('#netMode button[data-m="1v1"]');
await host.click("#netCreate");
const created = await waitFor(host, () => /^\d{6}$/.test(document.getElementById("lbCode").textContent));
check(created, "host creates a room on the public relay");
const code = await host.textContent("#lbCode");
console.log("     room PIN:", code);
await host.screenshot({ path: resolve(shots, "11-online-lobby-host.png") });

await openOnline(gst, "Guesty");
await gst.fill("#netCode", code);
await gst.click("#netJoin");
const joined = await waitFor(host, () => [...document.querySelectorAll("#lbSlots .sname")].some((e) => e.textContent.includes("Guesty")));
check(joined, "guest joins by code and appears in the host's lobby");
const guestLobby = await waitFor(gst, () => !document.getElementById("lobby").classList.contains("hidden"));
check(guestLobby, "guest sees the lobby");
await gst.screenshot({ path: resolve(shots, "12-online-lobby-guest.png") });

// give the direct (WebRTC) link a moment
await host.waitForTimeout(2500);
const link = await host.evaluate(() => window.__clash.net.host.slots[1]?.link);
console.log("     guest link:", link);
if (RELAY_ONLY) check(link === "relay", "relay-only mode: no direct link, traffic goes through the public broker");

await host.click("#lbStart");
const started = await waitFor(gst, () => window.__clash.mode === "guest" && !!window.__clash.game);
check(started, "host starts; guest enters the match");
check(await G(gst, "window.__clash.local === 1 && g.players.length === 2"), "guest controls player 2 (red)");

// wait out the countdown on the host
await waitFor(host, () => window.__clash.game.state === "fight", null, 8000);
await waitFor(gst, () => window.__clash.game.state === "fight", null, 8000);

const L = await gst.evaluate(() => {
  const pad = window.__clash.layout.pads[0];
  return { move: pad.move, aim: pad.aim, build: pad.build, slot0: { x: pad.slot0.cx, y: pad.slot0.cy } };
});
// guest walks left (toward blue) — the HOST's simulation must move red
const hx0 = await G(host, "g.players[1].x");
await touch(gst, "pointerdown", 1, L.move.x, L.move.y);
await touch(gst, "pointermove", 1, L.move.x - 50, L.move.y);
await gst.waitForTimeout(1500);
await touch(gst, "pointerup", 1, L.move.x - 50, L.move.y);
await gst.waitForTimeout(700);
const hx1 = await G(host, "g.players[1].x");
const gx1 = await G(gst, "g.players[1].x");
check(hx1 < hx0 - 2, `guest's move stick moves red on the host (x ${hx0.toFixed(1)} → ${hx1.toFixed(1)})`);
check(Math.abs(gx1 - hx1) < 1.2, `guest's predicted position matches the host (${gx1.toFixed(2)} vs ${hx1.toFixed(2)})`);

// guest aims and fires
const s0 = await G(host, "g.players[1].stats.shots");
await touch(gst, "pointerdown", 2, L.aim.x, L.aim.y);
await touch(gst, "pointermove", 2, L.aim.x - 50, L.aim.y);
await gst.waitForTimeout(250);
check(await G(gst, "g.players[1].aiming"), "guest sees their own aim line instantly");
if (!RELAY_ONLY) await gst.screenshot({ path: resolve(shots, "13-online-guest-aiming.png") });
await touch(gst, "pointerup", 2, L.aim.x - 50, L.aim.y);
await gst.waitForTimeout(1500);
const s1 = await G(host, "g.players[1].stats.shots");
check(s1 > s0, `guest's shot is fired on the host (+${s1 - s0} rounds)`);

// guest builds a wall
await gst.evaluate(() => {}); // noop
await touch(gst, "pointerdown", 3, L.build.x, L.build.y);
await touch(gst, "pointerup", 3, L.build.x, L.build.y);
await gst.waitForTimeout(150);
check((await G(gst, "g.players[1].mode")) === "build", "guest's BUILD button switches instantly (predicted)");
const w0 = await G(host, "g.world.walls.filter((w) => w.owner === 1).length");
await touch(gst, "pointerdown", 4, L.aim.x, L.aim.y);
// aim up: the wall lands on open floor above red (left of red there's rock)
await touch(gst, "pointermove", 4, L.aim.x, L.aim.y - 30);
await gst.waitForTimeout(200);
await touch(gst, "pointerup", 4, L.aim.x, L.aim.y - 30);
await gst.waitForTimeout(1500);
const w1 = await G(host, "g.world.walls.filter((w) => w.owner === 1).length");
const gw = await G(gst, "g.world.walls.filter((w) => w.owner === 1).length");
check(w1 === w0 + 1 && gw === w1, `guest's wall lands on the host and shows on the guest (host ${w1}, guest ${gw})`);

// guest edits it
await touch(gst, "pointerdown", 5, L.slot0.x, L.slot0.y);
await touch(gst, "pointerup", 5, L.slot0.x, L.slot0.y);
await gst.waitForTimeout(150);
await touch(gst, "pointerdown", 6, L.aim.x, L.aim.y);
await touch(gst, "pointermove", 6, L.aim.x, L.aim.y - 45);
await gst.waitForTimeout(150);
await touch(gst, "pointerup", 6, L.aim.x, L.aim.y - 45);
await gst.waitForTimeout(1500);
const edited = await G(host, "g.world.walls.some((w) => w.owner === 1 && w.edit >= 0)");
check(edited, "guest's edit opens a tile of their wall on the host");
await gst.screenshot({ path: resolve(shots, "14-online-guest-edit.png") });

// host fires; guest must see it via snapshots
const hs0 = await G(gst, "g.players[0].stats.shots");
const HL = await host.evaluate(() => window.__clash.layout.pads[0].aim);
await touch(host, "pointerdown", 2, HL.x, HL.y);
await touch(host, "pointermove", 2, HL.x + 50, HL.y);
await touch(host, "pointerup", 2, HL.x + 50, HL.y);
await host.waitForTimeout(1200);
const hs1 = await G(gst, "g.players[0].stats.shots");
check(hs1 > hs0, `host's shots show up on the guest (+${hs1 - hs0})`);
const ping = await gst.evaluate(() => ({ rtt: window.__clash.net.guest.rtt, direct: window.__clash.net.guest.direct }));
console.log(`     guest round-trip ${ping.rtt} ms via ${ping.direct ? "direct link" : "relay"}`);
await host.screenshot({ path: resolve(shots, "15-online-host-view.png") });

// guest leaves mid-match → bot takes over on the host
await gst.evaluate(() => window.__clash.net.guest.leave());
const botTook = await waitFor(host, () => window.__clash.game.players[1].name.includes("(bot)"), null, 15000);
check(botTook, "when a guest leaves mid-match, a bot takes over their player");
await host.evaluate(() => document.getElementById("quit").click());
await host.waitForTimeout(300);
await host.context().close();
await gst.context().close();

// ---------------------------------------------------------------- 2v2
const h2 = await phone("host2");
const ga = await phone("guestA");
const gb = await phone("guestB");
await openOnline(h2, "Captain");
await h2.click('#netMode button[data-m="2v2"]');
await h2.click("#netCreate");
check(await waitFor(h2, () => /^\d{6}$/.test(document.getElementById("lbCode").textContent)), "2v2 room created");
const code2 = await h2.textContent("#lbCode");
for (const [p, n] of [[ga, "Alpha"], [gb, "Bravo"]]) {
  await openOnline(p, n);
  await p.fill("#netCode", code2);
  await p.click("#netJoin");
}
const both = await waitFor(h2, () => {
  const names = [...document.querySelectorAll("#lbSlots .sname")].map((e) => e.textContent);
  return names.some((t) => t.includes("Alpha")) && names.some((t) => t.includes("Bravo"));
});
check(both, "two guests join the 2v2 lobby");
await h2.screenshot({ path: resolve(shots, "16-online-2v2-lobby.png") });
await h2.click("#lbStart");
const in2 = await waitFor(ga, () => window.__clash.mode === "guest" && window.__clash.game?.players.length === 4)
  && await waitFor(gb, () => window.__clash.mode === "guest" && window.__clash.game?.players.length === 4);
check(in2, "both guests enter a 4-player match");
const teams = await G(h2, "g.players.map((p) => p.team + ':' + p.name)");
console.log("     players:", teams.join(", "));
check(teams[0] === "0:Captain", "host keeps the name they typed");
check(await G(h2, "g.players.filter((p) => p.name.startsWith('BOT')).length === 1"), "the empty seat is played by a bot");
const slots = [await ga.evaluate(() => window.__clash.local), await gb.evaluate(() => window.__clash.local)];
check(new Set(slots).size === 2 && slots.every((s) => s >= 1), `guests control their own players (slots ${slots.join(", ")})`);
await waitFor(h2, () => window.__clash.game.state === "fight", null, 8000);
await h2.waitForTimeout(3000);
// teammates of the host share a team and the bot is fighting
const botActive = await G(h2, "g.players.find((p) => p.name.startsWith('BOT')).stats.shots >= 0");
check(botActive, "2v2 match is running on the host");
await ga.screenshot({ path: resolve(shots, "17-online-2v2-guest.png") });
const gaSees = await G(ga, "g.players.every((p) => Number.isFinite(p.x))");
check(gaSees, "guests receive all four players' positions");
for (const p of [h2, ga, gb]) await p.context().close();

// ---------------------------------------------------------------- free-for-all
async function ffa(mode, guestNames) {
  const n = mode === "1v1v1" ? 3 : 4;
  const hp = await phone("ffa-host");
  await openOnline(hp, "Boss");
  await hp.click(`#netMode button[data-m="${mode}"]`);
  await hp.click("#netCreate");
  check(await waitFor(hp, () => /^\d{6}$/.test(document.getElementById("lbCode").textContent)), `${mode} room created with a 6-digit PIN`);
  const pin = await hp.textContent("#lbCode");
  const gs = [];
  for (const nm of guestNames) {
    const p = await phone("ffa-" + nm);
    await openOnline(p, nm);
    await p.fill("#netCode", pin);
    await p.click("#netJoin");
    gs.push(p);
  }
  const all = await waitFor(hp, (names) => {
    const shown = [...document.querySelectorAll("#lbSlots .sname")].map((e) => e.textContent);
    return names.every((x) => shown.some((t) => t.includes(x)));
  }, guestNames);
  check(all, `${mode}: ${guestNames.length} guest(s) join with the PIN`);
  check((await hp.locator("#lbSlots .slot").count()) === n, `${mode} lobby has ${n} seats`);
  await hp.screenshot({ path: resolve(shots, `18-online-${mode}-lobby.png`) });
  await hp.click("#lbStart");
  let ok = true;
  for (const p of gs) ok = ok && (await waitFor(p, (k) => window.__clash.mode === "guest" && window.__clash.game?.players.length === k, n));
  check(ok, `${mode}: every guest enters a ${n}-player match`);
  const teams = await G(hp, "g.players.map((p) => p.team)");
  check(new Set(teams).size === n && (await G(hp, "g.numTeams")) === n, `${mode}: everyone is on their own team (${teams.join(",")})`);
  check((await G(hp, "g.players.filter((p) => p.name.startsWith('BOT')).length")) === n - 1 - guestNames.length, `${mode}: empty seats are bots`);
  await waitFor(hp, () => window.__clash.game.state === "fight", null, 8000);
  await hp.waitForTimeout(4000);
  const gsees = await G(gs[0], "g.numTeams === " + n + " && g.score.length === " + n);
  check(gsees, `${mode}: guests see ${n} teams and ${n} scores`);
  await gs[0].screenshot({ path: resolve(shots, `19-online-${mode}-guest.png`) });
  for (const p of [hp, ...gs]) await p.context().close();
}
await ffa("1v1v1v1", ["Echo", "Fox"]);
await ffa("1v1v1", ["Golf"]);

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 4).join(" | ") : ""}`);
await browser.close();
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall online checks passed");
