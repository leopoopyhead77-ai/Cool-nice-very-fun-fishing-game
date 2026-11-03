// Match simulation. Pure state + step(); no DOM, no rendering.
//
// Every player is driven by a controller with poll(game, player, dt) → command:
//   { mx, my,                       movement, length ≤ 1
//     aiming, aimAngle, aimMag,     the live aim (drives previews / facing)
//     actions: [ ... ] }            discrete events this frame
//
// Actions:
//   { t: "fire",  angle, mag, tap }   tap = quick-fire with auto-aim
//   { t: "build", angle, mag, tap }
//   { t: "edit",  angle, tap }        toggle one tile of your wall open/closed
//   { t: "reset", angle? }            restore an edited wall
//   { t: "mode",  mode }              "combat" | "build" | "edit"
//   { t: "slot",  slot } / { t: "swap" } / { t: "reload" }
//
// Human input, the bot and (later) a network peer all speak this same format,
// so online play only needs a controller that replays a remote player's
// commands.

import { GUN_BY_ID } from "./guns.js";
import {
  GW, GH, WALL_COST, SPAWNS, MEDKIT_SPOTS,
  createWorld, clearWalls, raycast, lineClear, segCircle, isSolid,
  collideCircle, wallPlacement, placeWall, damageTile, editTarget,
  circleOverlapsCell, tileAt, inBounds, isRock,
} from "./world.js";

export const MAX_HP = 100;
export const START_MATS = 90;
export const MAX_MATS = 300;
export const MATS_REGEN = 7;
export const ROUND_TIME = 90;
export const WINS_NEEDED = 3;
export const MAX_ROUNDS = 9;
const MOVE_SPEED = 4.3;
const MEDKIT_HEAL = 35;
const MEDKIT_EVERY = 16;

function makeStats() {
  return { dmg: 0, shots: 0, hits: 0, walls: 0, edits: 0, kills: 0 };
}

function makePlayer(team, loadout, name) {
  return {
    team, name,
    x: 0, y: 0, vx: 0, vy: 0, r: 0.38,
    hp: MAX_HP, alive: true,
    loadout,
    guns: loadout.map((id) => ({ def: GUN_BY_ID[id], ammo: GUN_BY_ID[id].mag })),
    slot: 0, cd: 0, reloadT: 0, swapT: 0, burst: null,
    mats: START_MATS, mode: "combat",
    facing: team === 0 ? 0 : Math.PI,
    aiming: false, aimAngle: 0, aimMag: 0,
    hitFlash: 0, recoil: 0,
    stats: makeStats(),
  };
}

