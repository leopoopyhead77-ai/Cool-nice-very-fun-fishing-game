// Renders the launcher icon at every density: a blue and a red fighter facing
// off across a 3-tile wall on the arena grid.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = { "mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192 };

const grid = Array.from({ length: 9 }, (_, i) => `<path d="M${i * 24} 0V192M0 ${i * 24}H192" />`).join("");
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 192 192">
  <defs><clipPath id="f"><rect width="192" height="192" rx="40"/></clipPath>
  <linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="#16324f"/><stop offset=".5" stop-color="#1b2232"/><stop offset="1" stop-color="#4a1c26"/></linearGradient></defs>
  <g clip-path="url(#f)">
    <rect width="192" height="192" fill="url(#bg)"/>
    <g stroke="rgba(160,180,220,.16)" stroke-width="2">${grid}</g>
    <g fill="#5b9ee0" stroke="#a9d8ff" stroke-width="2">
      <rect x="84" y="48" width="24" height="24"/><rect x="84" y="72" width="24" height="24"/><rect x="84" y="120" width="24" height="24"/>
    </g>
    <rect x="86" y="98" width="20" height="20" fill="none" stroke="#ffd23f" stroke-width="3" stroke-dasharray="5 4"/>
    <path d="M50 108 L150 92" stroke="rgba(255,255,255,.55)" stroke-width="5" stroke-linecap="round"/>
    <circle cx="44" cy="110" r="20" fill="#1d5f9e"/><circle cx="42" cy="107" r="16" fill="#3fa7ff"/>
    <rect x="58" y="104" width="22" height="8" rx="2" fill="#8fd3ff" transform="rotate(-9 58 108)"/>
    <circle cx="148" cy="90" r="20" fill="#9e2532"/><circle cx="146" cy="87" r="16" fill="#ff4d5e"/>
    <circle cx="44" cy="110" r="20" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="148" cy="90" r="20" fill="none" stroke="#fff" stroke-width="3"/>
  </g>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
for (const [dir, size] of Object.entries(SIZES)) {
  const out = resolve(root, "android/res", dir);
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size)}</body>`);
  await page.screenshot({ path: resolve(out, "ic_launcher.png"), omitBackground: true });
  await page.close();
  console.log(`${dir}/ic_launcher.png  ${size}x${size}`);
}
await browser.close();
