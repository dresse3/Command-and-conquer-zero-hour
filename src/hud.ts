import { UNITS, type UnitKind } from "./config";

export const HUD_HEIGHT = 96;

export interface HudButton {
  kind: UnitKind;
  hotkey: string;
}

export const HUD_BUTTONS: HudButton[] = [
  { kind: "ranger", hotkey: "R" },
  { kind: "raptor", hotkey: "T" },
  { kind: "harvester", hotkey: "H" },
];

export interface ButtonRect {
  btn: HudButton;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function buttonRects(canvasW: number, canvasH: number): ButtonRect[] {
  const bw = 108;
  const bh = 64;
  const gap = 10;
  const startX = 20;
  const y = canvasH - HUD_HEIGHT + (HUD_HEIGHT - bh) / 2;
  const rects: ButtonRect[] = [];
  HUD_BUTTONS.forEach((btn, i) => {
    rects.push({ btn, x: startX + i * (bw + gap), y, w: bw, h: bh });
  });
  void canvasW;
  return rects;
}

export function hudHitTest(px: number, py: number, canvasW: number, canvasH: number): UnitKind | null {
  for (const r of buttonRects(canvasW, canvasH)) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.btn.kind;
  }
  return null;
}

export function isInHud(py: number, canvasH: number): boolean {
  return py >= canvasH - HUD_HEIGHT;
}

export function costOf(kind: UnitKind): number {
  return UNITS[kind].cost;
}