export function createGame({ loadouts, names, controllers, seed }) {
  const g = {
    world: createWorld(),
    players: [0, 1].map((t) => makePlayer(t, loadouts[t], names[t])),
    controllers,
    bullets: [],
    beams: [],
    booms: [],
    particles: [],
    texts: [],
    medkits: MEDKIT_SPOTS.map((s) => ({ ...s, up: false, t: MEDKIT_EVERY * 0.5 })),
    events: [],
    state: "countdown",
    stateT: 3,
    round: 1,
    score: [0, 0],
    roundWinner: -1,
    matchWinner: -1,
    timeLeft: ROUND_TIME,
    time: 0,
    shake: 0,
    rng: mulberry(seed ?? (Date.now() & 0xffffffff)),
  };
  resetRound(g);
  return g;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resetRound(g) {
  clearWalls(g.world);
  g.bullets.length = 0;
  g.beams.length = 0;
  g.booms.length = 0;
  g.timeLeft = ROUND_TIME;
  g.roundWinner = -1;
  for (const m of g.medkits) {
    m.up = false;
    m.t = MEDKIT_EVERY * 0.5;
  }
  g.players.forEach((p, i) => {
    p.x = SPAWNS[i].x;
    p.y = SPAWNS[i].y;
    p.vx = p.vy = 0;
    p.hp = MAX_HP;
    p.alive = true;
    p.guns.forEach((gun) => (gun.ammo = gun.def.mag));
    p.cd = p.reloadT = p.swapT = 0;
    p.burst = null;
    p.mats = START_MATS;
    p.mode = "combat";
    p.facing = i === 0 ? 0 : Math.PI;
    p.aiming = false;
    p.roundDmg = 0;
  });
}

export const enemyOf = (g, p) => g.players[1 - p.team];
export const gunOf = (p) => p.guns[p.slot];

const emit = (g, e) => g.events.push(e);

// ---- step ------------------------------------------------------------------

export function step(g, dt) {
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt * 3);

  if (g.state === "countdown") {
    g.stateT -= dt;
    // let controllers aim / preview during the countdown, but nothing fires
    g.players.forEach((p, i) => {
      const cmd = g.controllers[i].poll(g, p, dt);
      p.aiming = !!cmd.aiming;
      if (p.aiming) p.aimAngle = cmd.aimAngle;
    });
    if (g.stateT <= 0) {
      g.state = "fight";
      emit(g, { t: "go" });
    }
  } else if (g.state === "fight") {
    g.players.forEach((p, i) => {
      if (!p.alive) return;
      const cmd = g.controllers[i].poll(g, p, dt);
      applyCommand(g, p, cmd, dt);
    });
    updatePlayers(g, dt);
    updateMedkits(g, dt);
    g.timeLeft -= dt;
    if (g.timeLeft <= 0 && g.state === "fight") {
      // time out: more health wins; equal health goes to whoever dealt more
      // damage this round; only a true tie is a draw
      const [a, b] = g.players;
      const key = (p) => p.hp * 1000 + p.roundDmg;
      endRound(g, key(a) === key(b) ? -1 : key(a) > key(b) ? 0 : 1);
    }
  } else if (g.state === "roundEnd") {
    g.stateT -= dt;
    if (g.stateT <= 0) {
      if (g.score[0] >= WINS_NEEDED || g.score[1] >= WINS_NEEDED || g.round >= MAX_ROUNDS) {
        g.state = "matchEnd";
        g.matchWinner = g.score[0] === g.score[1] ? -1 : g.score[0] > g.score[1] ? 0 : 1;
        emit(g, { t: "matchEnd", winner: g.matchWinner });
      } else {
        g.round++;
        resetRound(g);
        g.state = "countdown";
        g.stateT = 3;
        emit(g, { t: "round" });
      }
    }
  }

  updateBullets(g, dt);
  updateFx(g, dt);
}

function endRound(g, winner) {
  if (g.state !== "fight") return;
  g.state = "roundEnd";
  g.stateT = 2.6;
  g.roundWinner = winner;
  if (winner >= 0) g.score[winner]++;
  emit(g, { t: "roundEnd", winner });
}

function applyCommand(g, p, cmd, dt) {
  let mx = cmd.mx || 0;
  let my = cmd.my || 0;
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }
  const speed = MOVE_SPEED * (cmd.aiming ? 0.82 : 1);
  const k = Math.min(1, dt * 14);
  p.vx += (mx * speed - p.vx) * k;
  p.vy += (my * speed - p.vy) * k;

  p.aiming = !!cmd.aiming;
  if (p.aiming) {
    p.aimAngle = cmd.aimAngle;
    p.aimMag = cmd.aimMag;
    p.facing = cmd.aimAngle;
  } else if (ml > 0.2) {
    p.facing = Math.atan2(my, mx);
  }

  for (const a of cmd.actions || []) handleAction(g, p, a);
}

function handleAction(g, p, a) {
  switch (a.t) {
    case "mode":
      if (p.mode !== a.mode) {
        p.mode = a.mode;
        emit(g, { t: "mode", team: p.team, mode: a.mode });
      }
      break;
    case "fire":
      if (p.mode === "combat") pullTrigger(g, p, a);
      break;
    case "build":
      if (p.mode === "build") tryBuild(g, p, a);
      break;
    case "edit":
      if (p.mode === "edit") tryEdit(g, p, a);
      break;
    case "reset":
      tryReset(g, p, a);
      break;
    case "slot":
      selectSlot(g, p, a.slot);
      break;
    case "swap":
      selectSlot(g, p, 1 - p.slot);
      break;
    case "reload":
      startReload(g, p);
      break;
  }
}

function selectSlot(g, p, slot) {
  if (slot === p.slot || !p.guns[slot]) return;
  p.slot = slot;
  p.swapT = 0.28;
  p.burst = null;
  p.reloadT = 0;
  if (p.mode !== "combat") p.mode = "combat";
  emit(g, { t: "swap", team: p.team });
  if (gunOf(p).ammo <= 0) startReload(g, p);
}

