// Active powers: each player brings one into the match and fires it with the
// POWER button; then it goes on cooldown. Effects live in game.js.

export const POWERS = [
  {
    id: "freeze", name: "Freeze Blast", cd: 18, color: "#9fe8ff",
    desc: "Freezes enemies within 3 tiles solid for 1.6 s — they can't move or shoot.",
    radius: 3, freeze: 1.6,
  },
  {
    id: "heal", name: "Heal Pool", cd: 20, color: "#5aff96",
    desc: "Drops a pool that heals you and your allies 14 HP/s for 4 s.",
    radius: 2, heal: 14, time: 4,
  },
  {
    id: "flame", name: "Flaming Bullets", cd: 16, color: "#ff9a3c",
    desc: "For 5 s your hits set targets on fire (6 HP/s for 2 s).",
    time: 5, burn: 6,
  },
  {
    id: "dash", name: "Dash", cd: 7, color: "#ffe14d",
    desc: "Burst about 3 tiles the way you're moving. Dodge or close in.",
  },
  {
    id: "barrier", name: "Barrier", cd: 16, color: "#4fb0ff",
    desc: "A bubble that soaks the next 45 damage for 5 s.",
    amount: 45, time: 5,
  },
];

export const POWER_BY_ID = Object.fromEntries(POWERS.map((p) => [p.id, p]));
export const POWER_IDS = POWERS.map((p) => p.id);
