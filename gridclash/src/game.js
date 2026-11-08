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
import { baseBuffs, buffsFrom, dealHand, CARD_BY_ID, rarityRank } from "./cards.js";
import { mapOf } from "./maps.js";
import { initHazards, updateHazards, bulletHitsHazard, explodeHazards, checkTeleport, hurtPac } from "./hazards.js";
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
// blue, red, green, yellow — free-for-all modes give every player a team
export const TEAM_HEX = ["#3fa7ff", "#ff4d5e", "#43d97b", "#ffc93c"];
const TEAM_LIGHT = ["#7cc4ff", "#ff8a94", "#8be8ad", "#ffdf85"];
// free-for-all spawns, as far apart as the map allows
const FFA_SPAWNS = {
  3: [{ x: 15, y: 2.5 }, { x: 2.5, y: 17 }, { x: 27.5, y: 17 }],
  4: [{ x: 2.5, y: 3.5 }, { x: 27.5, y: 16.5 }, { x: 27.5, y: 3.5 }, { x: 2.5, y: 16.5 }],
};
export const MAX_ROUNDS = 9;
const MOVE_SPEED = 4.3;
const MEDKIT_HEAL = 35;
const MEDKIT_EVERY = 16;

function makeStats() {
  return { dmg: 0, shots: 0, hits: 0, walls: 0, edits: 0, kills: 0 };
}

