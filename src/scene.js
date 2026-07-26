// ---------------------------------------------------------------------------
// The view from the bank. Each area is described by a small scene object in
// data.js and painted here: sky, sun or moon, hills, trees, water, foreground
// props, drifting particles, and your float sitting on the surface.
//
// Everything is drawn procedurally so a whole world costs a few hundred bytes
// of description rather than an image.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round((((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t));
  const g = Math.round((((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t) + (pb & 255) * t));
  return `rgb(${r},${g},${bl})`;
};

const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Deterministic pseudo-noise so a scene looks the same frame to frame.
const noise = (i) => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

function ridge(ctx, w, h, layer, waterY) {
  const { color, base, amp, freq, peaks } = layer;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) {
    const u = x / w;
    let y = base + Math.sin(u * TAU * freq) * amp + Math.sin(u * TAU * freq * 2.7 + 1.3) * amp * 0.4;
    if (peaks) y -= Math.abs(Math.sin(u * TAU * freq * 0.5)) * amp * 1.6;
    ctx.lineTo(x, y * h);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  return null;
}

function willow(ctx, x, y, s, t) {
  ctx.strokeStyle = "#6B5636";
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - s * 0.05, y - s * 0.7);
  ctx.stroke();
  ctx.fillStyle = "#6FA45E";
  ctx.beginPath();
  ctx.ellipse(x - s * 0.05, y - s * 0.85, s * 0.42, s * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#7FB56C";
  ctx.lineWidth = Math.max(1, s * 0.035);
  for (let i = -3; i <= 3; i++) {
    const bx = x - s * 0.05 + i * s * 0.11;
    const sway = Math.sin(t * 0.8 + i) * s * 0.04;
    ctx.beginPath();
    ctx.moveTo(bx, y - s * 0.82);
    ctx.quadraticCurveTo(bx + sway, y - s * 0.5, bx + sway * 1.6, y - s * 0.18);
    ctx.stroke();
  }
}

function palm(ctx, x, y, s, t) {
  ctx.strokeStyle = "#9C7B4F";
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + s * 0.1, y - s * 0.5, x + s * 0.18, y - s * 0.86);
  ctx.stroke();
  const top = { x: x + s * 0.18, y: y - s * 0.86 };
  ctx.fillStyle = "#4FA86A";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.sin(t * 0.6) * 0.06;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(
      top.x + Math.cos(a) * s * 0.3,
      top.y + Math.sin(a) * s * 0.22 - s * 0.12,
      top.x + Math.cos(a) * s * 0.52,
      top.y + Math.sin(a) * s * 0.34
    );
    ctx.quadraticCurveTo(
      top.x + Math.cos(a) * s * 0.28,
      top.y + Math.sin(a) * s * 0.18,
      top.x,
      top.y
    );
    ctx.fill();
  }
}

function pine(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const top = y - s * (0.9 - i * 0.22);
    const half = s * (0.16 + i * 0.09);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - half, y - s * (0.5 - i * 0.22));
    ctx.lineTo(x + half, y - s * (0.5 - i * 0.22));
    ctx.closePath();
    ctx.fill();
  }
}

// A dense shoreline canopy: overlapping fronds plus a few hanging vines.
function canopy(ctx, w, y, s, t) {
  for (let i = 0; i < 26; i++) {
    const u = noise(i) * 1.06 - 0.03;
    if (Math.abs(u - 0.5) < 0.13) continue; // leave the falls a clear view
    const x = u * w;
    const yy = y - s * (0.04 + noise(i + 40) * 0.3);
    const r = s * (0.07 + noise(i + 80) * 0.09);
    const sway = Math.sin(t * 0.4 + i) * s * 0.02;
    ctx.fillStyle = ["#2C6440", "#377A4C", "#418C57"][i % 3];
    ctx.beginPath();
    ctx.ellipse(x + sway, yy, r * 1.7, r * 0.72, -0.5 + noise(i + 20) * 1.2, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(52,110,68,.75)";
  ctx.lineWidth = Math.max(1, s * 0.02);
  for (let i = 0; i < 4; i++) {
    const x = (0.07 + i * 0.28) * w;
    if (Math.abs(x / w - 0.5) < 0.13) continue;
    const sway = Math.sin(t * 0.5 + i * 1.3) * s * 0.04;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.26);
    ctx.quadraticCurveTo(x + sway, y - s * 0.15, x + sway * 1.4, y - s * 0.02);
    ctx.stroke();
  }
}

function cattail(ctx, x, y, s, t, i) {
  const sway = Math.sin(t * 0.9 + i * 1.7) * s * 0.06;
  ctx.strokeStyle = "#4A5C3C";
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway, y - s * 0.5, x + sway * 1.5, y - s * 0.95);
  ctx.stroke();
  ctx.fillStyle = "#6B4A2E";
  ctx.beginPath();
  ctx.ellipse(x + sway * 1.5, y - s * 0.95, s * 0.055, s * 0.16, 0, 0, TAU);
  ctx.fill();
}

