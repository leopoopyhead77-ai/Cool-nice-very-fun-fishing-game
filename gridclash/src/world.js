// The 30×20 arena grid: static rock, player-built walls, raycasts, collision.
//
// Coordinates are in tiles. Cell (cx, cy) covers [cx, cx+1) × [cy, cy+1).

export const GW = 30;
export const GH = 20;

export const WALL_COST = 30;
export const TILE_HP = 150;
export const WALL_LEN = 3;

// Left half of the map; the right half mirrors it (x' = 29 - x).
const ROCK_LEFT = [
  [8, 4], [8, 5], [9, 4],
  [8, 14], [8, 15], [9, 15],
  [12, 1], [12, 2],
  [12, 17], [12, 18],
  [5, 8], [5, 11],
  [14, 9], [14, 10],
  [11, 9], [11, 10],
];

export const SPAWNS = [
  { x: 2.5, y: 10 },
  { x: GW - 2.5, y: 10 },
];

export const MEDKIT_SPOTS = [
  { x: 15, y: 4.5 },
  { x: 15, y: 15.5 },
];

export function createWorld() {
  const rock = new Uint8Array(GW * GH);
  for (const [x, y] of ROCK_LEFT) {
    rock[y * GW + x] = 1;
    rock[y * GW + (GW - 1 - x)] = 1;
  }
  return {
    rock,
    // per-cell reference to a living wall tile: { wall, i } or null
    wallAt: new Array(GW * GH).fill(null),
    walls: [],
    nextWallId: 1,
  };
}

export function clearWalls(w) {
  w.wallAt.fill(null);
  w.walls.length = 0;
}

export const inBounds = (cx, cy) => cx >= 0 && cy >= 0 && cx < GW && cy < GH;
export const isRock = (w, cx, cy) => w.rock[cy * GW + cx] === 1;

export function tileAt(w, cx, cy) {
  if (!inBounds(cx, cy)) return null;
  return w.wallAt[cy * GW + cx];
}

// A tile is open when its wall has edited that tile out.
export const tileOpen = (t) => t.wall.edit === t.i;

export function isSolid(w, cx, cy) {
  if (!inBounds(cx, cy)) return true;
  if (w.rock[cy * GW + cx]) return true;
  const t = w.wallAt[cy * GW + cx];
  return !!t && !tileOpen(t);
}

// Amanatides–Woo grid traversal. (dx, dy) must be normalised.
// Returns the first cell for which solidFn returns true, within maxDist.
export function raycast(w, x, y, dx, dy, maxDist, solidFn = isSolid) {
  let cx = Math.floor(x);
  let cy = Math.floor(y);
  if (solidFn(w, cx, cy)) return { hit: true, dist: 0, cx, cy };
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMX = dx > 0 ? (cx + 1 - x) * tDX : dx < 0 ? (x - cx) * tDX : Infinity;
  let tMY = dy > 0 ? (cy + 1 - y) * tDY : dy < 0 ? (y - cy) * tDY : Infinity;
  for (let guard = 0; guard < 256; guard++) {
    let t;
    if (tMX < tMY) {
      cx += stepX;
      t = tMX;
      tMX += tDX;
    } else {
      cy += stepY;
      t = tMY;
      tMY += tDY;
    }
    if (t > maxDist) break;
    if (solidFn(w, cx, cy)) return { hit: true, dist: t, cx, cy };
  }
  return { hit: false, dist: maxDist, cx, cy };
}

export function lineClear(w, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  return !raycast(w, x0, y0, dx / d, dy / d, d).hit;
}

// Entry distance of a ray into a circle, or -1.
export function segCircle(x, y, dx, dy, len, px, py, r) {
  const fx = x - px;
  const fy = y - py;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const b = fx * dx + fy * dy;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= len ? t : -1;
}

