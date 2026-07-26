// Renders the launcher icon at every density. The mark is a sounder trace:
// an amber lure line above a seabed, drawn in the game's own palette.
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
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#123047"/>
      <stop offset="1" stop-color="#04080d"/>
    </linearGradient>
  </defs>
  <rect width="192" height="192" rx="34" fill="url(#water)"/>
  <g opacity=".28" stroke="#8fb6c8" stroke-width="2">
    <path d="M20 60h152M20 96h152M20 132h152"/>
  </g>
  <path d="M20 148c18-10 30 4 46-2s24-18 42-14 26 16 44 10 20-6 20-6v42H20z" fill="#1d5c72"/>
  <path d="M20 148c18-10 30 4 46-2s24-18 42-14 26 16 44 10 20-6 20-6" fill="none"
        stroke="#2FA8CC" stroke-width="5" stroke-linecap="round"/>
  <path d="M96 24v54" stroke="#F0A63C" stroke-width="5" stroke-linecap="round"/>
  <circle cx="96" cy="90" r="13" fill="#F0A63C"/>
  <circle cx="96" cy="90" r="25" fill="none" stroke="#F0A63C" stroke-width="3" opacity=".55"/>
  <circle cx="96" cy="90" r="37" fill="none" stroke="#F0A63C" stroke-width="2" opacity=".25"/>
</svg>`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
for (const [dir, size] of Object.entries(SIZES)) {
  const out = resolve(root, "android/res", dir);
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg(size)}</body>`
  );
  await page.screenshot({ path: resolve(out, "ic_launcher.png"), omitBackground: true });
  await page.close();
  console.log(`${dir}/ic_launcher.png  ${size}×${size}`);
}

await browser.close();
