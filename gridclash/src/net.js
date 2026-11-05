// Online play between phones on any network (mobile data included).
//
// There is no game server. Phones meet on a free public MQTT broker over
// secure WebSockets (wss), which works through mobile carrier NAT because
// every phone only makes outgoing connections. The room creator's phone is
// the HOST: it runs the real simulation. Guests send their controls and draw
// the host's snapshots, predicting their own movement so it feels instant.
//
// Each guest also tries a direct WebRTC link to the host (STUN only). If it
// opens, gameplay traffic switches to it for lower latency; if the carrier's
// NAT blocks it, everything keeps flowing through the broker.
//
// Room code: 5 characters. The first one also says which broker the room is
// on, so a guest connects to the same one as the host.

import { mqttConnect } from "./mqtt.js";
import { GUNS } from "./guns.js";
import { clearWalls } from "./world.js";

export const BROKERS = [
  { url: "wss://public.cloud.shiftr.io", username: "public", password: "public" },
  { url: "wss://broker.emqx.io:8084/mqtt" },
  { url: "wss://broker.hivemq.com:8884/mqtt" },
];
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOT = "gridclash/v2/";
const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
const TIMEOUT_MS = 8000;

const rid = (n) => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");

export function normalizeCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/I/g, "1").slice(0, 5);
}

export function brokerForCode(code) {
  const i = ALPHA.indexOf(code[0]);
  return i < 0 ? 0 : i % BROKERS.length;
}

async function connectBroker(index, clientId) {
  const b = BROKERS[index];
  return mqttConnect(b.url, clientId, { username: b.username, password: b.password, timeout: 12000, keepalive: 20 });
}

// ---- snapshots ------------------------------------------------------------------

const MODES = ["combat", "build", "edit"];
const KINDS = ["lob", "bullet", "rocket"];
const GUN_INDEX = Object.fromEntries(GUNS.map((g, i) => [g.id, i]));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function encodeWalls(world) {
  return world.walls.map((w) => [
    w.id, w.owner, w.team, w.vertical ? 1 : 0, w.edit, r2(w.born),
    w.cells.map((c) => (c.alive ? Math.round(c.hp) : -1)),
    w.cells[0].x, w.cells[0].y,
  ]);
}

// Host side: everything a guest needs to draw this moment of the match.
export function encodeSnapshot(g, n, extra) {
  const fresh = (list) => list.filter((f) => !f._sent && (f._sent = true));
  return {
    t: "s", n, ...extra,
    tm: r2(g.time), st: g.state, sT: r2(g.stateT), rd: g.round, sc: g.score,
    tl: r2(g.timeLeft), rw: g.roundWinner, mw: g.matchWinner, sh: r2(g.shake),
    p: g.players.map((p) => [
      r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), p.hp, p.alive ? 1 : 0, r2(p.facing),
      p.aiming ? 1 : 0, r2(p.aimAngle), r2(p.aimMag), MODES.indexOf(p.mode), p.slot,
      p.guns[0].ammo, p.guns[1].ammo, r2(p.reloadT), r2(p.cd), r2(p.swapT),
      Math.floor(p.mats), r2(p.hitFlash), r2(p.recoil), p.burst ? 1 : 0,
      [p.stats.dmg, p.stats.shots, p.stats.hits, p.stats.walls, p.stats.edits],
    ]),
    b: g.bullets.map((b) => (b.kind === "lob"
      ? [0, GUN_INDEX[b.def.id], b.owner, r2(b.sx), r2(b.sy), r2(b.tx), r2(b.ty), r2(b.t), r2(b.T)]
      : [KINDS.indexOf(b.kind), GUN_INDEX[b.def.id], b.owner, r2(b.x), r2(b.y), r3(b.dx), r3(b.dy), r2(b.speed), r2(b.left), r2(b.age)])),
    mk: g.medkits.map((m) => (m.up ? 1 : 0)),
    fx: {
      bo: fresh(g.booms).map((f) => [r2(f.x), r2(f.y), f.R, f.color, r2(f.t)]),
      be: fresh(g.beams).map((f) => [r2(f.x0), r2(f.y0), r2(f.x1), r2(f.y1), f.color, r2(f.t)]),
      tx: fresh(g.texts).map((f) => [r2(f.x), r2(f.y), f.text, f.color, r2(f.t)]),
    },
  };
}

