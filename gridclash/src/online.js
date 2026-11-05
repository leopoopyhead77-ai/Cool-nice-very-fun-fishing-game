// Running an online match on each phone.
//
// Host: the real simulation runs here. Each remote player is driven by a
// RemoteController fed by that guest's command messages; empty seats (or
// players who drop out mid-match) are played by bots. Snapshots go out 20×/s.
//
// Guest: no simulation. The match is drawn from the host's snapshots. The
// guest's own player is predicted locally (inputs not yet confirmed by the
// host are replayed on top of each snapshot) so moving feels instant. Shots,
// builds and edits are sent as numbered actions and re-sent until the host
// acknowledges them, so none are lost on the lossy direct link.

import { createGame, predictMove, stepVisual, particlesForEvent } from "./game.js";
import { encodeSnapshot, applySnapshot } from "./net.js";
import { collideCircle } from "./world.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const SNAP_EVERY = 1 / 20;
const CMD_EVERY = 1 / 30;

export function createRemoteController() {
  const st = { cmd: {}, seq: 0, lastAction: 0, queue: [] };
  return {
    receive(m) {
      if (m.q > st.seq) {
        st.seq = m.q;
        st.cmd = m;
      }
      const acts = (m.a || []).slice().sort((x, y) => x.id - y.id);
      for (const a of acts) {
        if (a.id > st.lastAction) {
          st.lastAction = a.id;
          st.queue.push(a);
        }
      }
    },
    poll() {
      const c = st.cmd;
      return {
        mx: c.mx || 0, my: c.my || 0,
        aiming: !!c.ai, aimAngle: c.aa || 0, aimMag: c.am || 0,
        actions: st.queue.splice(0),
      };
    },
    ack: () => [st.lastAction, st.seq],
  };
}

// The host's per-match bookkeeping: snapshot pacing, event batching and the
// walls (only sent when they change, plus a periodic refresh).
export function createHostSync(host, game, mid, remotes) {
  let n = 0;
  let acc = 0;
  let events = [];
  let lastWalls = "";
  let wallsAge = 0;
  return {
    addEvents(ev) {
      events.push(...ev);
    },
    tick(dt, encodeWalls) {
      acc += dt;
      if (acc < SNAP_EVERY) return;
      acc = 0;
      n++;
      const ack = {};
      remotes.forEach((r, slot) => {
        if (r) ack[slot] = r.ack();
      });
      const extra = { mid, ack, ev: events };
      const walls = encodeWalls(game.world);
      const ws = JSON.stringify(walls);
      wallsAge++;
      if (ws !== lastWalls || wallsAge > 20) {
        extra.w = walls;
        lastWalls = ws;
        wallsAge = 0;
      }
      host.sendSnapshot(encodeSnapshot(game, n, extra));
      events = [];
    },
  };
}

export function createGuestView(start, slot, guest, input) {
  const game = createGame({
    loadouts: start.loadouts,
    names: start.names,
    teams: start.teams,
    seed: start.seed,
    controllers: start.loadouts.map(() => ({ poll: () => ({ actions: [] }) })),
  });
  game.state = "countdown";
  let seq = 0;
  let actionId = 0;
  let pending = [];
  let history = [];
  let sendAcc = 0;
  let lastCmd = null;

  const me = () => game.players[slot];

  function predictActions(p) {
    for (const a of pending) {
      if (a.t === "mode") p.mode = a.mode;
      else if (a.t === "slot") p.slot = a.slot;
      else if (a.t === "swap") p.slot = 1 - p.slot;
    }
  }

  return {
    game,
    slot,
    mid: start.mid,
    frame(dt) {
      const p = me();
      const cmd = input.controllers[0].poll();
      for (const a of cmd.actions) pending.push({ ...a, id: ++actionId });
      seq++;
      history.push({ q: seq, mx: cmd.mx, my: cmd.my, ai: cmd.aiming, dt });
      if (history.length > 240) history.shift();
      if (p.alive && game.state === "fight") predictMove(game, p, cmd.mx, cmd.my, cmd.aiming, dt);
      p.aiming = cmd.aiming;
      if (cmd.aiming) {
        p.aimAngle = cmd.aimAngle;
        p.aimMag = cmd.aimMag;
        p.facing = cmd.aimAngle;
      } else if (Math.hypot(cmd.mx, cmd.my) > 0.2) {
        p.facing = Math.atan2(cmd.my, cmd.mx);
      }
      predictActions(p);
      // everyone else: carry on along their last known velocity
      for (const q of game.players) {
        if (q === p || !q.alive || game.state !== "fight") continue;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        collideCircle(game.world, q);
      }
      stepVisual(game, dt);
      sendAcc += dt;
      const moved = !lastCmd || lastCmd.mx !== cmd.mx || lastCmd.my !== cmd.my || lastCmd.ai !== cmd.aiming;
      if (sendAcc >= CMD_EVERY || cmd.actions.length || (moved && sendAcc >= CMD_EVERY / 2)) {
        sendAcc = 0;
        lastCmd = { mx: cmd.mx, my: cmd.my, ai: cmd.aiming };
        guest.send({
          t: "c", q: seq,
          mx: r3(cmd.mx), my: r3(cmd.my),
          ai: cmd.aiming ? 1 : 0, aa: r3(cmd.aimAngle), am: r3(cmd.aimMag),
          a: pending,
        });
      }
    },
    // returns the snapshot's events (for sound)
    snapshot(s) {
      if (s.mid !== start.mid) return [];
      const p = me();
      const keep = { aiming: p.aiming, aimAngle: p.aimAngle, aimMag: p.aimMag, facing: p.facing };
      applySnapshot(game, s);
      const ack = s.ack && s.ack[slot];
      if (ack) {
        pending = pending.filter((a) => a.id > ack[0]);
        history = history.filter((h) => h.q > ack[1]);
      }
      // re-apply inputs the host hasn't seen yet on top of its position
      if (p.alive && game.state === "fight") {
        for (const h of history) predictMove(game, p, h.mx, h.my, h.ai, h.dt);
      }
      if (keep.aiming) Object.assign(p, keep);
      predictActions(p);
      for (const e of s.ev || []) particlesForEvent(game, e);
      return s.ev || [];
    },
  };
}
