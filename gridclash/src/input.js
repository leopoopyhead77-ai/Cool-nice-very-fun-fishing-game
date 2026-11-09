// Touch controls, for one player (vs bot) or two players on one phone.
//
// Each human gets a "pad": a move stick, an aim stick (always shoots), a
// BUILD button above the aim stick with EDIT and RESET beside it, and two
// weapon-slot buttons.
//
// Building (no mode switching):
//   tap BUILD            – a wall drops right in front of you
//   drag from BUILD      – aim where it lands (live preview), release to place;
//                          drag back onto the button to cancel
//   tap EDIT             – cut a gap in (or restore) your wall in front of you
//   drag from EDIT       – pick which wall tile, release to cut / restore
//   tap ↺ (reset)        – restore your nearest edited wall
//
// Solo (landscape, held normally):
//   left half  – floating MOVE stick; right half – floating AIM stick.
//
// Local PvP (one phone, one player at each end):
//   Upright phone (the APK switches to portrait for this): Blue at the bottom
//   end, Red at the top end; Red's controls are flipped to face them.
//   Sideways screen (desktop browsers): Blue at the left end, Red at the right.
//   Each player owns their half of the screen; left thumb moves, right thumb
//   aims, and buttons and labels face their player. Sticks push in screen
//   directions as seen on the shared arena.
//
// Aim stick: drag to aim (translucent trajectory line), release to fire; quick
// tap = auto-aim; drag back to centre = cancel. In build mode it places walls,
// in edit mode it cuts / restores one tile of your wall.
// Desktop (player 1): WASD, mouse aim + release, B build, E edit, R reset /
// reload, 1/2 or Q weapons, Esc pause.

import { GW, GH } from "./world.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fitArena(W, H, top, side, bottom) {
  const TS = Math.min((W - side * 2) / GW, (H - top - bottom) / GH);
  return {
    TS,
    ox: Math.round((W - TS * GW) / 2),
    oy: Math.round(top + (H - top - bottom - TS * GH) / 2),
  };
}

// A button rect in screen space, plus its size in the pad's own (rotated)
// frame so the renderer can draw it facing its player.
function slotRect(cx, cy, lw, lh, rot) {
  const sideways = Math.abs(Math.sin(rot)) > 0.5;
  const w = sideways ? lh : lw;
  const h = sideways ? lw : lh;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, lw, lh };
}

