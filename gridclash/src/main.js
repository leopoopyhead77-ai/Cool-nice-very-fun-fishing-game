import "./styles.css";
import { GUNS, GUN_BY_ID, TIER_COLOR, gunStats } from "./guns.js";
import { createGame, step } from "./game.js";
import { createBot } from "./bot.js";
import { createInput } from "./input.js";
import { createRenderer } from "./render.js";
import { unlockAudio, playEvents, uiClick, audio } from "./audio.js";
import { load, save } from "./storage.js";

const ME = 0;
const NAMES_BOT = ["YOU", "BOT"];
const NAMES_PVP = ["BLUE", "RED"];
let matchMode = "bot"; // "bot" | "pvp"
const names = () => (matchMode === "pvp" ? NAMES_PVP : NAMES_BOT);
const DIFFS = ["easy", "normal", "hard"];

const settings = {
  loadout: load("loadout", ["ar", "shotgun"]),
  loadout2: load("loadout2", ["burst", "smg"]),
  difficulty: load("difficulty", "normal"),
  muted: load("muted", false),
};
const validLoadout = (l) => Array.isArray(l) && l.length === 2 && l.every((id) => GUN_BY_ID[id]);
if (!validLoadout(settings.loadout)) settings.loadout = ["ar", "shotgun"];
if (!validLoadout(settings.loadout2)) settings.loadout2 = ["burst", "smg"];
if (!DIFFS.includes(settings.difficulty)) settings.difficulty = "normal";
audio.muted = !!settings.muted;

// ---- DOM ----------------------------------------------------------------------

const app = document.getElementById("app");
app.innerHTML = `
  <canvas id="cv"></canvas>
  <section id="menu" class="screen">
    <div class="menu-card">
      <h1 class="logo">GRID<span>CLASH</span></h1>
      <p class="tag">1v1 shoot &amp; build arena · 30×20</p>
      <div class="menu-grid">
        <button class="btn red big" id="pvp">👥 2 PLAYERS <small>1v1 · same phone</small></button>
        <button class="btn primary big" id="play">▶ PLAY vs BOT</button>
        <button class="btn big disabled" id="online" aria-disabled="true">🌐 ONLINE <small>coming soon</small></button>
      </div>
      <div class="row">
        <span class="lbl">Bot</span>
        <div class="seg" id="diff">
          ${DIFFS.map((d) => `<button data-d="${d}">${d}</button>`).join("")}
        </div>
      </div>
      <div class="row">
        <span class="lbl">Loadout</span>
        <button class="btn loadout-btn" id="openLoadout"></button>
      </div>
      <div class="row foot">
        <button class="btn ghost small" id="howto">How to play</button>
        <button class="btn ghost small" id="mute"></button>
      </div>
    </div>
  </section>

  <section id="loadout" class="screen hidden">
    <div class="lo-head">
      <button class="btn ghost small" id="loBack">‹ Back</button>
      <div class="seg lo-player" id="loPlayer">
        <button data-p="0">P1 · Blue</button>
        <button data-p="1">P2 · Red</button>
      </div>
      <div class="lo-slots">
        <button class="lo-slot" data-slot="0"></button>
        <button class="lo-slot" data-slot="1"></button>
      </div>
      <span class="lo-hint">Pick a slot, then a gun</span>
    </div>
    <div class="gun-grid" id="gunGrid"></div>
  </section>

  <section id="help" class="screen hidden">
    <div class="menu-card help">
      <h2>How to play</h2>
      <ul>
        <li><b>Left stick</b> — move. Push where you want to go.</li>
        <li><b>Right stick</b> — drag to aim; the faint line shows the shot's path. <b>Release to shoot.</b> Quick tap = auto-aim. Drag back to centre to cancel.</li>
        <li><b>BUILD</b> (above the stick) — the stick becomes a build stick. Drag to move the green preview, release to drop a 3-tile wall (30 mats).</li>
        <li><b>EDIT</b> — aim at one of your walls and release to cut one tile out (a window/door). Release on the open tile again, or press <b>RESET</b>, to restore it. One edited tile per wall at a time.</li>
        <li><b>Weapon slots</b> — tap to switch, tap the active one to reload.</li>
        <li>Medkits spawn at the top and bottom middle. First to 3 rounds wins.</li>
        <li><b>2 Players</b> — the phone turns upright. Blue plays from the bottom end, Red from the top end; each side's controls face its player. Left thumb moves, right thumb aims, BUILD sits above your aim stick. Pick Red's guns with the P2 tab on the loadout screen.</li>
      </ul>
      <p class="kbd">Keyboard: WASD move · mouse aim/release · B build · E edit · R reset/reload · 1/2 weapons</p>
      <button class="btn primary" id="helpBack">Got it</button>
    </div>
  </section>

  <section id="pause" class="screen hidden dim">
    <div class="menu-card narrow">
      <h2>Paused</h2>
      <button class="btn primary" id="resume">Resume</button>
      <button class="btn" id="restart">Restart match</button>
      <button class="btn ghost" id="quit">Quit to menu</button>
    </div>
  </section>

  <section id="results" class="screen hidden dim">
    <div class="menu-card narrow">
      <h2 id="resTitle"></h2>
      <p id="resScore" class="score"></p>
      <table class="stats" id="resStats"></table>
      <button class="btn primary" id="again">Rematch</button>
      <button class="btn ghost" id="toMenu">Menu</button>
    </div>
  </section>

  <div id="rotate"><div>⟳</div><p>Rotate your phone to landscape</p></div>
`;

