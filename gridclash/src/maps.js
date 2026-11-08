// Maps: layout (rock), spawns, medkits, teleporter pairs, theme and gimmick.
// Rock is given for the left half (x ≤ 14) and mirrored to the right
// (x' = 29 − x), so every map is fair for both sides.

const R = (x, y, w = 1, h = 1) => {
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
};

export const MAPS = {
  arena: {
    id: "arena",
    name: "Arena",
    desc: "The original. Teleporters in the corners link opposite sides.",
    theme: "arena",
    rock: [
      [8, 4], [8, 5], [9, 4],
      [8, 14], [8, 15], [9, 15],
      [12, 1], [12, 2],
      [12, 17], [12, 18],
      [5, 8], [5, 11],
      [14, 9], [14, 10],
      [11, 9], [11, 10],
    ],
    teleporters: [
      [{ x: 1.5, y: 1.5 }, { x: 28.5, y: 18.5 }],
      [{ x: 1.5, y: 18.5 }, { x: 28.5, y: 1.5 }],
    ],
    medkits: [{ x: 15, y: 4.5 }, { x: 15, y: 15.5 }],
  },

  pac: {
    id: "pac",
    name: "Pac-Maze",
    desc: "A neon maze. Pac-Men roam the halls and chomp anyone they catch. Wrap-around tunnels at the edges.",
    theme: "pac",
    gimmick: "pacmen",
    rock: [
      ...R(2, 2, 3, 2), ...R(7, 2, 4, 2), ...R(13, 1, 2, 3),
      ...R(2, 6, 3, 2), ...R(7, 5, 2, 4), ...R(11, 6, 3, 1),
      // ghost house in the middle (door at the top)
      ...R(12, 9, 2, 1), ...R(12, 10, 1, 1), ...R(12, 11, 3, 1),
      ...R(2, 12, 3, 2), ...R(7, 11, 2, 4), ...R(11, 13, 3, 1),
      ...R(2, 16, 3, 2), ...R(7, 16, 4, 2), ...R(13, 16, 2, 3),
    ],
    // the classic wrap-around tunnels
    teleporters: [
      [{ x: 0.5, y: 4.5 }, { x: 29.5, y: 4.5 }],
      [{ x: 0.5, y: 14.5 }, { x: 29.5, y: 14.5 }],
    ],
    medkits: [{ x: 15, y: 7.5 }, { x: 15, y: 13.5 }],
    ffa: {
      3: [{ x: 2.5, y: 10 }, { x: 27.5, y: 0.6 }, { x: 27.5, y: 19.4 }],
      4: [{ x: 0.6, y: 0.6 }, { x: 29.4, y: 19.4 }, { x: 29.4, y: 0.6 }, { x: 0.6, y: 19.4 }],
    },
    pacHome: { x: 15, y: 10.5 },
  },

  desert: {
    id: "desert",
    name: "Desert Rail",
    desc: "A railway splits the sand. Trains thunder through — stay off the tracks when the lights flash. Teleporters cross safely.",
    theme: "desert",
    gimmick: "train",
    rock: [
      [5, 4], [5, 5], [6, 4],
      [5, 15], [5, 16], [6, 16],
      [9, 9], [9, 10],
      [11, 2], [11, 3],
      [11, 16], [11, 17],
      [3, 7], [3, 12],
      [12, 6], [12, 13],
    ],
    teleporters: [
      [{ x: 3.5, y: 1.5 }, { x: 26.5, y: 1.5 }],
      [{ x: 3.5, y: 18.5 }, { x: 26.5, y: 18.5 }],
    ],
    medkits: [{ x: 8.5, y: 10 }, { x: 21.5, y: 10 }],
    ffa: {
      3: [{ x: 2.5, y: 10 }, { x: 27.5, y: 4.5 }, { x: 27.5, y: 15.5 }],
      4: [{ x: 1.5, y: 1.5 }, { x: 28.5, y: 18.5 }, { x: 28.5, y: 1.5 }, { x: 1.5, y: 18.5 }],
    },
    // the railway runs top to bottom down the middle (cells x 14–15)
    track: { x: 15, half: 1.05 },
  },
};

export const MAP_IDS = Object.keys(MAPS);
export const mapOf = (id) => MAPS[id] || MAPS.arena;
