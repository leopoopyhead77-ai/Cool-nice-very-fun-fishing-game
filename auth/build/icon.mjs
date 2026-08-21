// Renders the launcher icon at every density: an anchor on Anchor's own teal.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SIZES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#173039"/>
      <stop offset="1" stop-color="#0B1014"/>
    </linearGradient>
    <clipPath id="frame"><rect width="192" height="192" rx="40"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="192" height="192" fill="url(#bg)"/>
    <circle cx="96" cy="96" r="62" fill="none" stroke="#1f3b45" stroke-width="8"/>
    <path d="M96 96v58" stroke="#4FD1C5" stroke-width="11" stroke-linecap="round"/>
    <circle cx="96" cy="52" r="13" fill="none" stroke="#4FD1C5" stroke-width="10"/>
    <path d="M70 80h52" stroke="#4FD1C5" stroke-width="10" stroke-linecap="round"/>
    <path d="M50 116a46 46 0 0 0 92 0" fill="none" stroke="#4FD1C5"
          stroke-width="11" stroke-linecap="round"/>
    <path d="M50 116l-13 8 15 6zM142 116l13 8-15 6z" fill="#4FD1C5"/>
  </g>
</svg>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
for (const [dir, size] of Object.entries(SIZES)) {
  const out = resolve(root, "android/res", dir);
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size)}</body>`);
  await page.screenshot({ path: resolve(out, "ic_launcher.png"), omitBackground: true });
  await page.close();
  console.log(`${dir}/ic_launcher.png  ${size}×${size}`);
}
await browser.close();