const $ = (id) => document.getElementById(id);
const canvas = $("cv");
const screens = ["menu", "loadout", "help", "pause", "results"];
function show(name) {
  for (const s of screens) $(s).classList.toggle("hidden", s !== name);
  input.st.enabled = name === null && !!game;
}

// ---- menu ---------------------------------------------------------------------

function refreshMenu() {
  $("diff").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.d === settings.difficulty));
  $("openLoadout").innerHTML = settings.loadout
    .map((id) => `<span style="--c:${TIER_COLOR[GUN_BY_ID[id].tier]}">${GUN_BY_ID[id].name}</span>`)
    .join("<i>+</i>");
  $("mute").textContent = audio.muted ? "🔇 Sound off" : "🔊 Sound on";
}

$("diff").addEventListener("click", (e) => {
  const d = e.target.closest("button")?.dataset.d;
  if (!d) return;
  settings.difficulty = d;
  save("difficulty", d);
  click();
  refreshMenu();
});
$("play").addEventListener("click", () => {
  click();
  startMatch("bot");
});
$("pvp").addEventListener("click", () => {
  click();
  startMatch("pvp");
});
$("online").addEventListener("click", () => {
  const b = $("online");
  b.classList.add("shake");
  setTimeout(() => b.classList.remove("shake"), 400);
});
$("openLoadout").addEventListener("click", () => {
  click();
  renderLoadout();
  show("loadout");
});
$("howto").addEventListener("click", () => {
  click();
  show("help");
});
$("helpBack").addEventListener("click", () => {
  click();
  show("menu");
});
$("mute").addEventListener("click", () => {
  audio.muted = !audio.muted;
  save("muted", audio.muted);
  click();
  refreshMenu();
});

// ---- loadout --------------------------------------------------------------------