// Guest side: overwrite the local copy of the match with a snapshot.
export function applySnapshot(g, s) {
  g.time = s.tm;
  g.state = s.st;
  g.stateT = s.sT;
  g.round = s.rd;
  g.score = s.sc;
  g.timeLeft = s.tl;
  g.roundWinner = s.rw;
  g.matchWinner = s.mw;
  g.shake = Math.max(g.shake, s.sh);
  s.p.forEach((a, i) => {
    const p = g.players[i];
    if (!p) return;
    [p.x, p.y, p.vx, p.vy, p.hp] = a;
    p.alive = !!a[5];
    p.facing = a[6];
    p.aiming = !!a[7];
    p.aimAngle = a[8];
    p.aimMag = a[9];
    p.mode = MODES[a[10]] || "combat";
    p.slot = a[11];
    p.guns[0].ammo = a[12];
    p.guns[1].ammo = a[13];
    p.reloadT = a[14];
    p.cd = a[15];
    p.swapT = a[16];
    p.mats = a[17];
    p.hitFlash = Math.max(p.hitFlash, a[18]);
    p.recoil = Math.max(p.recoil, a[19]);
    p.burst = a[20] ? {} : null;
    [p.stats.dmg, p.stats.shots, p.stats.hits, p.stats.walls, p.stats.edits] = a[21];
  });
  g.bullets = s.b.map((a) => {
    const def = GUNS[a[1]];
    if (a[0] === 0) {
      const [, , owner, sx, sy, tx, ty, t, T] = a;
      const k = T > 0 ? t / T : 1;
      return { kind: "lob", def, owner, sx, sy, tx, ty, t, T, x: sx + (tx - sx) * k, y: sy + (ty - sy) * k, h: 0 };
    }
    const [k, , owner, x, y, dx, dy, speed, left, age] = a;
    return { kind: KINDS[k], def, owner, x, y, px: x, py: y, dx, dy, speed, left, age, dmg: 0 };
  });
  s.mk.forEach((up, i) => {
    if (g.medkits[i]) g.medkits[i].up = !!up;
  });
  if (s.w) {
    const w = g.world;
    clearWalls(w);
    for (const [id, owner, team, vertical, edit, born, hps, x0, y0] of s.w) {
      const wall = {
        id, owner, team, vertical: !!vertical, edit, born,
        cells: hps.map((hp, i) => ({
          x: vertical ? x0 : x0 + i,
          y: vertical ? y0 + i : y0,
          hp: Math.max(0, hp),
          alive: hp >= 0,
        })),
      };
      wall.cells.forEach((c, i) => {
        if (c.alive) w.wallAt[c.y * 30 + c.x] = { wall, i };
      });
      w.walls.push(wall);
    }
  }
  for (const [x, y, R, color, t] of s.fx.bo) g.booms.push({ x, y, R, color, t, life: 0.45 });
  for (const [x0, y0, x1, y1, color, t] of s.fx.be) g.beams.push({ x0, y0, x1, y1, color, t, life: 0.35 });
  for (const [x, y, text, color, t] of s.fx.tx) g.texts.push({ x, y, text, color, t, life: 0.9 });
}

// ---- WebRTC (optional direct link) ------------------------------------------------

function canRtc() {
  return typeof RTCPeerConnection !== "undefined";
}

function attachChannel(dc, onMsg, onState) {
  dc.onopen = () => onState(true);
  dc.onclose = () => onState(false);
  dc.onmessage = (e) => {
    try {
      onMsg(JSON.parse(e.data));
    } catch (_) { /* ignore junk */ }
  };
}

// ---- host -------------------------------------------------------------------------

