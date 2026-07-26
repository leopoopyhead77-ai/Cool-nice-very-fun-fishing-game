// Bundles the game into two self-contained outputs:
//   dist/index.html    — a standalone page (also the APK's WebView asset)
//   dist/artifact.html — the same page as a body fragment for the Artifact tool
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const result = await build({
  entryPoints: [resolve(root, "src/game.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2018", "chrome69", "safari12"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
  legalComments: "none",
});

const js = result.outputFiles[0].text;
const css = read("build/fonts.css") + "\n" + read("src/styles.css");

const TITLE = "Sounding Line — a deep-water fishing console";
const DESC =
  "Cast, hook, reel and sell your way from a mossy creek to the Glass Meridian.";

const head = `<title>${TITLE}</title>
<meta name="description" content="${DESC}" />`;

const bodyFragment = `<div id="root"></div>
<style>${css}</style>
<script>${js}</script>`;

mkdirSync(resolve(root, "dist"), { recursive: true });

writeFileSync(
  resolve(root, "dist/index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#04080d" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
${head}
</head>
<body>
${bodyFragment}
</body>
</html>
`
);

writeFileSync(resolve(root, "dist/artifact.html"), `${head}\n${bodyFragment}\n`);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + " KB";
console.log(`js ${kb(js)} · css ${kb(css)} · page ${kb(bodyFragment)}`);
