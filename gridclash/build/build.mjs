// Bundles the game into two self-contained pages from one codebase:
//   dist/index.html         Grid Clash         – 2 players on one phone + vs bot
//   dist/online/index.html  Grid Clash Online  – 1v1 / 2v2 / 1v1v1 / 1v1v1v1 online
// Each page is the WebView asset of its own APK (see build/apk.sh).
//
// It also writes the web version to <repo>/docs for GitHub Pages, so iPhones
// (no APKs, no App Store needed) can play in Safari and "Add to Home Screen":
//   docs/index.html          landing page
//   docs/play/               Grid Clash        (installable web app)
//   docs/online/             Grid Clash Online (installable web app)
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const docs = resolve(root, "../docs");

const APPS = {
  local: {
    web: "play",
    short: "Grid Clash",
    orientation: "any",
    out: "dist/index.html",
    title: "Grid Clash",
    desc: "A shoot-and-build arena on a 30×20 grid. Two players on one phone, or play a bot. Twin-stick aiming, 3-tile walls with edits, 12 guns.",
  },
  online: {
    web: "online",
    short: "GC Online",
    orientation: "landscape",
    out: "dist/online/index.html",
    title: "Grid Clash Online",
    desc: "Online shoot-and-build arena: 1v1, 2v2, 1v1v1 and 1v1v1v1 between phones on any network. Host a room, join with a PIN.",
  },
};

const only = process.argv[2];
for (const [app, cfg] of Object.entries(APPS)) {
  if (only && only !== app) continue;
  const result = await build({
    entryPoints: [resolve(root, "src/main.js")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2018", "chrome69", "safari12"],
    define: { __APP__: JSON.stringify(app) },
    loader: { ".png": "dataurl" },
    write: false,
    outdir: "out",
    legalComments: "none",
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
  const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const out = resolve(root, cfg.out);
  mkdirSync(dirname(out), { recursive: true });
  const page = (webHead = "", webTail = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#273463" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="screen-orientation" content="landscape" />
<title>${cfg.title}</title>
<meta name="description" content="${cfg.desc}" />${webHead}
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>${webTail}
</body>
</html>
`;
  writeFileSync(out, page());
  console.log(`${cfg.out}  ${((js.length + css.length) / 1024).toFixed(1)} KB`);

  // ---- web version (GitHub Pages / any static host) ----
  const dir = resolve(docs, cfg.web);
  mkdirSync(dir, { recursive: true });
  const version = createHash("sha1").update(js + css).digest("hex").slice(0, 10);
  const webHead = `
<link rel="manifest" href="manifest.webmanifest" />
<link rel="icon" type="image/png" href="icon-192.png" />
<link rel="apple-touch-icon" href="icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="${cfg.short}" />`;
  const webTail = `
<script>if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(function () {});</script>`;
  writeFileSync(resolve(dir, "index.html"), page(webHead, webTail));
  writeFileSync(resolve(dir, "manifest.webmanifest"), JSON.stringify({
    name: cfg.title,
    short_name: cfg.short,
    description: cfg.desc,
    start_url: "./",
    scope: "./",
    display: "fullscreen",
    orientation: cfg.orientation,
    background_color: "#273463",
    theme_color: "#273463",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }, null, 2));
  // network first (always the newest version when online), cache as the
  // offline fallback
  writeFileSync(resolve(dir, "sw.js"), `// ${cfg.title} offline cache, version ${version}
const CACHE = "gridclash-${cfg.web}-${version}";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("gridclash-${cfg.web}-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
`);
  console.log(`docs/${cfg.web}/  (web app, version ${version})`);
}

// landing page
const APK_BASE = "https://github.com/leopoopyhead77-ai/Cool-nice-very-fun-fishing-game/raw/claude/two-player-game-shoot-build-lw3edo/gridclash/dist/";
writeFileSync(resolve(docs, ".nojekyll"), "");
writeFileSync(resolve(docs, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#273463" />
<title>Grid Clash</title>
<meta name="description" content="Shoot-and-build arena for phones. Play in the browser on iPhone or Android, or install the Android apps." />
<link rel="icon" type="image/png" href="play/icon-192.png" />
<link rel="apple-touch-icon" href="play/icon-180.png" />
<style>
  :root { --bg: #273463; --card: #2f3d78; --line: rgba(255,255,255,.1); --text: #eef3ff; --muted: #9aa7c2; --blue: #3fa7ff; --red: #ff4d5e; --green: #43d97b; --gold: #ffd23f; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at top, #16243d, var(--bg) 60%); color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: max(20px, env(safe-area-inset-top)) 16px 32px; }
  main { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  h1 { margin: 8px 0 0; font-size: clamp(40px, 11vw, 64px); font-weight: 900; letter-spacing: .04em; line-height: 1; color: var(--blue); text-shadow: 0 3px 0 #13406b; }
  h1 span { color: var(--red); text-shadow: 0 3px 0 #6b1320; margin-left: .12em; }
  p { margin: 0; color: var(--muted); line-height: 1.45; }
  .apps { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .app { display: flex; gap: 14px; align-items: center; text-decoration: none; color: inherit; background: var(--card);
    border: 1.5px solid var(--line); border-radius: 18px; padding: 14px; }
  .app:active { transform: scale(.98); }
  .app img { width: 72px; height: 72px; border-radius: 16px; flex: 0 0 auto; }
  .app b { display: block; font-size: 19px; margin-bottom: 3px; color: var(--text); }
  .app.online { border-color: rgba(67,217,123,.5); }
  .how { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; }
  .how h2 { margin: 0 0 8px; font-size: 16px; }
  .how ol { margin: 0; padding-left: 20px; color: var(--muted); line-height: 1.6; }
  .how b { color: var(--gold); }
  .apk { display: flex; gap: 10px; flex-wrap: wrap; }
  .apk a { color: var(--text); background: rgba(255,255,255,.07); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; text-decoration: none; font-weight: 700; font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>GRID<span>CLASH</span></h1>
  <p>A shoot-and-build arena for phones. Plays right here in your browser — on iPhone or Android — no app store needed.</p>
  <div class="apps">
    <a class="app" href="play/"><img src="play/icon-192.png" alt="" /><div><b>Grid Clash</b><p>2 players on one phone, or play a bot. Works offline once added.</p></div></a>
    <a class="app online" href="online/"><img src="online/icon-192.png" alt="" /><div><b>Grid Clash Online</b><p>1v1 · 2v2 · 1v1v1 · 1v1v1v1. Host a room, friends join with a PIN. iPhone and Android together, mobile data works.</p></div></a>
  </div>
  <div class="how">
    <h2>📲 Install on iPhone</h2>
    <ol>
      <li>Open this page in <b>Safari</b>.</li>
      <li>Tap a game above to open it.</li>
      <li>Tap <b>Share</b> (the square with an arrow) → <b>Add to Home Screen</b> → <b>Add</b>.</li>
      <li>Open it from your home screen: it runs full screen like an app. Do it for both games if you want both.</li>
    </ol>
  </div>
  <div class="how">
    <h2>🤖 Android</h2>
    <p style="margin-bottom:10px">Play in Chrome (menu → <b>Add to Home screen</b>), or install the Android apps:</p>
    <div class="apk">
      <a href="${APK_BASE}grid-clash.apk">⬇ grid-clash.apk</a>
      <a href="${APK_BASE}grid-clash-online.apk">⬇ grid-clash-online.apk</a>
    </div>
  </div>
</main>
</body>
</html>
`);
console.log("docs/index.html  (landing page)");
