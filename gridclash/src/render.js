// Canvas renderer: arena, builds, players, projectiles, previews and HUD.

import { GW, GH, WALL_COST, isRock } from "./world.js";
import { gunOf, enemyOf, traceShot, buildPreview, editPreview, quickEditTarget, nearestEditedWall, MAX_HP, MAX_MATS, magOf } from "./game.js";
import { drawGun, drawCardIcon, GUN_LEN } from "./art.js";
import { CARD_BY_ID, RARITIES } from "./cards.js";
import { cardRects } from "./input.js";
import { PAC_R, TRAIN_LEN } from "./hazards.js";
import { TIER_COLOR } from "./guns.js";

export const TEAM = [
  { main: "#3fa7ff", dark: "#1d5f9e", light: "#a9d8ff", wall: "#2f6fb0", wallHi: "#5b9ee0" },
  { main: "#ff4d5e", dark: "#9e2532", light: "#ffb1b9", wall: "#a8343f", wallHi: "#e0606b" },
  { main: "#43d97b", dark: "#1f7a43", light: "#b6f5cc", wall: "#2f8a52", wallHi: "#57c27e" },
  { main: "#ffc93c", dark: "#a57a12", light: "#ffe9a8", wall: "#a8822a", wallHi: "#dcb24d" },
];

