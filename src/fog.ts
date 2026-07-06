import { TILE } from "./config";

// Player-side visibility. Three states per tile:
//   unexplored  -> explored=0            (rendered black)
//   shroud      -> explored=1 visible=0  (terrain/own buildings remembered, dimmed)
//   visible     -> explored=1 visible=1  (fully lit, enemies shown)
export class VisibilityMap {
  visible: Uint8Array;
  explored: Uint8Array;

  constructor(public w: number, public h: number) {
    this.visible = new Uint8Array(w * h);
    this.explored = new Uint8Array(w * h);
  }

  private idx(tx: number, ty: number) {
    return ty * this.w + tx;
  }

  clearVisible() {
    this.visible.fill(0);
  }

  reveal(wx: number, wy: number, sightPx: number) {
    const ctx = Math.floor(wx / TILE);
    const cty = Math.floor(wy / TILE);
    const r = Math.ceil(sightPx / TILE);
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = ctx + dx;
        const ty = cty + dy;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        const i = this.idx(tx, ty);
        this.visible[i] = 1;
        this.explored[i] = 1;
      }
    }
  }

  isVisibleTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.visible[this.idx(tx, ty)] === 1;
  }

  isExploredTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.explored[this.idx(tx, ty)] === 1;
  }

  isVisibleWorld(wx: number, wy: number): boolean {
    return this.isVisibleTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }

  isExploredWorld(wx: number, wy: number): boolean {
    return this.isExploredTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }
}
