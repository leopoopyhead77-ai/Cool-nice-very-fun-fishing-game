// The PvB opponent. Speaks the same command format as the human controller.
//
// Each frame it: picks the best gun for the range, takes cover when hit
// (builds a wall), peeks by editing a window into its own wall, strafes while
// it has line of sight, and otherwise paths (BFS on the grid) to the closest
// spot that does.

import { WALL_COST, GW, GH, isSolid, lineClear, raycast, tileAt, inBounds } from "./world.js";
import { enemyOf, gunOf, buildPreview } from "./game.js";

const PROFILES = {
  easy:   { react: 0.6,  err: 0.24,  build: 0.25, edit: 0.25, lead: 0,   strafe: 0.55, cover: 6,   fire: 0.6 },
  normal: { react: 0.34, err: 0.11,  build: 0.55, edit: 0.55, lead: 0.5, strafe: 0.85, cover: 3.8, fire: 0.85 },
  hard:   { react: 0.17, err: 0.045, build: 0.9,  edit: 0.9,  lead: 1,   strafe: 1,    cover: 2.4, fire: 1 },
};

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function createBot(difficulty = "normal") {
  const D = PROFILES[difficulty] || PROFILES.normal;
  const s = {
    path: [], pathT: 0, strafeDir: 1, strafeT: 0,
    aimT: 0, aimErr: 0, lastHp: 100, buildCd: 1.5, swapCd: 0,
    peek: null, stuckT: 0, lastX: 0, lastY: 0, goal: -1, blindT: 0,
  };

  function rand() {
    return Math.random();
  }

  function chooseSlot(p, dist) {
    let best = p.slot;
    let bestScore = -Infinity;
    p.guns.forEach((gun, i) => {
      const def = gun.def;
      let score = -Math.abs(def.pref - dist);
      if (dist > def.range) score -= 20;
      if (gun.ammo <= 0) score -= 6;
      if (i === p.slot) score += 1.5; // hysteresis
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  function bfs(p, e, def, w, charge = false) {
    const N = GW * GH;
    const dist = new Int16Array(N).fill(-1);
    const prev = new Int32Array(N).fill(-1);
    const sx = Math.floor(p.x);
    const sy = Math.floor(p.y);
    const start = sy * GW + sx;
    const q = [start];
    dist[start] = 0;
    // the longer we go without a shot, the closer we're willing to push
    const pref = Math.max(1.2, Math.min(def.pref, def.range * 0.9) - s.blindT * 0.7);
    let goal = -1;
    let goalScore = Infinity;
    let keptScore = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const cx = c % GW;
      const cy = (c / GW) | 0;
      const d = dist[c];
      const px = cx + 0.5;
      const py = cy + 0.5;
      const de = Math.hypot(e.x - px, e.y - py);
      const sees = def.type === "lob" ? de <= def.range : lineClear(w, px, py, e.x, e.y);
      const score = charge
        ? de * 3 + d * 0.2
        : d * 0.55 + Math.abs(de - pref) * 1.1 + (sees ? 0 : 60) + (de > def.range ? 30 : 0);
      if (score < goalScore) {
        goalScore = score;
        goal = c;
      }
      if (c === s.goal) keptScore = score;
      if (d >= 45) continue;
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (!inBounds(nx, ny) || isSolid(w, nx, ny)) continue;
        if (ox && oy && (isSolid(w, cx + ox, cy) || isSolid(w, cx, cy + oy))) continue;
        const n = ny * GW + nx;
        if (dist[n] >= 0) continue;
        dist[n] = d + 1;
        prev[n] = c;
        q.push(n);
      }
    }
    // Hysteresis: on a mirrored map two routes often score the same, and
    // flipping between them every replan leaves the bot dithering in place.
    if (keptScore < goalScore + 4 && s.goal !== start) {
      goal = s.goal;
      goalScore = keptScore;
    }
    s.goal = goal;
    const path = [];
    for (let c = goal; c >= 0 && c !== start; c = prev[c]) {
      path.push({ x: (c % GW) + 0.5, y: ((c / GW) | 0) + 0.5 });
    }
    path.reverse();
    return { path, reachedLos: goalScore < 60 };
  }

  return {
    poll(g, p, dt) {
      const cmd = { mx: 0, my: 0, aiming: false, aimAngle: 0, aimMag: 0, actions: [] };
      const e = enemyOf(g, p);
      if (!e.alive || g.state !== "fight") return cmd;
      const w = g.world;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.hypot(dx, dy);
      const toE = Math.atan2(dy, dx);

      s.buildCd -= dt;
      s.swapCd -= dt;
      s.pathT -= dt;
      s.strafeT -= dt;

      // --- weapon choice
      const slot = chooseSlot(p, dist);
      if (slot !== p.slot && s.swapCd <= 0 && !p.burst) {
        cmd.actions.push({ t: "slot", slot });
        s.swapCd = 1.4;
      }
      const gun = gunOf(p);
      const def = gun.def;
      if (gun.ammo <= 0 && p.reloadT <= 0) cmd.actions.push({ t: "reload" });

      const losClear = lineClear(w, p.x, p.y, e.x, e.y);
      const canHit =
        dist <= def.range * 0.97 &&
        (def.type === "lob" || def.type === "rail" || losClear);
      s.blindT = canHit ? Math.max(0, s.blindT - dt * 3) : s.blindT + dt;

      // --- took damage: throw up cover between us and them
      const tookHit = p.hp < s.lastHp;
      s.lastHp = p.hp;
      if (tookHit && s.buildCd <= 0 && p.mats >= WALL_COST && dist > 2.2 && rand() < D.build) {
        const place = buildPreview(g, p, toE, 0.05);
        if (place.valid) {
          cmd.actions.push(
            { t: "mode", mode: "build" },
            { t: "build", angle: toE, mag: 0.05 },
            { t: "mode", mode: "combat" }
          );
          s.buildCd = D.cover;
          s.path = [];
        }
      }

      // --- peek: open a window in our own wall that blocks the shot
      if (s.peek) {
        s.peek.t -= dt;
        const t = tileAt(w, s.peek.cx, s.peek.cy);
        const stillOpen = t && t.wall.edit === t.i;
        if (!stillOpen) s.peek = null;
        else if (s.peek.t <= 0 && !p.burst) {
          const a = Math.atan2(s.peek.cy + 0.5 - p.y, s.peek.cx + 0.5 - p.x);
          cmd.actions.push({ t: "reset", angle: a });
          s.peek.t = 0.5; // retry if someone stands in the gap
        }
      } else if (!losClear && dist <= def.range && def.type !== "lob") {
        const r = raycast(w, p.x, p.y, dx / dist, dy / dist, dist);
        const t = r.hit ? tileAt(w, r.cx, r.cy) : null;
        if (t && t.wall.owner === p.team && r.dist < 2.8 && rand() < D.edit * dt * 4) {
          // only worth it if that tile is the only thing in the way
          const beyond = raycast(w, r.cx + 0.5, r.cy + 0.5, dx / dist, dy / dist, Math.hypot(e.x - r.cx - 0.5, e.y - r.cy - 0.5),
            (ww, cx, cy) => !(cx === r.cx && cy === r.cy) && isSolid(ww, cx, cy));
          if (!beyond.hit) {
            const a = Math.atan2(r.cy + 0.5 - p.y, r.cx + 0.5 - p.x);
            cmd.actions.push(
              { t: "mode", mode: "edit" },
              { t: "edit", angle: a },
              { t: "mode", mode: "combat" }
            );
            s.peek = { cx: r.cx, cy: r.cy, t: 1.2 + rand() * 0.8 };
          }
        }
      }

      // --- aim & fire
      if (canHit) {
        let aim = toE;
        if (D.lead > 0 && def.speed > 0) {
          const tf = dist / def.speed;
          const lx = e.x + e.vx * tf * D.lead;
          const ly = e.y + e.vy * tf * D.lead;
          aim = Math.atan2(ly - p.y, lx - p.x);
        }
        if (s.aimT === 0) s.aimErr = (rand() - 0.5) * 2 * D.err;
        s.aimT += dt;
        cmd.aiming = true;
        cmd.aimAngle = aim + s.aimErr;
        cmd.aimMag = Math.min(1, dist / def.range);
        const ready = p.cd <= 0 && !p.burst && p.reloadT <= 0 && p.swapT <= 0 && gun.ammo > 0;
        if (ready && s.aimT >= D.react) {
          if (rand() < D.fire) {
            cmd.actions.push({ t: "fire", angle: cmd.aimAngle, mag: cmd.aimMag });
          }
          s.aimT = 0;
        }
      } else {
        // sight flickers at cover edges; don't throw away the aim instantly
        s.aimT = Math.max(0, s.aimT - dt * 0.5);
        // boxed in by enemy builds: shoot our way through
        if (!losClear && dist <= def.range && s.path.length === 0) {
          const r = raycast(w, p.x, p.y, dx / dist, dy / dist, dist);
          const t = r.hit ? tileAt(w, r.cx, r.cy) : null;
          if (t && t.wall.owner !== p.team && p.cd <= 0 && !p.burst && p.reloadT <= 0) {
            const a = Math.atan2(r.cy + 0.5 - p.y, r.cx + 0.5 - p.x);
            cmd.actions.push({ t: "fire", angle: a, mag: 0.5 });
          }
        }
      }

      // --- movement
      let mx = 0;
      let my = 0;
      // dodge incoming grenades
      for (const b of g.bullets) {
        if (b.kind !== "lob" || b.owner === p.team) continue;
        const bd = Math.hypot(p.x - b.tx, p.y - b.ty);
        if (bd < b.def.radius + 0.8) {
          mx += (p.x - b.tx) / (bd + 0.01);
          my += (p.y - b.ty) / (bd + 0.01);
        }
      }
      const wantHeal = p.hp < 55 && g.medkits.some((m) => m.up);
      if (canHit && !wantHeal) {
        if (s.strafeT <= 0) {
          s.strafeDir = rand() < 0.5 ? -1 : 1;
          s.strafeT = 0.7 + rand() * 1.2;
        }
        const pref = Math.min(def.pref, def.range * 0.85);
        const radial = Math.max(-1, Math.min(1, (dist - pref) / 2.5));
        // only strafe the way that keeps them in sight
        const ahead = (dir) => lineClear(w, p.x + (-dy / dist) * dir * 0.7, p.y + (dx / dist) * dir * 0.7, e.x, e.y);
        if (def.type === "bullet" || def.type === "rocket") {
          if (!ahead(s.strafeDir) && ahead(-s.strafeDir)) s.strafeDir *= -1;
        }
        mx += (dx / dist) * radial * 0.8 + (-dy / dist) * s.strafeDir * D.strafe;
        my += (dy / dist) * radial * 0.8 + (dx / dist) * s.strafeDir * D.strafe;
        s.path = [];
      } else {
        if (s.pathT <= 0 || s.path.length === 0) {
          if (wantHeal) {
            const m = g.medkits
              .filter((k) => k.up)
              .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
            s.path = bfs(p, { x: m.x, y: m.y, vx: 0, vy: 0 }, { ...def, pref: 0, range: 99 }, w).path;
            s.path.push({ x: m.x, y: m.y });
          } else {
            s.path = bfs(p, e, def, w, s.blindT > 6).path;
          }
          s.pathT = 0.45;
        }
        const wp = s.path[0];
        if (wp) {
          const wx = wp.x - p.x;
          const wy = wp.y - p.y;
          const wd = Math.hypot(wx, wy);
          if (wd < 0.28) s.path.shift();
          else {
            mx += wx / wd;
            my += wy / wd;
          }
        }
      }

      // unstick
      const moved = Math.hypot(p.x - s.lastX, p.y - s.lastY);
      s.lastX = p.x;
      s.lastY = p.y;
      if (Math.hypot(mx, my) > 0.3 && moved < dt * 0.8) s.stuckT += dt;
      else s.stuckT = 0;
      if (s.stuckT > 0.5) {
        s.strafeDir *= -1;
        s.path = [];
        s.pathT = 0;
        s.stuckT = 0;
      }

      cmd.mx = mx;
      cmd.my = my;
      return cmd;
    },
  };
}
