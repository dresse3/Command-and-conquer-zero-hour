import { MAP_W, MAP_H, TILE } from "./config";

const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

export class Camera {
  x = 0; // world coords of top-left of viewport
  y = 0;
  zoom = 1;
  viewW = 0;
  viewH = 0;

  resize(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  setZoom(factor: number, anchorX: number, anchorY: number) {
    // anchor is a screen point that should stay put while zooming
    const worldBefore = this.screenToWorld(anchorX, anchorY);
    this.zoom = Math.min(2.2, Math.max(0.45, this.zoom * factor));
    const worldAfter = this.screenToWorld(anchorX, anchorY);
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
    this.clamp();
  }

  pan(dxWorld: number, dyWorld: number) {
    this.x += dxWorld;
    this.y += dyWorld;
    this.clamp();
  }

  centerOn(wx: number, wy: number) {
    this.x = wx - this.viewW / this.zoom / 2;
    this.y = wy - this.viewH / this.zoom / 2;
    this.clamp();
  }

  clamp() {
    const visW = this.viewW / this.zoom;
    const visH = this.viewH / this.zoom;
    this.x = Math.max(0, Math.min(WORLD_W - visW, this.x));
    this.y = Math.max(0, Math.min(WORLD_H - visH, this.y));
    if (WORLD_W < visW) this.x = (WORLD_W - visW) / 2;
    if (WORLD_H < visH) this.y = (WORLD_H - visH) / 2;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }
}