export function layout(W, H, pvp = false) {
  const u = clamp(Math.min(W / 760, H / 380), 0.72, 1.35);

  if (!pvp) {
    const R = 58 * u;
    const top = 40 * u;
    const aim = { x: W - 128 * u, y: H - 112 * u };
    const move = { x: 128 * u, y: H - 112 * u };
    // BUILD sits directly over the attack stick
    const build = { x: aim.x, y: aim.y - R - 48 * u, r: 32 * u };
    // weapon slots (EDIT / RESET in build mode) stack in the right margin
    const bw = 116 * u;
    const bh = 34 * u;
    const sx = W - 8 * u - bw / 2;
    const pad = {
      team: 0, rot: 0, center: { x: W / 2, y: H / 2 },
      move, aim, build,
      slot0: slotRect(sx, 46 * u + bh / 2, bw, bh, 0),
      slot1: slotRect(sx, 46 * u + bh * 1.5 + 6 * u, bw, bh, 0),
      zones: {
        move: { x0: 0, y0: top, x1: W / 2, y1: H },
        aim: { x0: W / 2, y0: top, x1: W, y1: H },
      },
    };
    addQuickButtons(pad, u);
    addPowerButton(pad, u, R, 40 * u);
    return {
      u, R, top, pvp: false,
      arena: fitArena(W, H, top, 4, 4),
      pause: { x: W - 30 * u, y: 24 * u, r: 18 * u },
      pads: [pad],
    };
  }

  if (H > W) return portraitPvp(W, H);

  const R = 44 * u;
  const arena = fitArena(W, H, 18 * u, 4, 4);
  // stick column centre: middle of the margin beside the arena, but never so
  // close to the edge that the stick ring is cut off
  const cx0 = Math.max(R + 6 * u, arena.ox / 2);
  const cx1 = W - cx0;
  const edge = R + 14 * u;
  const lw = 96 * u;
  const lh = 28 * u;
  const off = lh / 2 + 3 * u;
  const blue = {
    team: 0, rot: Math.PI / 2, center: { x: W / 4, y: H / 2 },
    move: { x: cx0, y: edge },            // under Blue's left thumb
    aim: { x: cx0, y: H - edge },         // under Blue's right thumb
    build: { x: cx0 + R + 30 * u, y: H - edge, r: 26 * u }, // "above" = toward the arena
    // Blue's "up" points to screen +x, so slot 1 (top) is the inner one
    slot0: slotRect(cx0 + off, H / 2, lw, lh, Math.PI / 2),
    slot1: slotRect(cx0 - off, H / 2, lw, lh, Math.PI / 2),
    zones: {
      move: { x0: 0, y0: 0, x1: W / 2, y1: H / 2 },
      aim: { x0: 0, y0: H / 2, x1: W / 2, y1: H },
    },
  };
  const red = {
    team: 1, rot: -Math.PI / 2, center: { x: (W * 3) / 4, y: H / 2 },
    move: { x: cx1, y: H - edge },
    aim: { x: cx1, y: edge },
    build: { x: cx1 - R - 30 * u, y: edge, r: 26 * u },
    slot0: slotRect(cx1 - off, H / 2, lw, lh, -Math.PI / 2),
    slot1: slotRect(cx1 + off, H / 2, lw, lh, -Math.PI / 2),
    zones: {
      aim: { x0: W / 2, y0: 0, x1: W, y1: H / 2 },
      move: { x0: W / 2, y0: H / 2, x1: W, y1: H },
    },
  };
  addQuickButtons(blue, u);
  addQuickButtons(red, u);
  addPowerButton(blue, u, R, 34 * u);
  addPowerButton(red, u, R, 34 * u);
  return {
    u, R, top: 18 * u, pvp: true,
    arena,
    pause: { x: W / 2, y: H - 15 * u, r: 13 * u },
    pads: [blue, red],
  };
}

// Local PvP with the phone upright: Blue at the bottom end, Red at the top end.
// The arena is drawn turned 90° (bases at each player's end), and each
// player's controls sit in a band at their end, Red's flipped 180° to face them.
function portraitPvp(W, H) {
  const u = clamp(Math.min(W / 380, H / 760), 0.72, 1.35);
  const R = 42 * u;
  const band = 165 * u;
  const TS = Math.min((W - 8) / GH, (H - band * 2) / GW);
  const aw = GH * TS;
  const ah = GW * TS;
  const arena = {
    TS, portrait: true,
    ox: Math.round((W - aw) / 2),
    oy: Math.round(band + (H - band * 2 - ah) / 2),
  };
  const edge = R + 26 * u; // leaves room for the hint under each stick
  const lw = 100 * u;
  const lh = 30 * u;
  const blue = {
    team: 0, rot: 0, center: { x: W / 2, y: H * 0.72 },
    move: { x: R + 16 * u, y: H - edge },           // left thumb
    aim: { x: W - R - 16 * u, y: H - edge },        // right thumb
    build: { x: W - R - 16 * u, y: H - edge - R - 30 * u, r: 24 * u }, // above the aim stick
    slot0: slotRect(W / 2, H - 58 * u, lw, lh, 0),
    slot1: slotRect(W / 2, H - 24 * u, lw, lh, 0),
    info: { x: W / 2, y: H - 92 * u }, // score pill: above the weapon slots, clear of every button
    zones: {
      move: { x0: 0, y0: H / 2, x1: W / 2, y1: H },
      aim: { x0: W / 2, y0: H / 2, x1: W, y1: H },
    },
  };
  const flip = (p) => ({ ...p, x: W - p.x, y: H - p.y });
  const red = {
    team: 1, rot: Math.PI, center: { x: W / 2, y: H * 0.28 },
    move: flip(blue.move),
    aim: flip(blue.aim),
    build: flip(blue.build),
    slot0: slotRect(W / 2, 58 * u, lw, lh, Math.PI),
    slot1: slotRect(W / 2, 24 * u, lw, lh, Math.PI),
    info: { x: W / 2, y: 92 * u },
    zones: {
      move: { x0: W / 2, y0: 0, x1: W, y1: H / 2 },
      aim: { x0: 0, y0: 0, x1: W / 2, y1: H / 2 },
    },
  };
  addQuickButtons(blue, u);
  addQuickButtons(red, u);
  addPowerButton(blue, u, R, 34 * u);
  addPowerButton(red, u, R, 34 * u);
  return {
    u, R, top: 0, pvp: true, portrait: true,
    // screen directions are turned 90° from board directions in this layout
    worldRot: Math.PI / 2,
    arena,
    pause: { x: 16 * u, y: H / 2, r: 13 * u },
    pads: [blue, red],
  };
}