function startReload(g, p) {
  const gun = gunOf(p);
  if (p.reloadT > 0 || gun.ammo >= gun.def.mag) return;
  p.reloadT = gun.def.reload;
  p.burst = null;
  emit(g, { t: "reload", team: p.team });
}

// The angle a tap fires at: straight at the enemy if they are in range and
// visible, otherwise wherever the player is facing.
export function autoAim(g, p) {
  const e = enemyOf(g, p);
  const def = gunOf(p).def;
  const d = Math.hypot(e.x - p.x, e.y - p.y);
  const visible = def.type === "lob" || def.type === "rail" || lineClear(g.world, p.x, p.y, e.x, e.y);
  if (e.alive && d <= def.range + 0.5 && visible) {
    return { angle: Math.atan2(e.y - p.y, e.x - p.x), mag: Math.min(1, d / def.range) };
  }
  return { angle: p.facing, mag: 0.6 };
}

function pullTrigger(g, p, a) {
  const gun = gunOf(p);
  if (p.cd > 0 || p.swapT > 0 || p.burst || p.reloadT > 0) return;
  if (gun.ammo <= 0) {
    startReload(g, p);
    return;
  }
  let { angle, mag } = a;
  if (a.tap) ({ angle, mag } = autoAim(g, p));
  const def = gun.def;
  p.facing = angle;
  p.burst = { angle, mag, left: def.burst, t: 0 };
  p.cd = def.cd + (def.burst - 1) * def.gap;
}

function fireRound(g, p, angle, mag) {
  const gun = gunOf(p);
  const def = gun.def;
  gun.ammo--;
  p.stats.shots++;
  p.recoil = 1;
  const mx = p.x + Math.cos(angle) * (p.r + 0.12);
  const my = p.y + Math.sin(angle) * (p.r + 0.12);
  emit(g, { t: "shot", team: p.team, gun: def.id });

  if (def.type === "rail") {
    fireRail(g, p, def, angle);
    return;
  }
  if (def.type === "lob") {
    const dist = Math.max(2, Math.min(def.range, def.range * mag));
    const tx = p.x + Math.cos(angle) * dist;
    const ty = p.y + Math.sin(angle) * dist;
    g.bullets.push({
      kind: "lob", owner: p.team, def,
      sx: mx, sy: my, tx: clampX(tx), ty: clampY(ty),
      x: mx, y: my, t: 0, T: dist / def.speed, h: 0,
    });
    return;
  }
  for (let i = 0; i < def.pellets; i++) {
    let a = angle;
    if (def.pellets > 1) {
      a += (i / (def.pellets - 1) - 0.5) * def.spread + (g.rng() - 0.5) * def.spread * 0.18;
    } else {
      a += (g.rng() - 0.5) * def.spread;
    }
    g.bullets.push({
      kind: def.type, owner: p.team, def,
      x: mx, y: my, px: mx, py: my,
      dx: Math.cos(a), dy: Math.sin(a),
      speed: def.speed * (def.flame ? 0.85 + g.rng() * 0.3 : 1),
      left: def.range * (def.flame ? 0.8 + g.rng() * 0.25 : 1),
      dmg: def.dmg, age: 0,
    });
  }
}

const clampX = (x) => Math.max(0.3, Math.min(GW - 0.3, x));
const clampY = (y) => Math.max(0.3, Math.min(GH - 0.3, y));

// Builds don't stop a rail; rock and the arena edge do.
function fireRail(g, p, def, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const pierced = [];
  const stop = raycast(g.world, p.x, p.y, dx, dy, def.range, (w, cx, cy) => {
    if (!inBounds(cx, cy) || isRock(w, cx, cy)) return true;
    if (tileAt(w, cx, cy)) pierced.push([cx, cy]);
    return false;
  });
  const len = stop.hit ? stop.dist : def.range;
  for (const [cx, cy] of pierced) hitTile(g, cx, cy, def.dmg * def.tile, p.team);
  const e = enemyOf(g, p);
  if (e.alive && segCircle(p.x, p.y, dx, dy, len, e.x, e.y, e.r) >= 0) {
    damagePlayer(g, e, def.dmg, p);
  }
  g.beams.push({
    x0: p.x + dx * 0.4, y0: p.y + dy * 0.4,
    x1: p.x + dx * len, y1: p.y + dy * len,
    color: def.color, t: 0, life: 0.35,
  });
  g.shake = Math.max(g.shake, 0.25);
}

