import { TILE, COLORS, UNITS } from "./config";
import type { Game } from "./game";
import { Unit, Building } from "./entities";
import { buttonRects, HUD_HEIGHT, costOf } from "./hud";

export class Renderer {
  ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  draw(game: Game) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.scale(game.camera.zoom, game.camera.zoom);
    ctx.translate(-game.camera.x, -game.camera.y);

    this.drawTerrain(game);
    this.drawSupply(game);
    for (const b of game.buildings) this.drawBuilding(ctx, b);
    for (const u of game.units) this.drawUnit(ctx, u);
    this.drawProjectiles(game);

    ctx.restore();

    this.drawSelectionBox(game);
    this.drawHud(game);
    if (game.status !== "playing") this.drawEndScreen(game);
  }

  private drawTerrain(game: Game) {
    const ctx = this.ctx;
    const cam = game.camera;
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(game.grid.w, Math.ceil((cam.x + cam.viewW / cam.zoom) / TILE));
    const y1 = Math.min(game.grid.h, Math.ceil((cam.y + cam.viewH / cam.zoom) / TILE));

    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const c = game.grid.cell(tx, ty)!;
        let color = (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
        if (c.terrain === 1) color = COLORS.dirt;
        if (c.terrain === 2) color = COLORS.rock;
        ctx.fillStyle = color;
        ctx.fillRect(tx * TILE, ty * TILE, TILE + 0.5, TILE + 0.5);
      }
    }
  }

  private drawSupply(game: Game) {
    const ctx = this.ctx;
    for (const f of game.supplyFields) {
      const frac = Math.max(0.25, f.remaining / 4000);
      ctx.fillStyle = COLORS.supply;
      ctx.globalAlpha = 0.9;
      const r = f.radius * frac;
      ctx.beginPath();
      // crystal cluster: a few diamonds
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const cx = f.x + Math.cos(a) * r * 0.5;
        const cy = f.y + Math.sin(a) * r * 0.5;
        this.diamond(ctx, cx, cy, r * 0.5);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private diamond(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building) {
    const px = b.tileX * TILE;
    const py = b.tileY * TILE;
    const w = b.def.tilesW * TILE;
    const h = b.def.tilesH * TILE;
    const main = b.team === "player" ? COLORS.player : COLORS.enemy;
    const dark = b.team === "player" ? COLORS.playerDark : COLORS.enemyDark;

    ctx.fillStyle = dark;
    ctx.fillRect(px + 3, py + 3, w - 6, h - 6);
    ctx.fillStyle = main;
    ctx.fillRect(px + 8, py + 8, w - 16, h - 16);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3, py + 3, w - 6, h - 6);

    // roof marker
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(px + w / 2 - 6, py + h / 2 - 6, 12, 12);

    this.hpBar(ctx, b.x, py - 8, w - 6, b.hp / b.maxHp, b.hp < b.maxHp);

    if (b.selected) {
      ctx.strokeStyle = "#7CFC00";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
    }
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: Unit) {
    const main = u.team === "player" ? COLORS.player : COLORS.enemy;
    const dark = u.team === "player" ? COLORS.playerDark : COLORS.enemyDark;

    if (u.selected) {
      ctx.strokeStyle = "#7CFC00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(u.angle);

    if (u.kind === "raptor") {
      ctx.fillStyle = dark;
      ctx.fillRect(-u.radius, -u.radius * 0.75, u.radius * 2, u.radius * 1.5);
      ctx.fillStyle = main;
      ctx.fillRect(-u.radius * 0.6, -u.radius * 0.5, u.radius * 1.2, u.radius);
      ctx.fillStyle = dark;
      ctx.fillRect(0, -2, u.radius * 1.5, 4); // barrel
    } else if (u.kind === "harvester") {
      ctx.fillStyle = dark;
      ctx.fillRect(-u.radius, -u.radius, u.radius * 2, u.radius * 2);
      ctx.fillStyle = u.carrying > 0 ? COLORS.supply : main;
      ctx.fillRect(-u.radius * 0.6, -u.radius * 0.6, u.radius * 1.2, u.radius * 1.2);
    } else {
      // ranger infantry
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.fillRect(0, -1.5, u.radius + 4, 3); // rifle
    }
    ctx.restore();

    if (u.hp < u.maxHp) this.hpBar(ctx, u.x, u.y - u.radius - 8, u.radius * 2 + 6, u.hp / u.maxHp, true);
  }

  private drawProjectiles(game: Game) {
    const ctx = this.ctx;
    ctx.fillStyle = "#ffe27a";
    for (const p of game.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private hpBar(ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, frac: number, show: boolean) {
    if (!show) return;
    const w = width;
    const x = cx - w / 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 1, y - 1, w + 2, 6);
    ctx.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.25 ? "#facc15" : "#ef4444";
    ctx.fillRect(x, y, w * frac, 4);
  }

  private drawSelectionBox(game: Game) {
    const r = game.input.dragRect;
    if (!r || (r.w < 4 && r.h < 4)) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(124,252,0,0.9)";
    ctx.fillStyle = "rgba(124,252,0,0.12)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  private drawHud(game: Game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // top bar
    ctx.fillStyle = "rgba(10,12,16,0.82)";
    ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = COLORS.supply;
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`⛃ ${Math.floor(game.credits["player"])}`, 16, 21);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px system-ui, sans-serif";
    const army = game.units.filter((u) => u.team === "player" && u.alive).length;
    const enemyArmy = game.units.filter((u) => u.team === "enemy" && u.alive).length;
    ctx.fillText(`Units: ${army}`, 160, 21);
    ctx.fillStyle = COLORS.enemy;
    ctx.fillText(`Hostiles: ${enemyArmy}`, 250, 21);

    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText("WASD/edges: pan · wheel: zoom · L-drag: select · R-click: move/attack", W - 16, 21);
    ctx.textAlign = "left";

    // bottom command bar
    ctx.fillStyle = "rgba(10,12,16,0.9)";
    ctx.fillRect(0, H - HUD_HEIGHT, W, HUD_HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, H - HUD_HEIGHT, W, 2);

    const base = game.baseOf("player");
    for (const rect of buttonRects(W, H)) {
      const def = UNITS[rect.btn.kind];
      const affordable = game.credits["player"] >= def.cost;
      ctx.fillStyle = affordable ? "rgba(61,169,252,0.18)" : "rgba(80,80,90,0.18)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = affordable ? "rgba(61,169,252,0.7)" : "rgba(120,120,130,0.5)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      ctx.fillStyle = affordable ? "#e2e8f0" : "#7a8290";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(def.name, rect.x + 8, rect.y + 16);
      ctx.fillStyle = COLORS.supply;
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(`⛃ ${def.cost}`, rect.x + 8, rect.y + 36);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(`[${rect.btn.hotkey}]`, rect.x + 8, rect.y + 52);
    }

    // production queue preview
    if (base && base.queue.length > 0) {
      const qx = buttonRects(W, H)[2].x + 130;
      const qy = H - HUD_HEIGHT + 16;
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText("Production:", qx, qy);
      base.queue.forEach((item, i) => {
        const bx = qx + i * 46;
        const by = qy + 14;
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(bx, by, 40, 40);
        const prog = 1 - item.timeLeft / item.total;
        ctx.fillStyle = "rgba(61,169,252,0.5)";
        ctx.fillRect(bx, by + 40 - 40 * prog, 40, 40 * prog);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.strokeRect(bx, by, 40, 40);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(UNITS[item.kind].name.slice(0, 6), bx + 3, by + 22);
      });
    }

    if (game.toast) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const tw = ctx.measureText(game.toast).width + 24;
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.fillRect(W / 2 - tw / 2, 50, tw, 28);
      ctx.fillStyle = "#f1f5f9";
      ctx.textAlign = "center";
      ctx.fillText(game.toast, W / 2, 64);
      ctx.textAlign = "left";
    }
  }

  private drawEndScreen(game: Game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = game.status === "won" ? "#4ade80" : "#ef4565";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText(game.status === "won" ? "VICTORY" : "DEFEAT", W / 2, H / 2 - 20);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Refresh the page to play again", W / 2, H / 2 + 24);
    ctx.textAlign = "left";
    void costOf;
  }
}
