import type { Grid } from "./grid";
import type { Team } from "./config";

// An original, hand-designed skirmish map — a symmetric desert battlefield with
// a wrecked crater at its heart, rock formations framing the bases and open
// lanes weaving between them. Everything is stamped with 180° rotational
// symmetry so the two diagonal corners play perfectly fair.
//
// This is our own terrain data (no external map files are used or shipped).

export interface MapLayout {
  bases: { team: Team; tx: number; ty: number }[];
  supplies: { tx: number; ty: number }[];
}

export function buildCrashSite(grid: Grid): MapLayout {
  const W = grid.w;
  const H = grid.h;
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;

  const setRock = (x: number, y: number) => {
    const c = grid.cell(Math.round(x), Math.round(y));
    if (c) {
      c.terrain = 2;
      c.blocked = true;
    }
  };
  const setDirt = (x: number, y: number) => {
    const c = grid.cell(Math.round(x), Math.round(y));
    if (c && c.terrain !== 2) c.terrain = 1;
  };
  // 180°-rotational stampers (mirror through the map centre)
  const rock2 = (x: number, y: number) => {
    setRock(x, y);
    setRock(W - 1 - x, H - 1 - y);
  };
  const dirt2 = (x: number, y: number) => {
    setDirt(x, y);
    setDirt(W - 1 - x, H - 1 - y);
  };

  // deterministic 0..1 hash for irregular edges
  const noise = (x: number, y: number) => {
    let h = (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 1000) / 1000;
  };

  // A ragged rock blob of radius r. `sym` mirrors it through the centre.
  const blob = (bx: number, by: number, r: number, density: number, sym: boolean) => {
    for (let dy = -r - 1; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + noise(bx + dx * 5, by + dy * 5) * 1.2) continue;
        if (d > r - 1.2 && noise(bx + dx * 3, by + dy * 7) > density) continue;
        if (sym) rock2(bx + dx, by + dy);
        else setRock(bx + dx, by + dy);
      }
    }
  };

  // A soft dirt patch (visual only, still passable).
  const dirtPatch = (bx: number, by: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) > r) continue;
        if (noise(bx + dx * 4, by + dy * 4) > 0.5) dirt2(bx + dx, by + dy);
      }
  };

  // --- 1. Central crater: an impassable wreck that splits the battlefield,
  //        forcing armies to flank north or south of it. Self-symmetric. ---
  blob(Math.round(cx), Math.round(cy), 5.5, 0.85, false);
  // scorched dirt skirt around it
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    dirtPatch(cx + Math.cos(ang) * 8.5, cy + Math.sin(ang) * 8.5, 1.5);
  }

  // --- 2. Diagonal ridge fragments along the "unused" corners (top-left /
  //        bottom-right), framing the arena without walling off the lanes. ---
  for (let i = 0; i < 3; i++) {
    const t = 0.24 + i * 0.13;
    rock2(cx - t * W * 0.72, cy - t * H * 0.72 + (i === 1 ? 3 : 0));
    blob(Math.round(cx - t * W * 0.72), Math.round(cy - t * H * 0.72), 2 + (i % 2), 0.7, true);
  }

  // --- 3. Side-passage clusters (left / right mid-edges, like a real map's
  //        flank routes) leaving a wide gap between rock and the map edge. ---
  blob(Math.round(W * 0.30), Math.round(cy), 3, 0.75, true);
  blob(Math.round(W * 0.30), Math.round(cy - 9), 2, 0.7, true);
  blob(Math.round(W * 0.30), Math.round(cy + 9), 2, 0.7, true);

  // --- 4. Base defensive rims: a broken rock horseshoe hugging each base,
  //        open toward the centre so there is a natural choke to hold. ---
  const px = W * 0.11;
  const py = H * 0.86;
  for (let a = -40; a <= 130; a += 12) {
    const ang = (a * Math.PI) / 180;
    const rx = px + Math.cos(ang) * 12;
    const ry = py + Math.sin(ang) * 11;
    if (noise(rx * 2, ry * 2) > 0.28) blob(Math.round(rx), Math.round(ry), 1 + (noise(rx, ry) > 0.6 ? 1 : 0), 0.7, true);
  }

  // --- 5. Scattered cover boulders (symmetric) for skirmish texture. ---
  const cover = [
    [0.5, 0.2],
    [0.36, 0.36],
    [0.64, 0.28],
    [0.2, 0.6],
    [0.5, 0.72],
    [0.72, 0.62],
  ];
  for (const [fx, fy] of cover) {
    blob(Math.round(W * fx), Math.round(H * fy), 1 + Math.round(noise(fx * 99, fy * 99) * 2), 0.65, true);
  }
  // broad dirt tracks for visual interest
  dirtPatch(W * 0.22, H * 0.5, 4);
  dirtPatch(W * 0.5, H * 0.3, 5);

  // --- Bases (diagonally opposed) & supply fields ---
  const bases: MapLayout["bases"] = [
    { team: "player", tx: Math.round(W * 0.07), ty: Math.round(H * 0.86) },
    { team: "enemy", tx: Math.round(W * 0.86), ty: Math.round(H * 0.07) },
  ];

  // Supplies come in mirrored pairs: one safe field per base, a flank field on
  // each side passage, and a contested pair either side of the crater.
  const supplies: MapLayout["supplies"] = [];
  const supplyPair = (tx: number, ty: number) => {
    supplies.push({ tx, ty });
    supplies.push({ tx: W - 2 - tx, ty: H - 2 - ty });
  };
  supplyPair(Math.round(W * 0.14), Math.round(H * 0.74)); // near player base
  supplyPair(Math.round(W * 0.08), Math.round(H * 0.44)); // left flank passage
  supplyPair(Math.round(W * 0.4), Math.round(H * 0.58)); // contested, south of crater

  return { bases, supplies };
}
