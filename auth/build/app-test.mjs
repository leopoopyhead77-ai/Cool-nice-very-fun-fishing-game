// Drives the built page in a real browser: adding accounts by key and by QR
// image, persistence across a reload, and the PIN lock.
//
// It serves dist/ over http://127.0.0.1 rather than opening the file directly,
// because localhost is a secure context — the same property the APK buys with
// its https asset origin, and what WebCrypto and the camera need.
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import QRCode from "qrcode";
import { codeFor } from "../src/totp.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page404 = "not found";
let failures = 0;

function check(ok, what) {
  if (ok) return;
  failures++;
  console.log(`FAIL ${what}`);
}

async function eventually(fn, what, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  check(false, what);
  return false;
}

const html = readFileSync(join(root, "dist/index.html"));
const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } else {
    res.writeHead(404).end(page404);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 900 },
  permissions: ["camera", "clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.goto(base);

// --- empty state -----------------------------------------------------------
await page.waitForSelector(".empty-title");
check(await page.isVisible("text=No accounts yet"), "shows the empty state");

// --- add by setup key ------------------------------------------------------
const SECRET = "JBSWY3DPEHPK3PXP";
await page.click("text=Add your first account");
await page.click('button[role="tab"]:has-text("Setup key")');
await page.fill(".key-input", SECRET);
await page.click('button:has-text("Continue")');
await page.waitForSelector(".draft");
await page.fill('.draft label:has-text("Service") input', "Roblox");
await page.fill('.draft label:has-text("Account") input', "builderman");
await page.click('button:has-text("Save account")');
await page.waitForSelector(".account");

const account = { secret: SECRET, algorithm: "SHA1", digits: 6, period: 30, type: "totp" };
const shownCode = () => page.textContent(".account .code").then((t) => t.replace(/\s/g, ""));
// The window can roll between reading the page and computing here, so accept
// the neighbouring windows too.
const near = (code) => [-30000, 0, 30000].some((d) => codeFor(account, Date.now() + d) === code);
check(near(await shownCode()), "shows the code the RFC vectors say it should");
check(await page.isVisible("text=builderman"), "shows the account name");

// --- countdown -------------------------------------------------------------
const firstSeconds = Number(await page.textContent(".ring-text"));
await page.waitForTimeout(1400);
const laterSeconds = Number(await page.textContent(".ring-text"));
check(laterSeconds < firstSeconds || laterSeconds > 27, "the countdown ticks down");

// --- copy to clipboard -----------------------------------------------------
await page.click(".account-main");
await page.waitForSelector(".toast");
check(
  (await page.evaluate(() => navigator.clipboard.readText())).replace(/\s/g, "")
    === (await shownCode()),
  "tapping a row copies the code"
);

// --- persistence -----------------------------------------------------------
await page.reload();
await page.waitForSelector(".account");
check(await page.isVisible("text=builderman"), "the account survives a reload");

// --- add by QR image -------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "anchor-"));
const qrPath = join(dir, "roblox-2fa.png");
const uri = "otpauth://totp/Roblox:zeuxcg?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Roblox&digits=8";
writeFileSync(qrPath, await QRCode.toBuffer(uri, { width: 420, margin: 2 }));

await page.click(".fab");
await page.click('button[role="tab"]:has-text("Image")');
await page.setInputFiles(".file-drop input", qrPath);
await page.waitForSelector(".draft");
check(
  await page.inputValue('.draft label:has-text("Service") input') === "Roblox",
  "reads the issuer out of a scanned QR code"
);
check((await page.textContent(".draft-meta")).includes("8 digits"), "keeps the QR's digit count");
await page.click('button:has-text("Save account")');
await eventually(async () => (await page.locator(".account").count()) === 2, "saves the scanned account");
check((await page.textContent(".account:nth-child(2) .code")).replace(/\s/g, "").length === 8,
  "renders an eight-digit code");

// A QR that is not an otpauth link must be refused, not stored.
const junkPath = join(dir, "junk.png");
writeFileSync(junkPath, await QRCode.toBuffer("https://example.com/not-a-secret", { width: 420 }));
await page.click(".fab");
await page.click('button[role="tab"]:has-text("Image")');
await page.setInputFiles(".file-drop input", junkPath);
await page.waitForSelector(".notice.warn");
check((await page.textContent(".notice.warn")).includes("not a 2FA setup code"),
  "refuses a QR that is not a 2FA code");
await page.click('.sheet-head button');

// --- camera pane -----------------------------------------------------------
await page.click(".fab");
await page.click('button[role="tab"]:has-text("Scan")');
await page.waitForSelector(".viewport video");
await eventually(
  async () => await page.evaluate(() => {
    const v = document.querySelector(".viewport video");
    return !!v && v.videoWidth > 0;
  }),
  "the camera preview starts"
);
check(!(await page.isVisible(".notice.warn")), "no camera error with a camera present");
await page.click(".sheet-head button");

// --- PIN lock --------------------------------------------------------------
await page.click('button[aria-label="Settings"]');
await page.fill('label:has-text("PIN") input', "3141");
await page.fill('label:has-text("Again") input', "3141");
await page.click('button:has-text("Set PIN")');
await page.waitForSelector("text=The vault is encrypted");

const stored = await page.evaluate(() => localStorage.getItem("anchor/vault/v1"));
check(!stored.includes(SECRET), "the stored blob no longer contains the secret");
check(JSON.parse(stored).enc === "pbkdf2-sha256/aes-gcm", "records how it was encrypted");

await page.reload();
await page.waitForSelector(".lock");
await page.fill(".lock input", "0000");
await page.click('button:has-text("Unlock")');
await page.waitForSelector(".notice.warn");
check((await page.textContent(".notice.warn")).includes("Wrong PIN"), "rejects the wrong PIN");

await page.fill(".lock input", "3141");
await page.click('button:has-text("Unlock")');
await page.waitForSelector(".account");
check(await page.isVisible("text=builderman"), "the right PIN brings the accounts back");
check(near(await shownCode()), "codes still generate after unlocking");

// --- delete ----------------------------------------------------------------
await page.click('.account:first-child button[aria-label="Account settings"]');
await page.click('button:has-text("Delete account")');
await page.click('button:has-text("Delete for good")');
await eventually(async () => (await page.locator(".account").count()) === 1, "deletes an account");

check(pageErrors.length === 0, `no uncaught page errors (${pageErrors.join("; ")})`);

await browser.close();
server.close();

console.log(failures ? `\n${failures} failing check(s)` : "app: all checks passed");
process.exit(failures ? 1 : 0);