let editSlot = 0;
let editPlayer = 0;
const editList = () => (editPlayer === 1 ? settings.loadout2 : settings.loadout);
function renderLoadout() {
  $("loPlayer").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.p) === editPlayer));
  document.querySelectorAll(".lo-slot").forEach((b) => {
    const i = Number(b.dataset.slot);
    const g = GUN_BY_ID[editList()[i]];
    b.classList.toggle("on", i === editSlot);
    b.style.setProperty("--c", TIER_COLOR[g.tier]);
    b.innerHTML = `<small>SLOT ${i + 1}</small>${g.name}`;
  });
  $("gunGrid").innerHTML = GUNS.map((g) => {
    const s = gunStats(g);
    const idx = editList().indexOf(g.id);
    const bar = (n, v) => `<div class="stat"><span>${n}</span><b><i style="width:${Math.round(v * 100)}%"></i></b></div>`;
    return `<button class="gun ${idx >= 0 ? "equipped" : ""}" data-id="${g.id}" style="--c:${TIER_COLOR[g.tier]};--g:${g.color}">
      <div class="gun-top"><span class="swatch"></span><span class="gname">${g.name}</span>${idx >= 0 ? `<span class="badge">${idx + 1}</span>` : ""}</div>
      <div class="tier">${g.tier} · ${g.type === "lob" ? "explosive lob" : g.type === "rocket" ? "explosive" : g.type === "rail" ? "piercing beam" : g.pellets > 1 ? `${g.pellets} pellets` : g.burst > 1 ? `${g.burst}-round burst` : "single shot"}</div>
      ${bar("DMG", s.damage)}${bar("DPS", s.rate)}${bar("RNG", s.range)}${bar("BLD", s.builds)}
      <p>${g.desc}</p>
    </button>`;
  }).join("");
}
document.querySelector(".lo-slots").addEventListener("click", (e) => {
  const b = e.target.closest(".lo-slot");
  if (!b) return;
  editSlot = Number(b.dataset.slot);
  click();
  renderLoadout();
});
$("gunGrid").addEventListener("click", (e) => {
  const b = e.target.closest(".gun");
  if (!b) return;
  const id = b.dataset.id;
  const list = editList();
  if (list[1 - editSlot] === id) list[1 - editSlot] = list[editSlot]; // swap
  list[editSlot] = id;
  editSlot = 1 - editSlot;
  save(editPlayer === 1 ? "loadout2" : "loadout", list);
  click();
  renderLoadout();
});
$("loPlayer").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  editPlayer = Number(b.dataset.p);
  editSlot = 0;
  click();
  renderLoadout();
});
$("loBack").addEventListener("click", () => {
  click();
  refreshMenu();
  show("menu");
});

// ---- pause / results ------------------------------------------------------------

let paused = false;
function pause() {
  if (!game || game.state === "matchEnd") return;
  paused = true;
  input.reset();
  show("pause");
}
$("resume").addEventListener("click", () => {
  click();
  paused = false;
  show(null);
});
$("restart").addEventListener("click", () => {
  click();
  startMatch();
});
$("quit").addEventListener("click", () => {
  click();
  game = null;
  paused = false;
  toMenu();
});
$("again").addEventListener("click", () => {
  click();
  startMatch();
});
$("toMenu").addEventListener("click", () => {
  click();
  game = null;
  toMenu();
});

function toMenu() {
  setOrientation("landscape");
  input.setPvp(false);
  resize();
  refreshMenu();
  show("menu");
}

