import "./styles.css";
import { GUNS, GUN_BY_ID, TIER_COLOR, gunStats } from "./guns.js";
import { createGame, step } from "./game.js";
import { createBot } from "./bot.js";
import { createInput } from "./input.js";
import { createRenderer } from "./render.js";
import { unlockAudio, playEvents, uiClick, audio } from "./audio.js";
import { load, save } from "./storage.js";
import { createHost, joinRoom, normalizeCode, encodeWalls, MODES, PIN_LENGTH } from "./net.js";

// One codebase, two apps (chosen at build time by build/build.mjs):
//   "local"  – Grid Clash: 2 players on one phone, and vs bot
//   "online" – Grid Clash Online: 1v1, 2v2, 1v1v1, 1v1v1v1 over the internet
// eslint-disable-next-line no-undef
const APP = typeof __APP__ !== "undefined" ? __APP__ : "local";
const IS_ONLINE_APP = APP === "online";
import { createRemoteController, createHostSync, createGuestView } from "./online.js";

const ME = 0;
const NAMES_BOT = ["YOU", "BOT"];
const NAMES_PVP = ["BLUE", "RED"];
let matchMode = "bot"; // "bot" | "pvp" | "host" | "guest"
let curNames = NAMES_BOT;
const names = () => curNames;
// which player this phone controls (always 0 except for an online guest)
let local = 0;
const online = () => matchMode === "host" || matchMode === "guest";
const DIFFS = ["easy", "normal", "hard"];

