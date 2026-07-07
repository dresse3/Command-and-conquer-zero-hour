import { MAP_W, MAP_H, TILE, POWER_ORDER, type BuildEntry, type PowerKind } from "./config";

export const HUD_HEIGHT = 104;
const MINIMAP_MARGIN = 10;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

// bottom bar has two rows: a thin top row (name / queue / sell) and the main
// button row. Everything is laid out relative to the canvas width so nothing
// overlaps on tablet/narrow screens.
const BUTTON_H = 56;
function mainRowY(H: number): number {
  return H - HUD_HEIGHT + 40;
}
export function topRowY(H: number): number {
  return H - HUD_HEIGHT + 7;
}

export interface ButtonRect {
  entry: BuildEntry;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function buttonRects(entries: BuildEntry[], canvasW: number, canvasH: number): ButtonRect[] {
  const n = entries.length;
  if (n === 0) return [];
  const gap = 8;
  const startX = 16;
  const powers = powerButtonRects(canvasW, canvasH);
  const rightBound = (powers.length ? powers[0].x : canvasW - 200) - 12;
  const avail = rightBound - startX;
  // fit N buttons into the available width; only floor at a readable minimum
  let bw = Math.min(104, Math.floor((avail - (n - 1) * gap) / n));
  bw = Math.max(46, bw);
  const y = mainRowY(canvasH);
  return entries.map((entry, i) => ({ entry, x: startX + i * (bw + gap), y, w: bw, h: BUTTON_H }));
}

export function hudHitTest(
  px: number,
  py: number,
  entries: BuildEntry[],
  canvasW: number,
  canvasH: number,
): BuildEntry | null {
  for (const r of buttonRects(entries, canvasW, canvasH)) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.entry;
  }
  return null;
}

export function isInHud(py: number, canvasH: number): boolean {
  return py >= canvasH - HUD_HEIGHT;
}

// Sell button in the thin top row, just left of the power buttons — clear of
// the build-button row below it.
export function sellButtonRect(canvasW: number, canvasH: number) {
  const w = 90;
  const h = 24;
  const powers = powerButtonRects(canvasW, canvasH);
  const rightEdge = powers.length ? powers[0].x - 14 : canvasW - 220;
  return { x: rightEdge - w, y: topRowY(canvasH), w, h };
}

export function isInSellButton(px: number, py: number, canvasW: number, canvasH: number): boolean {
  const r = sellButtonRect(canvasW, canvasH);
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// ---- general power buttons (main row, left of the minimap) ----
export interface PowerRect {
  kind: PowerKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function powerButtonRects(canvasW: number, canvasH: number): PowerRect[] {
  const bw = 86;
  const gap = 8;
  const rightEdge = minimapRect(canvasW, canvasH).x - 14;
  const y = mainRowY(canvasH);
  const n = POWER_ORDER.length;
  const startX = rightEdge - n * bw - (n - 1) * gap;
  return POWER_ORDER.map((kind, i) => ({ kind, x: startX + i * (bw + gap), y, w: bw, h: BUTTON_H }));
}

export function powerHitTest(px: number, py: number, canvasW: number, canvasH: number): PowerKind | null {
  for (const r of powerButtonRects(canvasW, canvasH)) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.kind;
  }
  return null;
}

// ---- minimap (scales down a little on small screens) ----
export function minimapSize(canvasW: number, canvasH: number): number {
  return Math.round(Math.min(176, canvasH * 0.22, canvasW * 0.16));
}

export function minimapRect(canvasW: number, canvasH: number) {
  const size = minimapSize(canvasW, canvasH);
  return {
    x: canvasW - size - MINIMAP_MARGIN,
    y: canvasH - size - MINIMAP_MARGIN,
    w: size,
    h: size,
  };
}

export function isInMinimap(px: number, py: number, canvasW: number, canvasH: number): boolean {
  const r = minimapRect(canvasW, canvasH);
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function minimapToWorld(px: number, py: number, canvasW: number, canvasH: number): { x: number; y: number } {
  const r = minimapRect(canvasW, canvasH);
  const fx = (px - r.x) / r.w;
  const fy = (py - r.y) / r.h;
  return { x: fx * WORLD_W, y: fy * WORLD_H };
}

export function worldToMinimap(wx: number, wy: number, canvasW: number, canvasH: number): { x: number; y: number } {
  const r = minimapRect(canvasW, canvasH);
  return { x: r.x + (wx / WORLD_W) * r.w, y: r.y + (wy / WORLD_H) * r.h };
}
