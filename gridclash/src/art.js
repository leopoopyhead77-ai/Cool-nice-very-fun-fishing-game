// Item art, drawn with canvas paths so it stays crisp at any size and needs no
// image files: a side-view silhouette for each gun (in players' hands, on the
// HUD weapon buttons and on the item-pick screen) and an emblem for each kind
// of buff card.

import { GUN_BY_ID } from "./guns.js";
import { GUN_ART } from "./gunart.js";

// The weapon sprites as ready-to-draw images (browser only). Until an image
// has loaded, the hand-drawn vector version below is used instead.
const GUN_IMG = {};
if (typeof Image !== "undefined") {
  for (const [id, url] of Object.entries(GUN_ART)) {
    const im = new Image();
    im.src = url;
    GUN_IMG[id] = im;
  }
}
const spriteFor = (id) => {
  const im = GUN_IMG[id];
  return im && im.complete && im.naturalWidth ? im : null;
};

let BODY = "#2a303c";
let METAL = "#5b6577";
let DARK = "#151922";
const LINE = "rgba(5,7,12,0.85)";

// Gun length in tiles when held in-game.
export const GUN_LEN = {
  pistol: 0.56, revolver: 0.62, smg: 0.72, ar: 0.92, burst: 0.86, shotgun: 0.98,
  sniper: 1.18, minigun: 0.96, grenade: 0.86, rocket: 1.12, rail: 1.06, flamer: 0.92,
  akimbo: 0.6, dmr: 1.02, crossbow: 0.9, dbarrel: 0.92, frost: 0.9, ricochet: 0.84, cluster: 0.92,
};