// Small EDIT and RESET buttons beside BUILD, placed in the pad's own frame
// (to the player's left of BUILD) so they sit right for every seat.
function addQuickButtons(pad, u) {
  const c = Math.cos(pad.rot);
  const n = Math.sin(pad.rot);
  const at = (lx, ly) => ({ x: pad.build.x + lx * c - ly * n, y: pad.build.y + lx * n + ly * c });
  const gap = pad.build.r + 8 * u;
  pad.edit = { ...at(-(gap + 22 * u), 4 * u), r: 21 * u };
  pad.reset = { ...at(-(gap + 22 * u + 50 * u), 4 * u), r: 17 * u };
}

// The POWER button sits just above the move stick, in the pad's own frame.
function addPowerButton(pad, u, R, gap) {
  const c = Math.cos(pad.rot);
  const n = Math.sin(pad.rot);
  const ly = -(R + gap);
  pad.power = { x: pad.move.x - ly * n, y: pad.move.y + ly * c, r: 25 * u };
}

// Where the 3 buff cards sit for a pad, in screen space (and in the pad's own
// frame for drawing). Shared by input (taps) and render (drawing).
export function cardRects(L, pad, n = 3) {
  const u = L.u;
  const big = !L.pvp;
  const lw = (big ? 128 : 104) * u;
  const lh = (big ? 176 : 146) * u;
  const gap = 10 * u;
  const c = Math.cos(pad.rot);
  const sn = Math.sin(pad.rot);
  // shared phone: nudge the cards toward the middle (clear of the score pill)
  const nudge = L.pvp ? -26 * u : 8 * u;
  const center = { x: pad.center.x - nudge * sn, y: pad.center.y + nudge * c };
  return Array.from({ length: n }, (_, i) => {
    const lx = (i - (n - 1) / 2) * (lw + gap);
    const cx = center.x + lx * c;
    const cy = center.y + lx * sn;
    return slotRect(cx, cy, lw, lh, pad.rot);
  });
}

const inRect = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const inCircle = (b, x, y, pad = 6) => Math.hypot(x - b.x, y - b.y) <= b.r + pad;
const inZone = (z, x, y) => x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1;

