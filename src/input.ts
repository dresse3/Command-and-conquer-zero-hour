export interface InputHandlers {
  onSelect(rect: { x: number; y: number; w: number; h: number }, additive: boolean): void;
  onCommand(screenX: number, screenY: number, additive: boolean): void; // right click
  onZoom(factor: number, screenX: number, screenY: number): void;
  onHotkey(key: string): void;
  onTap(screenX: number, screenY: number): void; // touch tap
  onPan(dxScreen: number, dyScreen: number): void; // two-finger drag
}

const CLICK_THRESHOLD = 6; // px of movement below which a drag counts as a click

export class Input {
  keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;

  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  dragRect: { x: number; y: number; w: number; h: number } | null = null;

  // touch state
  private touches = new Map<number, { x: number; y: number }>();
  private tStartX = 0;
  private tStartY = 0;
  private tStartTime = 0;
  private tPotentialTap = false;
  private tDragging = false;
  private twoFinger = false;
  private prevCX = 0;
  private prevCY = 0;
  private prevDist = 0;

  constructor(private canvas: HTMLCanvasElement, private h: InputHandlers) {
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
  }

  private onMouseDown = (e: MouseEvent) => {
    const { x, y } = this.local(e);
    this.mouseX = x;
    this.mouseY = y;
    if (e.button === 0) {
      this.dragging = true;
      this.dragStartX = x;
      this.dragStartY = y;
      this.dragRect = { x, y, w: 0, h: 0 };
    } else if (e.button === 2) {
      e.preventDefault();
      this.h.onCommand(x, y, e.shiftKey);
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    const { x, y } = this.local(e);
    this.mouseX = x;
    this.mouseY = y;
    if (this.dragging) {
      this.dragRect = {
        x: Math.min(this.dragStartX, x),
        y: Math.min(this.dragStartY, y),
        w: Math.abs(x - this.dragStartX),
        h: Math.abs(y - this.dragStartY),
      };
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0 || !this.dragging) return;
    this.dragging = false;
    const rect = this.dragRect ?? { x: this.mouseX, y: this.mouseY, w: 0, h: 0 };
    this.dragRect = null;
    const isClick = rect.w < CLICK_THRESHOLD && rect.h < CLICK_THRESHOLD;
    if (isClick) {
      this.h.onSelect({ x: this.mouseX - 2, y: this.mouseY - 2, w: 4, h: 4 }, e.shiftKey);
    } else {
      this.h.onSelect(rect, e.shiftKey);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const { x, y } = this.local(e);
    this.h.onZoom(factor, x, y);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
    this.h.onHotkey(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------------- touch ----------------
  private localT(t: Touch): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  private centroid(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const p of this.touches.values()) {
      x += p.x;
      y += p.y;
    }
    const n = this.touches.size || 1;
    return { x: x / n, y: y / n };
  }

  private touchDist(): number {
    const v = [...this.touches.values()];
    if (v.length < 2) return 0;
    return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
  }

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) this.touches.set(t.identifier, this.localT(t));
    const n = this.touches.size;
    if (n === 1) {
      const p = [...this.touches.values()][0];
      this.tStartX = p.x;
      this.tStartY = p.y;
      this.tStartTime = performance.now();
      this.tPotentialTap = true;
      this.tDragging = false;
      this.twoFinger = false;
      this.mouseX = p.x;
      this.mouseY = p.y;
      this.dragRect = { x: p.x, y: p.y, w: 0, h: 0 };
    } else {
      // second finger down: cancel tap / box-select, start pan+zoom gesture
      this.tPotentialTap = false;
      this.tDragging = false;
      this.dragRect = null;
      this.twoFinger = true;
      const c = this.centroid();
      this.prevCX = c.x;
      this.prevCY = c.y;
      this.prevDist = this.touchDist();
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (this.touches.has(t.identifier)) this.touches.set(t.identifier, this.localT(t));
    }
    const n = this.touches.size;
    if (n === 1 && !this.twoFinger) {
      const p = [...this.touches.values()][0];
      this.mouseX = p.x;
      this.mouseY = p.y;
      const dx = p.x - this.tStartX;
      const dy = p.y - this.tStartY;
      if (Math.hypot(dx, dy) > CLICK_THRESHOLD) {
        this.tDragging = true;
        this.tPotentialTap = false;
      }
      if (this.tDragging) {
        this.dragRect = { x: Math.min(this.tStartX, p.x), y: Math.min(this.tStartY, p.y), w: Math.abs(dx), h: Math.abs(dy) };
      }
    } else if (n >= 2) {
      const c = this.centroid();
      const d = this.touchDist();
      if (this.prevDist > 0 && Math.abs(d - this.prevDist) > 1) this.h.onZoom(d / this.prevDist, c.x, c.y);
      this.h.onPan(c.x - this.prevCX, c.y - this.prevCY);
      this.prevCX = c.x;
      this.prevCY = c.y;
      this.prevDist = d;
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) this.touches.delete(t.identifier);
    const n = this.touches.size;
    if (n === 0) {
      if (this.tPotentialTap && performance.now() - this.tStartTime < 500) {
        this.h.onTap(this.tStartX, this.tStartY);
      } else if (this.tDragging && this.dragRect && (this.dragRect.w > CLICK_THRESHOLD || this.dragRect.h > CLICK_THRESHOLD)) {
        this.h.onSelect(this.dragRect, false);
      }
      this.dragRect = null;
      this.tDragging = false;
      this.tPotentialTap = false;
      this.twoFinger = false;
    } else {
      // lifted one of several fingers — stay inert until all are up
      const p = [...this.touches.values()][0];
      this.tStartX = p.x;
      this.tStartY = p.y;
      this.mouseX = p.x;
      this.mouseY = p.y;
      this.tPotentialTap = false;
      this.tDragging = false;
      this.twoFinger = true;
      this.dragRect = null;
    }
  };
}