// opts: { mode: "1v1"|"2v2", name, loadout, onLobby(slots), onGuestMessage, onStatus }
export async function createHost(opts) {
  const size = opts.mode === "2v2" ? 4 : 2;
  const cid = "h" + rid(8);
  let client = null;
  let brokerIndex = 0;
  let lastErr = null;
  for (let i = 0; i < BROKERS.length && !client; i++) {
    opts.onStatus?.(`Connecting to relay ${i + 1}/${BROKERS.length}…`);
    try {
      client = await connectBroker(i, cid);
      brokerIndex = i;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!client) throw new Error("Couldn't reach any relay (" + (lastErr && lastErr.message) + ")");

  // first character picks the broker
  let first;
  do first = ALPHA[Math.floor(Math.random() * ALPHA.length)];
  while (ALPHA.indexOf(first) % BROKERS.length !== brokerIndex);
  const code = first + rid(4);
  const base = ROOT + code;

  const slots = Array.from({ length: size }, () => null);
  slots[0] = { name: opts.name, cid: "host", human: true, loadout: opts.loadout, link: "host" };
  const guests = new Map(); // cid -> guest record
  let started = false;
  let closed = false;

  const host = {
    code, size, slots, guests,
    get started() { return started; },
    set started(v) { started = v; },
    broadcast(msg) {
      client.publish(base + "/all", JSON.stringify(msg));
    },
    sendTo(gcid, msg) {
      client.publish(base + "/g/" + gcid, JSON.stringify(msg));
    },
    // fast path: direct channel to every guest that has one, relay for the rest
    sendSnapshot(snap) {
      const raw = JSON.stringify(snap);
      let relay = false;
      for (const gu of guests.values()) {
        if (gu.dc && gu.dc.readyState === "open") {
          try {
            gu.dc.send(raw);
          } catch (_) {
            relay = true;
          }
        } else relay = true;
      }
      if (relay) client.publish(base + "/all", raw);
    },
    lobby() {
      host.broadcast({
        t: "lobby", size, mode: opts.mode, started,
        slots: slots.map((s) => (s ? { name: s.name, cid: s.cid, link: s.link, ping: s.ping || 0 } : null)),
      });
      opts.onLobby?.(slots);
    },
    kick(slot) {
      const s = slots[slot];
      if (!s || s.cid === "host") return;
      dropGuest(s.cid, "kicked");
    },
    close() {
      closed = true;
      clearInterval(watch);
      clearInterval(lobbyTimer);
      try {
        host.broadcast({ t: "bye" });
      } catch (_) { /* ignore */ }
      for (const gu of guests.values()) gu.pc?.close();
      setTimeout(() => client.close(), 150);
    },
  };

  function dropGuest(gcid, why) {
    const gu = guests.get(gcid);
    if (!gu) return;
    guests.delete(gcid);
    gu.pc?.close();
    if (why === "kicked") host.sendTo(gcid, { t: "kicked" });
    if (!started) slots[gu.slot] = null;
    else if (slots[gu.slot]) slots[gu.slot].left = true;
    opts.onGuestLeft?.(gu.slot, why);
    host.lobby();
  }

  async function offerRtc(gu) {
    if (!canRtc()) return;
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE });
      gu.pc = pc;
      const dc = pc.createDataChannel("g", { ordered: false, maxRetransmits: 0 });
      gu.dc = dc;
      attachChannel(dc, (m) => onGuestMsg(m, true), (open) => {
        const s = slots[gu.slot];
        if (s && s.cid === gu.cid) s.link = open ? "direct" : "relay";
        host.lobby();
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) host.sendTo(gu.cid, { t: "ice", c: e.candidate });
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      host.sendTo(gu.cid, { t: "offer", sdp: pc.localDescription });
    } catch (_) { /* direct link is optional */ }
  }

  function onGuestMsg(m, viaDirect) {
    if (!m || !m.cid) return;
    const gu = guests.get(m.cid);
    if (gu) gu.seen = Date.now();
    switch (m.t) {
      case "join": {
        if (gu) {
          host.lobby();
          return;
        }
        if (started) {
          host.sendTo(m.cid, { t: "full", why: "Match already started" });
          return;
        }
        // fill alternately so 2 humans in 2v2 end up on opposite teams
        const order = size === 4 ? [1, 2, 3] : [1];
        const slot = order.find((i) => !slots[i]);
        if (slot === undefined) {
          host.sendTo(m.cid, { t: "full", why: "Room is full" });
          return;
        }
        const name = String(m.name || "Player").slice(0, 12);
        const rec = { cid: m.cid, slot, seen: Date.now(), dc: null, pc: null };
        guests.set(m.cid, rec);
        slots[slot] = { name, cid: m.cid, human: true, loadout: m.loadout, link: "relay" };
        host.lobby();
        offerRtc(rec);
        break;
      }
      case "answer":
        gu?.pc?.setRemoteDescription(m.sdp).catch(() => {});
        break;
      case "ice":
        gu?.pc?.addIceCandidate(m.c).catch(() => {});
        break;
      case "ping":
        if (gu) {
          const s = slots[gu.slot];
          if (s) s.ping = m.rtt || 0;
          const pong = { t: "pong", ts: m.ts };
          if (viaDirect && gu.dc?.readyState === "open") gu.dc.send(JSON.stringify(pong));
          else host.sendTo(m.cid, pong);
        }
        break;
      case "leave":
        dropGuest(m.cid, "left");
        break;
      default:
        if (gu) opts.onGuestMessage?.(gu.slot, m);
    }
  }

  client.on("message", (topic, raw) => {
    if (closed) return;
    try {
      onGuestMsg(JSON.parse(raw), false);
    } catch (_) { /* ignore junk */ }
  });
  client.on("close", () => opts.onStatus?.("Lost the relay connection"));
  client.subscribe(base + "/h");

  const watch = setInterval(() => {
    const now = Date.now();
    for (const [gcid, gu] of guests) if (now - gu.seen > TIMEOUT_MS) dropGuest(gcid, "timeout");
  }, 1000);
  // re-announce the lobby so late or lossy joiners always get it
  const lobbyTimer = setInterval(() => {
    if (!started) host.lobby();
  }, 2000);

  host.lobby();
  return host;
}