// Draws gun `id` along +x from the origin (stock / grip end) to x = L (muzzle),
// roughly centred on y = 0, "up" = -y. Returns nothing.
// light: lighter metals, for drawing small on the dark arena floor
export function drawGun(ctx, id, L, light = false) {
  const img = spriteFor(id);
  if (img) {
    // sprite: L long, its grip hanging below the line it points along
    const h = (L * img.naturalHeight) / img.naturalWidth;
    ctx.drawImage(img, 0, -h * 0.42, L, h);
    return;
  }
  BODY = light ? "#5a6478" : "#2a303c";
  METAL = light ? "#a3adc0" : "#5b6577";
  DARK = light ? "#323a48" : "#151922";
  const def = GUN_BY_ID[id];
  const acc = def ? def.color : "#ccc";
  const s = L;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.6, s * 0.025);
  ctx.strokeStyle = LINE;
  const R = (x, y, w, h, fill, rad = 0) => {
    ctx.beginPath();
    if (rad > 0 && ctx.roundRect) ctx.roundRect(x * s, y * s, w * s, h * s, rad * s);
    else ctx.rect(x * s, y * s, w * s, h * s);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  const P = (pts, fill) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  const O = (x, y, r, fill) => {
    ctx.beginPath();
    ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  const shine = (x, y, w) => {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x * s, y * s, w * s, Math.max(0.5, s * 0.022));
  };

  switch (id) {
    case "pistol":
      P([[0.14, 0.02], [0.42, 0.02], [0.36, 0.44], [0.1, 0.44]], BODY);       // grip
      R(0.4, 0.02, 0.16, 0.13, METAL, 0.04);                                     // trigger guard
      R(0.12, -0.22, 0.86, 0.24, acc, 0.03);                                     // slide
      R(0.86, -0.12, 0.14, 0.1, DARK);                                           // muzzle
      for (let i = 0; i < 4; i++) R(0.17 + i * 0.05, -0.18, 0.02, 0.15, "rgba(0,0,0,0.25)");
      shine(0.14, -0.2, 0.8);
      break;
    case "revolver":
      P([[0.02, 0.0], [0.22, -0.04], [0.32, 0.06], [0.2, 0.46], [0.0, 0.42]], "#7a4f2c"); // wooden grip
      R(0.2, -0.16, 0.3, 0.2, METAL, 0.04);                                      // frame
      O(0.36, -0.05, 0.13, acc);                                                 // cylinder
      O(0.36, -0.05, 0.04, DARK);
      R(0.48, -0.15, 0.52, 0.1, METAL, 0.02);                                    // barrel
      R(0.92, -0.2, 0.05, 0.06, DARK);                                           // front sight
      P([[0.16, -0.16], [0.24, -0.26], [0.27, -0.16]], DARK);                    // hammer
      shine(0.5, -0.14, 0.46);
      break;
    case "smg":
      R(0.0, -0.13, 0.18, 0.09, METAL);                                          // folding stock
      R(0.14, -0.2, 0.6, 0.26, BODY, 0.03);                                      // receiver
      R(0.2, -0.2, 0.48, 0.07, acc);                                             // top cover
      R(0.74, -0.11, 0.26, 0.08, METAL);                                         // barrel
      R(0.44, 0.06, 0.12, 0.38, acc, 0.02);                                      // magazine
      P([[0.2, 0.06], [0.32, 0.06], [0.3, 0.34], [0.18, 0.34]], BODY);           // grip
      shine(0.22, -0.18, 0.44);
      break;
    case "ar":
      P([[0.0, -0.12], [0.22, -0.16], [0.22, 0.06], [0.02, 0.1]], BODY);         // stock
      R(0.2, -0.2, 0.44, 0.24, BODY, 0.02);                                      // receiver
      R(0.62, -0.18, 0.26, 0.17, acc, 0.03);                                     // handguard
      R(0.86, -0.12, 0.14, 0.06, METAL);                                         // barrel
      P([[0.4, 0.04], [0.52, 0.04], [0.56, 0.36], [0.44, 0.38]], acc);           // curved mag
      P([[0.26, 0.04], [0.36, 0.04], [0.32, 0.3], [0.22, 0.3]], BODY);           // grip
      R(0.34, -0.31, 0.16, 0.11, DARK, 0.03);                                    // optic
      shine(0.22, -0.18, 0.4);
      break;
    case "burst":
      R(0.02, -0.2, 0.78, 0.27, BODY, 0.05);                                     // bullpup body
      R(0.06, -0.2, 0.7, 0.08, acc, 0.03);
      R(0.8, -0.11, 0.2, 0.07, METAL);                                           // barrel
      R(0.12, 0.07, 0.13, 0.27, acc, 0.02);                                      // mag behind grip
      P([[0.44, 0.07], [0.54, 0.07], [0.51, 0.32], [0.41, 0.32]], BODY);         // grip
      R(0.36, -0.36, 0.3, 0.12, DARK, 0.05);                                     // scope
      O(0.66, -0.3, 0.035, "#7cd3ff");
      shine(0.08, -0.18, 0.66);
      break;
    case "shotgun":
      P([[0.0, -0.08], [0.24, -0.13], [0.24, 0.06], [0.0, 0.14]], "#7a4f2c");    // wooden stock
      R(0.22, -0.15, 0.22, 0.2, BODY, 0.02);                                     // receiver
      R(0.42, -0.14, 0.58, 0.075, METAL);                                        // barrel
      R(0.42, -0.06, 0.46, 0.065, METAL);                                        // magazine tube
      R(0.54, -0.085, 0.2, 0.12, acc, 0.03);                                     // pump
      P([[0.26, 0.05], [0.36, 0.05], [0.33, 0.26], [0.24, 0.24]], BODY);
      shine(0.43, -0.13, 0.55);
      break;
    case "sniper":
      P([[0.0, -0.06], [0.26, -0.1], [0.26, 0.05], [0.12, 0.05], [0.06, 0.16], [0.0, 0.16]], acc); // stock
      R(0.24, -0.12, 0.26, 0.15, BODY, 0.02);                                    // receiver
      R(0.5, -0.09, 0.5, 0.045, METAL);                                          // long barrel
      R(0.94, -0.11, 0.06, 0.085, DARK);                                         // muzzle brake
      R(0.26, -0.27, 0.3, 0.1, DARK, 0.04);                                      // scope
      R(0.22, -0.285, 0.06, 0.13, DARK, 0.02);
      R(0.54, -0.285, 0.06, 0.13, DARK, 0.02);
      O(0.6, -0.22, 0.025, "#7cd3ff");
      R(0.33, 0.03, 0.08, 0.16, BODY);                                           // grip
      R(0.38, -0.155, 0.08, 0.03, METAL);                                        // bolt
      shine(0.5, -0.085, 0.44);
      break;
    case "minigun":
      R(0.08, -0.24, 0.38, 0.4, BODY, 0.05);                                     // motor housing
      R(0.12, -0.24, 0.3, 0.1, acc, 0.03);
      for (const y of [-0.17, -0.07, 0.03]) R(0.46, y, 0.54, 0.06, METAL);      // barrels
      R(0.7, -0.2, 0.06, 0.29, DARK);                                            // barrel clamp
      R(0.94, -0.2, 0.06, 0.29, DARK);
      R(0.18, -0.36, 0.2, 0.06, METAL);                                          // carry handle
      R(0.18, -0.36, 0.04, 0.13, METAL);
      R(0.34, -0.36, 0.04, 0.13, METAL);
      R(0.0, 0.0, 0.1, 0.24, BODY);                                              // rear grip
      ctx.fillStyle = "#c9a14a";                                                  // ammo belt
      for (let i = 0; i < 5; i++) ctx.fillRect((0.16 + i * 0.05) * s, 0.16 * s, 0.03 * s, 0.1 * s);
      break;
    case "grenade":
      R(0.0, -0.06, 0.2, 0.1, METAL);                                            // stock bar
      R(0.34, -0.17, 0.62, 0.22, BODY, 0.04);                                    // launch tube
      R(0.9, -0.19, 0.1, 0.26, DARK, 0.02);                                      // muzzle
      O(0.3, -0.01, 0.17, acc);                                                  // drum
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        O(0.3 + Math.cos(a) * 0.1, -0.01 + Math.sin(a) * 0.1, 0.03, DARK);
      }
      P([[0.5, 0.05], [0.6, 0.05], [0.57, 0.3], [0.47, 0.3]], BODY);
      shine(0.36, -0.15, 0.54);
      break;
    case "rocket":
      R(0.0, -0.15, 0.92, 0.24, "#4a5a3c", 0.05);                                // tube
      R(0.06, -0.15, 0.06, 0.24, acc);                                           // stripes
      R(0.7, -0.15, 0.06, 0.24, acc);
      P([[0.92, -0.13], [1.0, -0.13], [1.1, -0.03], [1.0, 0.07], [0.92, 0.07]], "#ff6b4a"); // warhead
      R(0.36, -0.29, 0.14, 0.14, DARK, 0.02);                                    // sight
      P([[0.4, 0.09], [0.5, 0.09], [0.47, 0.32], [0.37, 0.32]], BODY);          // grip
      R(0.6, 0.09, 0.08, 0.16, BODY);                                            // front grip
      shine(0.04, -0.13, 0.86);
      break;
    case "rail":
      P([[0.0, -0.1], [0.3, -0.2], [0.62, -0.2], [0.66, 0.08], [0.32, 0.1], [0.0, 0.06]], BODY); // body
      R(0.62, -0.16, 0.38, 0.05, METAL);                                         // twin rails
      R(0.62, -0.03, 0.38, 0.05, METAL);
      ctx.save();
      ctx.shadowColor = acc;
      ctx.shadowBlur = s * 0.12;
      for (let i = 0; i < 4; i++) R(0.68 + i * 0.08, -0.11, 0.035, 0.08, acc);   // glowing coils
      R(0.3, -0.12, 0.26, 0.05, acc, 0.02);
      ctx.restore();
      P([[0.36, 0.08], [0.46, 0.08], [0.42, 0.32], [0.32, 0.32]], BODY);
      break;
    case "flamer":
      R(0.0, -0.1, 0.24, 0.12, METAL, 0.02);                                     // rear grip block
      R(0.22, -0.16, 0.48, 0.2, BODY, 0.04);                                     // body
      R(0.7, -0.1, 0.3, 0.085, METAL);                                           // nozzle
      R(0.95, -0.125, 0.05, 0.135, DARK);
      R(0.24, 0.05, 0.42, 0.17, acc, 0.08);                                      // fuel tank
      R(0.3, 0.09, 0.3, 0.03, "rgba(255,255,255,0.3)");
      P([[0.3, 0.04], [0.38, 0.04], [0.36, 0.06], [0.3, 0.06]], DARK);
      ctx.fillStyle = "#ffcf5a";                                                  // pilot light
      ctx.beginPath();
      ctx.arc(1.03 * s, -0.06 * s, 0.035 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "akimbo": {
      // two pistols, one behind the other
      for (const [ox, oy, a] of [[0.0, -0.16, 0.55], [0.1, 0.08, 1]]) {
        ctx.save();
        ctx.globalAlpha *= a;
        P([[0.1 + ox, 0.0 + oy], [0.32 + ox, 0.0 + oy], [0.27 + ox, 0.3 + oy], [0.07 + ox, 0.3 + oy]], BODY);
        R(0.08 + ox, -0.17 + oy, 0.74, 0.18, acc, 0.03);
        R(0.72 + ox, -0.1 + oy, 0.12, 0.08, DARK);
        ctx.restore();
      }
      break;
    }
    case "dmr":
      P([[0.0, -0.08], [0.24, -0.13], [0.24, 0.05], [0.04, 0.14], [0.0, 0.14]], BODY);  // stock
      R(0.22, -0.15, 0.36, 0.19, BODY, 0.02);                                     // receiver
      R(0.56, -0.13, 0.26, 0.12, acc, 0.03);                                      // handguard
      R(0.8, -0.1, 0.2, 0.05, METAL);                                             // barrel
      R(0.34, 0.04, 0.1, 0.24, METAL, 0.02);                                      // straight mag
      P([[0.26, 0.04], [0.34, 0.04], [0.31, 0.26], [0.23, 0.26]], BODY);
      R(0.3, -0.28, 0.24, 0.09, DARK, 0.04);                                      // scope
      O(0.54, -0.235, 0.025, "#7cd3ff");
      shine(0.24, -0.13, 0.5);
      break;
    case "crossbow": {
      R(0.0, -0.07, 0.62, 0.1, "#7a4f2c", 0.03);                                  // wooden stock / rail
      R(0.55, -0.06, 0.35, 0.07, METAL);
      // bow limbs
      ctx.beginPath();
      ctx.moveTo(0.72 * s, -0.36 * s);
      ctx.quadraticCurveTo(0.86 * s, -0.02 * s, 0.72 * s, 0.32 * s);
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.strokeStyle = acc;
      ctx.stroke();
      ctx.lineWidth = Math.max(0.6, s * 0.015);
      ctx.strokeStyle = "#e9e4d6";
      ctx.beginPath();                                                             // string
      ctx.moveTo(0.72 * s, -0.36 * s);
      ctx.lineTo(0.42 * s, -0.02 * s);
      ctx.lineTo(0.72 * s, 0.32 * s);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.6, s * 0.025);
      ctx.strokeStyle = LINE;
      R(0.42, -0.04, 0.6, 0.035, "#e9e4d6");                                      // bolt
      P([[1.02, -0.07], [1.08, -0.02], [1.02, 0.03]], METAL);
      P([[0.2, 0.03], [0.3, 0.03], [0.27, 0.26], [0.17, 0.26]], BODY);
      break;
    }
    case "dbarrel":
      P([[0.0, -0.06], [0.28, -0.12], [0.28, 0.06], [0.0, 0.16]], "#7a4f2c");    // stock
      R(0.26, -0.13, 0.12, 0.2, METAL, 0.02);                                     // breech
      R(0.38, -0.14, 0.62, 0.065, METAL);                                         // two barrels
      R(0.38, -0.07, 0.62, 0.065, METAL);
      R(0.42, -0.005, 0.28, 0.06, "#7a4f2c", 0.02);                               // fore-end
      R(0.36, -0.2, 0.04, 0.07, acc);                                             // hammers
      R(0.31, -0.2, 0.04, 0.07, acc);
      shine(0.4, -0.13, 0.58);
      break;
    case "frost":
      R(0.0, -0.08, 0.2, 0.11, METAL, 0.02);
      R(0.18, -0.17, 0.46, 0.22, BODY, 0.05);                                     // body
      R(0.64, -0.12, 0.2, 0.12, METAL, 0.02);
      P([[0.84, -0.16], [1.0, -0.2], [1.0, 0.08], [0.84, 0.04]], acc);            // flared emitter
      O(0.4, 0.13, 0.11, acc);                                                    // coolant canister
      ctx.save();
      ctx.shadowColor = acc;
      ctx.shadowBlur = s * 0.1;
      R(0.24, -0.12, 0.34, 0.04, "#e8fbff");
      ctx.restore();
      P([[0.22, 0.05], [0.3, 0.05], [0.28, 0.26], [0.2, 0.26]], BODY);
      break;
    case "ricochet":
      P([[0.0, -0.04], [0.16, -0.16], [0.6, -0.18], [0.7, -0.06], [0.6, 0.06], [0.16, 0.06]], BODY);
      R(0.66, -0.11, 0.3, 0.06, METAL);
      ctx.save();
      ctx.shadowColor = acc;
      ctx.shadowBlur = s * 0.12;
      O(0.38, -0.06, 0.08, acc);                                                  // energy cell
      O(0.98, -0.08, 0.04, acc);
      ctx.restore();
      P([[0.22, 0.05], [0.32, 0.05], [0.29, 0.28], [0.19, 0.28]], BODY);
      R(0.2, -0.24, 0.2, 0.06, acc, 0.03);
      break;
    case "cluster":
      R(0.0, -0.06, 0.18, 0.1, METAL);
      R(0.18, -0.2, 0.74, 0.28, "#5a4a32", 0.06);                                 // fat tube
      R(0.86, -0.22, 0.12, 0.32, DARK, 0.02);
      for (let i = 0; i < 3; i++) O(0.36 + i * 0.16, -0.06, 0.06, acc);           // visible bomblets
      P([[0.42, 0.08], [0.52, 0.08], [0.49, 0.32], [0.39, 0.32]], BODY);
      R(0.6, -0.31, 0.12, 0.11, DARK, 0.02);
      break;
    default:
      R(0, -0.1, 1, 0.2, acc);
  }
  ctx.restore();
}

