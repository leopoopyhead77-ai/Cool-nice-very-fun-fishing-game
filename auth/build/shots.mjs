// Phone-sized screenshots of the built page, for a look at the app without an
// Android device. Writes auth/dist/shot-*.png (kept out of git).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "dist/index.html"));
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const seed = {
  v: 1,
  enc: null,
  vault: {
    settings: { timeOffsetMs: 0, hideCodes: false },
    accounts: [
      { id: "a", type: "totp", issuer: "Roblox", name: "builderman", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30, counter: 0 },
      { id: "b", type: "totp", issuer: "Roblox", name: "alt account", secret: "GEZDGNBVGY3TQOJQ", algorithm: "SHA1", digits: 6, period: 30, counter: 0 },
      { id: "c", type: "totp", issuer: "Discord", name: "you@example.com", secret: "MZXW6YTBOI======", algorithm: "SHA1", digits: 6, period: 30, counter: 0 },
    ],
  },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 850 },
  deviceScaleFactor: 2,
  permissions: ["camera"],
});

const shot = async (name, prepare) => {
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector(".app, .lock");
  if (prepare) await prepare(page);
  await page.screenshot({ path: join(root, `dist/shot-${name}.png`) });
  await page.close();
  console.log(`dist/shot-${name}.png`);
};

await shot("empty");

await context.addInitScript((s) => {
  localStorage.setItem("anchor/vault/v1", JSON.stringify(s));
}, seed);

await shot("codes");
await shot("add", async (page) => {
  await page.click(".fab");
  await page.click('button[role="tab"]:has-text("Setup key")');
});
await shot("scan", async (page) => {
  await page.click(".fab");
  await page.waitForTimeout(1200);
});
await shot("settings", async (page) => {
  await page.click('button[aria-label="Settings"]');
});

await browser.close();
server.close();
