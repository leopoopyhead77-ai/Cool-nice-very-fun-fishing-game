// Touch controls (landscape):
//   left half  – floating MOVE joystick; push direction = walk direction
//   right half – floating AIM joystick; drag to aim (a translucent trajectory
//                line shows the shot), release to fire. A quick tap fires with
//                auto-aim; dragging back to the centre cancels.
//   BUILD button above the aim stick switches it to a build stick (preview
//   ghost while dragging, release to place). In build mode the weapon slots
//   become EDIT and RESET.
// Desktop: WASD move, mouse aim + release to fire, B build, E edit, R reset /
// reload, 1/2 or Q weapons.

export function layout(W, H) {
  const u = Math.max(0.72, Math.min(1.35, Math.min(W / 760, H / 380)));
  const R = 58 * u;
  const aim = { x: W - 128 * u, y: H - 112 * u };
  const move = { x: 128 * u, y: H - 112 * u };
  // BUILD sits directly over the attack stick
  const build = { x: aim.x, y: aim.y - R - 48 * u, r: 32 * u };
  // weapon slots (EDIT / RESET in build mode) stack in the right margin
  const bw = 116 * u;
  const bh = 34 * u;
  const slotX = W - 8 * u - bw;
  const slot0 = { x: slotX, y: 46 * u, w: bw, h: bh };
  const slot1 = { x: slotX, y: 46 * u + bh + 6 * u, w: bw, h: bh };
  const pause = { x: W - 30 * u, y: 24 * u, r: 18 * u };
  return { u, R, aim, move, build, slot0, slot1, pause, top: 40 * u };
}

const inRect = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const inCircle = (b, x, y, pad = 6) => Math.hypot(x - b.x, y - b.y) <= b.r + pad;

