// Buff cards. Before every round each player is dealt 3 cards and keeps 1;
// buffs stack for the rest of the match. Rarer cards are stronger.

export const RARITIES = {
  common: { name: "Common", color: "#b8c0cc", glow: "rgba(184,192,204,0.35)", weight: 52 },
  rare: { name: "Rare", color: "#4fb0ff", glow: "rgba(79,176,255,0.45)", weight: 29 },
  epic: { name: "Epic", color: "#c37bff", glow: "rgba(195,123,255,0.5)", weight: 14 },
  legendary: { name: "Legendary", color: "#ffb340", glow: "rgba(255,179,64,0.6)", weight: 5 },
};

// The starting buffs every player has before any card.
export function baseBuffs() {
  return {
    dmg: 1,         // damage dealt ×
    rate: 1,        // time between shots × (lower = faster)
    speed: 1,       // move speed ×
    reload: 1,      // reload time ×
    mag: 1,         // magazine size ×
    maxHp: 0,       // + max health
    shield: 0,      // blue shield bar, refilled every round
    armor: 0,       // fraction of incoming damage ignored
    lifesteal: 0,   // fraction of damage dealt healed back
    regen: 0,       // hp per second after 3 s without being hit
    wallHp: 1,      // your walls' toughness ×
    mats: 0,        // + building materials at round start
    matsRegen: 1,   // materials regen ×
  };
}

// One entry per card. `kind` groups the same buff at different rarities so a
// hand never offers two of the same kind.
const C = (id, kind, rarity, name, icon, desc, apply) => ({ id, kind, rarity, name, icon, desc, apply });
export const CARDS = [
  C("shield1", "shield", "common", "Light Shield", "shield", "+25 shield", (b) => { b.shield += 25; }),
  C("shield2", "shield", "rare", "Shield", "shield", "+50 shield", (b) => { b.shield += 50; }),
  C("shield3", "shield", "epic", "Heavy Shield", "shield", "+75 shield", (b) => { b.shield += 75; }),
  C("shield4", "shield", "legendary", "Aegis", "shield", "+110 shield", (b) => { b.shield += 110; }),

  C("dmg1", "dmg", "common", "Sharp Rounds", "damage", "+10% damage", (b) => { b.dmg *= 1.1; }),
  C("dmg2", "dmg", "rare", "Hollow Points", "damage", "+20% damage", (b) => { b.dmg *= 1.2; }),
  C("dmg3", "dmg", "epic", "Overcharge", "damage", "+32% damage", (b) => { b.dmg *= 1.32; }),
  C("dmg4", "dmg", "legendary", "Annihilator", "damage", "+50% damage", (b) => { b.dmg *= 1.5; }),

  C("rate1", "rate", "common", "Light Trigger", "rate", "+8% fire rate", (b) => { b.rate *= 0.92; }),
  C("rate2", "rate", "rare", "Rapid Fire", "rate", "+16% fire rate", (b) => { b.rate *= 0.84; }),
  C("rate3", "rate", "epic", "Bullet Storm", "rate", "+26% fire rate", (b) => { b.rate *= 0.74; }),

  C("speed1", "speed", "common", "Sneakers", "speed", "+8% move speed", (b) => { b.speed *= 1.08; }),
  C("speed2", "speed", "rare", "Sprinter", "speed", "+15% move speed", (b) => { b.speed *= 1.15; }),
  C("speed3", "speed", "epic", "Jet Boots", "speed", "+24% move speed", (b) => { b.speed *= 1.24; }),

  C("hp1", "hp", "common", "Vitamins", "heart", "+15 max health", (b) => { b.maxHp += 15; }),
  C("hp2", "hp", "rare", "Tough Skin", "heart", "+30 max health", (b) => { b.maxHp += 30; }),
  C("hp3", "hp", "epic", "Juggernaut", "heart", "+50 max health", (b) => { b.maxHp += 50; }),

  C("reload1", "reload", "common", "Quick Hands", "reload", "Reload 20% faster", (b) => { b.reload *= 0.8; }),
  C("reload2", "reload", "rare", "Speed Loader", "reload", "Reload 35% faster", (b) => { b.reload *= 0.65; }),

  C("mag1", "mag", "rare", "Extended Mag", "mag", "+50% magazine size", (b) => { b.mag *= 1.5; }),
  C("mag2", "mag", "epic", "Drum Mag", "mag", "Double magazine size", (b) => { b.mag *= 2; }),

  C("armor1", "armor", "rare", "Kevlar", "armor", "Take 10% less damage", (b) => { b.armor = 1 - (1 - b.armor) * 0.9; }),
  C("armor2", "armor", "epic", "Plate Armor", "armor", "Take 20% less damage", (b) => { b.armor = 1 - (1 - b.armor) * 0.8; }),
  C("armor3", "armor", "legendary", "Titan Plating", "armor", "Take 30% less damage", (b) => { b.armor = 1 - (1 - b.armor) * 0.7; }),

  C("leech1", "leech", "epic", "Vampire Rounds", "leech", "Heal 15% of damage dealt", (b) => { b.lifesteal += 0.15; }),
  C("leech2", "leech", "legendary", "Blood Pact", "leech", "Heal 30% of damage dealt", (b) => { b.lifesteal += 0.3; }),

  C("regen1", "regen", "rare", "Bandages", "regen", "Regen 2 HP/s out of combat", (b) => { b.regen += 2; }),
  C("regen2", "regen", "epic", "Nanobots", "regen", "Regen 4 HP/s out of combat", (b) => { b.regen += 4; }),

  C("build1", "build", "common", "Stockpile", "build", "+60 mats each round, +20% mat regen", (b) => { b.mats += 60; b.matsRegen *= 1.2; }),
  C("build2", "build", "rare", "Reinforced Walls", "build", "Your walls are 50% tougher", (b) => { b.wallHp *= 1.5; }),
  C("build3", "build", "epic", "Master Builder", "build", "Walls 100% tougher, +40% mat regen", (b) => { b.wallHp *= 2; b.matsRegen *= 1.4; }),
];
export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
export const rarityRank = (r) => RARITY_ORDER.indexOf(r);

