// Bundles Anchor into one self-contained page: dist/index.html, which is also
// the asset the APK's WebView loads. No runtime network requests at all.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const result = await build({
  entryPoints: [resolve(root, "src/app.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  // BigInt (used by SHA-512) puts a floor under this: Chrome 67 / Safari 14.
  // Android WebView updates through Play, so any phone that can install the
  // APK is comfortably past it.
  target: ["es2020", "chrome80", "safari14"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
  legalComments: "none",
});

const js = result.outputFiles[0].text;
const css = readFileSync(resolve(root, "src/styles.css"), "utf8");

mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(
  resolve(root, "dist/index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0b1014" />
<meta name="color-scheme" content="dark" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="referrer" content="no-referrer" />
<title>Anchor — authenticator</title>
</head>
<body>
<div id="root"></div>
<style>${css}</style>
<script>${js}</script>
</body>
</html>
`
);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + " KB";
console.log(`anchor: js ${kb(js)} · css ${kb(css)}`);