// A gun icon as an image URL (for DOM screens). Cached.
const iconCache = new Map();
export function gunIconURL(id, w = 168, h = 72) {
  // DOM icons can use the sprite itself (scaled with CSS object-fit)
  if (GUN_ART[id]) return GUN_ART[id];
  const key = `${id}:${w}x${h}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement("canvas");
  const dpr = 2;
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  const L = Math.min(w * 0.82, h * 1.9);
  ctx.translate((w - L) / 2, h * 0.45);
  drawGun(ctx, id, L);
  const url = c.toDataURL("image/png");
  iconCache.set(key, url);
  return url;
}

// ---- card emblems -------------------------------------------------------------------

// Draws a card emblem centred on (0, 0), about `s` across.
export function drawCardIcon(ctx, icon, s) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const k = s / 100;
  ctx.scale(k, k);
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(5,7,12,0.7)";
  switch (icon) {
    case "shield": {
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.bezierCurveTo(22, -32, 38, -34, 40, -34);
      ctx.bezierCurveTo(40, 8, 26, 30, 0, 46);
      ctx.bezierCurveTo(-26, 30, -40, 8, -40, -34);
      ctx.bezierCurveTo(-38, -34, -22, -32, 0, -44);
      ctx.closePath();
      ctx.fillStyle = "#3f9bff";
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.bezierCurveTo(14, -22, 24, -22, 28, -22);
      ctx.bezierCurveTo(28, 4, 18, 20, 0, 32);
      ctx.closePath();
      ctx.fillStyle = "#9fd2ff";
      ctx.fill();
      break;
    }
    case "damage": {
      // a bullet with impact sparks
      ctx.fillStyle = "#ffcf5a";
      path([[-8, -6], [8, -6], [8, 34], [-8, 34]]);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.quadraticCurveTo(-8, -38, 0, -44);
      ctx.quadraticCurveTo(8, -38, 8, -6);
      ctx.closePath();
      ctx.fillStyle = "#e0773a";
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ff5a4a";
      ctx.lineWidth = 6;
      for (const [x1, y1, x2, y2] of [[-22, -30, -34, -40], [22, -30, 34, -40], [-26, -8, -40, -8], [26, -8, 40, -8]]) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      break;
    }
    case "rate":
      path([[8, -46], [-24, 4], [-2, 4], [-10, 46], [24, -8], [2, -8]]);
      ctx.fillStyle = "#ffe14d";
      ctx.fill();
      ctx.stroke();
      break;
    case "speed": {
      ctx.fillStyle = "#5aff96";
      path([[-6, -30], [30, 0], [-6, 30], [6, 0]]);
      ctx.fill();
      ctx.stroke();
      path([[-30, -30], [6, 0], [-30, 30], [-18, 0]]);
      ctx.fillStyle = "#2fbf6a";
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "heart":
      ctx.beginPath();
      ctx.moveTo(0, 40);
      ctx.bezierCurveTo(-44, 10, -44, -30, -20, -36);
      ctx.bezierCurveTo(-8, -38, 0, -28, 0, -20);
      ctx.bezierCurveTo(0, -28, 8, -38, 20, -36);
      ctx.bezierCurveTo(44, -30, 44, 10, 0, 40);
      ctx.closePath();
      ctx.fillStyle = "#ff5c8a";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.ellipse(-18, -18, 7, 10, -0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "reload":
      ctx.strokeStyle = "#5cf6ff";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(0, 0, 30, -0.3, Math.PI * 1.25);
      ctx.stroke();
      ctx.fillStyle = "#5cf6ff";
      path([[24, -34], [46, -12], [16, -4]]);
      ctx.fill();
      break;
    case "mag":
      ctx.fillStyle = "#ffcf5a";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 12, -36, 5, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      path([[-24, -26], [24, -26], [30, 40], [-14, 44]]);
      ctx.fillStyle = "#8f9bb0";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 0; i < 4; i++) ctx.fillRect(-14, -14 + i * 13, 30, 4);
      break;
    case "armor":
      path([[-36, -32], [-14, -40], [0, -30], [14, -40], [36, -32], [32, 4], [20, 40], [-20, 40], [-32, 4]]);
      ctx.fillStyle = "#aab6c9";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6f7c92";
      path([[-20, -16], [20, -16], [16, 28], [-16, 28]]);
      ctx.fill();
      break;
    case "leech":
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.bezierCurveTo(16, -18, 32, 0, 32, 16);
      ctx.arc(0, 16, 32, 0, Math.PI);
      ctx.bezierCurveTo(-32, 0, -16, -18, 0, -44);
      ctx.closePath();
      ctx.fillStyle = "#e0294a";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.ellipse(-12, 14, 6, 11, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "regen":
      ctx.fillStyle = "#5aff96";
      path([[-12, -40], [12, -40], [12, -12], [40, -12], [40, 12], [12, 12], [12, 40], [-12, 40], [-12, 12], [-40, 12], [-40, -12], [-12, -12]]);
      ctx.fill();
      ctx.stroke();
      break;
    case "build":
      ctx.fillStyle = "#e08a3c";
      for (const [x, y] of [[-38, -26], [2, -26], [-18, -4], [22, -4], [-38, 18], [2, 18]]) {
        ctx.beginPath();
        ctx.rect(x, y, 36, 19);
        ctx.fill();
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

// ---- power emblems ------------------------------------------------------------------

// Draws a power emblem centred on (0, 0), about `s` across.
export function drawPowerIcon(ctx, id, s) {
  ctx.save();
  const k = s / 100;
  ctx.scale(k, k);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (id) {
    case "freeze": {
      ctx.strokeStyle = "#bff4ff";
      ctx.lineWidth = 9;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -40);
        ctx.moveTo(0, -24);
        ctx.lineTo(-12, -34);
        ctx.moveTo(0, -24);
        ctx.lineTo(12, -34);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case "heal":
      ctx.fillStyle = "rgba(90,255,150,0.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5aff96";
      ctx.fillRect(-11, -32, 22, 64);
      ctx.fillRect(-32, -11, 64, 22);
      break;
    case "flame":
      ctx.fillStyle = "#ff6b2a";
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.bezierCurveTo(30, -14, 34, 10, 22, 30);
      ctx.bezierCurveTo(10, 46, -10, 46, -22, 30);
      ctx.bezierCurveTo(-34, 10, -20, -6, -8, -16);
      ctx.bezierCurveTo(-6, -2, 4, 4, 6, -8);
      ctx.bezierCurveTo(8, -20, 2, -32, 0, -44);
      ctx.fill();
      ctx.fillStyle = "#ffd25a";
      ctx.beginPath();
      ctx.ellipse(0, 22, 11, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "dash":
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      ctx.moveTo(40, 0);
      ctx.lineTo(4, -28);
      ctx.lineTo(4, -12);
      ctx.lineTo(-18, -12);
      ctx.lineTo(-18, 12);
      ctx.lineTo(4, 12);
      ctx.lineTo(4, 28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#ffe14d";
      ctx.lineWidth = 7;
      for (const [y, l] of [[-24, 18], [0, 12], [24, 18]]) {
        ctx.beginPath();
        ctx.moveTo(-44, y);
        ctx.lineTo(-44 + l, y);
        ctx.stroke();
      }
      break;
    case "barrier":
      ctx.strokeStyle = "#4fb0ff";
      ctx.lineWidth = 8;
      ctx.fillStyle = "rgba(79,176,255,0.25)";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * 40, Math.sin(a) * 40);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#cfe9ff";
      ctx.beginPath();
      ctx.arc(-12, -12, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

const powerIconCache = new Map();
export function powerIconURL(id, size = 64) {
  if (powerIconCache.has(id)) return powerIconCache.get(id);
  const c = document.createElement("canvas");
  c.width = c.height = size * 2;
  const ctx = c.getContext("2d");
  ctx.translate(size, size);
  drawPowerIcon(ctx, id, size * 1.6);
  const url = c.toDataURL("image/png");
  powerIconCache.set(id, url);
  return url;
}
