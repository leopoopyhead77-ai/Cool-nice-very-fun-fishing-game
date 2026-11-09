// Map gimmicks: teleporters (all maps), Pac-Men (Pac-Maze) and trains (Desert
// Rail). Pure simulation; game.js passes in `api` = { damage, hitTile, emit }.

import { GW, GH, isRock, inBounds, tileAt, segCircle } from "./world.js";

export const PAC_R = 0.42;
const PAC_SPEED = 3.1;
const PAC_HP = 80;
const PAC_DMG = 18;
const PAC_RESPAWN = 9;
export const TRAIN_LEN = 9;
const TRAIN_SPEED = 14;
const TRAIN_DMG = 55;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// teleporter balance: stand on a pad to charge it; then you (and that pair)
// need a while before it works again
export const TP_CHARGE = 0.6;   // seconds standing on the pad
export const TP_COOLDOWN = 10;  // per player
export const TP_PAIR_COOLDOWN = 3; // a pair rests after anyone uses it

function newPac(g, k) {
  const h = g.map.pacHome;
  const cx = Math.floor(h.x) - 1 + k;
  const cy = Math.floor(h.y);
  return {
    x: cx + 0.5, y: cy + 0.5, cx, cy, dx: 0, dy: -1,
    hp: PAC_HP, alive: true, respawnT: 0, release: 1.5 + k * 2.5, chomp: 0,
  };
}

export function initHazards(g) {
  g.pacs = [];
  g.train = null;
  if (g.map.gimmick === "pacmen") for (let k = 0; k < 3; k++) g.pacs.push(newPac(g, k));
  if (g.map.gimmick === "train") g.train = { phase: "idle", t: 7 + g.rng() * 5, dir: 1, y: -20, pass: 0 };
  g.tpCd = (g.map.teleporters || []).map(() => 0);
  for (const p of g.players) {
    p.tpLock = -1;
    p.tpCd = 0;
    p.tpCharge = 0;
    p.pacCd = 0;
    p.kx = 0;
    p.ky = 0;
  }
}

// ---- teleporters ------------------------------------------------------------------

// Stand on a pad for a moment and you come out of its partner. After that you
// have a personal cooldown, the pair rests briefly, and you have to step off
// the pad you arrived on before it will send you anywhere again.
export function checkTeleport(g, p, api, dt = 1 / 60) {
  const tps = g.map.teleporters || [];
  if (p.tpLock >= 0) {
    const pad = tps[p.tpLock >> 1][p.tpLock & 1];
    if (Math.hypot(p.x - pad.x, p.y - pad.y) > 0.7) p.tpLock = -1;
    else return;
  }
  let onPad = false;
  for (let i = 0; i < tps.length; i++) {
    for (let k = 0; k < 2; k++) {
      const pad = tps[i][k];
      if (Math.hypot(p.x - pad.x, p.y - pad.y) < 0.42) {
        onPad = true;
        if (p.tpCd > 0 || (g.tpCd && g.tpCd[i] > 0)) continue;
        p.tpCharge = (p.tpCharge || 0) + dt;
        p.tpPad = i * 2 + k;
        if (p.tpCharge < TP_CHARGE) continue;
        p.tpCharge = 0;
        p.tpCd = TP_COOLDOWN;
        if (g.tpCd) g.tpCd[i] = TP_PAIR_COOLDOWN;
        const dest = tps[i][1 - k];
        const from = { x: p.x, y: p.y };
        p.x = dest.x;
        p.y = dest.y;
        p.tpLock = i * 2 + (1 - k);
        api.emit(g, { t: "teleport", pid: p.id, team: p.team, x0: from.x, y0: from.y, x1: dest.x, y1: dest.y });
        for (const at of [from, dest]) {
          for (let n = 0; n < 12; n++) {
            const a = g.rng() * Math.PI * 2;
            g.particles.push({
              x: at.x, y: at.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
              life: 0.4 + g.rng() * 0.3, t: 0, size: 0.1, color: i % 2 ? "#ff7ae0" : "#5cf6ff",
            });
          }
        }
        return;
      }
    }
  }
  if (!onPad) p.tpCharge = 0;
}

