// Tiny WebAudio synth: every sound is generated, nothing is loaded.

let ac = null;
let master = null;
let noiseBuf = null;
export const audio = { muted: false };

export function unlockAudio() {
  if (ac) {
    if (ac.state === "suspended") ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function noise(dur, freq, q, vol, type = "lowpass") {
  if (!ac || audio.muted) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const gn = ac.createGain();
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(gn).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(f0, f1, dur, vol, type = "square") {
  if (!ac || audio.muted) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const gn = ac.createGain();
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SHOT = {
  pistol: () => { noise(0.09, 2600, 1, 0.35); tone(420, 120, 0.06, 0.08); },
  smg: () => noise(0.05, 3200, 1, 0.22),
  ar: () => { noise(0.08, 2200, 1, 0.3); tone(260, 90, 0.05, 0.06); },
  burst: () => { noise(0.07, 2800, 1.2, 0.3); tone(520, 160, 0.05, 0.06); },
  shotgun: () => { noise(0.22, 1300, 0.7, 0.55); tone(140, 50, 0.15, 0.15, "sawtooth"); },
  sniper: () => { noise(0.35, 1800, 0.8, 0.6); tone(900, 60, 0.3, 0.12, "sawtooth"); },
  revolver: () => { noise(0.16, 1700, 0.8, 0.45); tone(300, 70, 0.12, 0.12); },
  minigun: () => noise(0.04, 3600, 1, 0.16),
  grenade: () => { tone(220, 110, 0.12, 0.15, "triangle"); noise(0.08, 900, 1, 0.2); },
  rocket: () => { noise(0.3, 700, 0.6, 0.35); tone(160, 60, 0.25, 0.12, "sawtooth"); },
  rail: () => { tone(1800, 200, 0.28, 0.14, "sawtooth"); noise(0.2, 5000, 2, 0.2, "bandpass"); },
  flamer: () => noise(0.06, 900, 0.5, 0.12, "bandpass"),
};

// Plays the sounds for one frame's worth of game events.
// me: the local player id (-1 = everyone on this phone); myTeam: their team
export function playEvents(events, me, myTeam = me) {
  for (const e of events) {
    // me < 0: both players share this phone, so every event is local
    const mine = me < 0 || e.pid === me;
    switch (e.t) {
      case "shot": SHOT[e.gun]?.(); break;
      case "boom": noise(0.6, 400, 0.6, 0.8); tone(90, 30, 0.5, 0.25, "sine"); break;
      case "hurt":
        if (mine) { tone(180, 90, 0.12, 0.18, "square"); vibrate(30); }
        else tone(1400, 900, 0.05, 0.08, "triangle");
        break;
      case "tileHit": noise(0.04, 1200, 2, 0.08, "bandpass"); break;
      case "tileBreak": noise(0.18, 600, 1, 0.3); tone(200, 80, 0.12, 0.08, "triangle"); break;
      case "build":
        if (mine) vibrate(12);
        tone(140, 70, 0.1, 0.2, "triangle"); noise(0.08, 900, 1, 0.2);
        break;
      case "edit": tone(900, 1300, 0.06, 0.1, "triangle"); break;
      case "restore": tone(1300, 800, 0.06, 0.1, "triangle"); break;
      case "deny": if (mine) tone(160, 140, 0.08, 0.1, "square"); break;
      case "mode": if (mine) tone(600, 700, 0.04, 0.06, "triangle"); break;
      case "swap": if (mine) tone(500, 300, 0.05, 0.06, "triangle"); break;
      case "reload": if (mine) tone(300, 400, 0.05, 0.05, "square"); break;
      case "reloaded": if (mine) tone(700, 900, 0.05, 0.06, "square"); break;
      case "heal": tone(500, 1000, 0.25, 0.12, "sine"); break;
      case "death": tone(400, 40, 0.7, 0.2, "sawtooth"); noise(0.5, 500, 0.6, 0.4); if (mine) vibrate(120); break;
      case "go": tone(660, 880, 0.18, 0.15, "square"); break;
      case "roundEnd": tone(520, 260, 0.4, 0.12, "triangle"); break;
      case "matchEnd": tone(me < 0 || e.winner === myTeam ? 520 : 300, me < 0 || e.winner === myTeam ? 1040 : 120, 0.7, 0.15, "triangle"); break;
    }
  }
}

function vibrate(ms) {
  try {
    if (!audio.muted && navigator.vibrate) navigator.vibrate(ms);
  } catch (_) { /* not supported */ }
}

export function uiClick() {
  tone(700, 900, 0.04, 0.06, "triangle");
}
