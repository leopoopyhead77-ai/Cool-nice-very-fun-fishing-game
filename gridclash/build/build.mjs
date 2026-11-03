// Bundles the game into one self-contained file: gridclash/dist/index.html.
// That same file is the APK's WebView asset.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [resolve(root, "src/main.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2018", "chrome69", "safari12"],
  write: false,
  outdir: "out",
  legalComments: "none",
});

const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";

mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(
  resolve(root, "dist/index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#0b0f18" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="screen-orientation" content="landscape" />
<title>Grid Clash</title>
<meta name="description" content="A 1v1 shoot-and-build arena on a 30×20 grid. Twin-stick aiming, 3-tile walls with edits, 12 guns." />
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`
);
console.log(`dist/index.html  ${((js.length + css.length) / 1024).toFixed(1)} KB`);