function makePlayer(id, team, loadout, name) {
  return {
    id, team, name,
    x: 0, y: 0, vx: 0, vy: 0, r: 0.38,
    hp: MAX_HP, maxHp: MAX_HP, shield: 0, maxShield: 0, alive: true,
    cards: [], buffs: baseBuffs(), calmT: 0,
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

// loadouts / names / controllers: one entry per player. teams: team (0 blue,
// 1 red) per player; defaults to alternating, so 2 players = 1v1 and
// 4 players = 2v2 with ids 0,2 on blue and 1,3 on red.
// cards: deal buff cards before every round (local app)
// map: a map id from maps.js (default "arena")
export function createGame({ loadouts, names, controllers, seed, teams, cards, map }) {
  const mapDef = mapOf(map);
  const tm = teams || loadouts.map((_, i) => i % 2);
  const g = {
    world: createWorld(mapDef),
    map: mapDef,
    players: loadouts.map((l, i) => makePlayer(i, tm[i], l, names[i])),
    controllers,
    useCards: !!cards,
    offers: [],   // per player: card ids on offer this round
    picks: [],    // per player: chosen index, or -1
    bullets: [],
    beams: [],
    booms: [],
    particles: [],
    texts: [],
    medkits: (mapDef.medkits || MEDKIT_SPOTS).map((s) => ({ ...s, up: false, t: MEDKIT_EVERY * 0.5 })),
    events: [],
    state: "countdown",
    stateT: 3,
    round: 1,
    numTeams: Math.max(2, Math.max(...tm) + 1),
    score: [],
    roundWinner: -1,
    matchWinner: -1,
    timeLeft: ROUND_TIME,
    time: 0,
    shake: 0,
    rng: mulberry(seed ?? (Date.now() & 0xffffffff)),
  };
  g.score = Array.from({ length: g.numTeams }, () => 0);
  resetRound(g);
  if (g.useCards) startCards(g);
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
  initHazards(g);
  g.bullets.length = 0;
  g.beams.length = 0;
  g.booms.length = 0;
  g.timeLeft = ROUND_TIME;
  g.roundWinner = -1;
  for (const m of g.medkits) {
    m.up = false;
    m.t = MEDKIT_EVERY * 0.5;
  }
  g.players.forEach((p) => {
    if (g.numTeams > 2) {
      const sp = ((g.map.ffa && g.map.ffa[g.numTeams]) || FFA_SPAWNS[g.numTeams])[p.team];
      p.x = sp.x;
      p.y = sp.y;
    } else {
      const mates = g.players.filter((q) => q.team === p.team);
      const k = mates.indexOf(p);
      p.x = SPAWNS[p.team].x;
      p.y = mates.length === 1 ? SPAWNS[p.team].y : 6.5 + (7 * k) / (mates.length - 1);
    }
    p.vx = p.vy = 0;
    p.buffs = buffsFrom(p.cards);
    p.maxHp = MAX_HP + p.buffs.maxHp;
    p.hp = p.maxHp;
    p.maxShield = p.buffs.shield;
    p.shield = p.maxShield;
    p.calmT = 0;
    p.slowT = 0;
    p.burnT = 0;
    p.burnAcc = 0;
    p.alive = true;
    p.guns.forEach((gun) => {
      gun.ammo = magOf(p, gun);
      // limited-supply guns: what's left beyond the loaded magazine this round
      gun.reserve = gun.def.supply ? Math.max(0, gun.def.supply - gun.ammo) : null;
    });
    p.cd = p.reloadT = p.swapT = 0;
    p.burst = null;
    p.mats = Math.min(MAX_MATS, START_MATS + p.buffs.mats);
    p.mode = "combat";
    p.facing = g.numTeams > 2 ? Math.atan2(10 - p.y, 15 - p.x) : p.team === 0 ? 0 : Math.PI;
    p.aiming = false;
    p.roundDmg = 0;
  });
}

// magazine size after buffs
export const magOf = (p, gun) => Math.max(1, Math.round(gun.def.mag * (p.buffs ? p.buffs.mag : 1)));

// ---- buff cards ----------------------------------------------------------------

const CARD_TIME = 25;

function startCards(g) {
  g.state = "cards";
  g.stateT = CARD_TIME;
  g.offers = g.players.map(() => dealHand(g.rng, 3));
  g.picks = g.players.map(() => -1);
  emit(g, { t: "cards" });
}

function pickCard(g, p, i) {
  if (g.state !== "cards" || g.picks[p.id] >= 0) return;
  const hand = g.offers[p.id];
  if (!hand || i < 0 || i >= hand.length) return;
  g.picks[p.id] = i;
  emit(g, { t: "card", pid: p.id, team: p.team, card: hand[i] });
}

function finishCards(g) {
  g.players.forEach((p) => {
    // out of time: keep the rarest card on offer
    if (g.picks[p.id] < 0) {
      const hand = g.offers[p.id];
      let best = 0;
      hand.forEach((id, k) => {
        if (rarityRank(CARD_BY_ID[id].rarity) > rarityRank(CARD_BY_ID[hand[best]].rarity)) best = k;
      });
      g.picks[p.id] = best;
    }
    p.cards.push(g.offers[p.id][g.picks[p.id]]);
  });
  resetRound(g); // re-applies buffs: new max hp, shield, mags, mats
  g.state = "countdown";
  g.stateT = 3;
}

export const enemiesOf = (g, p) => g.players.filter((q) => q.team !== p.team);

// The nearest living enemy (or any enemy, if all are down).
export function enemyOf(g, p) {
  let best = null;
  let bestD = Infinity;
  for (const q of g.players) {
    if (q.team === p.team) continue;
    const d = (q.alive ? 0 : 1e6) + Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}
export const gunOf = (p) => p.guns[p.slot];

const emit = (g, e) => g.events.push(e);

// ---- step ------------------------------------------------------------------

export function step(g, dt) {
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt * 3);

  if (g.state === "cards") {
    g.stateT -= dt;
    g.players.forEach((p, i) => {
      const cmd = g.controllers[i].poll(g, p, dt);
      for (const a of cmd.actions || []) if (a.t === "card") pickCard(g, p, a.i);
    });
    if (g.picks.every((k) => k >= 0) || g.stateT <= 0) finishCards(g);
  } else if (g.state === "countdown") {
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
    updateHazards(g, dt, HAZARD_API);
    updateMedkits(g, dt);
    g.timeLeft -= dt;
    if (g.timeLeft <= 0 && g.state === "fight") {
      // time out: more health wins; equal health goes to whoever dealt more
      // damage this round; only a true tie is a draw
      const key = (t) => g.players.reduce((n, p) => n + (p.team === t ? p.hp * 1000 + p.roundDmg : 0), 0);
      endRound(g, uniqueBest(g.score.map((_, t) => key(t))));
    }
  } else if (g.state === "roundEnd") {
    g.stateT -= dt;
    if (g.stateT <= 0) {
      if (g.score.some((s) => s >= WINS_NEEDED) || g.round >= MAX_ROUNDS) {
        g.state = "matchEnd";
        g.matchWinner = uniqueBest(g.score);
        emit(g, { t: "matchEnd", winner: g.matchWinner });
      } else {
        g.round++;
        resetRound(g);
        g.state = "countdown";
        g.stateT = 3;
        emit(g, { t: "round" });
        if (g.useCards) startCards(g);
      }
    }
  }

  updateBullets(g, dt);
  updateFx(g, dt);
}

// index of the single highest value, or -1 if it's shared
function uniqueBest(vals) {
  const max = Math.max(...vals);
  const at = vals.reduce((a, v, i) => (v === max ? [...a, i] : a), []);
  return at.length === 1 ? at[0] : -1;
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
  const speed = MOVE_SPEED * p.buffs.speed * (cmd.aiming ? 0.82 : 1) * (p.slowT > 0 ? 0.6 : 1);
  const k = Math.min(1, dt * 14);
  p.vx += (mx * speed - p.vx) * k;
  p.vy += (my * speed - p.vy) * k;

  // live BUILD / EDIT drags (for the placement preview)
  p.buildAim = cmd.buildAim || null;
  p.editAim = cmd.editAim || null;
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
        emit(g, { t: "mode", pid: p.id, team: p.team, mode: a.mode });
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
    // one-touch building: no mode switch needed
    case "qbuild":
      tryBuild(g, p, a);
      break;
    case "qedit":
      tryEdit(g, p, a, true);
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
  emit(g, { t: "swap", pid: p.id, team: p.team });
  if (gunOf(p).ammo <= 0) startReload(g, p);
}

// a limited-supply gun with nothing loaded and nothing spare
export const isOut = (gun) => gun.ammo <= 0 && gun.reserve !== null && gun.reserve !== undefined && gun.reserve <= 0;

function startReload(g, p) {
  const gun = gunOf(p);
  if (p.reloadT > 0 || gun.ammo >= magOf(p, gun)) return;
  if (gun.reserve !== null && gun.reserve !== undefined && gun.reserve <= 0) {
    // out of supply for this round: switch to the other gun if it can shoot
    const other = p.guns[1 - p.slot];
    if (gun.ammo <= 0 && other && !isOut(other)) selectSlot(g, p, 1 - p.slot);
    else emit(g, { t: "deny", pid: p.id, team: p.team });
    return;
  }
  p.reloadT = gun.def.reload * p.buffs.reload;
  p.burst = null;
  emit(g, { t: "reload", pid: p.id, team: p.team });
}

// The angle a tap fires at: straight at the enemy if they are in range and
// visible, otherwise wherever the player is facing.
export function autoAim(g, p) {
  const def = gunOf(p).def;
  let best = null;
  let bestD = Infinity;
  for (const e of enemiesOf(g, p)) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const visible = def.type === "lob" || def.type === "rail" || lineClear(g.world, p.x, p.y, e.x, e.y);
    if (d <= def.range + 0.5 && visible && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) return { angle: Math.atan2(best.y - p.y, best.x - p.x), mag: Math.min(1, bestD / def.range) };
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
  p.cd = (def.cd + (def.burst - 1) * def.gap) * p.buffs.rate;
}

function fireRound(g, p, angle, mag) {
  const gun = gunOf(p);
  const def = gun.def;
  gun.ammo--;
  p.stats.shots++;
  p.recoil = 1;
  const mx = p.x + Math.cos(angle) * (p.r + 0.12);
  const my = p.y + Math.sin(angle) * (p.r + 0.12);
  emit(g, { t: "shot", pid: p.id, team: p.team, gun: def.id });

  if (def.type === "rail") {
    fireRail(g, p, def, angle);
    return;
  }
  if (def.type === "lob") {
    const dist = Math.max(2, Math.min(def.range, def.range * mag));
    const tx = p.x + Math.cos(angle) * dist;
    const ty = p.y + Math.sin(angle) * dist;
    g.bullets.push({
      kind: "lob", owner: p.id, def,
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
      kind: def.type, owner: p.id, def,
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
  // The beam punches through ONE wall (destroying the tiles it passes
  // through) and is stopped by the next wall it meets, or by rock.
  const pierced = [];
  let firstWall = null;
  const stop = raycast(g.world, p.x, p.y, dx, dy, def.range, (w, cx, cy) => {
    if (!inBounds(cx, cy) || isRock(w, cx, cy)) return true;
    const t = tileAt(w, cx, cy);
    if (!t || t.wall.edit === t.i) return false; // open floor / an edited gap
    if (!firstWall) firstWall = t.wall;
    if (t.wall !== firstWall) return true;       // a second wall: stop here
    pierced.push([cx, cy]);
    return false;
  });
  const len = stop.hit ? stop.dist : def.range;
  for (const [cx, cy] of pierced) hitTile(g, cx, cy, 1e6, p.id); // blown through
  if (stop.hit && tileAt(g.world, stop.cx, stop.cy)) hitTile(g, stop.cx, stop.cy, def.dmg * def.tile, p.id);
  for (const e of enemiesOf(g, p)) {
    const t = e.alive ? segCircle(p.x, p.y, dx, dy, len, e.x, e.y, e.r) : -1;
    if (t < 0) continue;
    // weaker after punching through the wall
    const through = pierced.some(([cx, cy]) => Math.hypot(cx + 0.5 - p.x, cy + 0.5 - p.y) < t);
    damagePlayer(g, e, def.dmg * (through ? 1 - (def.pierceLoss || 0) : 1), p);
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
    // knockback (Pac-Men, trains)
    if (p.kx || p.ky) {
      p.x += p.kx * dt;
      p.y += p.ky * dt;
      const f = Math.max(0, 1 - 7 * dt);
      p.kx *= f;
      p.ky *= f;
      if (Math.abs(p.kx) + Math.abs(p.ky) < 0.1) p.kx = p.ky = 0;
    }
    collideCircle(g.world, p);
    checkTeleport(g, p, HAZARD_API);

    p.mats = Math.min(MAX_MATS, p.mats + MATS_REGEN * p.buffs.matsRegen * dt);
    if (p.slowT > 0) p.slowT = Math.max(0, p.slowT - dt);
    if (p.burnT > 0) {
      p.burnT -= dt;
      p.burnAcc = (p.burnAcc || 0) + dt;
      if (p.burnAcc >= 0.5) {
        p.burnAcc -= 0.5;
        damagePlayer(g, p, p.burnDps * 0.5, g.players[p.burnBy]);
      }
      if (p.burnT <= 0) p.burnAcc = 0;
    }
    // regen card: heals after 3 s without taking damage
    p.calmT += dt;
    if (p.buffs.regen > 0 && p.calmT > 3 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.buffs.regen * dt);
    p.cd = Math.max(0, p.cd - dt);
    p.swapT = Math.max(0, p.swapT - dt);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        p.reloadT = 0;
        const gun = gunOf(p);
        if (gun.reserve !== null && gun.reserve !== undefined) {
          const take = Math.min(magOf(p, gun) - gun.ammo, gun.reserve);
          gun.ammo += take;
          gun.reserve -= take;
        } else gun.ammo = magOf(p, gun);
        emit(g, { t: "reloaded", pid: p.id, team: p.team });
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
  for (let i = 0; i < g.players.length; i++) {
    for (let j = i + 1; j < g.players.length; j++) {
      const a = g.players[i];
      const b = g.players[j];
      if (!a.alive || !b.alive) continue;
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
      if (!p.alive || p.hp >= p.maxHp) continue;
      if (Math.hypot(p.x - m.x, p.y - m.y) < p.r + 0.4) {
        const heal = Math.min(MEDKIT_HEAL, p.maxHp - p.hp);
        p.hp += heal;
        m.up = false;
        m.t = MEDKIT_EVERY;
        addText(g, p.x, p.y - 0.6, `+${Math.round(heal)}`, "#6dff9a");
        emit(g, { t: "heal", pid: p.id, team: p.team });
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
      if (!p.alive || p.team === g.players[b.owner].team) continue;
      const t = segCircle(b.x, b.y, b.dx, b.dy, hitDist, p.x, p.y, p.r);
      if (t >= 0 && t <= hitDist) {
        hitDist = t;
        target = p;
      }
    }
    const hz = bulletHitsHazard(g, b.x, b.y, b.dx, b.dy, hitDist);
    if (hz && hz.t < hitDist) {
      b.x += b.dx * hz.t;
      b.y += b.dy * hz.t;
      if (b.kind === "rocket") explode(g, b.x, b.y, b.def, b.owner);
      else hurtPac(g, hz.pc, b.dmg, HAZARD_API);
      spark(g, b.x, b.y, "#ffe14d", 4);
      g.bullets.splice(i, 1);
      continue;
    }
    b.x += b.dx * hitDist;
    b.y += b.dy * hitDist;
    b.left -= hitDist;
    const owner = g.players[b.owner];
    if (target) {
      if (b.kind === "rocket") explode(g, b.x, b.y, b.def, b.owner);
      else {
        damagePlayer(g, target, b.dmg, owner);
        // status effects
        if (b.def.slow) target.slowT = Math.max(target.slowT || 0, b.def.slow);
        if (b.def.burn) {
          target.burnT = 2;
          target.burnBy = b.owner;
          target.burnDps = b.def.burn;
        }
      }
      spark(g, b.x, b.y, b.def.flame ? "#ff9a3c" : b.def.slow ? "#bff4ff" : "#ff5a5a", 4);
      g.bullets.splice(i, 1);
    } else if (ray.hit && ray.dist <= len && b.def.bounce && (b.bounces || 0) < b.def.bounce) {
      // ricochet: chip the wall, then reflect off the face it hit
      hitTile(g, ray.cx, ray.cy, b.dmg * b.def.tile * 0.5, b.owner);
      spark(g, b.x, b.y, b.def.color, 3);
      const px = Math.floor(b.x - b.dx * 0.01);
      const py = Math.floor(b.y - b.dy * 0.01);
      if (px !== ray.cx) b.dx = -b.dx;
      if (py !== ray.cy) b.dy = -b.dy;
      if (px === ray.cx && py === ray.cy) {
        b.dx = -b.dx;
        b.dy = -b.dy;
      }
      b.x += b.dx * 0.02;
      b.y += b.dy * 0.02;
      b.bounces = (b.bounces || 0) + 1;
      emit(g, { t: "bounce" });
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

function hitTile(g, cx, cy, amount, byPid) {
  const t = tileAt(g.world, cx, cy);
  if (!t) return;
  const color = TEAM_LIGHT[t.wall.team] || "#ffffff";
  if (damageTile(g.world, cx, cy, amount)) {
    for (let k = 0; k < 10; k++) {
      g.particles.push({
        x: cx + 0.5, y: cy + 0.5,
        vx: (g.rng() - 0.5) * 7, vy: (g.rng() - 0.5) * 7,
        life: 0.5 + g.rng() * 0.4, t: 0, size: 0.12 + g.rng() * 0.12, color,
      });
    }
    emit(g, { t: "tileBreak", pid: byPid, x: cx + 0.5, y: cy + 0.5, color });
  } else {
    emit(g, { t: "tileHit" });
  }
}

function explode(g, x, y, def, ownerId, sub = false) {
  const R = def.radius;
  const owner = g.players[ownerId];
  for (const p of g.players) {
    if (!p.alive) continue;
    // no friendly fire, but your own blast still hurts you (a little)
    if (p.team === owner.team && p !== owner) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > R + p.r) continue;
    let dmg = def.dmg * (1 - 0.5 * Math.min(1, d / R));
    if (!lineClear(g.world, x, y, p.x, p.y)) dmg *= 0.35;
    if (p === owner) dmg *= 0.4;
    damagePlayer(g, p, dmg, owner);
  }
  const r = Math.ceil(R);
  for (let cy = Math.floor(y) - r; cy <= Math.floor(y) + r; cy++) {
    for (let cx = Math.floor(x) - r; cx <= Math.floor(x) + r; cx++) {
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
      if (d <= R) hitTile(g, cx, cy, def.dmg * def.tile * (1 - 0.4 * (d / R)), ownerId);
    }
  }
  g.booms.push({ x, y, R, t: 0, life: 0.45, color: def.color });
  explodeHazards(g, x, y, R, def.dmg, HAZARD_API);
  // cluster bombs burst into bomblets around the impact
  if (def.cluster && !sub) {
    for (let k = 0; k < def.cluster; k++) {
      const a = (k / def.cluster) * Math.PI * 2 + g.rng() * 0.6;
      const d = 1.1 + g.rng() * 0.5;
      const bx = Math.max(0.3, Math.min(GW - 0.3, x + Math.cos(a) * d));
      const by = Math.max(0.3, Math.min(GH - 0.3, y + Math.sin(a) * d));
      explode(g, bx, by, def, ownerId, true);
    }
  }
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
  emit(g, { t: "boom", x, y, R, color: def.color });
}

function damagePlayer(g, p, amount, by) {
  if (!p.alive || g.state !== "fight") return;
  // cards: attacker's damage boost, defender's armour
  if (by && by !== p && by.buffs) amount *= by.buffs.dmg;
  if (p.buffs) amount *= 1 - p.buffs.armor;
  amount = Math.max(1, Math.round(amount));
  p.calmT = 0;
  // the blue shield bar soaks damage first
  let shieldHit = 0;
  if (p.shield > 0) {
    shieldHit = Math.min(p.shield, amount);
    p.shield -= shieldHit;
  }
  p.hp -= amount - shieldHit;
  p.hitFlash = 1;
  if (by && by !== p) {
    by.stats.dmg += amount;
    by.stats.hits++;
    by.roundDmg += amount;
    if (by.buffs && by.buffs.lifesteal > 0 && by.alive) {
      by.hp = Math.min(by.maxHp, by.hp + amount * by.buffs.lifesteal);
    }
  }
  const allShield = shieldHit === amount;
  addText(g, p.x + (g.rng() - 0.5) * 0.5, p.y - 0.7, String(amount), allShield ? "#7cc4ff" : amount >= 50 ? "#ffd23f" : "#ffffff");
  emit(g, { t: "hurt", pid: p.id, team: p.team, amount });
  if (p.hp <= 0) {
    p.hp = 0;
    p.shield = 0;
    p.alive = false;
    p.burst = null;
    if (by && by !== p) by.stats.kills++;
    for (let k = 0; k < 26; k++) {
      const a = g.rng() * Math.PI * 2;
      const s = 1 + g.rng() * 6;
      g.particles.push({
        x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6 + g.rng() * 0.6, t: 0, size: 0.12 + g.rng() * 0.16,
        color: TEAM_HEX[p.team],
      });
    }
    g.shake = Math.max(g.shake, 0.8);
    emit(g, { t: "death", pid: p.id, team: p.team, x: p.x, y: p.y });
    // the round ends when only one team is left standing
    const standing = new Set(g.players.filter((q) => q.alive).map((q) => q.team));
    if (standing.size <= 1) endRound(g, standing.size ? [...standing][0] : -1);
  }
}

// what hazards.js may do to the match
const HAZARD_API = {
  damage: (g, p, amount, by) => damagePlayer(g, p, amount, by),
  hitTile: (g, cx, cy, amount, by) => hitTile(g, cx, cy, amount, by),
  emit: (g, e) => emit(g, e),
};

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

// Where a wall would land. If the exact spot is blocked (rock, another wall,
// someone standing there) it tries sliding the wall one tile along its length,
// then a little further out, so building near cover doesn't just fail.
export function buildPreview(g, p, angle, mag) {
  const base = wallPlacement(g.world, g.players, p.x, p.y, angle, mag);
  if (base.valid) return base;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // along the wall = perpendicular to the aim
  const ax = base.vertical ? 0 : 1;
  const ay = base.vertical ? 1 : 0;
  const tries = [];
  for (const out of [0, 0.35, 0.7]) {
    for (const side of [1, -1, 2, -2]) tries.push([side, out]);
  }
  for (const [side, out] of tries) {
    const m = Math.min(1, mag + out);
    const place = wallPlacement(g.world, g.players, p.x + ax * side, p.y + ay * side, angle, m);
    // must still be the same orientation and roughly in front of the player
    if (!place.valid || place.vertical !== base.vertical) continue;
    const [mx, my] = place.cells[1];
    const ahead = (mx + 0.5 - p.x) * dx + (my + 0.5 - p.y) * dy;
    if (ahead > 0.6) return place;
  }
  return base;
}

function tryBuild(g, p, a) {
  const angle = a.tap ? p.facing : a.angle;
  const mag = a.tap ? 0 : a.mag;
  const place = buildPreview(g, p, angle, mag);
  if (!place.valid || p.mats < WALL_COST) {
    emit(g, { t: "deny", pid: p.id, team: p.team });
    return false;
  }
  placeWall(g.world, p.id, place, g.time, p.team, p.buffs.wallHp);
  // dust as it lands
  for (const [cx, cy] of place.cells) {
    for (let k = 0; k < 5; k++) {
      const ang = g.rng() * Math.PI * 2;
      g.particles.push({
        x: cx + 0.5 + Math.cos(ang) * 0.4, y: cy + 0.5 + Math.sin(ang) * 0.4,
        vx: Math.cos(ang) * 2.5, vy: Math.sin(ang) * 2.5,
        life: 0.35 + g.rng() * 0.25, t: 0, size: 0.12 + g.rng() * 0.1, color: "rgba(210,200,180,0.8)",
      });
    }
  }
  p.mats -= WALL_COST;
  p.stats.walls++;
  emit(g, { t: "build", pid: p.id, team: p.team });
  return true;
}

export function editPreview(g, p, angle) {
  return editTarget(g.world, p.id, p.x, p.y, angle);
}

const cellOccupied = (g, cx, cy) =>
  g.players.some((q) => q.alive && circleOverlapsCell(q.x, q.y, q.r, cx, cy));

// One tile per wall can be open at a time. Editing the open tile closes it
// again; editing a different tile moves the opening there.
// nearest of your wall tiles within reach (for a quick EDIT tap)
function nearestOwnTile(g, p, reach = 3.4) {
  let best = null;
  let bestD = reach;
  for (const wall of g.world.walls) {
    if (wall.owner !== p.id) continue;
    wall.cells.forEach((c, i) => {
      if (!c.alive) return;
      const d = Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y);
      if (d < bestD) {
        bestD = d;
        best = { wall, i, cx: c.x, cy: c.y };
      }
    });
  }
  return best;
}

export function quickEditTarget(g, p, a) {
  if (a && !a.tap) return editPreview(g, p, a.angle);
  return editPreview(g, p, p.facing) || nearestOwnTile(g, p);
}

function tryEdit(g, p, a, quick = false) {
  const angle = a.tap ? p.facing : a.angle;
  const target = quick ? quickEditTarget(g, p, a) : editPreview(g, p, angle);
  if (!target) {
    emit(g, { t: "deny", pid: p.id, team: p.team });
    return false;
  }
  const { wall, i } = target;
  if (wall.edit === i) return restoreWall(g, p, wall);
  if (wall.edit >= 0) {
    const open = wall.cells[wall.edit];
    if (cellOccupied(g, open.x, open.y)) {
      emit(g, { t: "deny", pid: p.id, team: p.team });
      return false;
    }
  }
  wall.edit = i;
  p.stats.edits++;
  emit(g, { t: "edit", pid: p.id, team: p.team });
  return true;
}

function restoreWall(g, p, wall) {
  if (wall.edit < 0) return false;
  const open = wall.cells[wall.edit];
  if (cellOccupied(g, open.x, open.y)) {
    emit(g, { t: "deny", pid: p.id, team: p.team });
    return false;
  }
  wall.edit = -1;
  emit(g, { t: "restore", pid: p.id, team: p.team });
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
  emit(g, { t: "deny", pid: p.id, team: p.team });
  return false;
}

export function nearestEditedWall(g, p, reach = 6) {
  let best = null;
  let bestD = reach;
  for (const wall of g.world.walls) {
    if (wall.owner !== p.id || wall.edit < 0) continue;
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
  const enemies = enemiesOf(g, p).filter((e) => e.alive);
  if (def.type === "rail") {
    const stop = raycast(g.world, p.x, p.y, dx, dy, def.range, (w, cx, cy) => !inBounds(cx, cy) || isRock(w, cx, cy));
    const len = stop.hit ? stop.dist : def.range;
    const onTarget = enemies.some((e) => segCircle(p.x, p.y, dx, dy, len, e.x, e.y, e.r) >= 0);
    return { len, onTarget };
  }
  const ray = raycast(g.world, p.x, p.y, dx, dy, def.range, isSolid);
  let len = ray.hit ? ray.dist : def.range;
  let onTarget = false;
  for (const e of enemies) {
    const t = segCircle(p.x, p.y, dx, dy, len, e.x, e.y, e.r);
    if (t >= 0 && t <= len) {
      len = t;
      onTarget = true;
    }
  }
  return { len, onTarget, blocked: ray.hit && !onTarget };
}

// The movement half of applyCommand + updatePlayers, for a guest predicting
// its own player between snapshots. Same maths, so prediction matches the host.
export function predictMove(g, p, mx, my, aiming, dt) {
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }
  const speed = MOVE_SPEED * (p.buffs ? p.buffs.speed : 1) * (aiming ? 0.82 : 1) * (p.slowT > 0 ? 0.6 : 1);
  const k = Math.min(1, dt * 14);
  p.vx += (mx * speed - p.vx) * k;
  p.vy += (my * speed - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  collideCircle(g.world, p);
}

// ---- online guests: visuals only ----------------------------------------------
// A guest phone doesn't simulate the match; it shows the host's snapshots.
// Between snapshots it moves projectiles along and ages effects so motion
// stays smooth, and turns the host's events into local particles.

export function stepVisual(g, dt) {
  g.time += dt;
  // keep the train gliding between snapshots
  if (g.train && g.train.phase === "run") g.train.y += g.train.dir * 14 * dt;
  g.shake = Math.max(0, g.shake - dt * 3);
  for (const p of g.players) {
    p.hitFlash = Math.max(0, p.hitFlash - dt * 4);
    p.recoil = Math.max(0, p.recoil - dt * 9);
  }
  for (const b of g.bullets) {
    if (b.kind === "lob") {
      b.t = Math.min(b.T, b.t + dt);
      const k = b.T > 0 ? b.t / b.T : 1;
      b.x = b.sx + (b.tx - b.sx) * k;
      b.y = b.sy + (b.ty - b.sy) * k;
      b.h = 4 * k * (1 - k) * Math.min(2.4, 0.6 + b.T * 1.6);
    } else {
      const step = Math.min(b.speed * dt, Math.max(0, b.left));
      b.x += b.dx * step;
      b.y += b.dy * step;
      b.left -= step;
      b.age += dt;
    }
  }
  updateFx(g, dt);
}

export function particlesForEvent(g, e) {
  const burst = (x, y, n, colors, speed, life) => {
    for (let k = 0; k < n; k++) {
      const a = g.rng() * Math.PI * 2;
      const sp = speed * (0.3 + g.rng());
      g.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * (0.6 + g.rng() * 0.6), t: 0, size: 0.1 + g.rng() * 0.14,
        color: colors[k % colors.length],
      });
    }
  };
  if (e.t === "boom") burst(e.x, e.y, 18, ["#ffd27a", "#ff6b4a"], 6, 0.6);
  else if (e.t === "tileBreak") burst(e.x, e.y, 10, [e.color], 4, 0.7);
  else if (e.t === "death") burst(e.x, e.y, 26, [TEAM_HEX[e.team]], 5, 0.9);
}