function updatePlayers(g, dt) {
  for (const p of g.players) {
    p.hitFlash = Math.max(0, p.hitFlash - dt * 4);
    p.recoil = Math.max(0, p.recoil - dt * 9);
    if (!p.alive) continue;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    collideCircle(g.world, p);

    p.mats = Math.min(MAX_MATS, p.mats + MATS_REGEN * dt);
    p.cd = Math.max(0, p.cd - dt);
    p.swapT = Math.max(0, p.swapT - dt);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        p.reloadT = 0;
        const gun = gunOf(p);
        gun.ammo = gun.def.mag;
        emit(g, { t: "reloaded", team: p.team });
      }
    }
    if (p.burst) {
      p.burst.t -= dt;
      while (p.burst && p.burst.t <= 0) {
        const gun = gunOf(p);
        if (gun.ammo <= 0) {
          p.burst = null;
          startReload(g, p);
          break;
        }
        fireRound(g, p, p.burst.angle, p.burst.mag);
        p.burst.left--;
        p.burst.t += gun.def.gap;
        if (p.burst.left <= 0) {
          p.burst = null;
          if (gun.ammo <= 0) startReload(g, p);
        }
      }
    }
  }
  // players shove each other apart
  const [a, b] = g.players;
  if (a.alive && b.alive) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d < min && d > 1e-6) {
      const push = (min - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
      collideCircle(g.world, a);
      collideCircle(g.world, b);
    }
  }
}

function updateMedkits(g, dt) {
  for (const m of g.medkits) {
    if (!m.up) {
      m.t -= dt;
      if (m.t <= 0) {
        m.up = true;
        emit(g, { t: "medkitUp" });
      }
      continue;
    }
    for (const p of g.players) {
      if (!p.alive || p.hp >= MAX_HP) continue;
      if (Math.hypot(p.x - m.x, p.y - m.y) < p.r + 0.4) {
        const heal = Math.min(MEDKIT_HEAL, MAX_HP - p.hp);
        p.hp += heal;
        m.up = false;
        m.t = MEDKIT_EVERY;
        addText(g, p.x, p.y - 0.6, `+${Math.round(heal)}`, "#6dff9a");
        emit(g, { t: "heal", team: p.team });
        break;
      }
    }
  }
}

// ---- projectiles ---------------------------------------------------------------

function updateBullets(g, dt) {
  const w = g.world;
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    if (b.kind === "lob") {
      b.t += dt;
      const k = Math.min(1, b.t / b.T);
      b.x = b.sx + (b.tx - b.sx) * k;
      b.y = b.sy + (b.ty - b.sy) * k;
      b.h = 4 * k * (1 - k) * Math.min(2.4, 0.6 + b.T * 1.6);
      if (k >= 1) {
        explode(g, b.x, b.y, b.def, b.owner);
        g.bullets.splice(i, 1);
      }
      continue;
    }
    b.age += dt;
    b.px = b.x;
    b.py = b.y;
    const len = Math.min(b.speed * dt, b.left);
    const ray = raycast(w, b.x, b.y, b.dx, b.dy, len);
    let hitDist = ray.hit ? ray.dist : len;
    let target = null;
    for (const p of g.players) {
      if (!p.alive || p.team === b.owner) continue;
      const t = segCircle(b.x, b.y, b.dx, b.dy, hitDist, p.x, p.y, p.r);
      if (t >= 0 && t <= hitDist) {
        hitDist = t;
        target = p;
      }
    }
    b.x += b.dx * hitDist;
    b.y += b.dy * hitDist;
    b.left -= hitDist;
    const owner = g.players[b.owner];
    if (target) {
      if (b.kind === "rocket") explode(g, b.x, b.y, b.def, b.owner);
      else damagePlayer(g, target, b.dmg, owner);
      spark(g, b.x, b.y, b.def.flame ? "#ff9a3c" : "#ff5a5a", 4);
      g.bullets.splice(i, 1);
    } else if (ray.hit && ray.dist <= len) {
      if (b.kind === "rocket") {
        explode(g, b.x - b.dx * 0.05, b.y - b.dy * 0.05, b.def, b.owner);
      } else {
        hitTile(g, ray.cx, ray.cy, b.dmg * b.def.tile, b.owner);
        spark(g, b.x, b.y, "#ffe9b0", 3);
      }
      g.bullets.splice(i, 1);
    } else if (b.left <= 0.001) {
      if (b.kind === "rocket") explode(g, b.x, b.y, b.def, b.owner);
      g.bullets.splice(i, 1);
    }
  }
}