// Deal n cards of different kinds. Rarity is rolled first (weighted), then a
// card of that rarity whose kind isn't already in the hand.
// luck (comeback): whoever lost the last round gets better odds of rare cards.
const LUCKY = { common: 0.5, rare: 1.15, epic: 1.7, legendary: 2 };
export function dealHand(rng, n = 3, luck = false) {
  const hand = [];
  const weight = (k, r) => r.weight * (luck ? LUCKY[k] : 1);
  const total = Object.entries(RARITIES).reduce((a, [k, r]) => a + weight(k, r), 0);
  for (let tries = 0; hand.length < n && tries < 200; tries++) {
    let roll = rng() * total;
    let rarity = "common";
    for (const [k, r] of Object.entries(RARITIES)) {
      roll -= weight(k, r);
      if (roll <= 0) {
        rarity = k;
        break;
      }
    }
    const pool = CARDS.filter((c) => c.rarity === rarity && !hand.some((h) => h.kind === c.kind));
    if (!pool.length) continue;
    hand.push(pool[Math.floor(rng() * pool.length)]);
  }
  return hand.map((c) => c.id);
}

// Buffs after applying a list of card ids. Caps keep a lucky streak of
// Legendaries from snowballing a match: stacking still helps, but only so far.
export const CAPS = {
  dmg: 1.6, rate: 0.65, speed: 1.3, reload: 0.5, mag: 2, maxHp: 60,
  shield: 120, armor: 0.4, lifesteal: 0.3, regen: 4, wallHp: 2.5, mats: 120,
};
export function buffsFrom(ids) {
  const b = baseBuffs();
  for (const id of ids) CARD_BY_ID[id]?.apply(b);
  b.dmg = Math.min(CAPS.dmg, b.dmg);
  b.rate = Math.max(CAPS.rate, b.rate);
  b.speed = Math.min(CAPS.speed, b.speed);
  b.reload = Math.max(CAPS.reload, b.reload);
  b.mag = Math.min(CAPS.mag, b.mag);
  b.maxHp = Math.min(CAPS.maxHp, b.maxHp);
  b.shield = Math.min(CAPS.shield, b.shield);
  b.armor = Math.min(CAPS.armor, b.armor);
  b.lifesteal = Math.min(CAPS.lifesteal, b.lifesteal);
  b.regen = Math.min(CAPS.regen, b.regen);
  b.wallHp = Math.min(CAPS.wallHp, b.wallHp);
  b.mats = Math.min(CAPS.mats, b.mats);
  return b;
}