// ---- guest ------------------------------------------------------------------------

// opts: { code, name, loadout, onLobby, onStart, onSnapshot, onClosed(reason), onStatus }
export async function joinRoom(opts) {
  const code = normalizeCode(opts.code);
  if (code.length !== 5) throw new Error("Room codes are 5 characters");
  const cid = "g" + rid(8);
  opts.onStatus?.("Connecting to relay…");
  const client = await connectBroker(brokerForCode(code), cid);
  const base = ROOT + code;
  let pc = null;
  let dc = null;
  let lastHost = Date.now();
  let joined = false;
  let closed = false;
  let lastSnap = -1;
  let rtt = 0;
  let slot = -1;

  const toHost = (m) => client.publish(base + "/h", JSON.stringify({ ...m, cid }));
  const guest = {
    cid, code,
    get slot() { return slot; },
    get rtt() { return rtt; },
    get direct() { return !!(dc && dc.readyState === "open"); },
    // gameplay traffic: direct link when open, otherwise the relay
    send(m) {
      if (dc && dc.readyState === "open") {
        try {
          dc.send(JSON.stringify({ ...m, cid }));
          return;
        } catch (_) { /* fall back to relay */ }
      }
      toHost(m);
    },
    leave() {
      closed = true;
      clearInterval(timer);
      try {
        toHost({ t: "leave" });
      } catch (_) { /* ignore */ }
      pc?.close();
      setTimeout(() => client.close(), 150);
    },
  };

  function onHostMsg(m) {
    lastHost = Date.now();
    switch (m.t) {
      case "lobby": {
        const me = m.slots.findIndex((s) => s && s.cid === cid);
        if (me >= 0) {
          joined = true;
          slot = me;
        } else if (joined && !m.started) {
          // we were dropped from the lobby (e.g. timed out): ask again
          joined = false;
        }
        opts.onLobby?.(m, me);
        break;
      }
      case "start":
        slot = m.slots.indexOf(cid);
        if (slot >= 0) opts.onStart?.(m, slot);
        break;
      case "s":
        if (m.n > lastSnap || m.n < lastSnap - 1000) {
          lastSnap = m.n;
          opts.onSnapshot?.(m);
        }
        break;
      case "pong":
        rtt = Math.round(performance.now() - m.ts);
        break;
      case "offer":
        acceptRtc(m.sdp);
        break;
      case "ice":
        pc?.addIceCandidate(m.c).catch(() => {});
        break;
      case "full":
        opts.onClosed?.(m.why || "Room is full");
        guest.leave();
        break;
      case "kicked":
        opts.onClosed?.("Removed by the host");
        guest.leave();
        break;
      case "bye":
        opts.onClosed?.("The host closed the room");
        guest.leave();
        break;
      default:
        opts.onMessage?.(m);
    }
  }

  async function acceptRtc(sdp) {
    if (!canRtc()) return;
    try {
      pc?.close();
      pc = new RTCPeerConnection({ iceServers: ICE });
      pc.ondatachannel = (e) => {
        dc = e.channel;
        attachChannel(dc, onHostMsg, () => opts.onStatus?.(guest.direct ? "Direct link" : "Relay"));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) toHost({ t: "ice", c: e.candidate });
      };
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      toHost({ t: "answer", sdp: pc.localDescription });
    } catch (_) { /* relay still works */ }
  }

  client.on("message", (topic, raw) => {
    if (closed) return;
    try {
      onHostMsg(JSON.parse(raw));
    } catch (_) { /* ignore junk */ }
  });
  client.on("close", () => {
    if (!closed) opts.onClosed?.("Lost the relay connection");
  });
  client.subscribe(base + "/all");
  client.subscribe(base + "/g/" + cid);

  const timer = setInterval(() => {
    if (!joined) toHost({ t: "join", name: opts.name, loadout: opts.loadout });
    guest.send({ t: "ping", ts: performance.now(), rtt });
    if (Date.now() - lastHost > TIMEOUT_MS) {
      opts.onClosed?.(joined ? "Lost connection to the host" : "No room with that code (or the host is offline)");
      guest.leave();
    }
  }, 1000);
  toHost({ t: "join", name: opts.name, loadout: opts.loadout });
  return guest;
}