export function circleOverlapsCell(x, y, r, cx, cy) {
  const nx = Math.max(cx, Math.min(x, cx + 1));
  const ny = Math.max(cy, Math.min(y, cy + 1));
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of every solid cell it overlaps.
export function collideCircle(w, e) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    const x0 = Math.floor(e.x - e.r);
    const x1 = Math.floor(e.x + e.r);
    const y0 = Math.floor(e.y - e.r);
    const y1 = Math.floor(e.y + e.r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!isSolid(w, cx, cy)) continue;
        const nx = Math.max(cx, Math.min(e.x, cx + 1));
        const ny = Math.max(cy, Math.min(e.y, cy + 1));
        let dx = e.x - nx;
        let dy = e.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= e.r * e.r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = e.r - d;
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        } else {
          // centre inside the cell: leave by the nearest face
          const left = e.x - cx;
          const right = cx + 1 - e.x;
          const top = e.y - cy;
          const bottom = cy + 1 - e.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) e.x = cx - e.r;
          else if (m === right) e.x = cx + 1 + e.r;
          else if (m === top) e.y = cy - e.r;
          else e.y = cy + 1 + e.r;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  e.x = Math.max(e.r, Math.min(GW - e.r, e.x));
  e.y = Math.max(e.r, Math.min(GH - e.r, e.y));
}

// ---- builds ----------------------------------------------------------------

// Where a wall would land if released at this aim. A wall is always three
// cells in a line, perpendicular to the dominant axis of the aim, so it stands
// between the builder and whatever they are aiming at.
export function wallPlacement(w, players, x, y, angle, mag) {
  const dist = 1.35 + Math.max(0, Math.min(1, mag)) * 3.4;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const vertical = Math.abs(dx) >= Math.abs(dy);
  let cx = Math.floor(x + dx * dist);
  let cy = Math.floor(y + dy * dist);
  if (vertical) cy = Math.max(1, Math.min(GH - 2, cy));
  else cx = Math.max(1, Math.min(GW - 2, cx));
  cx = Math.max(0, Math.min(GW - 1, cx));
  cy = Math.max(0, Math.min(GH - 1, cy));
  const cells = vertical
    ? [[cx, cy - 1], [cx, cy], [cx, cy + 1]]
    : [[cx - 1, cy], [cx, cy], [cx + 1, cy]];
  let valid = true;
  const blocked = cells.map(([ax, ay]) => {
    const bad =
      !inBounds(ax, ay) ||
      isRock(w, ax, ay) ||
      !!w.wallAt[ay * GW + ax] ||
      players.some((p) => p.alive && circleOverlapsCell(p.x, p.y, p.r, ax, ay));
    if (bad) valid = false;
    return bad;
  });
  return { cells, vertical, valid, blocked };
}

// owner: the builder's player id (only they can edit it); team: for colour.
export function placeWall(w, owner, placement, time, team = owner, hpMul = 1) {
  const wall = {
    id: w.nextWallId++,
    owner,
    team,
    vertical: placement.vertical,
    edit: -1,
    born: time,
    cells: placement.cells.map(([x, y]) => ({ x, y, hp: TILE_HP * hpMul, max: TILE_HP * hpMul, alive: true })),
  };
  wall.cells.forEach((c, i) => {
    w.wallAt[c.y * GW + c.x] = { wall, i };
  });
  w.walls.push(wall);
  return wall;
}

// Returns true if the tile was destroyed.
export function damageTile(w, cx, cy, amount) {
  const t = tileAt(w, cx, cy);
  if (!t) return false;
  const cell = t.wall.cells[t.i];
  cell.hp -= amount;
  if (cell.hp > 0) return false;
  cell.alive = false;
  w.wallAt[cy * GW + cx] = null;
  if (t.wall.edit === t.i) t.wall.edit = -1;
  if (t.wall.cells.every((c) => !c.alive)) {
    w.walls.splice(w.walls.indexOf(t.wall), 1);
  }
  return true;
}

// The first tile of one of `owner`'s walls along the aim, within reach.
// Open (edited) tiles count, so they can be found again to restore.
export function editTarget(w, owner, x, y, angle, reach = 4.6) {
  let found = null;
  raycast(w, x, y, Math.cos(angle), Math.sin(angle), reach, (ww, cx, cy) => {
    if (!inBounds(cx, cy) || isRock(ww, cx, cy)) return true;
    const t = ww.wallAt[cy * GW + cx];
    if (!t) return false;
    if (t.wall.owner === owner) {
      found = { wall: t.wall, i: t.i, cx, cy };
      return true;
    }
    return !tileOpen(t);
  });
  return found;
}