// ---- Pac-Men ------------------------------------------------------------------------

const passable = (g, cx, cy) => inBounds(cx, cy) && !isRock(g.world, cx, cy);

function nextPacCell(g, pc) {
  let options = DIRS.filter(([dx, dy]) => passable(g, pc.cx + dx, pc.cy + dy));
  if (options.length > 1) options = options.filter(([dx, dy]) => !(dx === -pc.dx && dy === -pc.dy));
  if (!options.length) return;
  let pick = options[Math.floor(g.rng() * options.length)];
  // often chase the nearest player
  if (g.rng() < 0.45) {
    let best = Infinity;
    for (const o of options) {
      const nx = pc.cx + o[0] + 0.5;
      const ny = pc.cy + o[1] + 0.5;
      for (const p of g.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - nx, p.y - ny);
        if (d < best) {
          best = d;
          pick = o;
        }
      }
    }
  }
  pc.dx = pick[0];
  pc.dy = pick[1];
  pc.cx += pick[0];
  pc.cy += pick[1];
}

function updatePac(g, pc, dt, api) {
  if (!pc.alive) {
    pc.respawnT -= dt;
    if (pc.respawnT <= 0) Object.assign(pc, newPac(g, g.pacs.indexOf(pc)), { release: 0.5 });
    return;
  }
  if (pc.release > 0) {
    pc.release -= dt;
    return;
  }
  pc.chomp = Math.max(0, pc.chomp - dt);
  const tx = pc.cx + 0.5;
  const ty = pc.cy + 0.5;
  const d = Math.hypot(tx - pc.x, ty - pc.y);
  if (d < 0.03) {
    pc.x = tx;
    pc.y = ty;
    nextPacCell(g, pc);
  } else {
    // a player's wall in the way: chomp through it
    const t = tileAt(g.world, pc.cx, pc.cy);
    if (t && t.wall.edit !== t.i && d < 1.05) {
      api.hitTile(g, pc.cx, pc.cy, 170 * dt, -1);
      pc.chomp = 0.3;
    } else {
      const s = Math.min(d, PAC_SPEED * dt);
      pc.x += ((tx - pc.x) / d) * s;
      pc.y += ((ty - pc.y) / d) * s;
    }
  }
  // bite anyone it touches
  for (const p of g.players) {
    if (!p.alive || p.pacCd > 0) continue;
    const dd = Math.hypot(p.x - pc.x, p.y - pc.y);
    if (dd < p.r + PAC_R) {
      api.damage(g, p, PAC_DMG, null);
      const nx = dd > 1e-3 ? (p.x - pc.x) / dd : 1;
      const ny = dd > 1e-3 ? (p.y - pc.y) / dd : 0;
      p.kx = nx * 9;
      p.ky = ny * 9;
      p.pacCd = 0.9;
      pc.chomp = 0.4;
      api.emit(g, { t: "chomp", pid: p.id, team: p.team });
    }
  }
}

export function hurtPac(g, pc, dmg, api) {
  if (!pc.alive) return;
  pc.hp -= dmg;
  if (pc.hp <= 0) {
    pc.alive = false;
    pc.respawnT = PAC_RESPAWN;
    for (let n = 0; n < 20; n++) {
      const a = g.rng() * Math.PI * 2;
      g.particles.push({
        x: pc.x, y: pc.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
        life: 0.6, t: 0, size: 0.14, color: "#ffe14d",
      });
    }
    api.emit(g, { t: "pacDown", x: pc.x, y: pc.y });
  }
}

