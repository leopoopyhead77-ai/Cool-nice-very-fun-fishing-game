// Renders the launcher icon at every density: a float sitting on the lake at
// first light, drawn from the game's own palette.
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
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#BFE0EC"/>
      <stop offset="1" stop-color="#F3E7C8"/>
    </linearGradient>
    <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7FB8AE"/>
      <stop offset="1" stop-color="#2F6E66"/>
    </linearGradient>
    <clipPath id="frame"><rect width="192" height="192" rx="38"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="192" height="192" fill="url(#sky)"/>
    <circle cx="138" cy="52" r="26" fill="#FFF0B8"/>
    <path d="M0 108c22-16 40 2 62-4s34-20 58-14 46 14 72 6v20H0z" fill="#6FA45E"/>
    <path d="M0 118c26-10 44 6 68 0s36-16 60-10 42 12 64 6v18H0z" fill="#4F8A55"/>
    <rect y="124" width="192" height="68" fill="url(#lake)"/>
    <g stroke="rgba(255,255,255,.5)" stroke-width="3.5" stroke-linecap="round" fill="none">
      <path d="M14 142h44M108 138h58M28 160h50M118 164h44M64 178h62"/>
    </g>
    <path d="M96 126L150 74" stroke="#FDFBF5" stroke-width="3" stroke-linecap="round"/>
    <circle cx="96" cy="134" r="15" fill="#FDFBF5"/>
    <path d="M81 134a15 15 0 0 1 30 0z" fill="#E8503C"/>
    <rect x="93" y="112" width="6" height="12" rx="3" fill="#33403A"/>
  </g>
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
