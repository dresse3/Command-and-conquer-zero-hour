import type { Grid } from "./grid";

// An original, hand-designed skirmish map — a symmetric desert battlefield with
// a wrecked crater at its heart, four corner base sites and open lanes weaving
// between them. Terrain is stamped with 4-fold mirror symmetry (both axes) so
// all four start positions play perfectly fair. Two of the four are chosen at
// random each match, so you never know which corner the enemy took — fog of war
// actually matters.
//
// This is our own terrain data (no external map files are used or shipped).

export interface StartSpot {
  tx: number; // command-centre top-left tile
  ty: number;
  dirX: 1 | -1; // direction the base cluster grows (toward centre)
  dirY: 1 | -1;
}

export interface MapLayout {
  starts: StartSpot[]; // four corner base sites
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
  // 4-fold mirror stampers (reflect across both centre axes)
  const rock4 = (x: number, y: number) => {
    setRock(x, y);
    setRock(W - 1 - x, y);
    setRock(x, H - 1 - y);
    setRock(W - 1 - x, H - 1 - y);
  };
  const dirt4 = (x: number, y: number) => {
    setDirt(x, y);
    setDirt(W - 1 - x, y);
    setDirt(x, H - 1 - y);
    setDirt(W - 1 - x, H - 1 - y);
  };

  // deterministic 0..1 hash for irregular edges
  const noise = (x: number, y: number) => {
    let h = (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 1000) / 1000;
  };

  // A ragged rock blob of radius r. `sym` mirrors it 4-fold.
  const blob = (bx: number, by: number, r: number, density: number, sym: boolean) => {
    for (let dy = -r - 1; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + noise(bx + dx * 5, by + dy * 5) * 1.2) continue;
        if (d > r - 1.2 && noise(bx + dx * 3, by + dy * 7) > density) continue;
        if (sym) rock4(bx + dx, by + dy);
        else setRock(bx + dx, by + dy);
      }
    }
  };

  const dirtPatch = (bx: number, by: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) > r) continue;
        if (noise(bx + dx * 4, by + dy * 4) > 0.5) dirt4(bx + dx, by + dy);
      }
  };

  // --- 1. Central crater: an impassable wreck that splits the battlefield,
  //        forcing armies to flank around it. Self-symmetric about centre. ---
  blob(Math.round(cx), Math.round(cy), 5.5, 0.85, false);
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    dirtPatch(cx + Math.cos(ang) * 8.5, cy + Math.sin(ang) * 8.5, 1.5);
  }

  // --- 2. Cross-axis ridge fragments partway out from the crater, framing the
  //        four quadrants while leaving broad lanes between them. ---
  for (let i = 0; i < 3; i++) {
    const off = 12 + i * 6;
    blob(Math.round(cx - off), Math.round(cy - 4), 2 + (i % 2), 0.7, true); // toward each corner
    blob(Math.round(cx - 5), Math.round(cy - off), 2, 0.7, true); // toward top/bottom edges
  }

  // --- 3. Mid-edge cover clusters (the flank routes on each side). ---
  blob(Math.round(W * 0.28), Math.round(cy), 3, 0.75, true);
  blob(Math.round(cx), Math.round(H * 0.28), 3, 0.75, true);

  // --- 4. Base defensive rims: a broken rock horseshoe around each corner
  //        site, open toward the centre so there is a natural choke. ---
  const bx = W * 0.13;
  const by = H * 0.13;
  for (let a = 20; a <= 200; a += 14) {
    const ang = (a * Math.PI) / 180;
    const rx = bx + Math.cos(ang) * 11;
    const ry = by + Math.sin(ang) * 11;
    if (noise(rx * 2, ry * 2) > 0.3) blob(Math.round(rx), Math.round(ry), 1, 0.7, true);
  }

  // --- 5. Scattered cover boulders + dirt tracks for texture. ---
  const cover = [
    [0.34, 0.34],
    [0.22, 0.44],
    [0.44, 0.22],
    [0.4, 0.4],
  ];
  for (const [fx, fy] of cover) {
    blob(Math.round(W * fx), Math.round(H * fy), 1 + Math.round(noise(fx * 99, fy * 99) * 2), 0.65, true);
  }
  dirtPatch(W * 0.2, H * 0.2, 4);
  dirtPatch(W * 0.35, H * 0.12, 3);

  // --- Four corner start sites (each grows toward the centre). ---
  const near = Math.round(W * 0.07);
  const far = W - 3 - near;
  const nearY = Math.round(H * 0.07);
  const farY = H - 3 - nearY;
  const starts: StartSpot[] = [
    { tx: near, ty: nearY, dirX: 1, dirY: 1 }, // top-left
    { tx: far, ty: nearY, dirX: -1, dirY: 1 }, // top-right
    { tx: near, ty: farY, dirX: 1, dirY: -1 }, // bottom-left
    { tx: far, ty: farY, dirX: -1, dirY: -1 }, // bottom-right
  ];

  // --- Supply fields: mirrored 4-fold so every corner is equally supplied,
  //     plus a contested pair beside the crater. ---
  const supplies: { tx: number; ty: number }[] = [];
  const supply4 = (tx: number, ty: number) => {
    supplies.push({ tx, ty });
    supplies.push({ tx: W - 2 - tx, ty });
    supplies.push({ tx, ty: H - 2 - ty });
    supplies.push({ tx: W - 2 - tx, ty: H - 2 - ty });
  };
  supply4(Math.round(W * 0.16), Math.round(H * 0.16)); // one safe field per corner
  supply4(Math.round(W * 0.08), Math.round(H * 0.4)); // flank fields
  // contested fields just off the crater (mirror pair)
  supplies.push({ tx: Math.round(cx - 8), ty: Math.round(cy + 3) });
  supplies.push({ tx: Math.round(cx + 6), ty: Math.round(cy - 5) });

  return { starts, supplies };
}
