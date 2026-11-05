// Bundles the game into two self-contained pages from one codebase:
//   dist/index.html         Grid Clash         – 2 players on one phone + vs bot
//   dist/online/index.html  Grid Clash Online  – 1v1 / 2v2 / 1v1v1 / 1v1v1v1 online
// Each page is the WebView asset of its own APK (see build/apk.sh).
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APPS = {
  local: {
    out: "dist/index.html",
    title: "Grid Clash",
    desc: "A shoot-and-build arena on a 30×20 grid. Two players on one phone, or play a bot. Twin-stick aiming, 3-tile walls with edits, 12 guns.",
  },
  online: {
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
    write: false,
    outdir: "out",
    legalComments: "none",
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
  const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const out = resolve(root, cfg.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#0b0f18" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="screen-orientation" content="landscape" />
<title>${cfg.title}</title>
<meta name="description" content="${cfg.desc}" />
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`
  );
  console.log(`${cfg.out}  ${((js.length + css.length) / 1024).toFixed(1)} KB`);
}
