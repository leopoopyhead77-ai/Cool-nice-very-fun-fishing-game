import "./styles.css";
import { GUNS, GUN_BY_ID, TIER_COLOR, gunStats } from "./guns.js";
import { createGame, step } from "./game.js";
import { createBot } from "./bot.js";
import { createInput, cardRects } from "./input.js";
import { createRenderer } from "./render.js";
import { unlockAudio, playEvents, uiClick, audio } from "./audio.js";
import { load, save } from "./storage.js";
import { createHost, joinRoom, normalizeCode, encodeWalls, MODES, PIN_LENGTH, testRelays } from "./net.js";

// One codebase, two apps (chosen at build time by build/build.mjs):
//   "local"  – Grid Clash: 2 players on one phone, and vs bot
//   "online" – Grid Clash Online: 1v1, 2v2, 1v1v1, 1v1v1v1 over the internet
// eslint-disable-next-line no-undef
const APP = typeof __APP__ !== "undefined" ? __APP__ : "local";
const IS_ONLINE_APP = APP === "online";
import { createRemoteController, createHostSync, createGuestView } from "./online.js";
import { gunIconURL, powerIconURL } from "./art.js";
import { POWERS, POWER_BY_ID, POWER_IDS } from "./powers.js";
import { MAPS, MAP_IDS } from "./maps.js";

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
  // "stick": BUILD is its own joystick with a crosshair (tap = quick wall)
  // "classic": the original — BUILD switches the aim stick into a build stick
  buildStyle: load("buildStyle", "stick"),
  map: load("map", "arena"),
  power: load("power", "dash"),
  power2: load("power2", "barrier"),
};
if (!POWER_BY_ID[settings.power]) settings.power = "dash";
if (!POWER_BY_ID[settings.power2]) settings.power2 = "barrier";
const botPower = () => POWER_IDS[Math.floor(Math.random() * POWER_IDS.length)];
// power picker row (pick screen / loadout screen)
const powerRow = (pl, chosen) => `<div class="pw-row">
  <span class="pw-lbl">POWER</span>
  ${POWERS.map((pw) => `<button class="pw${pw.id === chosen ? " on" : ""}" data-p="${pl}" data-pw="${pw.id}" style="--c:${pw.color}" title="${pw.desc}">
    <img src="${powerIconURL(pw.id)}" alt="" draggable="false" /><b>${pw.name}</b><small>${pw.cd}s</small>
  </button>`).join("")}
</div>`;
if (settings.map !== "random" && !MAPS[settings.map]) settings.map = "arena";
// "random" picks a map each match
const pickMap = () => (settings.map === "random" ? MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] : settings.map);
if (!["stick", "classic"].includes(settings.buildStyle)) settings.buildStyle = "stick";
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
        <span class="lbl">Map</span>
        <div class="seg" id="mapPick">
          ${MAP_IDS.map((id) => `<button data-m="${id}">${MAPS[id].name}</button>`).join("")}
          <button data-m="random">Random</button>
        </div>
      </div>
      <p class="tag map-note" id="mapNote"></p>
      <div class="row">
        <span class="lbl">Build</span>
        <div class="seg" id="buildStyle">
          <button data-b="stick">Stick <small>+ crosshair</small></button>
          <button data-b="classic">Classic <small>mode switch</small></button>
        </div>
      </div>
      <div class="row${IS_ONLINE_APP ? "" : " hidden"}">
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
    <div id="loPower"></div>
    <div class="gun-grid" id="gunGrid"></div>
  </section>

  <section id="select" class="screen hidden">
    <div class="sel-wrap" id="selWrap">
      <div class="sel-panel" id="selP1" data-p="1"></div>
      <div class="sel-panel" id="selP0" data-p="0"></div>
    </div>
    <button class="btn ghost small sel-back" id="selBack">‹ Menu</button>
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
      <div id="netTest" class="net-test hidden"></div>
      <div class="row foot"><button class="btn ghost small" id="netBack">‹ Back</button><button class="btn ghost small" id="netTestBtn">📶 Test connection</button><span class="tag small-note">Empty seats are filled by bots.</span></div>
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
        <li><b>Building</b> — pick your style on the main menu (<b>Build: Stick / Classic</b>). Walls are 3 tiles, cost 30 mats, and land up to ~4 tiles away.</li>
        <li><b>Stick</b> — BUILD is its own joystick. <b>Tap</b> it: a wall drops right in front of you. <b>Drag</b> it: a crosshair and a ghost wall show where it lands; release to build, drag back to cancel. <b>EDIT</b> works the same way (tap = wall in front, drag = pick a tile); <b>↺</b> restores. Your aim stick always shoots.</li>
        <li><b>Classic</b> — BUILD switches your aim stick into a build stick (drag, release to place); tap it again (FIGHT) to shoot. In build mode the weapon buttons become <b>EDIT</b> (aim at your wall, release to cut / restore a tile) and <b>RESET</b>.</li>
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
  <div id="safe"></div>