function lilyPad(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0.35, TAU + 0.05);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws one frame.
 * @param live  shared frame state: { phase, blip, tier, rarityColor }
 */
export function drawScene(ctx, w, h, scene, t, live) {
  const waterY = h * scene.waterline;

  // --- sky -----------------------------------------------------------------
  const sky = ctx.createLinearGradient(0, 0, 0, waterY);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(1, scene.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, waterY);

  if (scene.stars) {
    for (let i = 0; i < 60; i++) {
      const x = noise(i) * w;
      const y = noise(i + 99) * waterY * 0.8;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.7 + i));
      ctx.fillStyle = `rgba(255,255,255,${tw * 0.8})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  if (scene.aurora) {
    for (let band = 0; band < 3; band++) {
      const hue = ["#5FE3B0", "#7FC4F0", "#B98BE8"][band];
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = hue;
      ctx.lineWidth = h * 0.07;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const u = x / w;
        const y =
          waterY * (0.2 + band * 0.07) +
          Math.sin(u * 4 + t * 0.4 + band) * h * 0.05 +
          Math.sin(u * 9 - t * 0.25) * h * 0.02;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const light = scene.sun || scene.moon;
  if (light) {
    const cx = light.x * w;
    const cy = light.y * waterY * 1.6;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, light.r * 3.2);
    glow.addColorStop(0, alpha(light.color, 0.75));
    glow.addColorStop(1, alpha(light.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(cx - light.r * 3.4, cy - light.r * 3.4, light.r * 6.8, light.r * 6.8);
    ctx.fillStyle = light.color;
    ctx.beginPath();
    ctx.arc(cx, cy, light.r, 0, TAU);
    ctx.fill();
  }

  // --- distant land --------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, waterY + 1);
  ctx.clip();
  for (const layer of scene.hills) ridge(ctx, w, h, layer, waterY);

  if (scene.waterfall) {
    const fx = w * 0.5;
    const top = h * 0.08;
    const wTop = w * 0.13;
    const wBot = w * 0.19;

    // wet rock the water pours over
    ctx.fillStyle = "#2A4636";
    ctx.beginPath();
    ctx.moveTo(fx - wTop * 1.15, top);
    ctx.lineTo(fx + wTop * 1.15, top);
    ctx.lineTo(fx + wBot * 1.05, waterY);
    ctx.lineTo(fx - wBot * 1.05, waterY);
    ctx.closePath();
    ctx.fill();

    // the falling sheet, wider at the bottom and soft at the edges
    const fall = ctx.createLinearGradient(fx - wBot / 2, 0, fx + wBot / 2, 0);
    fall.addColorStop(0, "rgba(226,248,242,.15)");
    fall.addColorStop(0.25, "rgba(240,255,250,.9)");
    fall.addColorStop(0.75, "rgba(240,255,250,.9)");
    fall.addColorStop(1, "rgba(226,248,242,.15)");
    ctx.fillStyle = fall;
    ctx.beginPath();
    ctx.moveTo(fx - wTop / 2, top);
    ctx.lineTo(fx + wTop / 2, top);
    ctx.lineTo(fx + wBot / 2, waterY + h * 0.01);
    ctx.lineTo(fx - wBot / 2, waterY + h * 0.01);
    ctx.closePath();
    ctx.fill();

    // streaks racing down the sheet
    for (let i = 0; i < 16; i++) {
      const span = waterY - top;
      const y = top + ((t * 150 + i * 53) % span);
      const k = (y - top) / span;
      const ww = wTop + (wBot - wTop) * k;
      ctx.fillStyle = `rgba(255,255,255,${0.5 - k * 0.2})`;
      ctx.fillRect(fx - ww / 2 + noise(i) * ww, y, 1.5, h * 0.05);
    }

    // spray where it lands
    for (let i = 0; i < 3; i++) {
      const puff = 0.5 + 0.5 * Math.sin(t * 2 + i * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.16 + puff * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(fx, waterY - h * 0.01, wBot * (0.8 + i * 0.45), h * (0.02 + i * 0.012), 0, 0, TAU);
      ctx.fill();
    }
  }

  // trees sit on the near shoreline
  const treeBase = waterY + 1;
  if (scene.trees === "willow") {
    willow(ctx, w * 0.12, treeBase, h * 0.46, t);
    willow(ctx, w * 0.88, treeBase, h * 0.34, t + 2);
  } else if (scene.trees === "palm") {
    palm(ctx, w * 0.09, treeBase, h * 0.5, t);
    palm(ctx, w * 0.93, treeBase, h * 0.38, t + 1.4);
  } else if (scene.trees === "pine") {
    for (let i = 0; i < 9; i++) {
      const x = (i / 8) * w;
      const s = h * (0.2 + noise(i) * 0.14);
      pine(ctx, x, treeBase, s, i % 2 ? "#2F5B45" : "#264B3A");
    }
  } else if (scene.trees === "jungle") {
    canopy(ctx, w, treeBase, h * 0.5, t);
  } else if (scene.trees === "cattail") {
    for (let i = 0; i < 10; i++) {
      cattail(ctx, (i / 9) * w * 0.98 + w * 0.01, treeBase, h * (0.24 + noise(i) * 0.1), t, i);
    }
  }

  ctx.restore();

  // --- water ---------------------------------------------------------------
  const water = ctx.createLinearGradient(0, waterY, 0, h);
  water.addColorStop(0, scene.water[0]);
  water.addColorStop(1, scene.water[1]);
  ctx.fillStyle = water;
  ctx.fillRect(0, waterY, w, h - waterY);

  // light on the surface, right under the sun or moon
  if (light) {
    ctx.fillStyle = light.color;
    for (let i = 0; i < 7; i++) {
      const y = waterY + (i + 1) * ((h - waterY) / 9);
      const ww = w * 0.13 * (1 + i * 0.28) * (0.8 + 0.2 * Math.sin(t * 1.5 + i));
      const hh = Math.max(2, h * 0.011);
      ctx.globalAlpha = 0.34 - i * 0.035;
      ctx.beginPath();
      ctx.ellipse(light.x * w, y, ww / 2, hh / 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // gentle surface ripples
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const y = waterY + ((h - waterY) * (i + 0.5)) / 6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * 0.03 + t * 1.1 + i * 1.9) * (2 + i * 0.7);
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // shoreline highlight
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.fillRect(0, waterY - 1, w, 2);

  // --- foreground props ----------------------------------------------------
  if (scene.fg === "lily") {
    lilyPad(ctx, w * 0.16, h * 0.9, h * 0.07, "#4E8F55");
    lilyPad(ctx, w * 0.3, h * 0.96, h * 0.05, "#5C9E5F");
    lilyPad(ctx, w * 0.82, h * 0.92, h * 0.06, "#47834E");
    ctx.fillStyle = "#EFA8C6";
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.9, h * 0.02, 0, TAU);
    ctx.fill();
  } else if (scene.fg === "sand") {
    ctx.fillStyle = "#E8D6AE";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.3, h * 0.88, w, h * 0.95);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath();
    ctx.ellipse(w * 0.2, h * 0.965, h * 0.03, h * 0.012, 0, 0, TAU);
    ctx.fill();
  } else if (scene.fg === "rock") {
    ctx.fillStyle = "#6E7B78";
    ctx.beginPath();
    ctx.ellipse(w * 0.12, h, h * 0.14, h * 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#59635F";
    ctx.beginPath();
    ctx.ellipse(w * 0.9, h * 1.02, h * 0.12, h * 0.07, 0, 0, TAU);
    ctx.fill();
  } else if (scene.fg === "coral") {
    const colors = ["#F08A9B", "#F6C46B", "#8FD8C0"];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = colors[i % 3];
      const x = w * (0.08 + i * 0.21);
      ctx.beginPath();
      ctx.ellipse(x, h * 1.0, h * 0.05, h * 0.09, 0, 0, TAU);
      ctx.fill();
    }
  } else if (scene.fg === "cattail") {
    ctx.fillStyle = "rgba(20,24,44,.6)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.5, h * 0.9, w, h);
    ctx.closePath();
    ctx.fill();
  } else if (scene.fg === "fern") {
    ctx.fillStyle = "#255C39";
    for (let i = 0; i < 4; i++) {
      const x = w * (0.05 + i * 0.3);
      ctx.beginPath();
      ctx.ellipse(x, h * 1.02, h * 0.14, h * 0.06, -0.4, 0, TAU);
      ctx.fill();
    }
  } else if (scene.fg === "ice") {
    ctx.fillStyle = "#CFE2F2";
    ctx.beginPath();
    ctx.moveTo(w * 0.02, h);
    ctx.lineTo(w * 0.13, h * 0.86);
    ctx.lineTo(w * 0.26, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#AFCBE2";
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h);
    ctx.lineTo(w * 0.85, h * 0.9);
    ctx.lineTo(w * 0.98, h);
    ctx.closePath();
    ctx.fill();
  }

  // --- your float ----------------------------------------------------------
  const onWater =
    live.phase === "waiting" || live.phase === "bite" || live.phase === "reeling";
  if (onWater) {
    const fx = live.phase === "reeling" ? w * (0.2 + live.blip * 0.6) : w * 0.6;
    const bob = live.phase === "bite" ? Math.sin(t * 22) * 5 : Math.sin(t * 1.6) * 2.5;
    const fy = waterY + (h - waterY) * 0.18 + bob;

    // ripples around the float
    const rings = live.phase === "bite" ? 3 : 2;
    for (let i = 0; i < rings; i++) {
      const p = ((t * (live.phase === "bite" ? 1.6 : 0.6) + i / rings) % 1);
      ctx.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(fx, fy + 4, 8 + p * 34, 3 + p * 12, 0, 0, TAU);
      ctx.stroke();
    }

    // line up to the rod tip, off the top-right of the frame
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(w * 0.95, fy - h * 0.3, w * 1.02, -h * 0.05);
    ctx.stroke();

    ctx.fillStyle = "#E8503C";
    ctx.beginPath();
    ctx.arc(fx, fy, 6, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = "#FDFBF4";
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = "#2F3B36";
    ctx.fillRect(fx - 0.75, fy - 12, 1.5, 6);
  }

  // the fish itself, as a shadow under the surface while you fight it
  if (live.phase === "reeling") {
    const fx = w * (0.2 + live.blip * 0.6);
    const fy = waterY + (h - waterY) * 0.55;
    ctx.fillStyle = alpha(live.rarityColor || "#2F3B36", 0.55);
    ctx.beginPath();
    ctx.ellipse(fx, fy, 18, 7, Math.sin(t * 3) * 0.15, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx + 16, fy);
    ctx.lineTo(fx + 27, fy - 7);
    ctx.lineTo(fx + 27, fy + 7);
    ctx.closePath();
    ctx.fill();
  }

  // --- drifting particles --------------------------------------------------
  const p = scene.particles;
  if (p === "firefly") {
    for (let i = 0; i < 16; i++) {
      const x = ((noise(i) * w + t * (8 + noise(i + 5) * 14)) % w);
      const y = waterY * (0.3 + noise(i + 30) * 0.6) + Math.sin(t * 1.2 + i) * 8;
      const glowT = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i * 2));
      ctx.fillStyle = `rgba(255,232,150,${glowT})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }
  } else if (p === "petal") {
    for (let i = 0; i < 12; i++) {
      const x = ((noise(i) * w + t * 12) % w);
      const y = ((noise(i + 7) * waterY + t * 9) % waterY);
      ctx.fillStyle = "rgba(255,225,235,.85)";
      ctx.beginPath();
      ctx.ellipse(x, y, 3, 1.6, t + i, 0, TAU);
      ctx.fill();
    }
  } else if (p === "snow") {
    for (let i = 0; i < 30; i++) {
      const x = ((noise(i) * w + Math.sin(t * 0.5 + i) * 12) % w + w) % w;
      const y = ((noise(i + 11) * h + t * 16) % waterY);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, TAU);
      ctx.fill();
    }
  } else if (p === "rain") {
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 34; i++) {
      const x = ((noise(i) * w + t * 30) % (w * 1.2)) - w * 0.1;
      const y = (noise(i + 13) * h + t * 320) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 12);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = ((noise(i) * w * 1.4 + t * 7) % (w * 1.4)) - w * 0.2;
      ctx.fillStyle = "rgba(255,255,255,.13)";
      ctx.beginPath();
      ctx.ellipse(x, waterY * (0.6 + noise(i + 3) * 0.3), w * 0.22, h * 0.035, 0, 0, TAU);
      ctx.fill();
    }
  } else if (p === "mist") {
    for (let i = 0; i < 5; i++) {
      const x = ((noise(i) * w * 1.4 + t * 7) % (w * 1.4)) - w * 0.2;
      const y = waterY * (0.55 + noise(i + 3) * 0.35);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.2, h * 0.035, 0, 0, TAU);
      ctx.fill();
    }
  } else if (p === "bird") {
    for (let i = 0; i < 3; i++) {
      const x = ((noise(i) * w + t * (10 + i * 4)) % (w * 1.2)) - w * 0.1;
      const y = waterY * (0.16 + noise(i + 2) * 0.2) + Math.sin(t + i) * 4;
      const s = 5 + i;
      ctx.strokeStyle = "rgba(70,90,100,.65)";
      ctx.lineWidth = 1.4;
      const flap = Math.sin(t * 4 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(x - s, y + flap);
      ctx.quadraticCurveTo(x, y - s * 0.5, x + s, y + flap);
      ctx.stroke();
    }
  }
}

export { mix };
