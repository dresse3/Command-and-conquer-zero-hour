export interface InputHandlers {
  onSelect(rect: { x: number; y: number; w: number; h: number }, additive: boolean): void;
  onCommand(screenX: number, screenY: number, additive: boolean): void; // right click
  onZoom(factor: number, screenX: number, screenY: number): void;
  onHotkey(key: string): void;
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

  constructor(private canvas: HTMLCanvasElement, private h: InputHandlers) {
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
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
}