function hitTile(g, cx, cy, amount, byTeam) {
  const t = tileAt(g.world, cx, cy);
  if (!t) return;
  const color = t.wall.owner === 0 ? "#7cc4ff" : "#ff8a94";
  if (damageTile(g.world, cx, cy, amount)) {
    for (let k = 0; k < 10; k++) {
      g.particles.push({
        x: cx + 0.5, y: cy + 0.5,
        vx: (g.rng() - 0.5) * 7, vy: (g.rng() - 0.5) * 7,
        life: 0.5 + g.rng() * 0.4, t: 0, size: 0.12 + g.rng() * 0.12, color,
      });
    }
    emit(g, { t: "tileBreak", team: byTeam });
  } else {
    emit(g, { t: "tileHit" });
  }
}

function explode(g, x, y, def, ownerTeam) {
  const R = def.radius;
  const owner = g.players[ownerTeam];
  for (const p of g.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > R + p.r) continue;
    let dmg = def.dmg * (1 - 0.5 * Math.min(1, d / R));
    if (!lineClear(g.world, x, y, p.x, p.y)) dmg *= 0.35;
    if (p.team === ownerTeam) dmg *= 0.4; // self-damage hurts, but less
    damagePlayer(g, p, dmg, owner);
  }
  const r = Math.ceil(R);
  for (let cy = Math.floor(y) - r; cy <= Math.floor(y) + r; cy++) {
    for (let cx = Math.floor(x) - r; cx <= Math.floor(x) + r; cx++) {
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
      if (d <= R) hitTile(g, cx, cy, def.dmg * def.tile * (1 - 0.4 * (d / R)), ownerTeam);
    }
  }
  g.booms.push({ x, y, R, t: 0, life: 0.45, color: def.color });
  for (let k = 0; k < 18; k++) {
    const a = g.rng() * Math.PI * 2;
    const s = 2 + g.rng() * 6;
    g.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.4 + g.rng() * 0.4, t: 0, size: 0.1 + g.rng() * 0.15,
      color: g.rng() < 0.5 ? "#ffd27a" : "#ff6b4a",
    });
  }
  g.shake = Math.max(g.shake, 0.6);
  emit(g, { t: "boom" });
}

function damagePlayer(g, p, amount, by) {
  if (!p.alive || g.state !== "fight") return;
  amount = Math.max(1, Math.round(amount));
  p.hp -= amount;
  p.hitFlash = 1;
  if (by && by !== p) {
    by.stats.dmg += amount;
    by.stats.hits++;
    by.roundDmg += amount;
  }
  addText(g, p.x + (g.rng() - 0.5) * 0.5, p.y - 0.7, String(amount), amount >= 50 ? "#ffd23f" : "#ffffff");
  emit(g, { t: "hurt", team: p.team, amount });
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.burst = null;
    if (by && by !== p) by.stats.kills++;
    for (let k = 0; k < 26; k++) {
      const a = g.rng() * Math.PI * 2;
      const s = 1 + g.rng() * 6;
      g.particles.push({
        x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6 + g.rng() * 0.6, t: 0, size: 0.12 + g.rng() * 0.16,
        color: p.team === 0 ? "#3fa7ff" : "#ff4d5e",
      });
    }
    g.shake = Math.max(g.shake, 0.8);
    emit(g, { t: "death", team: p.team });
    endRound(g, 1 - p.team);
  }
}

function spark(g, x, y, color, n) {
  for (let k = 0; k < n; k++) {
    g.particles.push({
      x, y, vx: (g.rng() - 0.5) * 6, vy: (g.rng() - 0.5) * 6,
      life: 0.18 + g.rng() * 0.15, t: 0, size: 0.07, color,
    });
  }
}

function addText(g, x, y, text, color) {
  g.texts.push({ x, y, text, color, t: 0, life: 0.9 });
}