export function createInput(canvas, hooks) {
  const st = {
    W: 1, H: 1, pvp: false, L: layout(1, 1),
    // per team: { move, aim, btn (a drag that started on BUILD / EDIT), actions }
    ps: [0, 1].map(() => ({ move: null, aim: null, btn: null, actions: [] })),
    keys: new Set(),
    pressed: null,
    enabled: false,
  };

  function resize(W, H) {
    st.W = W;
    st.H = H;
    st.L = layout(W, H, st.pvp);
  }

  function setPvp(pvp) {
    st.pvp = !!pvp;
    resize(st.W, st.H);
  }

  // Which HUD button is under (x, y)? → { team, btn } or null.
  function buttonAt(x, y) {
    const L = st.L;
    if (inCircle(L.pause, x, y)) return { team: 0, btn: "pause" };
    for (const pad of L.pads) {
      const mode = hooks.mode(pad.team);
      const classic = hooks.buildStyle?.() === "classic";
      if (pad.power && hooks.hasPower?.(pad.team) && inCircle(pad.power, x, y, 4)) return { team: pad.team, btn: "power" };
      if (inCircle(pad.build, x, y)) return { team: pad.team, btn: "build" };
      if (!classic && inCircle(pad.edit, x, y, 4)) return { team: pad.team, btn: "qedit" };
      if (!classic && inCircle(pad.reset, x, y, 4)) return { team: pad.team, btn: "reset" };
      if (inRect(pad.slot0, x, y)) return { team: pad.team, btn: mode === "combat" ? "slot0" : "edit" };
      if (inRect(pad.slot1, x, y)) return { team: pad.team, btn: mode === "combat" ? "slot1" : "reset" };
    }
    return null;
  }

  function press(team, btn) {
    const mode = hooks.mode(team);
    const out = st.ps[team].actions;
    switch (btn) {
      case "pause":
        hooks.onPause?.();
        break;
      case "build":
        // classic: BUILD toggles the aim stick between shooting and building
        if (hooks.buildStyle?.() === "classic") out.push({ t: "mode", mode: mode === "combat" ? "build" : "combat" });
        else out.push({ t: "qbuild", tap: true });
        break;
      case "qedit":
        out.push({ t: "qedit", tap: true });
        break;
      case "power":
        out.push({ t: "power" });
        break;
      case "edit":
        out.push({ t: "mode", mode: mode === "edit" ? "build" : "edit" });
        break;
      case "reset": {
        const a = aimVector(team);
        out.push(a && a.mag > 0.25 ? { t: "reset", angle: a.angle } : { t: "reset" });
        break;
      }
      case "slot0":
      case "slot1": {
        const slot = btn === "slot0" ? 0 : 1;
        if (hooks.slot(team) === slot) out.push({ t: "reload" });
        else out.push({ t: "slot", slot });
        break;
      }
    }
  }

  // Keep a floating stick's base inside its zone, with a full margin at
  // screen edges and a smaller one at edges shared with another zone.
  function clampBase(x, y, z) {
    const m = st.L.R + 8 * st.L.u;
    const mx0 = z.x0 <= 0 ? m : m * 0.4;
    const mx1 = z.x1 >= st.W ? m : m * 0.4;
    const my0 = z.y0 <= st.L.top ? m : m * 0.4;
    const my1 = z.y1 >= st.H ? m : m * 0.4;
    return {
      x: clamp(x, z.x0 + mx0, Math.max(z.x0 + mx0, z.x1 - mx1)),
      y: clamp(y, z.y0 + my0, Math.max(z.y0 + my0, z.y1 - my1)),
    };
  }

  function point(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function onDown(ev) {
    if (!st.enabled) return;
    ev.preventDefault();
    hooks.onFirstTouch?.();
    const { x, y } = point(ev);
    // between rounds the only things to tap are the buff cards (and pause)
    if (hooks.cardPhase?.()) {
      if (inCircle(st.L.pause, x, y)) {
        hooks.onPause?.();
        return;
      }
      for (const pad of st.L.pads) {
        cardRects(st.L, pad).forEach((r, i) => {
          if (inRect(r, x, y)) st.ps[pad.team].actions.push({ t: "card", i });
        });
      }
      return;
    }
    const hit = buttonAt(x, y);
    if (hit) {
      st.pressed = { id: ev.pointerId, ...hit };
      // BUILD and EDIT act like mini sticks: tap = quick, drag = aimed
      const stickStyle = hooks.buildStyle?.() !== "classic";
      if (stickStyle && (hit.btn === "build" || hit.btn === "qedit") && !st.ps[hit.team].btn) {
        const pad = st.L.pads.find((p) => p.team === hit.team);
        const b = hit.btn === "build" ? pad.build : pad.edit;
        try {
          canvas.setPointerCapture(ev.pointerId);
        } catch (_) { /* synthetic events can't be captured */ }
        st.ps[hit.team].btn = { kind: hit.btn, id: ev.pointerId, bx: b.x, by: b.y, x, y, dragged: false };
        return;
      }
      press(hit.team, hit.btn);
      return;
    }
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (_) { /* synthetic events can't be captured */ }
    if (ev.pointerType === "mouse") {
      if (ev.button !== 0) return;
      st.ps[0].aim = { id: ev.pointerId, bx: 0, by: 0, x, y, dragged: true, mouse: true };
      return;
    }
    for (const pad of st.L.pads) {
      const s = st.ps[pad.team];
      for (const kind of ["move", "aim"]) {
        if (!inZone(pad.zones[kind], x, y) || s[kind]) continue;
        const b = clampBase(x, y, pad.zones[kind]);
        s[kind] = { id: ev.pointerId, bx: b.x, by: b.y, x, y, dragged: false, mouse: false };
        return;
      }
    }
  }

  function findStick(id) {
    for (let team = 0; team < 2; team++) {
      const s = st.ps[team];
      if (s.move && s.move.id === id) return { team, kind: "move", stick: s.move };
      if (s.aim && s.aim.id === id) return { team, kind: "aim", stick: s.aim };
      if (s.btn && s.btn.id === id) return { team, kind: "btn", stick: s.btn };
    }
    return null;
  }

  // The drag from BUILD / EDIT as { angle, mag } in board directions.
  function btnVector(team) {
    const b = st.ps[team].btn;
    if (!b || !b.dragged) return null;
    const dx = b.x - b.bx;
    const dy = b.y - b.by;
    const reach = st.L.R * 1.6;
    return { angle: Math.atan2(dy, dx) + (st.L.worldRot || 0), mag: Math.min(1, Math.hypot(dx, dy) / reach) };
  }

  function releaseBtn(team) {
    const b = st.ps[team].btn;
    const t = b.kind === "build" ? "qbuild" : "qedit";
    const out = st.ps[team].actions;
    if (!b.dragged) {
      out.push({ t, tap: true });
      return;
    }
    // dragged back onto the button: cancelled
    if (Math.hypot(b.x - b.bx, b.y - b.by) < st.L.R * 0.35) return;
    const v = btnVector(team);
    out.push({ t, angle: v.angle, mag: v.mag });
  }

  function onMove(ev) {
    if (!st.enabled) return;
    const f = findStick(ev.pointerId);
    if (!f) return;
    const { x, y } = point(ev);
    f.stick.x = x;
    f.stick.y = y;
    if (f.kind === "aim" && !f.stick.mouse && Math.hypot(x - f.stick.bx, y - f.stick.by) > st.L.R * 0.28) {
      f.stick.dragged = true;
    }
    if (f.kind === "btn" && Math.hypot(x - f.stick.bx, y - f.stick.by) > st.L.R * 0.4) f.stick.dragged = true;
  }

  function onUp(ev) {
    if (st.pressed && st.pressed.id === ev.pointerId) st.pressed = null;
    const f = findStick(ev.pointerId);
    if (!f) return;
    if (f.kind === "aim" && st.enabled && ev.type !== "pointercancel") release(f.team);
    if (f.kind === "btn" && st.enabled && ev.type !== "pointercancel") releaseBtn(f.team);
    st.ps[f.team][f.kind] = null;
  }

  function release(team) {
    const s = st.ps[team];
    const a = aimVector(team);
    const mode = hooks.mode(team);
    const t = mode === "combat" ? "fire" : mode;
    if (!s.aim.dragged) s.actions.push({ t, tap: true, angle: 0, mag: 0 });
    else if (a && a.mag > 0.22) s.actions.push({ t, angle: a.angle, mag: a.mag });
    // dragged back into the dead zone: cancelled
  }

  // The live aim for a team as { angle, mag } (mag 0..1), or null.
  function aimVector(team) {
    const a = st.ps[team].aim;
    if (!a) return null;
    if (a.mouse) {
      const pp = hooks.playerScreen(team);
      if (!pp) return null;
      const dx = a.x - pp.x;
      const dy = a.y - pp.y;
      const reach = st.L.arena.TS * 9;
      return { angle: Math.atan2(dy, dx) + (st.L.worldRot || 0), mag: Math.min(1, Math.hypot(dx, dy) / reach) };
    }
    const dx = a.x - a.bx;
    const dy = a.y - a.by;
    return { angle: Math.atan2(dy, dx) + (st.L.worldRot || 0), mag: Math.min(1, Math.hypot(dx, dy) / st.L.R) };
  }

  // Movement in board directions (the arena may be drawn turned on screen).
  function moveVector(team) {
    const v = screenMove(team);
    const r = st.L.worldRot || 0;
    if (!r) return v;
    const c = Math.cos(r);
    const n = Math.sin(r);
    return { x: v.x * c - v.y * n, y: v.x * n + v.y * c };
  }

  function screenMove(team) {
    const m = st.ps[team].move;
    if (m) {
      const dx = m.x - m.bx;
      const dy = m.y - m.by;
      const d = Math.hypot(dx, dy);
      const dead = st.L.R * 0.12;
      if (d < dead) return { x: 0, y: 0 };
      const k = Math.min(1, (d - dead) / (st.L.R * 0.75));
      return { x: (dx / d) * k, y: (dy / d) * k };
    }
    if (team !== 0) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    const k = st.keys;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) y -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y += 1;
    const d = Math.hypot(x, y);
    return d ? { x: x / d, y: y / d } : { x: 0, y: 0 };
  }

  function onKey(ev) {
    if (!st.enabled) return;
    const down = ev.type === "keydown";
    if (down) st.keys.add(ev.code);
    else st.keys.delete(ev.code);
    if (!down || ev.repeat) return;
    const mode = hooks.mode(0);
    const out = st.ps[0].actions;
    switch (ev.code) {
      case "KeyB": out.push({ t: "qbuild", tap: true }); break;
      case "KeyE": out.push({ t: "qedit", tap: true }); break;
      case "KeyF": press(0, "reset"); break;
      case "Space": out.push({ t: "power" }); ev.preventDefault?.(); break;
      case "KeyR": out.push({ t: "reload" }); break;
      case "Digit1": out.push({ t: "slot", slot: 0 }); break;
      case "Digit2": out.push({ t: "slot", slot: 1 }); break;
      case "KeyQ": out.push({ t: "swap" }); break;
      case "Escape":
      case "KeyP": hooks.onPause?.(); break;
    }
  }

  canvas.addEventListener("pointerdown", onDown, { passive: false });
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);

  function reset() {
    for (const s of st.ps) {
      s.move = null;
      s.aim = null;
      s.btn = null;
      s.actions.length = 0;
    }
    st.keys.clear();
    st.pressed = null;
  }

  const controllers = [0, 1].map((team) => ({
    poll() {
      const m = moveVector(team);
      const a = aimVector(team);
      const s = st.ps[team];
      const aiming = !!(s.aim && s.aim.dragged && a && a.mag > 0.22);
      const bv = btnVector(team);
      return {
        mx: m.x, my: m.y,
        // a live BUILD / EDIT drag, for the placement preview
        buildAim: bv && s.btn.kind === "build" ? bv : null,
        editAim: bv && s.btn.kind === "qedit" ? bv : null,
        aiming,
        aimAngle: a ? a.angle : 0,
        aimMag: a ? a.mag : 0,
        actions: s.actions.splice(0),
      };
    },
  }));

  return { st, resize, setPvp, controllers, controller: controllers[0], aimVector, reset };
}