const easeOutBack = (t) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const v = { W: 1, H: 1, dpr: 1, TS: 10, ox: 0, oy: 0, floor: null, L: null };

  function resize(W, H, dpr, L) {
    v.W = W;
    v.H = H;
    v.dpr = dpr;
    v.L = L;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    // the arena rect comes from the input layout so touch zones and drawing agree
    v.TS = L.arena.TS;
    // Portrait PvP draws the arena turned 90° via a canvas transform: world
    // code still draws in an unturned frame at the origin.
    v.portrait = !!L.arena.portrait;
    v.OX = L.arena.ox;
    v.OY = L.arena.oy;
    v.ox = v.portrait ? 0 : L.arena.ox;
    v.oy = v.portrait ? 0 : L.arena.oy;
    v.floor = null;
  }

  const sx = (x) => v.ox + x * v.TS;
  const sy = (y) => v.oy + y * v.TS;

  function buildFloor(world, numTeams = 2) {
    v.floorTeams = numTeams;
    const theme = (world.map && world.map.theme) || "arena";
    v.floorTheme = theme;
    const c = document.createElement("canvas");
    const TS = v.TS * v.dpr;
    c.width = Math.ceil(GW * TS);
    c.height = Math.ceil(GH * TS);
    const f = c.getContext("2d");
    const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const base = theme === "pac" ? ["#05070f", "#070a16"] : theme === "desert" ? ["#7a6240", "#806745"] : ["#1b2232", "#1e2638"];
    f.fillStyle = base[0];
    f.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        if ((x + y) % 2 === 0) {
          f.fillStyle = base[1];
          f.fillRect(x * TS, y * TS, TS, TS);
        }
      }
    }
    if (theme === "desert") {
      // sand speckles and dune ripples
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const h = hash(x, y);
          f.fillStyle = h % 2 ? "rgba(255,230,180,0.08)" : "rgba(60,40,20,0.12)";
          f.fillRect((x + (h % 7) / 8) * TS, (y + ((h >> 3) % 7) / 8) * TS, TS * 0.08, TS * 0.08);
          if (h % 11 === 0) {
            f.strokeStyle = "rgba(255,225,170,0.12)";
            f.lineWidth = Math.max(1, TS * 0.05);
            f.beginPath();
            f.arc((x + 0.5) * TS, (y + 1) * TS, TS * 0.7, Math.PI * 1.15, Math.PI * 1.85);
            f.stroke();
          }
        }
      }
      // the railway: ballast, sleepers, rails
      const tx = world.map.track.x;
      f.fillStyle = "#5b4a38";
      f.fillRect((tx - 1.05) * TS, 0, 2.1 * TS, c.height);
      f.fillStyle = "#3e2a18";
      for (let y = 0.2; y < GH; y += 0.55) f.fillRect((tx - 0.95) * TS, y * TS, 1.9 * TS, 0.2 * TS);
      for (const rx of [tx - 0.62, tx + 0.62]) {
        f.fillStyle = "rgba(0,0,0,0.35)";
        f.fillRect((rx - 0.05) * TS, 0, 0.14 * TS, c.height);
        f.fillStyle = "#c3c9d3";
        f.fillRect((rx - 0.07) * TS, 0, 0.11 * TS, c.height);
      }
    }
    if (theme === "pac") {
      // pellets in the corridors
      f.fillStyle = "rgba(255,214,170,0.55)";
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          if (isRock(world, x, y) || (y === 10 && x > 12 && x < 17)) continue;
          f.beginPath();
          f.arc((x + 0.5) * TS, (y + 0.5) * TS, TS * 0.06, 0, Math.PI * 2);
          f.fill();
        }
      }
    }
    // spawn zones (team modes only; free-for-all spawns in the corners)
    if (numTeams === 2) {
    const grad0 = f.createLinearGradient(0, 0, TS * 5, 0);
    grad0.addColorStop(0, "rgba(63,167,255,0.16)");
    grad0.addColorStop(1, "rgba(63,167,255,0)");
    f.fillStyle = grad0;
    f.fillRect(0, 0, TS * 5, c.height);
    const grad1 = f.createLinearGradient(c.width, 0, c.width - TS * 5, 0);
    grad1.addColorStop(0, "rgba(255,77,94,0.16)");
    grad1.addColorStop(1, "rgba(255,77,94,0)");
    f.fillStyle = grad1;
    f.fillRect(c.width - TS * 5, 0, TS * 5, c.height);
    }
    // grid
    f.strokeStyle = "rgba(140,160,200,0.10)";
    f.lineWidth = Math.max(1, TS * 0.04);
    f.beginPath();
    for (let x = 0; x <= GW; x++) {
      f.moveTo(x * TS, 0);
      f.lineTo(x * TS, c.height);
    }
    for (let y = 0; y <= GH; y++) {
      f.moveTo(0, y * TS);
      f.lineTo(c.width, y * TS);
    }
    f.stroke();
    // centre line
    if (theme === "arena") {
    f.setLineDash([TS * 0.4, TS * 0.4]);
    f.strokeStyle = "rgba(220,230,255,0.13)";
    f.lineWidth = TS * 0.08;
    f.beginPath();
    f.moveTo(c.width / 2, 0);
    f.lineTo(c.width / 2, c.height);
    f.stroke();
    f.setLineDash([]);
    }
    // rock
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        if (!isRock(world, x, y)) continue;
        const px = x * TS;
        const py = y * TS;
        if (theme === "pac") {
          // neon maze walls: glowing outline on the outer edges of each block
          f.fillStyle = "#0a1038";
          f.fillRect(px, py, TS, TS);
          f.save();
          f.strokeStyle = "#3d5bff";
          f.shadowColor = "#3d5bff";
          f.shadowBlur = TS * 0.35;
          f.lineWidth = Math.max(1.5, TS * 0.09);
          f.beginPath();
          const e = TS * 0.12;
          if (!isRock(world, x, y - 1)) { f.moveTo(px, py + e); f.lineTo(px + TS, py + e); }
          if (!isRock(world, x, y + 1)) { f.moveTo(px, py + TS - e); f.lineTo(px + TS, py + TS - e); }
          if (!isRock(world, x - 1, y)) { f.moveTo(px + e, py); f.lineTo(px + e, py + TS); }
          if (!isRock(world, x + 1, y)) { f.moveTo(px + TS - e, py); f.lineTo(px + TS - e, py + TS); }
          f.stroke();
          f.restore();
          continue;
        }
        if (theme === "desert" && hash(x, y) % 3 === 0) {
          // cactus
          f.fillStyle = "rgba(0,0,0,0.25)";
          f.beginPath();
          f.ellipse(px + TS * 0.6, py + TS * 0.85, TS * 0.42, TS * 0.14, 0, 0, Math.PI * 2);
          f.fill();
          f.fillStyle = "#3f8f4a";
          f.strokeStyle = "#245c2c";
          f.lineWidth = Math.max(1, TS * 0.05);
          const body = (x0, y0, w, h) => {
            f.beginPath();
            if (f.roundRect) f.roundRect(x0, y0, w, h, w / 2);
            else f.rect(x0, y0, w, h);
            f.fill();
            f.stroke();
          };
          body(px + TS * 0.38, py + TS * 0.08, TS * 0.26, TS * 0.84);
          body(px + TS * 0.12, py + TS * 0.3, TS * 0.18, TS * 0.36);
          body(px + TS * 0.12, py + TS * 0.52, TS * 0.32, TS * 0.14);
          body(px + TS * 0.7, py + TS * 0.22, TS * 0.18, TS * 0.32);
          body(px + TS * 0.56, py + TS * 0.42, TS * 0.3, TS * 0.13);
          continue;
        }
        if (theme === "desert") {
          // sandstone
          f.fillStyle = "#4a3320";
          f.fillRect(px + TS * 0.06, py + TS * 0.12, TS, TS);
          f.fillStyle = "#a8743e";
          f.fillRect(px, py, TS, TS);
          f.fillStyle = "#c48a4c";
          f.fillRect(px + TS * 0.08, py + TS * 0.08, TS * 0.84, TS * 0.62);
          f.fillStyle = "rgba(90,50,20,0.35)";
          f.fillRect(px + TS * 0.08, py + TS * 0.38, TS * 0.84, TS * 0.06);
          continue;
        }
        f.fillStyle = "#11151f";
        f.fillRect(px + TS * 0.06, py + TS * 0.12, TS, TS);
        f.fillStyle = "#4a5366";
        f.fillRect(px, py, TS, TS);
        f.fillStyle = "#5d677d";
        f.fillRect(px + TS * 0.08, py + TS * 0.08, TS * 0.84, TS * 0.7);
        f.fillStyle = "rgba(255,255,255,0.08)";
        f.fillRect(px + TS * 0.08, py + TS * 0.08, TS * 0.84, TS * 0.12);
        f.fillStyle = "rgba(0,0,0,0.14)";
        f.beginPath();
        f.arc(px + TS * (0.3 + ((x * 7 + y * 3) % 5) * 0.08), py + TS * 0.5, TS * 0.12, 0, Math.PI * 2);
        f.fill();
      }
    }
    // pac-maze ghost-house door
    if (theme === "pac") {
      f.fillStyle = "#ff7ae0";
      f.fillRect(14 * TS, 9.42 * TS, 2 * TS, 0.16 * TS);
    }
    // border
    f.strokeStyle = theme === "pac" ? "#3d5bff" : theme === "desert" ? "#a8743e" : "#5a6884";
    f.lineWidth = TS * 0.12;
    f.strokeRect(0, 0, c.width, c.height);
    v.floor = c;
  }

  // ---- world ----------------------------------------------------------------

  // hex colour × k (k < 1 darker, > 1 lighter)
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // Walls are drawn as raised wooden blocks: a front face (height) and a top
  // face with planks running along the wall, team-coloured trim on the wall's
  // outer edges, corner bolts, and cracks as they take damage. An edited tile
  // becomes a doorway with frame posts.
  function drawWalls(g) {
    const TS = v.TS;
    const lift = TS * 0.3;
    const tiles = [];
    const gaps = [];
    for (const wall of g.world.walls) {
      const k = Math.min(1, (g.time - wall.born) / 0.24);
      const rise = k < 1 ? Math.max(0.05, easeOutBack(k)) : 1;
      const drop = (1 - Math.min(1, k * 1.5)) * TS * 0.9;
      const solid = (i) => i >= 0 && i < wall.cells.length && wall.cells[i].alive && wall.edit !== i;
      wall.cells.forEach((c, i) => {
        if (!c.alive) return;
        if (wall.edit === i) gaps.push({ wall, c, i });
        else tiles.push({ wall, c, i, rise, drop, prev: solid(i - 1), next: solid(i + 1) });
      });
    }
    tiles.sort((a, b) => a.c.y - b.c.y);

    // doorways first (they're on the floor)
    for (const { wall, c } of gaps) {
      const col = TEAM[wall.team];
      const x = sx(c.x);
      const y = sy(c.y);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4);
      ctx.setLineDash([TS * 0.16, TS * 0.12]);
      ctx.strokeStyle = col.light;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, TS * 0.06);
      ctx.strokeRect(x + TS * 0.12, y + TS * 0.12, TS * 0.76, TS * 0.76);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // frame posts at both ends of the opening
      const post = TS * 0.16;
      const posts = wall.vertical
        ? [[x + TS * 0.2, y], [x + TS * 0.2, y + TS - post]]
        : [[x, y + TS * 0.2], [x + TS - post, y + TS * 0.2]];
      for (const [px, py] of posts) {
        const pw = wall.vertical ? TS * 0.6 : post;
        const ph = wall.vertical ? post : TS * 0.6;
        ctx.fillStyle = shade(col.wall, 0.55);
        ctx.fillRect(px, py + ph - lift * 0.6, pw, lift * 0.6);
        ctx.fillStyle = col.wallHi;
        ctx.fillRect(px, py - lift * 0.6, pw, ph);
      }
    }

    // ground shadows
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    for (const t of tiles) ctx.fillRect(sx(t.c.x) + TS * 0.14, sy(t.c.y) + TS * 0.12, TS, TS * 0.92);

    for (const t of tiles) {
      const { wall, c, rise, drop } = t;
      const col = TEAM[wall.team];
      const hpk = Math.max(0, c.hp / (c.max || 150));
      const x0 = sx(c.x);
      const y0 = sy(c.y) - drop;
      ctx.save();
      if (rise !== 1) {
        ctx.translate(x0 + TS / 2, y0 + TS / 2);
        ctx.scale(rise, rise);
        ctx.translate(-(x0 + TS / 2), -(y0 + TS / 2));
      }
      const dim = 0.72 + 0.28 * hpk; // battered walls darken
      // front face (gives the block height)
      ctx.fillStyle = shade(col.wall, 0.55 * dim);
      ctx.fillRect(x0, y0 + TS - lift, TS, lift);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, TS * 0.03);
      ctx.beginPath();
      for (let q = 1; q < 4; q++) {
        ctx.moveTo(x0 + (TS * q) / 4, y0 + TS - lift);
        ctx.lineTo(x0 + (TS * q) / 4, y0 + TS);
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x0, y0 + TS - Math.max(1, TS * 0.04), TS, Math.max(1, TS * 0.04));

      // top face
      const ty = y0 - lift;
      ctx.fillStyle = shade(col.wall, dim);
      ctx.fillRect(x0, ty, TS, TS);
      // planks along the wall
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = Math.max(1, TS * 0.035);
      ctx.beginPath();
      for (let q = 1; q < 3; q++) {
        if (wall.vertical) {
          ctx.moveTo(x0 + (TS * q) / 3, ty);
          ctx.lineTo(x0 + (TS * q) / 3, ty + TS);
        } else {
          ctx.moveTo(x0, ty + (TS * q) / 3);
          ctx.lineTo(x0 + TS, ty + (TS * q) / 3);
        }
      }
      ctx.stroke();
      // wood grain highlight
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      if (wall.vertical) ctx.fillRect(x0 + TS * 0.06, ty, TS * 0.06, TS);
      else ctx.fillRect(x0, ty + TS * 0.06, TS, TS * 0.06);
      // team trim on the wall's outer edges only, so 3 tiles read as one wall
      const tw = Math.max(1.5, TS * 0.08);
      ctx.fillStyle = col.main;
      if (wall.vertical) {
        ctx.fillRect(x0, ty, tw, TS);
        ctx.fillRect(x0 + TS - tw, ty, tw, TS);
        if (!t.prev) ctx.fillRect(x0, ty, TS, tw);
        if (!t.next) ctx.fillRect(x0, ty + TS - tw, TS, tw);
      } else {
        ctx.fillRect(x0, ty, TS, tw);
        ctx.fillRect(x0, ty + TS - tw, TS, tw);
        if (!t.prev) ctx.fillRect(x0, ty, tw, TS);
        if (!t.next) ctx.fillRect(x0 + TS - tw, ty, tw, TS);
      }
      // bolts at the wall's ends
      ctx.fillStyle = "rgba(230,235,245,0.8)";
      const bolt = (bx, by) => {
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(1, TS * 0.05), 0, Math.PI * 2);
        ctx.fill();
      };
      const e = TS * 0.2;
      if (!t.prev) {
        if (wall.vertical) { bolt(x0 + e, ty + e); bolt(x0 + TS - e, ty + e); } else { bolt(x0 + e, ty + e); bolt(x0 + e, ty + TS - e); }
      }
      if (!t.next) {
        if (wall.vertical) { bolt(x0 + e, ty + TS - e); bolt(x0 + TS - e, ty + TS - e); } else { bolt(x0 + TS - e, ty + e); bolt(x0 + TS - e, ty + TS - e); }
      }
      // damage
      if (hpk < 0.75) {
        ctx.strokeStyle = `rgba(10,10,15,${Math.min(0.9, 1 - hpk)})`;
        ctx.lineWidth = Math.max(1, TS * 0.05);
        ctx.beginPath();
        ctx.moveTo(x0 + TS * 0.22, ty + TS * 0.18);
        ctx.lineTo(x0 + TS * 0.46, ty + TS * 0.46);
        ctx.lineTo(x0 + TS * 0.74, ty + TS * 0.52);
        if (hpk < 0.45) {
          ctx.moveTo(x0 + TS * 0.46, ty + TS * 0.46);
          ctx.lineTo(x0 + TS * 0.36, ty + TS * 0.84);
          ctx.moveTo(x0 + TS * 0.6, ty + TS * 0.12);
          ctx.lineTo(x0 + TS * 0.8, ty + TS * 0.34);
        }
        ctx.stroke();
      }
      if (hpk < 0.3) {
        // a chunk knocked out of the corner
        ctx.fillStyle = "#1b2232";
        ctx.beginPath();
        ctx.moveTo(x0 + TS, ty);
        ctx.lineTo(x0 + TS * 0.68, ty);
        ctx.lineTo(x0 + TS, ty + TS * 0.3);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- map gimmicks -------------------------------------------------------------

  function drawTeleporters(g) {
    const TS = v.TS;
    const tps = (g.map && g.map.teleporters) || [];
    const me = g.players[v.local ?? 0];
    tps.forEach((pair, i) => {
      const resting = (g.tpCd && g.tpCd[i] > 0) || (me && !v.L.pvp && me.tpCd > 0);
      const col = resting ? "120,130,150" : i % 2 ? "255,122,224" : "92,246,255";
      pair.forEach((pad, k) => {
        const x = sx(pad.x);
        const y = sy(pad.y);
        // someone charging this pad: a filling ring
        for (const q of g.players) {
          if (!q.alive || !(q.tpCharge > 0) || q.tpPad !== i * 2 + k) continue;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(2, TS * 0.1);
          ctx.beginPath();
          ctx.arc(x, y, TS * 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, q.tpCharge / 0.6));
          ctx.stroke();
        }
        // your own cooldown, in seconds, over each pad
        if (me && !v.L.pvp && me.tpCd > 0) label(String(Math.ceil(me.tpCd)), x, y - TS * 0.62, TS * 0.42, "rgba(220,225,235,0.85)", "center", 900);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, TS * 0.55);
        grad.addColorStop(0, `rgba(${col},0.55)`);
        grad.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, TS * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, TS * 0.07);
        for (let k = 0; k < 3; k++) {
          const a = g.time * (2.5 + k) * (k % 2 ? -1 : 1);
          ctx.strokeStyle = `rgba(${col},${0.9 - k * 0.22})`;
          ctx.beginPath();
          ctx.arc(x, y, TS * (0.18 + k * 0.1), a, a + Math.PI * 1.3);
          ctx.stroke();
        }
      });
    });
  }

  function drawTrackWarning(g) {
    const tr = g.train;
    if (!tr || !g.map.track) return;
    const TS = v.TS;
    const tx = g.map.track.x;
    const flash = Math.sin(g.time * 14) > 0;
    // signal lights at both ends of the line
    for (const yy of [0.5, GH - 0.5]) {
      for (const ox of [-1.6, 1.6]) {
        const lit = tr.phase !== "idle" && (ox < 0 ? flash : !flash);
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(sx(tx + ox), sy(yy), TS * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lit ? "#ff3b3b" : "#4a1a1a";
        if (lit) {
          ctx.shadowColor = "#ff3b3b";
          ctx.shadowBlur = TS * 0.6;
        }
        ctx.beginPath();
        ctx.arc(sx(tx + ox), sy(yy), TS * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    if (tr.phase === "warn") {
      ctx.fillStyle = flash ? "rgba(255,50,50,0.22)" : "rgba(255,50,50,0.1)";
      ctx.fillRect(sx(tx - 1.05), sy(0), 2.1 * TS, GH * TS);
      ctx.save();
      ctx.translate(sx(tx), sy(GH / 2));
      ctx.rotate(-Math.PI / 2);
      label("⚠ TRAIN ⚠", 0, 0, TS * 0.7, flash ? "#ffdddd" : "#ff6b6b", "center", 900);
      ctx.restore();
    }
  }

  function drawPacs(g) {
    const TS = v.TS;
    for (const pc of g.pacs || []) {
      if (!pc.alive) continue;
      const x = sx(pc.x);
      const y = sy(pc.y);
      const r = PAC_R * TS * 1.05;
      const dir = Math.atan2(pc.dy || 0, pc.dx || 1);
      const open = 0.08 + Math.abs(Math.sin(g.time * 11 + pc.x)) * (pc.chomp > 0 ? 0.9 : 0.6);
      ctx.globalAlpha = pc.release > 0 ? 0.55 : 1;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x + r * 0.1, y + r * 0.4, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffe14d";
      ctx.shadowColor = "#ffe14d";
      ctx.shadowBlur = TS * 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, dir + open, dir + Math.PI * 2 - open);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // eye
      const ex = x + Math.cos(dir - Math.PI / 2.4) * r * 0.5;
      const ey = y + Math.sin(dir - Math.PI / 2.4) * r * 0.5;
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      // health once it's been hit
      if (pc.hp < 80) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(x - r, y - r - TS * 0.25, r * 2, TS * 0.1);
        ctx.fillStyle = "#ffe14d";
        ctx.fillRect(x - r, y - r - TS * 0.25, r * 2 * (pc.hp / 80), TS * 0.1);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawTrain(g) {
    const tr = g.train;
    if (!tr || tr.phase !== "run") return;
    const TS = v.TS;
    const tx = g.map.track.x;
    // trains enter and leave through the map edge: clip to the arena
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx(0), sy(0), GW * TS, GH * TS);
    ctx.clip();
    const x0 = sx(tx - 0.95);
    const w = 1.9 * TS;
    // cars from the head backwards: locomotive (3 tiles) + two wagons
    const parts = [{ len: 3, loco: true }, { len: 2.85 }, { len: 2.85 }];
    let at = tr.y;
    for (const part of parts) {
      const yA = at;
      const yB = at - tr.dir * part.len;
      const top = sy(Math.min(yA, yB));
      const h = part.len * TS;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x0 + TS * 0.12, top + TS * 0.12, w, h);
      if (part.loco) {
        ctx.fillStyle = "#8c2a22";
        ctx.fillRect(x0, top, w, h);
        ctx.fillStyle = "#b8463a";
        ctx.fillRect(x0 + w * 0.15, top + TS * 0.1, w * 0.7, h - TS * 0.2);
        // cab at the back, nose at the front
        const cabY = tr.dir > 0 ? top + TS * 0.15 : top + h - TS * 1.05;
        ctx.fillStyle = "#3a1410";
        ctx.fillRect(x0 + w * 0.2, cabY, w * 0.6, TS * 0.9);
        ctx.fillStyle = "#9fd6ff";
        ctx.fillRect(x0 + w * 0.3, cabY + TS * 0.15, w * 0.4, TS * 0.3);
        // headlight
        const hy = tr.dir > 0 ? top + h - TS * 0.15 : top + TS * 0.15;
        ctx.fillStyle = "#fff4b0";
        ctx.shadowColor = "#fff4b0";
        ctx.shadowBlur = TS;
        ctx.beginPath();
        ctx.arc(x0 + w / 2, hy, TS * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "#6f4a2a";
        ctx.fillRect(x0, top, w, h);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = Math.max(1, TS * 0.05);
        ctx.beginPath();
        for (let k = 1; k < 4; k++) {
          ctx.moveTo(x0 + (w * k) / 4, top);
          ctx.lineTo(x0 + (w * k) / 4, top + h);
        }
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(x0, top, w * 0.12, h);
      }
      at = yB - tr.dir * 0.15; // coupling gap
    }
    ctx.restore();
    void TRAIN_LEN;
  }

  function drawMedkits(g) {
    const TS = v.TS;
    for (const m of g.medkits) {
      const x = sx(m.x);
      const y = sy(m.y);
      if (!m.up) {
        ctx.strokeStyle = "rgba(109,255,154,0.18)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, TS * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const pulse = 1 + Math.sin(g.time * 5) * 0.08;
      const s = TS * 0.34 * pulse;
      ctx.fillStyle = "rgba(109,255,154,0.18)";
      ctx.beginPath();
      ctx.arc(x, y, s * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4fff7";
      rr(ctx, x - s, y - s, s * 2, s * 2, s * 0.35);
      ctx.fill();
      ctx.fillStyle = "#2fd36b";
      ctx.fillRect(x - s * 0.22, y - s * 0.7, s * 0.44, s * 1.4);
      ctx.fillRect(x - s * 0.7, y - s * 0.22, s * 1.4, s * 0.44);
    }
  }

  function drawPlayer(g, p) {
    if (!p.alive) return;
    const TS = v.TS;
    const col = TEAM[p.team];
    const x = sx(p.x);
    const y = sy(p.y);
    const r = p.r * TS * 1.12;
    const def = gunOf(p).def;
    const a = p.facing;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.15, y + r * 0.35, r * 1.05, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // gun
    if (p.mode === "combat") {
      // the actual gun, side-on, held out in the facing direction (mirrored
      // when facing left so it's never upside down)
      const len = (GUN_LEN[def.id] || 0.8) * TS * 1.15;
      const back = p.recoil * TS * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      if (Math.cos(a) < 0) ctx.scale(1, -1);
      ctx.translate(r * 0.15 - back, 0);
      // lighter metal + a faint halo so it reads against the dark floor
      ctx.shadowColor = "rgba(255,255,255,0.55)";
      ctx.shadowBlur = Math.max(2, TS * 0.12);
      drawGun(ctx, def.id, len, true);
      ctx.shadowBlur = 0;
      if (p.recoil > 0.6) {
        ctx.fillStyle = "rgba(255,230,150,0.9)";
        ctx.beginPath();
        ctx.arc(len * 1.02, -len * 0.06, TS * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // hammer for build/edit
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = "#c9a26b";
      ctx.fillRect(r * 0.4, -TS * 0.05, TS * 0.5, TS * 0.1);
      ctx.fillStyle = p.mode === "edit" ? "#ffd23f" : "#d7dde8";
      ctx.fillRect(r * 0.4 + TS * 0.42, -TS * 0.16, TS * 0.16, TS * 0.32);
      ctx.restore();
    }
    // body
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.arc(x - r * 0.08, y - r * 0.1, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // status effects
    if (p.slowT > 0) {
      ctx.fillStyle = "rgba(160,230,255,0.45)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(200,245,255,0.9)";
      ctx.lineWidth = Math.max(1.5, TS * 0.07);
      ctx.setLineDash([TS * 0.12, TS * 0.08]);
      ctx.beginPath();
      ctx.arc(x, y, r + TS * 0.12, g.time * 2, g.time * 2 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.burnT > 0) {
      for (let k = 0; k < 3; k++) {
        const a2 = g.time * 9 + k * 2.1;
        const fx = x + Math.cos(a2) * r * 0.6;
        const fy = y - r * 0.4 - Math.abs(Math.sin(a2 * 1.3)) * TS * 0.35;
        ctx.fillStyle = k % 2 ? "rgba(255,200,80,0.85)" : "rgba(255,110,40,0.8)";
        ctx.beginPath();
        ctx.arc(fx, fy, TS * (0.09 + 0.04 * Math.sin(a2 * 2)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (p.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${p.hitFlash * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1, TS * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // hp bar
    const bw = TS * 1.15;
    const bh = Math.max(3, TS * 0.15);
    const bx = x - bw / 2;
    const by = y - r - bh - TS * 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    rr(ctx, bx - 1, by - 1, bw + 2, bh + 2, bh / 2);
    ctx.fill();
    const k = Math.max(0, p.hp / (p.maxHp || MAX_HP));
    ctx.fillStyle = k > 0.5 ? "#5df08a" : k > 0.25 ? "#ffd23f" : "#ff5a5a";
    rr(ctx, bx, by, Math.max(bh, bw * k), bh, bh / 2);
    ctx.fill();
    // blue shield bar (from cards) sits on top of the health bar
    if (p.maxShield > 0) {
      const sh = Math.max(2, bh * 0.7);
      const sy2 = by - sh - 1.5;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      rr(ctx, bx - 1, sy2 - 1, bw + 2, sh + 2, sh / 2);
      ctx.fill();
      if (p.shield > 0) {
        ctx.fillStyle = "#4fb0ff";
        rr(ctx, bx, sy2, Math.max(sh, bw * (p.shield / p.maxShield)), sh, sh / 2);
        ctx.fill();
      }
    }
    // name tag (online / 2v2) and a marker on this phone's own player
    if (v.tags) {
      ctx.font = `800 ${Math.round(TS * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      const nm = p.name || "";
      ctx.strokeText(nm, x, by - TS * 0.05);
      ctx.fillStyle = p.id === v.local ? "#ffffff" : col.light;
      ctx.fillText(nm, x, by - TS * 0.05);
    }
    if (v.tags && p.id === v.local) {
      ctx.fillStyle = "#ffd23f";
      const ty = by - TS * 0.62;
      ctx.beginPath();
      ctx.moveTo(x - TS * 0.16, ty - TS * 0.18);
      ctx.lineTo(x + TS * 0.16, ty - TS * 0.18);
      ctx.lineTo(x, ty);
      ctx.fill();
    }
    // reload ring
    if (p.reloadT > 0) {
      const t = 1 - p.reloadT / (gunOf(p).def.reload * (p.buffs ? p.buffs.reload : 1));
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(2, TS * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, r + TS * 0.18, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBullets(g) {
    const TS = v.TS;
    for (const b of g.bullets) {
      if (b.kind === "lob") {
        const x = sx(b.x);
        const y = sy(b.y);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(x, y, TS * 0.18, TS * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b.def.color;
        ctx.beginPath();
        ctx.arc(x, y - b.h * TS, TS * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#1a2a0a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // landing warning
        ctx.strokeStyle = "rgba(255,90,90,0.5)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(sx(b.tx), sy(b.ty), b.def.radius * TS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      const x = sx(b.x);
      const y = sy(b.y);
      if (b.def.slow) {
        // frost: icy shards
        ctx.fillStyle = "rgba(190,240,255,0.85)";
        ctx.beginPath();
        ctx.arc(x, y, TS * (0.1 + Math.min(0.12, b.age * 0.3)), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (b.def.bounce) {
        ctx.save();
        ctx.shadowColor = b.def.color;
        ctx.shadowBlur = TS * 0.4;
        ctx.fillStyle = b.def.color;
        ctx.beginPath();
        ctx.arc(x, y, TS * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (b.def.flame) {
        const k = Math.min(1, b.age / 0.4);
        ctx.fillStyle = `rgba(255,${Math.round(200 - k * 120)},60,${0.85 - k * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, TS * (0.12 + k * 0.28), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (b.kind === "rocket") {
        ctx.strokeStyle = "rgba(220,220,220,0.35)";
        ctx.lineWidth = TS * 0.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - b.dx * TS * 1.2, y - b.dy * TS * 1.2);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(b.dy, b.dx));
        ctx.fillStyle = "#e9edf3";
        ctx.fillRect(-TS * 0.3, -TS * 0.09, TS * 0.42, TS * 0.18);
        ctx.fillStyle = b.def.color;
        ctx.beginPath();
        ctx.moveTo(TS * 0.12, -TS * 0.09);
        ctx.lineTo(TS * 0.26, 0);
        ctx.lineTo(TS * 0.12, TS * 0.09);
        ctx.fill();
        ctx.fillStyle = "#ffcf5a";
        ctx.beginPath();
        ctx.arc(-TS * 0.34, 0, TS * 0.08 + Math.random() * TS * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.lineCap = "butt";
        continue;
      }
      const tail = Math.min(TS * 0.9, b.speed * TS * 0.025);
      ctx.strokeStyle = b.def.color;
      ctx.lineWidth = Math.max(1.5, TS * 0.08);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - b.dx * tail, y - b.dy * tail);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
  }

  function drawFx(g) {
    const TS = v.TS;
    for (const b of g.beams) {
      const k = b.t / b.life;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineCap = "round";
      ctx.lineWidth = TS * 0.35 * (1 - k);
      ctx.beginPath();
      ctx.moveTo(sx(b.x0), sy(b.y0));
      ctx.lineTo(sx(b.x1), sy(b.y1));
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = TS * 0.1 * (1 - k);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineCap = "butt";
    }
    for (const b of g.booms) {
      const k = b.t / b.life;
      const r = b.R * TS * (0.4 + k * 0.7);
      ctx.fillStyle = `rgba(255,${Math.round(210 - k * 120)},90,${(1 - k) * 0.55})`;
      ctx.beginPath();
      ctx.arc(sx(b.x), sy(b.y), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,240,200,${1 - k})`;
      ctx.lineWidth = TS * 0.12 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(sx(b.x), sy(b.y), b.R * TS * (0.3 + k), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of g.particles) {
      const k = p.t / p.life;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.color;
      const s = p.size * TS * (1 - k * 0.5);
      ctx.fillRect(sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of g.texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${Math.round(TS * 0.55)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      const y = sy(t.y) - k * TS * 0.9;
      ctx.strokeText(t.text, sx(t.x), y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, sx(t.x), y);
    }
    ctx.globalAlpha = 1;
  }

  // ---- previews (local player only) ---------------------------------------------

  function drawAimPreview(g, p) {
    if (!p.alive || !p.aiming || p.mode !== "combat" || g.state === "matchEnd") return;
    const TS = v.TS;
    const def = gunOf(p).def;
    const a = p.aimAngle;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const x0 = sx(p.x);
    const y0 = sy(p.y);
    const ready = p.cd <= 0 && p.reloadT <= 0 && !p.burst;
    const alpha = ready ? 1 : 0.5;

    if (def.type === "lob") {
      const dist = Math.max(2, Math.min(def.range, def.range * p.aimMag));
      const tx = p.x + dx * dist;
      const ty = p.y + dy * dist;
      const T = dist / def.speed;
      const H = Math.min(2.4, 0.6 + T * 1.6);
      ctx.fillStyle = `rgba(255,255,255,${0.55 * alpha})`;
      for (let i = 1; i <= 22; i++) {
        const k = i / 23;
        const hx = p.x + (tx - p.x) * k;
        const hy = p.y + (ty - p.y) * k - 4 * k * (1 - k) * H;
        ctx.beginPath();
        ctx.arc(sx(hx), sy(hy), TS * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,120,90,${0.16 * alpha})`;
      ctx.strokeStyle = `rgba(255,150,120,${0.7 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(tx), sy(ty), def.radius * TS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    const tr = traceShot(g, p, a, def);
    const x1 = x0 + dx * tr.len * TS;
    const y1 = y0 + dy * tr.len * TS;
    if (def.spread >= 0.1) {
      const half = def.spread / 2;
      const R = def.range * TS;
      ctx.fillStyle = `rgba(255,255,255,${0.1 * alpha})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.arc(x0, y0, R, a - half, a + half);
      ctx.closePath();
      ctx.fill();
    }
    const hot = tr.onTarget;
    const color = def.type === "rail" ? "92,246,255" : hot ? "255,90,90" : "255,255,255";
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(${color},${(hot ? 0.55 : 0.32) * alpha})`;
    ctx.lineWidth = TS * 0.2;
    ctx.beginPath();
    ctx.moveTo(x0 + dx * TS * 0.5, y0 + dy * TS * 0.5);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = `rgba(${color},${0.75 * alpha})`;
    ctx.beginPath();
    ctx.arc(x1, y1, TS * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBuildPreview(g, p) {
    const dragging = !!p.buildAim;
    if (!p.alive || (p.mode !== "build" && !dragging) || g.state === "matchEnd") return;
    const TS = v.TS;
    const angle = dragging ? p.buildAim.angle : p.aiming ? p.aimAngle : p.facing;
    const mag = dragging ? p.buildAim.mag : p.aiming ? p.aimMag : 0;
    const place = buildPreview(g, p, angle, mag);
    const afford = p.mats >= WALL_COST;
    const ok = place.valid && afford;
    const strong = dragging || p.aiming ? 1 : 0.55;
    const pulse = 0.85 + Math.sin(g.time * 8) * 0.15;
    // a ghost of the raised wall that will land: footprint on the floor,
    // translucent block above it
    const lift = TS * 0.3;
    place.cells.forEach(([cx, cy], i) => {
      const bad = place.blocked[i] || !afford;
      const x = sx(cx);
      const y = sy(cy);
      ctx.fillStyle = bad ? `rgba(255,80,80,${0.18 * strong})` : `rgba(90,255,150,${0.16 * strong})`;
      ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = bad ? `rgba(160,40,40,${0.45 * strong})` : `rgba(40,150,90,${0.45 * strong * pulse})`;
      ctx.fillRect(x, y + TS - lift, TS, lift);
      ctx.fillStyle = bad ? `rgba(255,90,90,${0.35 * strong})` : `rgba(110,255,170,${0.38 * strong * pulse})`;
      ctx.fillRect(x, y - lift, TS, TS);
    });
    const c0 = place.cells[0];
    const c2 = place.cells[2];
    const gx = sx(Math.min(c0[0], c2[0]));
    const gy = sy(Math.min(c0[1], c2[1])) - lift;
    const gw = (Math.abs(c2[0] - c0[0]) + 1) * TS;
    const gh = (Math.abs(c2[1] - c0[1]) + 1) * TS;
    ctx.strokeStyle = ok ? `rgba(160,255,200,${0.95 * strong})` : `rgba(255,120,120,${0.95 * strong})`;
    ctx.lineWidth = Math.max(1.5, TS * 0.08);
    ctx.strokeRect(gx + 1, gy + 1, gw - 2, gh - 2);
    if (!afford) label("need 30 ▰", gx + gw / 2, gy - TS * 0.45, TS * 0.5, "#ff9090", "center", 900);
    if (dragging) {
      // the build stick's crosshair, on the middle of the wall it will drop
      const [mx2, my2] = place.cells[1];
      const cx = sx(mx2 + 0.5);
      const cy = sy(my2 + 0.5) - lift;
      const r = TS * 0.62;
      const col = ok ? "#a0ffc8" : "#ff8080";
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, TS * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx - r * 0.25, cy);
      ctx.moveTo(cx + r * 0.25, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy - r * 0.25);
      ctx.moveTo(cx, cy + r * 0.25);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.5, TS * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    // tether from builder to the drop point
    const [mx, my] = place.cells[1];
    ctx.setLineDash([TS * 0.15, TS * 0.15]);
    ctx.strokeStyle = ok ? `rgba(140,255,190,${0.5 * strong})` : `rgba(255,110,110,${0.5 * strong})`;
    ctx.lineWidth = Math.max(1, TS * 0.05);
    ctx.beginPath();
    ctx.moveTo(sx(p.x), sy(p.y));
    ctx.lineTo(sx(mx + 0.5), sy(my + 0.5));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawEditPreview(g, p) {
    const dragging = !!p.editAim;
    if (!p.alive || (p.mode !== "edit" && !dragging) || g.state === "matchEnd") return;
    const TS = v.TS;
    const angle = dragging ? p.editAim.angle : p.aiming ? p.aimAngle : p.facing;
    const target = dragging ? quickEditTarget(g, p, { angle }) : editPreview(g, p, angle);
    // all of your walls get a faint outline so you can see what's editable
    for (const wall of g.world.walls) {
      if (wall.owner !== p.id) continue;
      wall.cells.forEach((c) => {
        if (!c.alive) return;
        ctx.strokeStyle = "rgba(255,210,63,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx(c.x) + 1.5, sy(c.y) + 1.5, TS - 3, TS - 3);
      });
    }
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.setLineDash([TS * 0.12, TS * 0.12]);
    ctx.strokeStyle = "rgba(255,210,63,0.45)";
    ctx.lineWidth = Math.max(1, TS * 0.06);
    ctx.beginPath();
    ctx.moveTo(sx(p.x), sy(p.y));
    const reach = target ? Math.hypot(target.cx + 0.5 - p.x, target.cy + 0.5 - p.y) : 4.6;
    ctx.lineTo(sx(p.x + dx * reach), sy(p.y + dy * reach));
    ctx.stroke();
    ctx.setLineDash([]);
    if (!target) return;
    const { wall, i } = target;
    wall.cells.forEach((c, j) => {
      if (!c.alive) return;
      ctx.strokeStyle = j === i ? "#ffd23f" : "rgba(255,210,63,0.6)";
      ctx.lineWidth = j === i ? Math.max(2, TS * 0.12) : Math.max(1, TS * 0.06);
      ctx.strokeRect(sx(c.x) + 2, sy(c.y) + 2, TS - 4, TS - 4);
    });
    const c = wall.cells[i];
    ctx.fillStyle = "rgba(255,210,63,0.28)";
    ctx.fillRect(sx(c.x) + 2, sy(c.y) + 2, TS - 4, TS - 4);
    // icon: ✕ to cut a gap, ↺ to restore it
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(TS * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(wall.edit === i ? "↺" : "✕", sx(c.x + 0.5), sy(c.y + 0.52));
  }

  // ---- HUD -----------------------------------------------------------------------

  function label(text, x, y, size, color = "#fff", align = "center", weight = 800) {
    ctx.font = `${weight} ${Math.round(size)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function hpBar(x, y, w, h, p, align) {
    const k = Math.max(0, p.hp / (p.maxHp || MAX_HP));
    ctx.fillStyle = "rgba(8,12,20,0.7)";
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    const fw = Math.max(h, (w - 4) * k);
    ctx.fillStyle = TEAM[p.team].main;
    rr(ctx, align === "right" ? x + w - 2 - fw : x + 2, y + 2, fw, h - 4, (h - 4) / 2);
    ctx.fill();
    // shield: a blue bar overlaid along the bottom of the health bar
    if (p.maxShield > 0 && p.shield > 0) {
      const sw = Math.max(2, (w - 4) * (p.shield / p.maxShield));
      ctx.fillStyle = "#4fb0ff";
      rr(ctx, align === "right" ? x + w - 2 - sw : x + 2, y + h - 2 - h * 0.32, sw, h * 0.32, h * 0.16);
      ctx.fill();
    }
    label(`${Math.ceil(p.hp)}${p.shield > 0 ? ` +${Math.ceil(p.shield)}` : ""}`, x + w / 2, y + h / 2 + 0.5, h * 0.68, "#fff");
  }

  // Run fn in a pad's own frame: origin at (x, y), rotated to face its player.
  function inFrame(pad, x, y, fn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pad.rot);
    fn();
    ctx.restore();
  }

  function drawPause() {
    const P = v.L.pause;
    ctx.fillStyle = "rgba(8,12,20,0.7)";
    ctx.beginPath();
    ctx.arc(P.x, P.y, P.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    const bw = P.r * 0.22;
    const bh = P.r * 0.75;
    ctx.fillRect(P.x - bw * 1.5, P.y - bh / 2, bw, bh);
    ctx.fillRect(P.x + bw * 0.5, P.y - bh / 2, bw, bh);
  }

  function timerText(g) {
    const tl = Math.max(0, Math.ceil(g.timeLeft));
    return `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`;
  }

  // Round countdown / FIGHT! / round result, from one player's point of view.
  function drawBanner(g, me, x, y, rot, s, bandLen) {
    const u = v.L.u * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (g.state === "countdown") {
      const n = Math.ceil(g.stateT);
      const k = g.stateT - Math.floor(g.stateT);
      ctx.globalAlpha = Math.min(1, k * 2 + 0.2);
      label(String(n), 0, 0, (60 + k * 30) * u, "#fff", "center", 900);
      ctx.globalAlpha = 1;
      label(`ROUND ${g.round}`, 0, 50 * u, 14 * u, "rgba(255,255,255,0.8)");
    } else if (g.state === "fight" && g.timeLeft > 89) {
      ctx.globalAlpha = Math.max(0, g.timeLeft - 89);
      label("FIGHT!", 0, 0, 56 * u, "#ffd23f", "center", 900);
      ctx.globalAlpha = 1;
    } else if (g.state === "roundEnd") {
      const won = g.roundWinner === me;
      const txt = g.roundWinner < 0 ? "DRAW" : won ? "ROUND WON" : "ROUND LOST";
      ctx.fillStyle = "rgba(8,12,20,0.55)";
      ctx.fillRect(-bandLen / 2, -34 * u, bandLen, 68 * u);
      label(txt, 0, 0, 34 * u, g.roundWinner < 0 ? "#fff" : won ? "#6dff9a" : "#ff6b6b", "center", 900);
    }
    ctx.restore();
  }

  function drawHud(g, input, meta) {
    const L = v.L;
    const u = L.u;
    const W = v.W;
    const H = v.H;
    const cx = W / 2;

    if (!L.pvp) {
      const me = meta.local ?? 0;
      const ffa = (g.numTeams || 2) > 2;
      // top bar
      const ty = 20 * u;
      if (ffa) {
        // free-for-all: one score chip per player, in their colour
        const n = g.numTeams;
        const chip = 30 * u;
        const tw = 74 * u + n * (chip + 4 * u);
        ctx.fillStyle = "rgba(8,12,20,0.72)";
        rr(ctx, cx - tw / 2, 4 * u, tw, 32 * u, 16 * u);
        ctx.fill();
        label(timerText(g), cx - tw / 2 + 36 * u, ty - 4 * u, 13 * u, g.timeLeft <= 10 ? "#ff7a7a" : "#fff");
        label(`R${g.round} · FIRST TO 3`, cx - tw / 2 + 36 * u, ty + 9 * u, 6.5 * u, "rgba(255,255,255,0.6)", "center", 700);
        for (let t = 0; t < n; t++) {
          const x = cx - tw / 2 + 72 * u + t * (chip + 4 * u);
          ctx.fillStyle = TEAM[t].main;
          rr(ctx, x, 8 * u, chip, 24 * u, 10 * u);
          ctx.fill();
          if (g.players[me] && g.players[me].team === t) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          label(String(g.score[t] ?? 0), x + chip / 2, ty, 15 * u, "#0b1220", "center", 900);
        }
      }
      if (!ffa) {
      ctx.fillStyle = "rgba(8,12,20,0.72)";
      rr(ctx, cx - 120 * u, 4 * u, 240 * u, 32 * u, 16 * u);
      ctx.fill();
      ctx.fillStyle = TEAM[0].main;
      rr(ctx, cx - 116 * u, 8 * u, 46 * u, 24 * u, 12 * u);
      ctx.fill();
      ctx.fillStyle = TEAM[1].main;
      rr(ctx, cx + 70 * u, 8 * u, 46 * u, 24 * u, 12 * u);
      ctx.fill();
      label(String(g.score[0]), cx - 93 * u, ty, 17 * u);
      label(String(g.score[1]), cx + 93 * u, ty, 17 * u);
      label(timerText(g), cx, ty - 4 * u, 14 * u, g.timeLeft <= 10 ? "#ff7a7a" : "#fff");
      label(`ROUND ${g.round} · FIRST TO 3`, cx, ty + 9 * u, 7.5 * u, "rgba(255,255,255,0.6)", "center", 700);
      }
      // HP bars: blue team / first half on the left, red team / second half on the right
      const hw = Math.min(170 * u, cx - (ffa ? 110 : 140) * u - 14 * u);
      const ew = Math.min(hw, 104 * u);
      const sides = ffa
        ? [g.players.filter((q, i) => i < Math.ceil(g.players.length / 2)), g.players.filter((q, i) => i >= Math.ceil(g.players.length / 2))]
        : [g.players.filter((q) => q.team === 0), g.players.filter((q) => q.team === 1)];
      sides.forEach((list, side) => {
        const w = side === 0 ? hw : ew;
        const x = side === 0 ? 12 * u : W - 54 * u - ew;
        const align = side === 0 ? "left" : "right";
        if (list.length === 1) {
          const q = list[0];
          const nm = q.id === me && !meta.tags ? meta.names[q.id] : q.name || meta.names[q.id];
          label(nm + (q.id === me && meta.tags ? " (you)" : ""), side === 0 ? 14 * u : W - 56 * u, 12 * u, 9 * u, TEAM[q.team].light, align, 800);
          hpBar(x, 18 * u, w, 16 * u, q, align);
        } else {
          list.forEach((q, k) => {
            const y = 3 * u + k * 18 * u;
            hpBar(x, y + 6 * u, w, 11 * u, q, align);
            label(q.name + (q.id === me ? " ·you" : ""), side === 0 ? x + 2 * u : x + w - 2 * u, y + 2 * u, 6.5 * u, q.id === me ? "#fff" : TEAM[q.team].light, align, 800);
          });
        }
      });
      if (meta.net) {
        const n = meta.net;
        const good = n.ping < 120;
        const txt = `${n.host ? "HOST" : "ONLINE"} · ${n.direct ? "direct" : "relay"}${n.ping ? ` · ${n.ping} ms` : ""}`;
        label(txt, cx, 44 * u, 7.5 * u, n.ping > 250 ? "#ff8080" : good ? "#6dff9a" : "#ffd23f", "center", 800);
      }
    } else if (L.portrait) {
      for (const pad of L.pads) {
        inFrame(pad, pad.info.x, pad.info.y, () => {
          const mine = pad.team;
          ctx.fillStyle = "rgba(8,12,20,0.78)";
          rr(ctx, -66 * u, -9 * u, 132 * u, 18 * u, 9 * u);
          ctx.fill();
          ctx.fillStyle = TEAM[mine].main;
          rr(ctx, -64 * u, -7 * u, 26 * u, 14 * u, 7 * u);
          ctx.fill();
          ctx.fillStyle = TEAM[1 - mine].main;
          rr(ctx, 38 * u, -7 * u, 26 * u, 14 * u, 7 * u);
          ctx.fill();
          label(String(g.score[mine]), -51 * u, 0.5 * u, 10 * u);
          label(String(g.score[1 - mine]), 51 * u, 0.5 * u, 10 * u);
          label(`${timerText(g)} · R${g.round}`, 0, 0.5 * u, 9 * u, g.timeLeft <= 10 ? "#ff7a7a" : "#fff");
        });
      }
      g.players.forEach((p, i) => {
        const len = W * 0.7;
        const y = i === 0 ? H - 5 * u : 0;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect((W - len) / 2, y, len, 5 * u);
        ctx.fillStyle = TEAM[i].main;
        const k = Math.max(0, p.hp / (p.maxHp || MAX_HP));
        ctx.fillRect((W - len * k) / 2, y, len * k, 5 * u);
        if (p.maxShield > 0 && p.shield > 0) {
          const ks = p.shield / p.maxShield;
          ctx.fillStyle = "#4fb0ff";
          ctx.fillRect((W - len * ks) / 2, i === 0 ? y - 4 * u : 5 * u, len * ks, 3 * u);
        }
      });
    } else {
      // shared screen: a compact score pill both players can read
      ctx.fillStyle = "rgba(8,12,20,0.78)";
      rr(ctx, cx - 70 * u, 1 * u, 140 * u, 16 * u, 8 * u);
      ctx.fill();
      ctx.fillStyle = TEAM[0].main;
      rr(ctx, cx - 68 * u, 3 * u, 26 * u, 12 * u, 6 * u);
      ctx.fill();
      ctx.fillStyle = TEAM[1].main;
      rr(ctx, cx + 42 * u, 3 * u, 26 * u, 12 * u, 6 * u);
      ctx.fill();
      label(String(g.score[0]), cx - 55 * u, 9.5 * u, 10 * u);
      label(String(g.score[1]), cx + 55 * u, 9.5 * u, 10 * u);
      label(`${timerText(g)} · R${g.round}`, cx, 9.5 * u, 9 * u, g.timeLeft <= 10 ? "#ff7a7a" : "#fff");
      // each player's health as a strip along their own edge of the phone
      g.players.forEach((p, i) => {
        const len = H * 0.7;
        const x = i === 0 ? 0 : W - 5 * u;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x, (H - len) / 2, 5 * u, len);
        const k = Math.max(0, p.hp / (p.maxHp || MAX_HP));
        ctx.fillStyle = TEAM[i].main;
        ctx.fillRect(x, (H - len * k) / 2, 5 * u, len * k);
        if (p.maxShield > 0 && p.shield > 0) {
          const ks = p.shield / p.maxShield;
          ctx.fillStyle = "#4fb0ff";
          ctx.fillRect(i === 0 ? 5 * u : W - 8 * u, (H - len * ks) / 2, 3 * u, len * ks);
        }
      });
    }

    if (g.state === "cards") {
      drawCardPhase(g, meta);
      drawPause();
      return;
    }
    drawPause();
    // buttons first so a dragged stick knob stays visible on top of them
    // on a shared phone pad i is player i; otherwise the one pad is this phone's player
    const padP = (pad) => g.players[L.pvp ? pad.team : meta.local ?? 0];
    for (const pad of L.pads) drawButtons(g, padP(pad), pad, input);
    for (const pad of L.pads) drawSticks(g, padP(pad), input, pad);

    if (!L.pvp) {
      const me = meta.local ?? 0;
      drawBanner(g, g.players[me].team, cx, H * 0.42, 0, 1, W);
      const mode = g.players[me].mode;
      if (g.state === "fight" && mode !== "combat") {
        const by = meta.net ? 52 * u : 40 * u;
        ctx.fillStyle = mode === "edit" ? "rgba(255,210,63,0.9)" : "rgba(90,255,150,0.9)";
        rr(ctx, cx - 50 * u, by, 100 * u, 18 * u, 9 * u);
        ctx.fill();
        label(mode === "edit" ? "EDIT MODE" : "BUILD MODE", cx, by + 9 * u, 9 * u, "#0b1220", "center", 900);
      }
    } else {
      for (const pad of L.pads) drawBanner(g, pad.team, pad.center.x, pad.center.y, pad.rot, L.portrait ? 0.7 : 0.62, L.portrait ? W : H);
    }
  }

  // ---- buff cards between rounds -----------------------------------------------

  function wrapText(text, maxW, size, weight = 700) {
    ctx.font = `${weight} ${Math.round(size)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  // one card in its pad's frame, centred on (0,0)
  function drawCard(card, w, h, state) {
    const R = RARITIES[card.rarity];
    const u = v.L.u * (w / (104 * v.L.u));
    ctx.save();
    if (state === "dim") ctx.globalAlpha = 0.3;
    if (card.rarity === "epic" || card.rarity === "legendary" || state === "picked") {
      ctx.shadowColor = state === "picked" ? "#ffffff" : R.color;
      ctx.shadowBlur = 18;
    }
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, shade(R.color, 0.42));
    grad.addColorStop(0.55, "#141c2e");
    grad.addColorStop(1, "#0d1322");
    ctx.fillStyle = grad;
    rr(ctx, -w / 2, -h / 2, w, h, 12 * u);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = state === "picked" ? "#ffffff" : R.color;
    ctx.lineWidth = state === "picked" ? 4 : card.rarity === "common" ? 1.5 : 2.5;
    ctx.stroke();
    // rarity ribbon
    ctx.fillStyle = R.color;
    rr(ctx, -w / 2 + 8 * u, -h / 2 + 8 * u, w - 16 * u, 15 * u, 7 * u);
    ctx.fill();
    label(R.name.toUpperCase(), 0, -h / 2 + 15.5 * u, 8 * u, "#0b1220", "center", 900);
    // emblem
    ctx.save();
    ctx.translate(0, -h * 0.13);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    drawCardIcon(ctx, card.icon, w * 0.42);
    ctx.restore();
    // name + effect
    label(card.name, 0, h * 0.17, 11 * u, "#ffffff", "center", 900);
    const lines = wrapText(card.desc, w - 14 * u, 8.5 * u, 700);
    lines.slice(0, 3).forEach((ln, i) => label(ln, 0, h * 0.29 + i * 10.5 * u, 8.5 * u, R.color, "center", 700));
    if (state === "picked") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(w / 2 - 12 * u, -h / 2 + 12 * u, 11 * u, 0, Math.PI * 2);
      ctx.fill();
      label("✓", w / 2 - 12 * u, -h / 2 + 12.5 * u, 13 * u, "#0b1220", "center", 900);
    }
    ctx.restore();
  }

  function drawCardPhase(g, meta) {
    const L = v.L;
    const u = L.u;
    ctx.fillStyle = "rgba(5,8,14,0.78)";
    ctx.fillRect(0, 0, v.W, v.H);
    for (const pad of L.pads) {
      const pid = L.pvp ? pad.team : meta.local ?? 0;
      const p = g.players[pid];
      const hand = g.offers[pid] || [];
      const picked = g.picks[pid];
      const rects = cardRects(L, pad, hand.length);
      const lw = rects[0]?.lw || 100;
      const lh = rects[0]?.lh || 140;
      // title / footer in the pad's frame
      const c = rects[1] || rects[0];
      inFrame(pad, c.cx, c.cy, () => {
        const who = L.pvp ? `${meta.names[pid]} · ` : "";
        label(`${who}ROUND ${g.round} · PICK A CARD`, 0, -lh / 2 - 16 * u, 12 * u, L.pvp ? TEAM[p.team].light : "#ffffff", "center", 900);
        const t = Math.max(0, Math.ceil(g.stateT));
        const sub = picked >= 0
          ? (g.picks.every((k) => k >= 0) ? "Starting…" : "Waiting for the other player…")
          : `Tap a card · ${t}s`;
        label(sub, 0, lh / 2 + 15 * u, 9.5 * u, picked >= 0 ? "#6dff9a" : "rgba(255,255,255,0.7)", "center", 800);
        // cards already held this match
        if (p.cards.length) {
          const size = 13 * u;
          const total = p.cards.length * (size + 4 * u);
          p.cards.forEach((id, k) => {
            const cd = CARD_BY_ID[id];
            const x = -total / 2 + k * (size + 4 * u) + size / 2;
            const y = lh / 2 + 32 * u;
            ctx.fillStyle = RARITIES[cd.rarity].color;
            rr(ctx, x - size / 2, y - size / 2, size, size, 3 * u);
            ctx.fill();
            ctx.save();
            ctx.translate(x, y);
            drawCardIcon(ctx, cd.icon, size * 0.75);
            ctx.restore();
          });
        }
      });
      hand.forEach((id, i) => {
        const r = rects[i];
        const state = picked < 0 ? "open" : picked === i ? "picked" : "dim";
        inFrame(pad, r.cx, r.cy, () => drawCard(CARD_BY_ID[id], lw, lh, state));
      });
    }
  }

  function drawStickBase(x, y, R, active, tint) {
    ctx.fillStyle = active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? tint : "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function knobPos(stick, base, R) {
    if (!stick) return base;
    const dx = stick.x - stick.bx;
    const dy = stick.y - stick.by;
    const d = Math.hypot(dx, dy);
    const c = Math.min(d, R);
    return d > 0 ? { x: base.x + (dx / d) * c, y: base.y + (dy / d) * c } : base;
  }

  function drawSticks(g, p, input, pad) {
    const L = v.L;
    const u = L.u;
    const R = L.R;
    const mode = p.mode;
    const s = (input.st.ps && input.st.ps[pad.team]) || {};
    // move
    const m = s.move;
    const mb = m ? { x: m.bx, y: m.by } : pad.move;
    drawStickBase(mb.x, mb.y, R, !!m, L.pvp ? TEAM[pad.team].main : "rgba(255,255,255,0.5)");
    const mk = knobPos(m, mb, R);
    ctx.fillStyle = m ? "rgba(255,255,255,0.75)" : L.pvp ? TEAM[pad.team].main : "rgba(255,255,255,0.35)";
    ctx.globalAlpha = m || !L.pvp ? 1 : 0.6;
    ctx.beginPath();
    ctx.arc(mk.x, mk.y, R * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!m) inFrame(pad, mb.x, mb.y, () => label("MOVE", 0, R + 12 * u, 9 * u, "rgba(255,255,255,0.45)"));

    // aim / build / edit
    const a = s.aim && !s.aim.mouse ? s.aim : null;
    const ab = a ? { x: a.bx, y: a.by } : pad.aim;
    const tint = mode === "combat" ? "#ff6b6b" : mode === "build" ? "#5aff96" : "#ffd23f";
    drawStickBase(ab.x, ab.y, R, !!a, tint);
    const ak = knobPos(a, ab, R);
    if (a && a.dragged && Math.hypot(a.x - a.bx, a.y - a.by) < R * 0.22) {
      inFrame(pad, ab.x, ab.y, () => label("CANCEL", 0, -R - 12 * u, 9 * u, "rgba(255,255,255,0.7)"));
    }
    const kr = R * 0.46;
    ctx.fillStyle = tint;
    ctx.globalAlpha = a ? 0.95 : 0.7;
    ctx.beginPath();
    ctx.arc(ak.x, ak.y, kr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    inFrame(pad, ak.x, ak.y, () => drawModeIcon(0, 0, kr * 0.62, mode, "#0b1220"));
    if (!a) {
      const word = L.pvp
        ? mode === "combat" ? "AIM · RELEASE" : mode === "build" ? "RELEASE TO BUILD" : "AIM AT WALL"
        : mode === "combat" ? "AIM · RELEASE TO SHOOT" : mode === "build" ? "DRAG · RELEASE TO BUILD" : "AIM AT YOUR WALL · RELEASE";
      inFrame(pad, ab.x, ab.y, () => label(word, 0, R + 12 * u, 8 * u, "rgba(255,255,255,0.45)"));
    }
  }

  function drawModeIcon(x, y, s, mode, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.22);
    if (mode === "combat") {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
      ctx.moveTo(x - s, y);
      ctx.lineTo(x - s * 0.3, y);
      ctx.moveTo(x + s * 0.3, y);
      ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y - s * 0.3);
      ctx.moveTo(x, y + s * 0.3);
      ctx.lineTo(x, y + s);
      ctx.stroke();
    } else if (mode === "build") {
      brick(x, y, s, color);
    } else {
      // pencil
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-s * 0.9, -s * 0.22, s * 1.4, s * 0.44);
      ctx.beginPath();
      ctx.moveTo(s * 0.55, -s * 0.22);
      ctx.lineTo(s * 0.95, 0);
      ctx.lineTo(s * 0.55, s * 0.22);
      ctx.fill();
      ctx.restore();
    }
  }

  function brick(x, y, s, color) {
    ctx.fillStyle = color;
    const bw = s * 0.9;
    const bh = s * 0.5;
    const gap = s * 0.12;
    ctx.fillRect(x - bw - gap / 2, y - bh - gap / 2, bw, bh);
    ctx.fillRect(x + gap / 2, y - bh - gap / 2, bw, bh);
    ctx.fillRect(x - bw / 2, y + gap / 2, bw, bh);
  }

  function drawButtons(g, p, pad, input) {
    if (v.buildStyle === "classic") {
      drawButtonsClassic(g, p, pad);
      return;
    }
    const u = v.L.u;
    const B = pad.build;
    const mode = p.mode;
    const drag = input && input.st.ps ? input.st.ps[pad.team].btn : null;
    // a drag that started on BUILD / EDIT: ring + knob like a mini stick
    const ring = (b, color) => {
      const R = v.L.R * 1.6;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const dx = drag.x - drag.bx;
      const dy = drag.y - drag.by;
      const d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(b.x + dx * k, b.y + dy * k, b.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (drag.dragged && d < v.L.R * 0.35) inFrame(pad, b.x, b.y, () => label("CANCEL", 0, -b.r - 12 * u, 8 * u, "#fff"));
    };

    // BUILD: tap = wall in front of you, drag = aim it
    const afford = p.mats >= WALL_COST;
    const building = drag && drag.kind === "build";
    // the build stick's base ring (the knob is the button itself)
    ctx.fillStyle = "rgba(90,255,150,0.06)";
    ctx.strokeStyle = "rgba(90,255,150,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(B.x, B.y, B.r * 1.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    inFrame(pad, B.x, B.y, () => {
      ctx.fillStyle = building ? "#5aff96" : "rgba(8,12,20,0.78)";
      ctx.beginPath();
      ctx.arc(0, 0, B.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = afford ? "rgba(90,255,150,0.9)" : "rgba(255,110,110,0.8)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // fill arc = materials
      ctx.strokeStyle = afford ? "#5aff96" : "#ff8080";
      ctx.lineWidth = Math.max(2, B.r * 0.12);
      ctx.beginPath();
      ctx.arc(0, 0, B.r + 4 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.mats / MAX_MATS));
      ctx.stroke();
      brick(0, -B.r * 0.14, B.r * 0.4, building ? "#0b1220" : afford ? "#5aff96" : "#ff8080");
      label("BUILD", 0, B.r * 0.52, Math.min(8 * u, B.r * 0.28), building ? "#0b1220" : afford ? "#5aff96" : "#ff8080", "center", 900);
      label(`▰ ${Math.floor(p.mats)}`, 0, -B.r - 12 * u, 9.5 * u, afford ? "#cfe9ff" : "#ff8080", "center", 900);
    });
    // EDIT and RESET beside it
    const E = pad.edit;
    const editing = drag && drag.kind === "qedit";
    inFrame(pad, E.x, E.y, () => {
      ctx.fillStyle = editing ? "#ffd23f" : "rgba(8,12,20,0.78)";
      ctx.beginPath();
      ctx.arc(0, 0, E.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,210,63,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawModeIcon(0, -E.r * 0.12, E.r * 0.42, "edit", editing ? "#0b1220" : "#ffd23f");
      label("EDIT", 0, E.r * 0.55, Math.min(7 * u, E.r * 0.3), editing ? "#0b1220" : "#ffd23f", "center", 900);
    });
    const Rz = pad.reset;
    const anyEdit = !!nearestEditedWall(g, p, 30);
    inFrame(pad, Rz.x, Rz.y, () => {
      ctx.fillStyle = "rgba(8,12,20,0.78)";
      ctx.beginPath();
      ctx.arc(0, 0, Rz.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = anyEdit ? "#8fd3ff" : "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
      label("↺", 0, 0, Rz.r * 1.05, anyEdit ? "#8fd3ff" : "rgba(255,255,255,0.3)", "center", 900);
    });
    if (building) ring(B, "#5aff96");
    if (editing) ring(E, "#ffd23f");

    const slots = [pad.slot0, pad.slot1];
    // r is the slot rect in the pad's own frame, centred on the origin
    const frameRect = (s) => ({ x: -s.lw / 2, y: -s.lh / 2, w: s.lw, h: s.lh });
    {
      p.guns.forEach((gun, i) => inFrame(pad, slots[i].cx, slots[i].cy, () => {
        const r = frameRect(slots[i]);
        const active = i === p.slot;
        const tier = TIER_COLOR[gun.def.tier];
        const s = r.h / 34; // text scale relative to the solo-mode slot
        ctx.fillStyle = active ? "rgba(20,28,44,0.92)" : "rgba(8,12,20,0.6)";
        rr(ctx, r.x, r.y, r.w, r.h, 8 * u * s);
        ctx.fill();
        ctx.strokeStyle = active ? tier : "rgba(255,255,255,0.15)";
        ctx.lineWidth = active ? 2.5 : 1;
        ctx.stroke();
        ctx.save();
        ctx.translate(r.x + 4 * u * s, r.y + r.h / 2 + 1 * u * s);
        drawGun(ctx, gun.def.id, 22 * u * s);
        ctx.restore();
        const name = gun.def.name.toUpperCase();
        const tx = r.x + 28 * u * s;
        ctx.font = `800 ${Math.round(8.5 * u * s)}px system-ui, sans-serif`;
        const fit = Math.min(1, (r.w - 34 * u * s) / ctx.measureText(name).width);
        label(name, tx, r.y + r.h * 0.34, 8.5 * u * s * fit, active ? "#fff" : "rgba(255,255,255,0.65)", "left", 800);
        const reloading = active && p.reloadT > 0;
        const txt = reloading ? "RELOADING…" : (gun.reserve !== null && gun.reserve !== undefined
          ? (gun.ammo <= 0 && gun.reserve <= 0 ? "OUT" : `${gun.ammo} · ${gun.reserve} left`)
          : `${gun.ammo} / ${magOf(p, gun)}`);
        label(txt, tx, r.y + r.h * 0.7, 9.5 * u * s, gun.ammo === 0 || reloading ? "#ffb36b" : tier, "left", 800);
        if (reloading) {
          const k = 1 - p.reloadT / (gun.def.reload * (p.buffs ? p.buffs.reload : 1));
          ctx.fillStyle = "#ffb36b";
          ctx.fillRect(r.x + 6 * u, r.y + r.h - 4 * u * s, (r.w - 12 * u) * k, 2 * u);
        } else if (active && p.cd > 0) {
          const k = p.cd / (gun.def.cd + (gun.def.burst - 1) * gun.def.gap);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(r.x + 6 * u, r.y + r.h - 4 * u * s, (r.w - 12 * u) * k, 2 * u);
        }
      }));
    }
  }

  // Classic (OG) build controls: BUILD toggles the aim stick into a build
  // stick; in build mode the weapon slots become EDIT / RESET.
  function drawButtonsClassic(g, p, pad) {
    const u = v.L.u;
    const B = pad.build;
    const mode = p.mode;
    // BUILD toggle (sits over the attack stick, from its player's point of view)
    const on = mode !== "combat";
    inFrame(pad, B.x, B.y, () => {
      ctx.fillStyle = on ? "#5aff96" : "rgba(8,12,20,0.75)";
      ctx.beginPath();
      ctx.arc(0, 0, B.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = on ? "#c8ffdd" : "rgba(90,255,150,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (on) drawModeIcon(0, -B.r * 0.12, B.r * 0.42, "combat", "#0b1220");
      else brick(0, -B.r * 0.12, B.r * 0.4, "#5aff96");
      label(on ? "FIGHT" : "BUILD", 0, B.r * 0.55, Math.min(8 * u, B.r * 0.28), on ? "#0b1220" : "#5aff96", "center", 900);
      // materials beside it
      const mats = Math.floor(p.mats);
      const mx = -B.r - 10 * u;
      label(`▰ ${mats}`, mx, -5 * u, 11 * u, mats >= WALL_COST ? "#cfe9ff" : "#ff8080", "right", 900);
      label(`wall ${WALL_COST}`, mx, 9 * u, 7.5 * u, "rgba(255,255,255,0.5)", "right", 700);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(mx - 40 * u, 17 * u, 40 * u, 3 * u);
      ctx.fillStyle = "#cfe9ff";
      ctx.fillRect(mx - 40 * u, 17 * u, 40 * u * (p.mats / MAX_MATS), 3 * u);
    });

    const slots = [pad.slot0, pad.slot1];
    // r is the slot rect in the pad's own frame, centred on the origin
    const frameRect = (s) => ({ x: -s.lw / 2, y: -s.lh / 2, w: s.lw, h: s.lh });
    if (mode === "combat") {
      p.guns.forEach((gun, i) => inFrame(pad, slots[i].cx, slots[i].cy, () => {
        const r = frameRect(slots[i]);
        const active = i === p.slot;
        const tier = TIER_COLOR[gun.def.tier];
        const s = r.h / 34; // text scale relative to the solo-mode slot
        ctx.fillStyle = active ? "rgba(20,28,44,0.92)" : "rgba(8,12,20,0.6)";
        rr(ctx, r.x, r.y, r.w, r.h, 8 * u * s);
        ctx.fill();
        ctx.strokeStyle = active ? tier : "rgba(255,255,255,0.15)";
        ctx.lineWidth = active ? 2.5 : 1;
        ctx.stroke();
        ctx.save();
        ctx.translate(r.x + 4 * u * s, r.y + r.h / 2 + 1 * u * s);
        drawGun(ctx, gun.def.id, 22 * u * s);
        ctx.restore();
        const name = gun.def.name.toUpperCase();
        const tx = r.x + 28 * u * s;
        ctx.font = `800 ${Math.round(8.5 * u * s)}px system-ui, sans-serif`;
        const fit = Math.min(1, (r.w - 34 * u * s) / ctx.measureText(name).width);
        label(name, tx, r.y + r.h * 0.34, 8.5 * u * s * fit, active ? "#fff" : "rgba(255,255,255,0.65)", "left", 800);
        const reloading = active && p.reloadT > 0;
        const txt = reloading ? "RELOADING…" : (gun.reserve !== null && gun.reserve !== undefined
          ? (gun.ammo <= 0 && gun.reserve <= 0 ? "OUT" : `${gun.ammo} · ${gun.reserve} left`)
          : `${gun.ammo} / ${magOf(p, gun)}`);
        label(txt, tx, r.y + r.h * 0.7, 9.5 * u * s, gun.ammo === 0 || reloading ? "#ffb36b" : tier, "left", 800);
        if (reloading) {
          const k = 1 - p.reloadT / (gun.def.reload * (p.buffs ? p.buffs.reload : 1));
          ctx.fillStyle = "#ffb36b";
          ctx.fillRect(r.x + 6 * u, r.y + r.h - 4 * u * s, (r.w - 12 * u) * k, 2 * u);
        } else if (active && p.cd > 0) {
          const k = p.cd / (gun.def.cd + (gun.def.burst - 1) * gun.def.gap);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(r.x + 6 * u, r.y + r.h - 4 * u * s, (r.w - 12 * u) * k, 2 * u);
        }
      }));
    } else {
      // EDIT toggle
      inFrame(pad, slots[0].cx, slots[0].cy, () => {
        const r = frameRect(slots[0]);
        const s = r.h / 34;
        const editing = mode === "edit";
        ctx.fillStyle = editing ? "#ffd23f" : "rgba(8,12,20,0.75)";
        rr(ctx, r.x, r.y, r.w, r.h, 8 * u * s);
        ctx.fill();
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 2;
        ctx.stroke();
        drawModeIcon(r.x + 18 * u * s, 0, 7 * u * s, "edit", editing ? "#0b1220" : "#ffd23f");
        label(editing ? "EDITING" : "EDIT", r.x + 32 * u * s, r.y + r.h * 0.38, 10 * u * s, editing ? "#0b1220" : "#ffd23f", "left", 900);
        label(editing ? "tap: back to build" : "cut / restore a tile", r.x + 32 * u * s, r.y + r.h * 0.72, 7 * u * s, editing ? "rgba(11,18,32,0.75)" : "rgba(255,255,255,0.6)", "left", 700);
      });
      // RESET
      inFrame(pad, slots[1].cx, slots[1].cy, () => {
        const r = frameRect(slots[1]);
        const s = r.h / 34;
        const any = !!nearestEditedWall(g, p);
        ctx.fillStyle = "rgba(8,12,20,0.75)";
        rr(ctx, r.x, r.y, r.w, r.h, 8 * u * s);
        ctx.fill();
        ctx.strokeStyle = any ? "#8fd3ff" : "rgba(255,255,255,0.15)";
        ctx.lineWidth = 2;
        ctx.stroke();
        label("↺", r.x + 18 * u * s, 0, 16 * u * s, any ? "#8fd3ff" : "rgba(255,255,255,0.3)", "center", 900);
        label("RESET", r.x + 32 * u * s, r.y + r.h * 0.38, 10 * u * s, any ? "#8fd3ff" : "rgba(255,255,255,0.35)", "left", 900);
        label("restore nearest edit", r.x + 32 * u * s, r.y + r.h * 0.72, 7 * u * s, "rgba(255,255,255,0.5)", "left", 700);
      });
    }
  }

  // ---- frame -----------------------------------------------------------------------

  // meta: { names, humans: [team...] (whose previews to show), }
  function draw(g, input, meta) {
    v.tags = !!meta.tags;
    v.buildStyle = meta.buildStyle || "stick";
    v.local = meta.local ?? 0;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = "#0b0f18";
    ctx.fillRect(0, 0, v.W, v.H);
    if (!v.floor || v.floorTeams !== (g.numTeams || 2) || v.floorTheme !== ((g.world.map && g.world.map.theme) || "arena")) buildFloor(g.world, g.numTeams || 2);

    ctx.save();
    if (v.portrait) ctx.transform(0, -1, 1, 0, v.OX, v.OY + GW * v.TS);
    if (g.shake > 0) {
      const s = g.shake * v.TS * 0.25;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    ctx.drawImage(v.floor, v.ox, v.oy, GW * v.TS, GH * v.TS);
    drawMedkits(g);
    drawTeleporters(g);
    drawTrackWarning(g);
    drawWalls(g);
    for (const i of meta.humans) {
      const p = g.players[i];
      drawBuildPreview(g, p);
      drawEditPreview(g, p);
      drawAimPreview(g, p);
    }
    drawBullets(g);
    drawPacs(g);
    for (const q of g.players) drawPlayer(g, q);
    drawTrain(g);
    drawFx(g);
    ctx.restore();

    // low health: red glow at the screen edges
    const me = g.players[meta.local ?? 0];
    if (!v.L.pvp && meta.humans && meta.humans.length && me && me.alive && g.state === "fight") {
      const k = me.hp / (me.maxHp || MAX_HP);
      if (k < 0.35) {
        const a = (0.35 - k) / 0.35 * (0.55 + 0.25 * Math.sin(g.time * 6));
        const grad = ctx.createRadialGradient(v.W / 2, v.H / 2, Math.min(v.W, v.H) * 0.35, v.W / 2, v.H / 2, Math.max(v.W, v.H) * 0.7);
        grad.addColorStop(0, "rgba(255,0,0,0)");
        grad.addColorStop(1, `rgba(255,30,40,${a})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, v.W, v.H);
      }
    }

    drawHud(g, input, meta);
  }

  return {
    v,
    resize,
    draw,
    toScreen: (x, y) => (v.portrait
      ? { x: v.OX + y * v.TS, y: v.OY + (GW - x) * v.TS }
      : { x: sx(x), y: sy(y) }),
  };
}
