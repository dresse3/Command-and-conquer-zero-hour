import { MAP_W, MAP_H, TILE } from "./config";

export type TerrainType = 0 | 1 | 2; // 0 grass, 1 dirt, 2 rock(blocked)

export interface Cell {
  terrain: TerrainType;
  blocked: boolean; // true if impassable (rock or building)
}

export class Grid {
  w = MAP_W;
  h = MAP_H;
  cells: Cell[];

  constructor() {
    this.cells = new Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const terrain: TerrainType = ((x * 7 + y * 13) % 5 === 0 ? 1 : 0) as TerrainType;
        this.cells[this.idx(x, y)] = { terrain, blocked: false };
      }
    }
    // Terrain features (rocks, dirt) are stamped by the designed map layout
    // in maps.ts, applied from the game's setup — see buildCrashSite().
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  cell(x: number, y: number): Cell | null {
    if (!this.inBounds(x, y)) return null;
    return this.cells[this.idx(x, y)];
  }

  isBlocked(x: number, y: number): boolean {
    const c = this.cell(x, y);
    return !c || c.blocked;
  }

  setBlocked(x: number, y: number, v: boolean) {
    const c = this.cell(x, y);
    if (c) c.blocked = v;
  }

  // world (pixels) <-> tile helpers
  worldToTile(wx: number, wy: number): { tx: number; ty: number } {
    return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE) };
  }

  tileCenter(tx: number, ty: number): { x: number; y: number } {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

}

// ---- A* pathfinding on the grid (8-directional) ----

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function findPath(
  grid: Grid,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  maxNodes = 7000,
): { x: number; y: number }[] {
  if (!grid.inBounds(gx, gy) || grid.isBlocked(gx, gy)) {
    const near = nearestOpen(grid, gx, gy);
    if (!near) return [];
    gx = near.x;
    gy = near.y;
  }
  if (sx === gx && sy === gy) return [];

  const open: Node[] = [];
  const start: Node = { x: sx, y: sy, g: 0, f: heuristic(sx, sy, gx, gy), parent: null };
  open.push(start);
  const seen = new Map<number, number>(); // idx -> best g
  seen.set(grid.idx(sx, sy), 0);
  let processed = 0;

  while (open.length > 0) {
    // pop lowest f (linear scan — fine for these map sizes)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    processed++;
    if (processed > maxNodes) break;

    if (cur.x === gx && cur.y === gy) {
      return reconstruct(cur);
    }

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!grid.inBounds(nx, ny) || grid.isBlocked(nx, ny)) continue;
      // prevent cutting through diagonal walls
      if (dx !== 0 && dy !== 0) {
        if (grid.isBlocked(cur.x + dx, cur.y) || grid.isBlocked(cur.x, cur.y + dy)) continue;
      }
      const step = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const ng = cur.g + step;
      const nIdx = grid.idx(nx, ny);
      const prev = seen.get(nIdx);
      if (prev !== undefined && prev <= ng) continue;
      seen.set(nIdx, ng);
      open.push({ x: nx, y: ny, g: ng, f: ng + heuristic(nx, ny, gx, gy), parent: cur });
    }
  }
  return [];
}

function heuristic(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
}

function reconstruct(node: Node): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  let n: Node | null = node;
  while (n) {
    path.push({ x: n.x, y: n.y });
    n = n.parent;
  }
  path.reverse();
  path.shift(); // drop the start tile
  return path;
}

// Breadth-first search for the closest passable tile to a blocked target.
function nearestOpen(grid: Grid, gx: number, gy: number): { x: number; y: number } | null {
  const q: [number, number][] = [[gx, gy]];
  const visited = new Set<number>();
  visited.add(grid.idx(gx, gy));
  let head = 0;
  while (head < q.length && head < 400) {
    const [x, y] = q[head++];
    if (grid.inBounds(x, y) && !grid.isBlocked(x, y)) return { x, y };
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const idx = grid.idx(nx, ny);
      if (visited.has(idx)) continue;
      visited.add(idx);
      q.push([nx, ny]);
    }
  }
  return null;
}