function updateFx(g, dt) {
  for (const list of [g.particles, g.texts, g.booms, g.beams]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.t += dt;
      if (f.vx !== undefined) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= 1 - dt * 3;
        f.vy *= 1 - dt * 3;
      }
      if (f.t >= f.life) list.splice(i, 1);
    }
  }
}

// ---- building & editing ------------------------------------------------------

export function buildPreview(g, p, angle, mag) {
  return wallPlacement(g.world, g.players, p.x, p.y, angle, mag);
}

function tryBuild(g, p, a) {
  const angle = a.tap ? p.facing : a.angle;
  const mag = a.tap ? 0 : a.mag;
  const place = buildPreview(g, p, angle, mag);
  if (!place.valid || p.mats < WALL_COST) {
    emit(g, { t: "deny", team: p.team });
    return false;
  }
  placeWall(g.world, p.team, place, g.time);
  p.mats -= WALL_COST;
  p.stats.walls++;
  emit(g, { t: "build", team: p.team });
  return true;
}

export function editPreview(g, p, angle) {
  return editTarget(g.world, p.team, p.x, p.y, angle);
}

const cellOccupied = (g, cx, cy) =>
  g.players.some((q) => q.alive && circleOverlapsCell(q.x, q.y, q.r, cx, cy));

// One tile per wall can be open at a time. Editing the open tile closes it
// again; editing a different tile moves the opening there.
function tryEdit(g, p, a) {
  const angle = a.tap ? p.facing : a.angle;
  const target = editPreview(g, p, angle);
  if (!target) {
    emit(g, { t: "deny", team: p.team });
    return false;
  }
  const { wall, i } = target;
  if (wall.edit === i) return restoreWall(g, p, wall);
  if (wall.edit >= 0) {
    const open = wall.cells[wall.edit];
    if (cellOccupied(g, open.x, open.y)) {
      emit(g, { t: "deny", team: p.team });
      return false;
    }
  }
  wall.edit = i;
  p.stats.edits++;
  emit(g, { t: "edit", team: p.team });
  return true;
}

function restoreWall(g, p, wall) {
  if (wall.edit < 0) return false;
  const open = wall.cells[wall.edit];
  if (cellOccupied(g, open.x, open.y)) {
    emit(g, { t: "deny", team: p.team });
    return false;
  }
  wall.edit = -1;
  emit(g, { t: "restore", team: p.team });
  return true;
}

// Restore the aimed-at wall, or failing that the nearest of your edited walls.
function tryReset(g, p, a) {
  if (a.angle !== undefined) {
    const t = editPreview(g, p, a.angle);
    if (t && t.wall.edit >= 0) return restoreWall(g, p, t.wall);
  }
  const target = nearestEditedWall(g, p);
  if (target) return restoreWall(g, p, target);
  emit(g, { t: "deny", team: p.team });
  return false;
}

export function nearestEditedWall(g, p, reach = 6) {
  let best = null;
  let bestD = reach;
  for (const wall of g.world.walls) {
    if (wall.owner !== p.team || wall.edit < 0) continue;
    const c = wall.cells[wall.edit];
    const d = Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y);
    if (d < bestD) {
      bestD = d;
      best = wall;
    }
  }
  return best;
}

// Where a straight shot would stop, for the aim line.
export function traceShot(g, p, angle, def) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  if (def.type === "rail") {
    const stop = raycast(g.world, p.x, p.y, dx, dy, def.range, (w, cx, cy) => !inBounds(cx, cy) || isRock(w, cx, cy));
    const len = stop.hit ? stop.dist : def.range;
    const e = enemyOf(g, p);
    const onTarget = e.alive && segCircle(p.x, p.y, dx, dy, len, e.x, e.y, e.r) >= 0;
    return { len, onTarget };
  }
  const ray = raycast(g.world, p.x, p.y, dx, dy, def.range, isSolid);
  let len = ray.hit ? ray.dist : def.range;
  const e = enemyOf(g, p);
  let onTarget = false;
  if (e.alive) {
    const t = segCircle(p.x, p.y, dx, dy, len, e.x, e.y, e.r);
    if (t >= 0) {
      len = t;
      onTarget = true;
    }
  }
  return { len, onTarget, blocked: ray.hit && !onTarget };
}