const settings = {
  loadout: load("loadout", ["ar", "shotgun"]),
  loadout2: load("loadout2", ["burst", "smg"]),
  difficulty: load("difficulty", "normal"),
  muted: load("muted", false),
  netName: load("netName", ""),
  netMode: load("netMode", "1v1"),
};
if (!MODES[settings.netMode]) settings.netMode = "1v1";
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
      <h1 class="logo">GRID<span>CLASH</span>${IS_ONLINE_APP ? '<em class="logo-online">ONLINE</em>' : ""}</h1>
      <p class="tag">${IS_ONLINE_APP ? "Online shoot &amp; build arena · 1v1 · 2v2 · 1v1v1 · 1v1v1v1" : "Shoot &amp; build arena · 30×20"}</p>
      <div class="menu-grid${IS_ONLINE_APP ? " one" : ""}">
        ${IS_ONLINE_APP
          ? '<button class="btn primary big" id="online">🌐 PLAY ONLINE <small>host a room or join with a PIN · mobile data works</small></button>'
          : `<button class="btn red big" id="pvp">👥 2 PLAYERS <small>1v1 · same phone</small></button>
        <button class="btn primary big" id="play">▶ PLAY vs BOT</button>`}
      </div>
      <div class="row">
        <span class="lbl">${IS_ONLINE_APP ? "Bots" : "Bot"}</span>
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

  <section id="online-screen" class="screen hidden">
    <div class="menu-card">
      <h2>Online</h2>
      <p class="tag">Play friends anywhere, on Wi-Fi or mobile data. One player hosts a room; everyone else joins with its PIN.</p>
      <div class="row">
        <span class="lbl">Name</span>
        <input id="netName" class="inp" maxlength="12" placeholder="Your name" autocomplete="off" />
      </div>
      <div class="row">
        <span class="lbl">Mode</span>
        <div class="seg" id="netMode">${Object.keys(MODES).map((m) => `<button data-m="${m}">${m}</button>`).join("")}</div>
      </div>
      <p class="tag mode-note" id="netModeNote"></p>
      <button class="btn primary big" id="netCreate">Host a room</button>
      <div class="row join-row">
        <input id="netCode" class="inp code" maxlength="${PIN_LENGTH}" placeholder="PIN" inputmode="numeric" pattern="[0-9]*" autocomplete="off" spellcheck="false" />
        <button class="btn red" id="netJoin">Join with PIN</button>
      </div>
      <p id="netStatus" class="status"></p>
      <div class="row foot"><button class="btn ghost small" id="netBack">‹ Back</button><span class="tag small-note">Empty seats are filled by bots.</span></div>
    </div>
  </section>

  <section id="lobby" class="screen hidden">
    <div class="menu-card">
      <div class="lobby-head">
        <div><small class="lbl">Room PIN</small><div id="lbCode" class="bigcode"></div></div>
        <div id="lbMode" class="pill"></div>
      </div>
      <p class="tag" id="lbHint"></p>
      <div id="lbSlots" class="slots"></div>
      <div class="row foot">
        <button class="btn ghost small" id="lbLeave">Leave</button>
        <button class="btn primary" id="lbStart">Start match</button>
      </div>
    </div>
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
        ${IS_ONLINE_APP
          ? `<li><b>Online</b> — one player taps <b>Host a room</b> and reads out the 6-digit PIN; everyone else types it and taps <b>Join with PIN</b>. Works on mobile data. Modes: 1v1, 2v2, and free-for-all 1v1v1 / 1v1v1v1. Empty seats get bots. The host's phone runs the match, so the host should stay in the app.</li>`
          : `<li><b>2 Players</b> — the phone turns upright. Blue plays from the bottom end, Red from the top end; each side's controls face its player. Left thumb moves, right thumb aims, BUILD sits above your aim stick. Pick Red's guns with the P2 tab on the loadout screen.</li>`}
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
      <p class="tag online-only">Online matches keep running while this menu is open.</p>
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
const screens = ["menu", "loadout", "help", "pause", "results", "online-screen", "lobby"];
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
$("play")?.addEventListener("click", () => {
  click();
  startMatch("bot");
});
$("pvp")?.addEventListener("click", () => {
  click();
  startMatch("pvp");
});
$("online")?.addEventListener("click", () => {
  click();
  openOnline("");
});
// the online app has no same-phone player 2, so no P2 loadout tab
if (IS_ONLINE_APP) $("loPlayer").classList.add("hidden");
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
  paused = !online(); // an online match can't stop for one player
  input.reset();
  document.body.classList.toggle("is-online", online());
  $("restart").classList.toggle("hidden", online());
  $("quit").textContent = online() ? "Leave match" : "Quit to menu";
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
  if (online()) {
    leaveOnline("");
    return;
  }
  game = null;
  paused = false;
  toMenu();
});
$("again").addEventListener("click", () => {
  click();
  if (matchMode === "host") startOnlineMatch();
  else if (matchMode !== "guest") startMatch();
});
$("toMenu").addEventListener("click", () => {
  click();
  if (online()) {
    leaveOnline("");
    return;
  }
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
  if (!game) return;
  const myTeam = game.players[local].team;
  const won = game.matchWinner === myTeam;
  const draw = game.matchWinner < 0;
  $("again").disabled = matchMode === "guest";
  $("again").textContent = matchMode === "guest" ? "Waiting for host…" : "Rematch";
  if (online()) {
    $("resTitle").textContent = draw ? "DRAW" : won ? "VICTORY" : "DEFEAT";
    $("resTitle").className = draw ? "" : won ? "win" : "lose";
    $("resScore").textContent = `${game.score[0]} – ${game.score[1]}`;
    const acc = (p) => (p.stats.shots ? Math.round((p.stats.hits / p.stats.shots) * 100) + "%" : "–");
    const head = ["", ...game.players.map((p) => p.name + (p.id === local ? " (you)" : ""))];
    const rows = [
      head,
      ["Damage", ...game.players.map((p) => p.stats.dmg)],
      ["Accuracy", ...game.players.map(acc)],
      ["Walls", ...game.players.map((p) => p.stats.walls)],
    ];
    $("resStats").innerHTML = rows
      .map((r, i) => `<tr>${r.map((c, j) => {
        const cls = j > 0 ? ` class="t${game.players[j - 1].team}"` : "";
        return i === 0 ? `<th${cls}>${c}</th>` : `<td${cls}>${c}</td>`;
      }).join("")}</tr>`)
      .join("");
    input.reset();
    show("results");
    return;
  }
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
// pad i drives player i on a shared phone, otherwise this phone's own player
const padPlayer = (i) => (game ? game.players[input.st.pvp ? i : local] : null);
const input = createInput(canvas, {
  mode: (i) => padPlayer(i)?.mode || "combat",
  slot: (i) => padPlayer(i)?.slot || 0,
  playerScreen: (i) => {
    const p = padPlayer(i);
    return p ? renderer.toScreen(p.x, p.y) : null;
  },
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
  local = 0;
  curNames = mode === "pvp" ? NAMES_PVP : NAMES_BOT;
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
  if (matchMode === "guest") {
    if (guestView) guestView.frame(elapsed);
  } else if (!paused && game.state !== "matchEnd") {
    acc += elapsed;
    while (acc >= DT) {
      step(game, DT);
      acc -= DT;
      if (game.events.length) {
        playEvents(game.events, matchMode === "pvp" ? -1 : local, game.players[local].team);
        if (hostSync) hostSync.addEvents(game.events);
        if (game.events.some((e) => e.t === "matchEnd")) setTimeout(showResults, 900);
        game.events.length = 0;
      }
    }
  }
  if (hostSync) hostSync.tick(elapsed, encodeWalls);
  renderer.draw(game, input, {
    names: names(),
    humans: matchMode === "pvp" ? [0, 1] : [local],
    local,
    tags: game.players.length > 2 || online(),
    net: online() ? netInfo() : null,
  });
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
  renderer.draw(demo, { st: {} }, { names: ["BLUE", "RED"], humans: [], local: 0 });
}

// ---- online -----------------------------------------------------------------------

let host = null;      // when this phone created the room
let guest = null;     // when this phone joined one
let guestView = null;
let hostSync = null;
let lobbyInfo = null;

function netInfo() {
  if (matchMode === "host") {
    const humans = host ? [...host.guests.values()] : [];
    const direct = humans.filter((g) => g.dc && g.dc.readyState === "open").length;
    const pings = host ? host.slots.filter((s) => s && s.ping).map((s) => s.ping) : [];
    return { host: true, ping: pings.length ? Math.max(...pings) : 0, direct: humans.length > 0 && direct === humans.length, code: host?.code };
  }
  return { host: false, ping: guest ? guest.rtt : 0, direct: guest ? guest.direct : false, code: guest?.code };
}

function setNetStatus(text, bad) {
  $("netStatus").textContent = text || "";
  $("netStatus").classList.toggle("bad", !!bad);
}

const MODE_NOTES = {
  "1v1": "1 vs 1 · two players",
  "2v2": "Teams of two · blue vs red · up to 4 players",
  "1v1v1": "Free-for-all · 3 players, everyone for themselves",
  "1v1v1v1": "Free-for-all · 4 players, everyone for themselves",
};

function refreshOnline(fillName) {
  if (fillName) $("netName").value = settings.netName;
  $("netMode").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === settings.netMode));
  $("netModeNote").textContent = MODE_NOTES[settings.netMode];
}

function openOnline(message) {
  setOrientation("landscape");
  input.setPvp(false);
  resize();
  refreshOnline(true);
  setNetStatus(message, !!message);
  show("online-screen");
}

function playerName() {
  const n = $("netName").value.trim().slice(0, 12);
  settings.netName = n;
  save("netName", n);
  return n || "Player";
}

$("netMode").addEventListener("click", (e) => {
  const m = e.target.closest("button")?.dataset.m;
  if (!m) return;
  settings.netMode = m;
  save("netMode", m);
  click();
  refreshOnline();
});
$("netBack").addEventListener("click", () => {
  click();
  toMenu();
});
$("netCode").addEventListener("input", (e) => {
  e.target.value = normalizeCode(e.target.value);
});

$("netCreate").addEventListener("click", async () => {
  click();
  const name = playerName();
  setNetStatus("Creating room…");
  $("netCreate").disabled = true;
  try {
    host = await createHost({
      mode: settings.netMode,
      name,
      loadout: settings.loadout.slice(),
      onStatus: (t) => setNetStatus(t),
      onLobby: () => renderLobby(),
      onGuestMessage: (slot, m) => {
        if (m.t === "c" && hostRemotes[slot]) hostRemotes[slot].receive(m);
      },
      onGuestLeft: (slot) => {
        // mid-match: a bot takes over the empty seat
        if (game && matchMode === "host" && game.controllers[slot] === hostRemotes[slot]) {
          game.controllers[slot] = createBot(settings.difficulty);
          game.players[slot].name += " (bot)";
          hostRemotes[slot] = null;
        }
      },
    });
    setNetStatus("");
    renderLobby();
    show("lobby");
  } catch (e) {
    setNetStatus(e.message || String(e), true);
  } finally {
    $("netCreate").disabled = false;
  }
});

$("netJoin").addEventListener("click", async () => {
  click();
  const code = normalizeCode($("netCode").value);
  if (code.length !== PIN_LENGTH) {
    setNetStatus(`Enter the ${PIN_LENGTH}-digit room PIN`, true);
    return;
  }
  const name = playerName();
  setNetStatus("Joining " + code + "…");
  $("netJoin").disabled = true;
  try {
    guest = await joinRoom({
      code, name,
      loadout: settings.loadout.slice(),
      onStatus: (t) => setNetStatus(t),
      onLobby: (m, me) => {
        lobbyInfo = m;
        if (me >= 0 && !guestView) {
          renderLobby();
          show("lobby");
        }
      },
      onStart: (m, slot) => startGuestMatch(m, slot),
      onSnapshot: (snap) => {
        if (!guestView) return;
        const ev = guestView.snapshot(snap);
        if (ev.length) playEvents(ev, local, game.players[local].team);
        if (ev.some((e) => e.t === "matchEnd")) setTimeout(showResults, 900);
      },
      onClosed: (why) => leaveOnline(why),
    });
    setNetStatus("Waiting for the host…");
  } catch (e) {
    setNetStatus("Couldn't join: " + (e.message || e), true);
  } finally {
    $("netJoin").disabled = false;
  }
});

function renderLobby() {
  const isHost = !!host;
  const code = isHost ? host.code : guest?.code;
  const size = isHost ? host.size : lobbyInfo?.size || 2;
  const mode = isHost ? host.mode : lobbyInfo?.mode || "1v1";
  const teams = isHost ? host.teams : lobbyInfo?.teams || MODES[mode]?.teams || [0, 1, 0, 1];
  const slots = isHost
    ? host.slots.map((s) => (s ? { name: s.name, cid: s.cid, link: s.link, ping: s.ping } : null))
    : lobbyInfo?.slots || [];
  $("lbCode").textContent = code || "";
  $("lbMode").textContent = mode;
  $("lbHint").textContent = isHost
    ? "You're hosting. Tell your friends this PIN — they tap PLAY ONLINE → Join with PIN. Start whenever you're ready; empty seats get bots."
    : "You're in! Waiting for the host to start the match…";
  const mine = isHost ? "host" : guest?.cid;
  $("lbSlots").innerHTML = Array.from({ length: size }, (_, i) => {
    const s = slots[i];
    const team = teams[i] ?? i % 2;
    const link = s && s.cid !== "host" ? (s.link === "direct" ? "direct" : "relay") + (s.ping ? ` · ${s.ping} ms` : "") : s ? "host" : "";
    return `<div class="slot t${team}${s && s.cid === mine ? " me" : ""}">
      <span class="dot"></span>
      <span class="sname">${s ? escapeHtml(s.name) + (s.cid === mine ? " (you)" : "") : "Empty — bot"}</span>
      <span class="slink">${link}</span>
      ${isHost && s && s.cid !== "host" ? `<button class="kick" data-slot="${i}">✕</button>` : ""}
    </div>`;
  }).join("");
  $("lbStart").classList.toggle("hidden", !isHost);
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

$("lbSlots").addEventListener("click", (e) => {
  const b = e.target.closest(".kick");
  if (b && host) host.kick(Number(b.dataset.slot));
});
$("lbStart").addEventListener("click", () => {
  click();
  startOnlineMatch();
});
$("lbLeave").addEventListener("click", () => {
  click();
  leaveOnline("");
});

let hostRemotes = [];

function startOnlineMatch() {
  if (!host) return;
  const valid = (l) => Array.isArray(l) && l.length === 2 && l.every((id) => GUN_BY_ID[id]);
  const slots = host.slots;
  const loadouts = slots.map((s, i) => (i === 0 ? settings.loadout.slice() : s && valid(s.loadout) ? s.loadout : botLoadout()));
  const nm = slots.map((s, i) => (s ? s.name : `BOT ${i + 1}`));
  const teams = host.teams.slice();
  hostRemotes = slots.map((s, i) => (i > 0 && s && !s.left ? createRemoteController() : null));
  const controllers = slots.map((s, i) => (i === 0 ? input.controllers[0] : hostRemotes[i] || createBot(settings.difficulty)));
  const mid = Math.random().toString(36).slice(2, 10);
  const seed = Math.floor(Math.random() * 1e9);
  matchMode = "host";
  local = 0;
  curNames = nm;
  input.reset();
  input.setPvp(false);
  resize();
  game = createGame({ loadouts, names: nm, controllers, seed, teams });
  host.started = true;
  hostSync = createHostSync(host, game, mid, hostRemotes);
  const msg = { t: "start", mid, seed, loadouts, names: nm, teams, slots: slots.map((s) => (s ? s.cid : null)) };
  host.broadcast(msg);
  // the start message is important: repeat it in case a guest misses one
  [600, 1300, 2200].forEach((ms) => setTimeout(() => host && host.started && hostSync && host.broadcast(msg), ms));
  paused = false;
  show(null);
}

function startGuestMatch(m, slot) {
  if (guestView && guestView.mid === m.mid) return;
  matchMode = "guest";
  local = slot;
  curNames = m.names;
  input.reset();
  input.setPvp(false);
  resize();
  guestView = createGuestView(m, slot, guest, input);
  game = guestView.game;
  paused = false;
  show(null);
}

function leaveOnline(reason) {
  if (host) host.close();
  if (guest) guest.leave();
  host = null;
  guest = null;
  guestView = null;
  hostSync = null;
  hostRemotes = [];
  lobbyInfo = null;
  game = null;
  paused = false;
  matchMode = "bot";
  local = 0;
  openOnline(reason);
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
  get local() { return local; },
  get net() { return { host, guest, guestView }; },
  toScreen: (x, y) => renderer.toScreen(x, y),
  startMatch,
  settings,
  step: (n = 1) => { for (let i = 0; i < n; i++) step(game, DT); },
  setPaused: (p) => { paused = p; },
};