`;

const $ = (id) => document.getElementById(id);
const canvas = $("cv");
const screens = ["menu", "loadout", "help", "pause", "results", "online-screen", "lobby", "select"];
function show(name) {
  for (const s of screens) $(s).classList.toggle("hidden", s !== name);
  input.st.enabled = name === null && !!game;
}

// ---- menu ---------------------------------------------------------------------

function refreshMenu() {
  $("mapPick").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === settings.map));
  $("mapNote").textContent = settings.map === "random" ? "A different map every match." : MAPS[settings.map].desc;
  $("buildStyle").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.b === settings.buildStyle));
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
$("mapPick").addEventListener("click", (e) => {
  const m = e.target.closest("button")?.dataset.m;
  if (!m) return;
  settings.map = m;
  save("map", m);
  click();
  refreshMenu();
});
$("buildStyle").addEventListener("click", (e) => {
  const b = e.target.closest("button")?.dataset.b;
  if (!b) return;
  settings.buildStyle = b;
  save("buildStyle", b);
  click();
  refreshMenu();
});
$("play")?.addEventListener("click", () => {
  click();
  openSelect("bot");
});
$("pvp")?.addEventListener("click", () => {
  click();
  openSelect("pvp");
});

// ---- item pick (local app): each player chooses 2 guns before the match ------

const sel = { mode: "bot", picks: [[], []], ready: [false, false], focus: [null, null] };

function openSelect(mode) {
  sel.mode = mode;
  sel.picks = [settings.loadout.slice(), settings.loadout2.slice()];
  sel.power = [settings.power, settings.power2];
  sel.ready = [false, mode !== "pvp"]; // vs bot: only player 1 picks
  sel.focus = [sel.picks[0][0], sel.picks[1][0]];
  setOrientation(mode === "pvp" ? "portrait" : "landscape");
  input.setPvp(false);
  resize();
  $("selWrap").className = "sel-wrap " + (mode === "pvp" ? "two" : "one");
  renderSelect();
  show("select");
}

function renderSelect() {
  for (const pl of [0, 1]) {
    const el = $(pl === 0 ? "selP0" : "selP1");
    if (sel.mode !== "pvp" && pl === 1) {
      el.innerHTML = "";
      continue;
    }
    const picks = sel.picks[pl];
    const ready = sel.ready[pl];
    const who = sel.mode === "pvp" ? (pl === 0 ? "PLAYER 1 · BLUE" : "PLAYER 2 · RED") : "YOUR ITEMS";
    const f = GUN_BY_ID[sel.focus[pl]] || GUN_BY_ID[picks[0]];
    el.innerHTML = `
      <div class="sel-head t${pl}">
        <b>${who}</b><span>${ready ? "Ready ✓" : `Pick 2 items · ${picks.length}/2`}</span>
      </div>
      <div class="sel-grid">
        ${GUNS.map((g) => {
          const k = picks.indexOf(g.id);
          return `<button class="item${k >= 0 ? " on" : ""}" data-p="${pl}" data-id="${g.id}" style="--c:${TIER_COLOR[g.tier]}">
            <img src="${gunIconURL(g.id)}" alt="" draggable="false" />
            <b>${g.name}</b>
            ${k >= 0 ? `<i>${k + 1}</i>` : ""}
          </button>`;
        }).join("")}
      </div>
      ${powerRow(pl, sel.power[pl])}
      <div class="sel-foot">
        <p class="sel-desc">${sel.powerFocus === pl ? `<b style="color:${POWER_BY_ID[sel.power[pl]].color}">${POWER_BY_ID[sel.power[pl]].name}</b> (${POWER_BY_ID[sel.power[pl]].cd}s cooldown) — ${POWER_BY_ID[sel.power[pl]].desc}` : f ? `<b style="color:${TIER_COLOR[f.tier]}">${f.tier} ${f.name}</b> — ${f.desc}` : ""}</p>
        <button class="btn ${ready ? "" : "primary"} sel-ready" data-p="${pl}" ${picks.length === 2 ? "" : "disabled"}>${ready ? "Change" : sel.mode === "pvp" ? "READY" : "FIGHT ▶"}</button>
      </div>`;
  }
}

$("selWrap").addEventListener("click", (e) => {
  const pwBtn = e.target.closest(".pw");
  if (pwBtn) {
    const pl = Number(pwBtn.dataset.p);
    sel.power[pl] = pwBtn.dataset.pw;
    sel.powerFocus = pl;
    sel.ready[pl] = false;
    click();
    renderSelect();
    return;
  }
  const item = e.target.closest(".item");
  const readyBtn = e.target.closest(".sel-ready");
  if (item) {
    const pl = Number(item.dataset.p);
    const id = item.dataset.id;
    const picks = sel.picks[pl];
    const k = picks.indexOf(id);
    if (k >= 0) picks.splice(k, 1);
    else {
      if (picks.length >= 2) picks.shift();
      picks.push(id);
    }
    sel.focus[pl] = id;
    sel.powerFocus = -1;
    sel.ready[pl] = false;
    click();
    renderSelect();
    return;
  }
  if (readyBtn && !readyBtn.disabled) {
    const pl = Number(readyBtn.dataset.p);
    sel.ready[pl] = !sel.ready[pl];
    click();
    if (sel.ready.every(Boolean)) {
      settings.loadout = sel.picks[0].slice();
      save("loadout", settings.loadout);
      settings.power = sel.power[0];
      save("power", settings.power);
      if (sel.mode === "pvp") {
        settings.loadout2 = sel.picks[1].slice();
        save("loadout2", settings.loadout2);
        settings.power2 = sel.power[1];
        save("power2", settings.power2);
      }
      startMatch(sel.mode);
      return;
    }
    renderSelect();
  }
});
$("selBack").addEventListener("click", () => {
  click();
  toMenu();
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
  $("loPower").innerHTML = IS_ONLINE_APP ? powerRow(0, settings.power) : "";
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
      <div class="gun-top"><img class="gicon" src="${gunIconURL(g.id)}" alt="" /><span class="gname">${g.name}</span>${idx >= 0 ? `<span class="badge">${idx + 1}</span>` : ""}</div>
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
$("loPower").addEventListener("click", (e) => {
  const b = e.target.closest(".pw");
  if (!b) return;
  settings.power = b.dataset.pw;
  save("power", settings.power);
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
  cardPhase: () => !!game && game.state === "cards" && !online(),
  hasPower: (i) => !!padPlayer(i)?.power,
  buildStyle: () => settings.buildStyle,
});

function click() {
  unlockAudio();
  uiClick();
}

function botLoadout() {
  // the bot gets a sensible pair: one close-range, one long-range gun
  const close = ["shotgun", "smg", "flamer", "minigun", "pistol", "dbarrel", "frost", "akimbo"];
  const far = ["ar", "burst", "sniper", "revolver", "rocket", "grenade", "rail", "dmr", "crossbow", "ricochet", "cluster"];
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
    powers: [settings.power, mode === "pvp" ? settings.power2 : botPower()],
    names: names(),
    controllers: mode === "pvp"
      ? [input.controllers[0], input.controllers[1]]
      : [input.controllers[0], createBot(settings.difficulty)],
    // the local app deals buff cards before every round
    cards: !IS_ONLINE_APP,
    map: pickMap(),
  });
  paused = false;
  show(null);
}

// The notch / rounded corners / home bar: keep the game inside the safe area.
function safeInsets() {
  const cs = getComputedStyle($("safe"));
  const px = (v) => parseFloat(v) || 0;
  return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
}

function resize() {
  const ins = safeInsets();
  const W = Math.max(1, window.innerWidth - ins.l - ins.r);
  const H = Math.max(1, window.innerHeight - ins.t - ins.b);
  canvas.style.left = ins.l + "px";
  canvas.style.top = ins.t + "px";
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
    buildStyle: settings.buildStyle,
    net: online() ? netInfo() : null,
  });
}

// A slow-panning demo match behind the main menu.
let demo = null;
let demoMap = -1;
function drawIdle(t) {
  if (!demo || demo.state === "matchEnd" || (demo.state === "roundEnd" && demo.stateT < 0.1)) {
    demoMap = (demoMap + 1) % MAP_IDS.length;
    demo = createGame({
      loadouts: [["ar", "shotgun"], ["burst", "smg"]],
      names: ["BLUE", "RED"],
      controllers: [createBot("hard"), createBot("hard")],
      map: MAP_IDS[demoMap],
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
$("netTestBtn").addEventListener("click", async () => {
  click();
  const box = $("netTest");
  box.classList.remove("hidden");
  $("netTestBtn").disabled = true;
  const draw = (rs) => {
    box.innerHTML = rs.map((r) => `<div class="nt ${r.state}"><span>${r.state === "ok" ? "✓" : r.state === "fail" ? "✗" : "…"}</span><b>${r.name}</b><em>${r.state === "ok" ? r.ms + " ms" : r.state === "fail" ? escapeHtml(r.err) : "testing"}</em></div>`).join("")
      + `<div class="nt-online">${navigator.onLine === false ? "This phone says it is offline." : ""}</div>`;
  };
  const rs = await testRelays(draw);
  draw(rs);
  const ok = rs.filter((r) => r.state === "ok").length;
  setNetStatus(ok ? `${ok} of ${rs.length} relays reachable — online play should work.` : "No relay reachable from this phone/network. Try switching Wi-Fi ↔ mobile data.", !ok);
  $("netTestBtn").disabled = false;
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
      power: settings.power,
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
      power: settings.power,
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
  $("lbMode").textContent = isHost ? `${mode} · ${settings.map === "random" ? "Random map" : MAPS[settings.map].name}` : mode;
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
  const powers = slots.map((s, i) => (i === 0 ? settings.power : s && POWER_BY_ID[s.power] ? s.power : botPower()));
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
  const map = pickMap();
  game = createGame({ loadouts, names: nm, controllers, seed, teams, map, powers });
  host.started = true;
  hostSync = createHostSync(host, game, mid, hostRemotes);
  const msg = { t: "start", mid, seed, loadouts, names: nm, teams, map, powers, slots: slots.map((s) => (s ? s.cid : null)) };
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

// iOS Safari only lets audio start from touchend / click
for (const ev of ["touchend", "click"]) document.addEventListener(ev, unlockAudio, { passive: true });

// iPhone in the Safari browser (not yet added to the home screen): show how to install
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone || window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: fullscreen)").matches;
if (isIOS && !standalone && location.protocol.startsWith("http")) {
  const hint = document.createElement("p");
  hint.className = "ios-hint";
  hint.innerHTML = "📲 For full screen: tap <b>Share</b> → <b>Add to Home Screen</b>, then open Grid Clash from your home screen.";
  document.querySelector("#menu .menu-card").appendChild(hint);
}

resize();
refreshMenu();
show("menu");
requestAnimationFrame(frame);

// test hook
window.__clash = {
  get game() { return game; },
  get layout() { return input.st.L; },
  cardRects: () => input.st.L.pads.map((pad) => cardRects(input.st.L, pad)),
  get mode() { return matchMode; },
  get local() { return local; },
  get net() { return { host, guest, guestView }; },
  toScreen: (x, y) => renderer.toScreen(x, y),
  startMatch,
  settings,
  step: (n = 1) => { for (let i = 0; i < n; i++) step(game, DT); },
  setPaused: (p) => { paused = p; },
};
