// Downloads the latin subsets of the two display faces and emits base64 @font-face CSS.
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const API =
  "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

const css = await (await fetch(API, { headers: { "User-Agent": UA } })).text();

const blocks = css.split("@font-face").slice(1);
const wanted = [];
for (const raw of blocks) {
  const range = /unicode-range:\s*([^;]+);/.exec(raw)?.[1] ?? "";
  // latin subset only: the block that carries U+0000-00FF
  if (!range.includes("U+0000-00FF")) continue;
  wanted.push({
    family: /font-family:\s*'([^']+)'/.exec(raw)[1],
    weight: /font-weight:\s*(\d+)/.exec(raw)[1],
    url: /src:\s*url\(([^)]+)\)/.exec(raw)[1],
  });
}

let out = "";
for (const f of wanted) {
  const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
  out += `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2');}\n`;
  console.error(`${f.family} ${f.weight} -> ${(buf.length / 1024).toFixed(1)} KB`);
}
writeFileSync(new URL("./fonts.css", import.meta.url), out);
console.error(`total ${(out.length / 1024).toFixed(1)} KB css`);
