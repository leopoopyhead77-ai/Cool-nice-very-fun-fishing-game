// Canvas renderer: arena, builds, players, projectiles, previews and HUD.

import { GW, GH, WALL_COST, isRock } from "./world.js";
import { gunOf, enemyOf, traceShot, buildPreview, editPreview, nearestEditedWall, MAX_HP, MAX_MATS } from "./game.js";
import { TIER_COLOR } from "./guns.js";

export const TEAM = [
  { main: "#3fa7ff", dark: "#1d5f9e", light: "#a9d8ff", wall: "#2f6fb0", wallHi: "#5b9ee0" },
  { main: "#ff4d5e", dark: "#9e2532", light: "#ffb1b9", wall: "#a8343f", wallHi: "#e0606b" },
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

  function buildFloor(world) {
    const c = document.createElement("canvas");
    const TS = v.TS * v.dpr;
    c.width = Math.ceil(GW * TS);
    c.height = Math.ceil(GH * TS);
    const f = c.getContext("2d");
    f.fillStyle = "#1b2232";
    f.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        if ((x + y) % 2 === 0) {
          f.fillStyle = "#1e2638";
          f.fillRect(x * TS, y * TS, TS, TS);
        }
      }
    }
    // spawn zones
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
    f.setLineDash([TS * 0.4, TS * 0.4]);
    f.strokeStyle = "rgba(220,230,255,0.13)";
    f.lineWidth = TS * 0.08;
    f.beginPath();
    f.moveTo(c.width / 2, 0);
    f.lineTo(c.width / 2, c.height);
    f.stroke();
    f.setLineDash([]);
    // rock
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        if (!isRock(world, x, y)) continue;
        const px = x * TS;
        const py = y * TS;
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
    // border
    f.strokeStyle = "#5a6884";
    f.lineWidth = TS * 0.12;
    f.strokeRect(0, 0, c.width, c.height);
    v.floor = c;
  }

  // ---- world ----------------------------------------------------------------

  function drawWalls(g) {
    const TS = v.TS;
    for (const wall of g.world.walls) {
      const col = TEAM[wall.owner];
      const k = Math.min(1, (g.time - wall.born) / 0.22);
      const s = k < 1 ? Math.max(0.05, easeOutBack(k)) : 1;
      // drop-in: the wall "lands" from slightly above
      const drop = (1 - Math.min(1, k * 1.4)) * TS * 0.6;
      wall.cells.forEach((c, i) => {
        if (!c.alive) return;
        const x = sx(c.x);
        const y = sy(c.y) - drop;
        if (wall.edit === i) {
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4);
          ctx.setLineDash([TS * 0.18, TS * 0.12]);
          ctx.strokeStyle = col.light;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = Math.max(1, TS * 0.07);
          ctx.strokeRect(x + TS * 0.1, y + TS * 0.1, TS * 0.8, TS * 0.8);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          return;
        }
        const w = TS * s;
        const cx = x + TS / 2;
        const cy = y + TS / 2;
        const hpk = c.hp / 150;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(cx - w / 2 + TS * 0.06, cy - w / 2 + TS * 0.14, w, w);
        ctx.fillStyle = col.wall;
        ctx.fillRect(cx - w / 2, cy - w / 2, w, w);
        ctx.fillStyle = col.wallHi;
        ctx.fillRect(cx - w / 2, cy - w / 2, w, w * 0.16);
        // planks run along the wall
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = Math.max(1, TS * 0.05);
        ctx.beginPath();
        for (let q = 1; q < 3; q++) {
          if (wall.vertical) {
            ctx.moveTo(cx - w / 2 + (w * q) / 3, cy - w / 2);
            ctx.lineTo(cx - w / 2 + (w * q) / 3, cy + w / 2);
          } else {
            ctx.moveTo(cx - w / 2, cy - w / 2 + (w * q) / 3);
            ctx.lineTo(cx + w / 2, cy - w / 2 + (w * q) / 3);
          }
        }
        ctx.stroke();
        if (hpk < 0.7) {
          ctx.strokeStyle = `rgba(10,10,15,${0.9 - hpk})`;
          ctx.lineWidth = Math.max(1, TS * 0.06);
          ctx.beginPath();
          ctx.moveTo(cx - w * 0.3, cy - w * 0.35);
          ctx.lineTo(cx - w * 0.05, cy - w * 0.05);
          ctx.lineTo(cx + w * 0.25, cy + w * 0.05);
          if (hpk < 0.4) {
            ctx.moveTo(cx - w * 0.05, cy - w * 0.05);
            ctx.lineTo(cx - w * 0.15, cy + w * 0.35);
            ctx.moveTo(cx + w * 0.1, cy - w * 0.4);
            ctx.lineTo(cx + w * 0.3, cy - w * 0.15);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - w / 2 + 0.5, cy - w / 2 + 0.5, w - 1, w - 1);
      });
    }
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
      const len = (def.type === "bullet" && def.range > 20 ? 0.95 : def.pellets > 1 ? 0.6 : def.type === "lob" || def.type === "rocket" ? 0.72 : 0.68) * TS;
      const wid = (def.type === "rocket" || def.type === "lob" ? 0.24 : def.burst > 8 ? 0.22 : 0.15) * TS;
      const back = p.recoil * TS * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = "#20242e";
      ctx.fillRect(r * 0.3 - back, -wid / 2 - 1, len + 2, wid + 2);
      ctx.fillStyle = def.color;
      ctx.fillRect(r * 0.3 - back, -wid / 2, len, wid);
      if (p.recoil > 0.6) {
        ctx.fillStyle = "rgba(255,230,150,0.9)";
        ctx.beginPath();
        ctx.arc(r * 0.3 + len - back + wid * 0.6, 0, wid * 0.9, 0, Math.PI * 2);
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
    const k = p.hp / MAX_HP;
    ctx.fillStyle = k > 0.5 ? "#5df08a" : k > 0.25 ? "#ffd23f" : "#ff5a5a";
    rr(ctx, bx, by, Math.max(bh, bw * k), bh, bh / 2);
    ctx.fill();
    // reload ring
    if (p.reloadT > 0) {
      const t = 1 - p.reloadT / gunOf(p).def.reload;
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
    if (!p.alive || p.mode !== "build" || g.state === "matchEnd") return;
    const TS = v.TS;
    const angle = p.aiming ? p.aimAngle : p.facing;
    const mag = p.aiming ? p.aimMag : 0;
    const place = buildPreview(g, p, angle, mag);
    const afford = p.mats >= WALL_COST;
    const ok = place.valid && afford;
    const strong = p.aiming ? 1 : 0.55;
    const pulse = 0.85 + Math.sin(g.time * 8) * 0.15;
    place.cells.forEach(([cx, cy], i) => {
      const bad = place.blocked[i] || !afford;
      const x = sx(cx);
      const y = sy(cy);
      ctx.fillStyle = bad ? `rgba(255,80,80,${0.28 * strong})` : `rgba(90,255,150,${0.3 * strong * pulse})`;
      ctx.fillRect(x + 1, y + 1, TS - 2, TS - 2);
      ctx.strokeStyle = bad ? `rgba(255,110,110,${0.9 * strong})` : `rgba(140,255,190,${0.95 * strong})`;
      ctx.lineWidth = Math.max(1.5, TS * 0.07);
      ctx.strokeRect(x + 1.5, y + 1.5, TS - 3, TS - 3);
    });
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
    if (!p.alive || p.mode !== "edit" || g.state === "matchEnd") return;
    const TS = v.TS;
    const angle = p.aiming ? p.aimAngle : p.facing;
    const target = editPreview(g, p, angle);
    // all of your walls get a faint outline so you can see what's editable
    for (const wall of g.world.walls) {
      if (wall.owner !== p.team) continue;
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
    const k = p.hp / MAX_HP;
    ctx.fillStyle = "rgba(8,12,20,0.7)";
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    const fw = Math.max(h, (w - 4) * k);
    ctx.fillStyle = TEAM[p.team].main;
    rr(ctx, align === "right" ? x + w - 2 - fw : x + 2, y + 2, fw, h - 4, (h - 4) / 2);
    ctx.fill();
    label(`${Math.ceil(p.hp)}`, x + w / 2, y + h / 2 + 0.5, h * 0.68, "#fff");
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
      const me = meta.humans[0] ?? 0;
      const p = g.players[me];
      const e = enemyOf(g, p);
      // top bar
      const ty = 20 * u;
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
      // HP bars
      const hw = Math.min(170 * u, cx - 140 * u - 14 * u);
      label(meta.names[me], 14 * u, 12 * u, 9 * u, TEAM[me].light, "left", 800);
      hpBar(12 * u, 18 * u, hw, 16 * u, p, "left");
      const ew = Math.min(hw, 104 * u);
      label(meta.names[1 - me], W - 56 * u, 12 * u, 9 * u, TEAM[1 - me].light, "right", 800);
      hpBar(W - 54 * u - ew, 18 * u, ew, 16 * u, e, "right");
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
        const k = p.hp / MAX_HP;
        ctx.fillRect((W - len * k) / 2, y, len * k, 5 * u);
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
        const k = p.hp / MAX_HP;
        ctx.fillStyle = TEAM[i].main;
        ctx.fillRect(x, (H - len * k) / 2, 5 * u, len * k);
      });
    }

    drawPause();
    // buttons first so a dragged stick knob stays visible on top of them
    for (const pad of L.pads) drawButtons(g, g.players[pad.team], pad);
    for (const pad of L.pads) drawSticks(g, g.players[pad.team], input, pad);

    if (!L.pvp) {
      const me = meta.humans[0] ?? 0;
      drawBanner(g, me, cx, H * 0.42, 0, 1, W);
      const mode = g.players[me].mode;
      if (g.state === "fight" && mode !== "combat") {
        ctx.fillStyle = mode === "edit" ? "rgba(255,210,63,0.9)" : "rgba(90,255,150,0.9)";
        rr(ctx, cx - 50 * u, 40 * u, 100 * u, 18 * u, 9 * u);
        ctx.fill();
        label(mode === "edit" ? "EDIT MODE" : "BUILD MODE", cx, 49 * u, 9 * u, "#0b1220", "center", 900);
      }
    } else {
      for (const pad of L.pads) drawBanner(g, pad.team, pad.center.x, pad.center.y, pad.rot, L.portrait ? 0.7 : 0.62, L.portrait ? W : H);
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

  function drawButtons(g, p, pad) {
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
        ctx.fillStyle = gun.def.color;
        rr(ctx, r.x + 6 * u * s, r.y + r.h / 2 - 4 * u * s, 16 * u * s, 8 * u * s, 3 * u * s);
        ctx.fill();
        const name = gun.def.name.toUpperCase();
        const tx = r.x + 28 * u * s;
        ctx.font = `800 ${Math.round(8.5 * u * s)}px system-ui, sans-serif`;
        const fit = Math.min(1, (r.w - 34 * u * s) / ctx.measureText(name).width);
        label(name, tx, r.y + r.h * 0.34, 8.5 * u * s * fit, active ? "#fff" : "rgba(255,255,255,0.65)", "left", 800);
        const reloading = active && p.reloadT > 0;
        const txt = reloading ? "RELOADING…" : `${gun.ammo} / ${gun.def.mag}`;
        label(txt, tx, r.y + r.h * 0.7, 9.5 * u * s, gun.ammo === 0 || reloading ? "#ffb36b" : tier, "left", 800);
        if (reloading) {
          const k = 1 - p.reloadT / gun.def.reload;
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
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = "#0b0f18";
    ctx.fillRect(0, 0, v.W, v.H);
    if (!v.floor) buildFloor(g.world);

    ctx.save();
    if (v.portrait) ctx.transform(0, -1, 1, 0, v.OX, v.OY + GW * v.TS);
    if (g.shake > 0) {
      const s = g.shake * v.TS * 0.25;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    ctx.drawImage(v.floor, v.ox, v.oy, GW * v.TS, GH * v.TS);
    drawMedkits(g);
    drawWalls(g);
    for (const i of meta.humans) {
      const p = g.players[i];
      drawBuildPreview(g, p);
      drawEditPreview(g, p);
      drawAimPreview(g, p);
    }
    drawBullets(g);
    for (const q of g.players) drawPlayer(g, q);
    drawFx(g);
    ctx.restore();

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