export function createInput(canvas, hooks) {
  const st = {
    W: 1, H: 1, L: layout(1, 1),
    move: null, // { id, bx, by, x, y }
    aim: null,  // { id, bx, by, x, y, dragged, mouse }
    keys: new Set(),
    actions: [],
    pressed: null,
    enabled: false,
  };

  function resize(W, H) {
    st.W = W;
    st.H = H;
    st.L = layout(W, H);
  }

  // Which HUD button is under (x, y), given the player's current mode.
  function buttonAt(x, y) {
    const L = st.L;
    const mode = hooks.mode();
    if (inCircle(L.pause, x, y)) return "pause";
    if (inCircle(L.build, x, y)) return "build";
    if (inRect(L.slot0, x, y)) return mode === "combat" ? "slot0" : "edit";
    if (inRect(L.slot1, x, y)) return mode === "combat" ? "slot1" : "reset";
    return null;
  }

  function press(btn) {
    const mode = hooks.mode();
    hooks.onButton?.(btn);
    switch (btn) {
      case "pause":
        hooks.onPause?.();
        break;
      case "build":
        st.actions.push({ t: "mode", mode: mode === "combat" ? "build" : "combat" });
        break;
      case "edit":
        st.actions.push({ t: "mode", mode: mode === "edit" ? "build" : "edit" });
        break;
      case "reset": {
        const a = aimVector();
        st.actions.push(a && a.mag > 0.25 ? { t: "reset", angle: a.angle } : { t: "reset" });
        break;
      }
      case "slot0":
      case "slot1": {
        const slot = btn === "slot0" ? 0 : 1;
        if (hooks.slot() === slot) st.actions.push({ t: "reload" });
        else st.actions.push({ t: "slot", slot });
        break;
      }
    }
  }

  function clampBase(x, y, side) {
    const L = st.L;
    const m = L.R + 10 * L.u;
    const minX = side === "left" ? m : st.W / 2 + m * 0.4;
    const maxX = side === "left" ? st.W / 2 - m * 0.4 : st.W - m;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(L.top + m, Math.min(st.H - m, y)),
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
    const btn = buttonAt(x, y);
    if (btn) {
      st.pressed = { id: ev.pointerId, btn };
      press(btn);
      return;
    }
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (_) { /* synthetic events can't be captured */ }
    if (ev.pointerType === "mouse") {
      if (ev.button !== 0) return;
      st.aim = { id: ev.pointerId, bx: 0, by: 0, x, y, dragged: true, mouse: true };
      return;
    }
    if (x < st.W / 2) {
      if (!st.move) {
        const b = clampBase(x, y, "left");
        st.move = { id: ev.pointerId, bx: b.x, by: b.y, x, y };
      }
    } else if (!st.aim) {
      const b = clampBase(x, y, "right");
      st.aim = { id: ev.pointerId, bx: b.x, by: b.y, x, y, dragged: false, mouse: false };
    }
  }

  function onMove(ev) {
    if (!st.enabled) return;
    const { x, y } = point(ev);
    if (st.move && st.move.id === ev.pointerId) {
      st.move.x = x;
      st.move.y = y;
    } else if (st.aim && st.aim.id === ev.pointerId) {
      st.aim.x = x;
      st.aim.y = y;
      if (!st.aim.mouse && Math.hypot(x - st.aim.bx, y - st.aim.by) > st.L.R * 0.28) {
        st.aim.dragged = true;
      }
    }
  }

  function onUp(ev) {
    if (st.pressed && st.pressed.id === ev.pointerId) st.pressed = null;
    if (st.move && st.move.id === ev.pointerId) st.move = null;
    if (st.aim && st.aim.id === ev.pointerId) {
      if (st.enabled && ev.type !== "pointercancel") release();
      st.aim = null;
    }
  }

  function release() {
    const a = aimVector();
    const mode = hooks.mode();
    const t = mode === "combat" ? "fire" : mode;
    if (!st.aim.dragged) st.actions.push({ t, tap: true, angle: 0, mag: 0 });
    else if (a && a.mag > 0.22) st.actions.push({ t, angle: a.angle, mag: a.mag });
    // dragged back into the dead zone: cancelled
  }

  // The live aim as { angle, mag } (mag 0..1), or null.
  function aimVector() {
    const a = st.aim;
    if (!a) return null;
    if (a.mouse) {
      const pp = hooks.playerScreen();
      if (!pp) return null;
      const dx = a.x - pp.x;
      const dy = a.y - pp.y;
      const reach = hooks.tileSize() * 9;
      return { angle: Math.atan2(dy, dx), mag: Math.min(1, Math.hypot(dx, dy) / reach) };
    }
    const dx = a.x - a.bx;
    const dy = a.y - a.by;
    const d = Math.hypot(dx, dy);
    return { angle: Math.atan2(dy, dx), mag: Math.min(1, d / st.L.R) };
  }

  function moveVector() {
    if (st.move) {
      const dx = st.move.x - st.move.bx;
      const dy = st.move.y - st.move.by;
      const d = Math.hypot(dx, dy);
      const dead = st.L.R * 0.12;
      if (d < dead) return { x: 0, y: 0 };
      const m = Math.min(1, (d - dead) / (st.L.R * 0.75));
      return { x: (dx / d) * m, y: (dy / d) * m };
    }
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
    const mode = hooks.mode();
    switch (ev.code) {
      case "KeyB":
        press("build");
        break;
      case "KeyE":
        if (mode === "combat") st.actions.push({ t: "mode", mode: "edit" });
        else press("edit");
        break;
      case "KeyR":
        if (mode === "combat") st.actions.push({ t: "reload" });
        else press("reset");
        break;
      case "Digit1":
        st.actions.push({ t: "slot", slot: 0 });
        break;
      case "Digit2":
        st.actions.push({ t: "slot", slot: 1 });
        break;
      case "KeyQ":
        st.actions.push({ t: "swap" });
        break;
      case "Escape":
      case "KeyP":
        hooks.onPause?.();
        break;
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
    st.move = null;
    st.aim = null;
    st.actions.length = 0;
    st.keys.clear();
    st.pressed = null;
  }

  // The human player's controller.
  const controller = {
    poll() {
      const m = moveVector();
      const a = aimVector();
      const aiming = !!(st.aim && st.aim.dragged && a && a.mag > 0.22);
      const actions = st.actions.splice(0);
      return {
        mx: m.x, my: m.y,
        aiming,
        aimAngle: a ? a.angle : 0,
        aimMag: a ? a.mag : 0,
        actions,
      };
    },
  };

  return { st, resize, controller, aimVector, reset };
}