function showResults() {
  const won = game.matchWinner === ME;
  const draw = game.matchWinner < 0;
  if (matchMode === "pvp") {
    $("resTitle").textContent = draw ? "DRAW" : `${NAMES_PVP[game.matchWinner]} WINS`;
    $("resTitle").className = draw ? "" : game.matchWinner === 0 ? "blue" : "lose";
  } else {
    $("resTitle").textContent = draw ? "DRAW" : won ? "VICTORY" : "DEFEAT";
    $("resTitle").className = draw ? "" : won ? "win" : "lose";
  }
  $("resScore").textContent = `${game.score[0]} – ${game.score[1]}`;
  const [a, b] = game.players;
  const acc = (p) => (p.stats.shots ? Math.round((p.stats.hits / p.stats.shots) * 100) + "%" : "–");
  const rows = [
    matchMode === "pvp" ? ["", "Blue", "Red"] : ["", "You", "Bot"],
    ["Damage", a.stats.dmg, b.stats.dmg],
    ["Accuracy", acc(a), acc(b)],
    ["Walls built", a.stats.walls, b.stats.walls],
    ["Edits", a.stats.edits, b.stats.edits],
  ];
  $("resStats").innerHTML = rows
    .map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`)
    .join("");
  input.reset();
  show("results");
}

// ---- game -------------------------------------------------------------------------

let game = null;
const renderer = createRenderer(canvas);
const input = createInput(canvas, {
  mode: (team) => (game ? game.players[team].mode : "combat"),
  slot: (team) => (game ? game.players[team].slot : 0),
  playerScreen: (team) => (game ? renderer.toScreen(game.players[team].x, game.players[team].y) : null),
  tileSize: () => renderer.v.TS,
  onPause: pause,
  onFirstTouch: unlockAudio,
});

function click() {
  unlockAudio();
  uiClick();
}

function botLoadout() {
  // the bot gets a sensible pair: one close-range, one long-range gun
  const close = ["shotgun", "smg", "flamer", "minigun", "pistol"];
  const far = ["ar", "burst", "sniper", "revolver", "rocket", "grenade", "rail"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return [pick(far), pick(close)];
}

// The APK locks orientation: portrait for local 2-player, landscape otherwise.
function setOrientation(o) {
  document.body.classList.toggle("pvp", o === "portrait");
  try {
    window.AndroidApp?.setOrientation(o);
  } catch (_) { /* not running in the APK */ }
}

function startMatch(mode = matchMode) {
  matchMode = mode;
  setOrientation(mode === "pvp" ? "portrait" : "landscape");
  input.reset();
  input.setPvp(mode === "pvp");
  resize();
  game = createGame({
    loadouts: [settings.loadout.slice(), mode === "pvp" ? settings.loadout2.slice() : botLoadout()],
    names: names(),
    controllers: mode === "pvp"
      ? [input.controllers[0], input.controllers[1]]
      : [input.controllers[0], createBot(settings.difficulty)],
  });
  paused = false;
  show(null);
}

function resize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  input.resize(W, H);
  renderer.resize(W, H, dpr, input.st.L);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 120));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

const DT = 1 / 60;
let acc = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game) {
    drawIdle(now / 1000);
    return;
  }
  if (!paused && game.state !== "matchEnd") {
    acc += elapsed;
    while (acc >= DT) {
      step(game, DT);
      acc -= DT;
      if (game.events.length) {
        playEvents(game.events, matchMode === "pvp" ? -1 : ME);
        if (game.events.some((e) => e.t === "matchEnd")) setTimeout(showResults, 900);
        game.events.length = 0;
      }
    }
  }
  renderer.draw(game, input, { names: names(), humans: matchMode === "pvp" ? [0, 1] : [ME] });
}

// A slow-panning demo match behind the main menu.
let demo = null;
function drawIdle(t) {
  if (!demo || demo.state === "matchEnd" || (demo.state === "roundEnd" && demo.stateT < 0.1)) {
    demo = createGame({
      loadouts: [["ar", "shotgun"], ["burst", "smg"]],
      names: ["BLUE", "RED"],
      controllers: [createBot("hard"), createBot("hard")],
    });
    demo.state = "fight";
  }
  step(demo, 1 / 60);
  demo.events.length = 0;
  renderer.draw(demo, { st: {} }, { names: ["BLUE", "RED"], humans: [] });
}

resize();
refreshMenu();
show("menu");
requestAnimationFrame(frame);

// test hook
window.__clash = {
  get game() { return game; },
  get layout() { return input.st.L; },
  get mode() { return matchMode; },
  toScreen: (x, y) => renderer.toScreen(x, y),
  startMatch,
  settings,
  step: (n = 1) => { for (let i = 0; i < n; i++) step(game, DT); },
  setPaused: (p) => { paused = p; },
};
