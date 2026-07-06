import { MAP_W, MAP_H, TILE, type BuildEntry } from "./config";

export const HUD_HEIGHT = 96;
export const MINIMAP_SIZE = 176;
const MINIMAP_MARGIN = 10;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

export interface ButtonRect {
  entry: BuildEntry;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function buttonRects(entries: BuildEntry[], canvasH: number): ButtonRect[] {
  const bw = 104;
  const bh = 64;
  const gap = 8;
  const startX = 16;
  const y = canvasH - HUD_HEIGHT + (HUD_HEIGHT - bh) / 2;
  return entries.map((entry, i) => ({ entry, x: startX + i * (bw + gap), y, w: bw, h: bh }));
}

export function hudHitTest(px: number, py: number, entries: BuildEntry[], canvasH: number): BuildEntry | null {
  for (const r of buttonRects(entries, canvasH)) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.entry;
  }
  return null;
}

export function isInHud(py: number, canvasH: number): boolean {
  return py >= canvasH - HUD_HEIGHT;
}

// ---- minimap ----
export function minimapRect(canvasW: number, canvasH: number) {
  return {
    x: canvasW - MINIMAP_SIZE - MINIMAP_MARGIN,
    y: canvasH - MINIMAP_SIZE - MINIMAP_MARGIN,
    w: MINIMAP_SIZE,
    h: MINIMAP_SIZE,
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