// Earliest Pac-Man a bullet segment touches: { t, pc } or null.
export function bulletHitsHazard(g, x, y, dx, dy, len) {
  let best = null;
  for (const pc of g.pacs || []) {
    if (!pc.alive || pc.release > 0) continue;
    const t = segCircle(x, y, dx, dy, len, pc.x, pc.y, PAC_R);
    if (t >= 0 && t <= len && (!best || t < best.t)) best = { t, pc };
  }
  return best;
}

export function explodeHazards(g, x, y, R, dmg, api) {
  for (const pc of g.pacs || []) {
    if (!pc.alive) continue;
    const d = Math.hypot(pc.x - x, pc.y - y);
    if (d < R + PAC_R) hurtPac(g, pc, dmg * (1 - 0.5 * Math.min(1, d / R)), api);
  }
}

// ---- trains ------------------------------------------------------------------------------

function updateTrain(g, tr, dt, api) {
  const track = g.map.track;
  if (tr.phase === "idle") {
    tr.t -= dt;
    if (tr.t <= 0) {
      tr.phase = "warn";
      tr.t = 2.6;
      tr.dir = g.rng() < 0.5 ? 1 : -1;
      api.emit(g, { t: "trainWarn" });
    }
    return;
  }
  if (tr.phase === "warn") {
    tr.t -= dt;
    if (tr.t <= 0) {
      tr.phase = "run";
      tr.y = tr.dir > 0 ? -1 : GH + 1; // head position
      tr.pass++;
      api.emit(g, { t: "trainGo" });
    }
    return;
  }
  // running
  tr.y += tr.dir * TRAIN_SPEED * dt;
  const y0 = Math.min(tr.y, tr.y - tr.dir * TRAIN_LEN);
  const y1 = Math.max(tr.y, tr.y - tr.dir * TRAIN_LEN);
  for (const p of g.players) {
    if (!p.alive || p.trainPass === tr.pass) continue;
    if (Math.abs(p.x - track.x) < track.half + p.r * 0.6 && p.y > y0 - p.r && p.y < y1 + p.r) {
      p.trainPass = tr.pass;
      api.damage(g, p, TRAIN_DMG, null);
      const side = p.x >= track.x ? 1 : -1;
      p.kx = side * 14;
      p.ky = tr.dir * 4;
      g.shake = Math.max(g.shake, 0.7);
      api.emit(g, { t: "trainHit", pid: p.id, team: p.team });
    }
  }
  // walls on the rails get smashed
  for (let cy = Math.max(0, Math.floor(y0)); cy <= Math.min(GH - 1, Math.floor(y1)); cy++) {
    for (const cx of [Math.floor(track.x) - 1, Math.floor(track.x)]) {
      if (tileAt(g.world, cx, cy)) api.hitTile(g, cx, cy, 1e6, -1);
    }
  }
  if ((tr.dir > 0 && y0 > GH + 1) || (tr.dir < 0 && y1 < -1)) {
    tr.phase = "idle";
    tr.t = 12 + g.rng() * 8;
  }
}

export function updateHazards(g, dt, api) {
  for (const p of g.players) {
    p.pacCd = Math.max(0, (p.pacCd || 0) - dt);
    p.tpCd = Math.max(0, (p.tpCd || 0) - dt);
  }
  if (g.tpCd) for (let i = 0; i < g.tpCd.length; i++) g.tpCd[i] = Math.max(0, g.tpCd[i] - dt);
  for (const pc of g.pacs || []) updatePac(g, pc, dt, api);
  if (g.train) updateTrain(g, g.train, dt, api);
}

// Danger zones for bots to steer away from: [{ x, y, r }] plus a track flag.
export function dangerFor(g) {
  const out = [];
  for (const pc of g.pacs || []) if (pc.alive && pc.release <= 0) out.push({ x: pc.x, y: pc.y, r: 2.4 });
  const trackHot = !!(g.train && g.train.phase !== "idle");
  return { spots: out, trackX: trackHot ? g.map.track.x : null };
}
