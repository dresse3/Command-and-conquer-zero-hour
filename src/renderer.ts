import { TILE, COLORS, UNITS, BUILDINGS, type BuildEntry } from "./config";
import type { Game } from "./game";
import { Unit, Building } from "./entities";
import { buttonRects, HUD_HEIGHT, minimapRect, worldToMinimap } from "./hud";

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
    if (game.placement) this.drawPlacementGhost(game);

    ctx.restore();

    this.drawSelectionBox(game);
    this.drawHud(game);
    this.drawMinimap(game);
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
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        this.diamond(ctx, f.x + Math.cos(a) * r * 0.5, f.y + Math.sin(a) * r * 0.5, r * 0.5);
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
    ctx.fillRect(px + 7, py + 7, w - 14, h - 14);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3, py + 3, w - 6, h - 6);

    this.buildingGlyph(ctx, b, px, py, w, h);

    // no-power indicator
    if (b.def.needsPower && !b.powered) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(px + 3, py + 3, w - 6, h - 6);
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡", b.x, b.y);
    }

    // turret barrel
    if (b.def.damage > 0) {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - b.radius - 4);
      ctx.stroke();
    }

    this.hpBar(ctx, b.x, py - 8, w - 6, b.hp / b.maxHp, b.hp < b.maxHp);

    if (b.selected) {
      ctx.strokeStyle = "#7CFC00";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
    }
  }

  private buildingGlyph(ctx: CanvasRenderingContext2D, b: Building, px: number, py: number, w: number, h: number) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    const cx = px + w / 2;
    const cy = py + h / 2;
    switch (b.kind) {
      case "command":
        ctx.fillRect(cx - 8, cy - 8, 16, 16);
        break;
      case "power":
        ctx.fillRect(cx - 8, cy - 3, 6, 6);
        ctx.fillRect(cx + 2, cy - 3, 6, 6);
        break;
      case "barracks":
        ctx.fillRect(cx - 4, cy - 8, 8, 16); // doorway
        break;
      case "factory":
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy + 8);
        ctx.lineTo(cx, cy - 8);
        ctx.lineTo(cx + 10, cy + 8);
        ctx.closePath();
        ctx.fill();
        break;
      case "supply":
        ctx.fillStyle = "rgba(230,195,74,0.5)";
        ctx.fillRect(cx - 9, cy - 2, 6, 6);
        ctx.fillRect(cx - 1, cy - 2, 6, 6);
        ctx.fillRect(cx - 5, cy - 8, 6, 6);
        break;
      case "turret":
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
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

    switch (u.kind) {
      case "raptor":
        ctx.fillStyle = dark;
        ctx.fillRect(-u.radius, -u.radius * 0.75, u.radius * 2, u.radius * 1.5);
        ctx.fillStyle = main;
        ctx.fillRect(-u.radius * 0.6, -u.radius * 0.5, u.radius * 1.2, u.radius);
        ctx.fillStyle = dark;
        ctx.fillRect(0, -2, u.radius * 1.5, 4);
        break;
      case "artillery":
        ctx.fillStyle = dark;
        ctx.fillRect(-u.radius, -u.radius * 0.6, u.radius * 2, u.radius * 1.2);
        ctx.fillStyle = main;
        ctx.fillRect(-u.radius * 0.5, -u.radius * 0.4, u.radius, u.radius * 0.8);
        ctx.fillStyle = "#2b2b30";
        ctx.fillRect(0, -1.5, u.radius * 2.4, 3); // long barrel
        break;
      case "harvester":
        ctx.fillStyle = dark;
        ctx.fillRect(-u.radius, -u.radius, u.radius * 2, u.radius * 2);
        ctx.fillStyle = u.carrying > 0 ? COLORS.supply : main;
        ctx.fillRect(-u.radius * 0.6, -u.radius * 0.6, u.radius * 1.2, u.radius * 1.2);
        break;
      case "rocketeer":
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e8e8e8";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#2b2b30";
        ctx.fillRect(0, -2.5, u.radius + 6, 5); // launcher
        break;
      default: // ranger
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = dark;
        ctx.fillRect(0, -1.5, u.radius + 4, 3);
        break;
    }
    ctx.restore();

    if (u.hp < u.maxHp) this.hpBar(ctx, u.x, u.y - u.radius - 8, u.radius * 2 + 6, u.hp / u.maxHp, true);
  }

  private drawProjectiles(game: Game) {
    const ctx = this.ctx;
    for (const p of game.projectiles) {
      ctx.fillStyle = p.splash > 0 ? "#ff9f45" : "#ffe27a";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.splash > 0 ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPlacementGhost(game: Game) {
    const kind = game.placement!;
    const def = BUILDINGS[kind];
    const world = game.camera.screenToWorld(game.input.mouseX, game.input.mouseY);
    const { tx, ty } = game.placementTile(world.x, world.y, kind);
    const ok = game.canPlace(kind, tx, ty, "player") && game.credits["player"] >= def.cost;
    const ctx = this.ctx;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? "#4ade80" : "#ef4444";
    ctx.fillRect(tx * TILE, ty * TILE, def.tilesW * TILE, def.tilesH * TILE);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#4ade80" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE, ty * TILE, def.tilesW * TILE, def.tilesH * TILE);
  }

  private hpBar(ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, frac: number, show: boolean) {
    if (!show) return;
    const x = cx - width / 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 1, y - 1, width + 2, 6);
    ctx.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.25 ? "#facc15" : "#ef4444";
    ctx.fillRect(x, y, width * frac, 4);
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
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.supply;
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.fillText(`⛃ ${Math.floor(game.credits["player"])}`, 16, 21);

    const pw = game.power["player"];
    ctx.fillStyle = pw >= 0 ? "#7dd3fc" : "#ef4444";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(`⚡ ${pw >= 0 ? "+" : ""}${pw}`, 150, 21);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px system-ui, sans-serif";
    const army = game.units.filter((u) => u.team === "player" && u.alive).length;
    const enemyArmy = game.units.filter((u) => u.team === "enemy" && u.alive).length;
    ctx.fillText(`Units: ${army}`, 240, 21);
    ctx.fillStyle = COLORS.enemy;
    ctx.fillText(`Hostiles: ${enemyArmy}`, 330, 21);

    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText(
      "Arrows/edges: pan · wheel: zoom · click building to build · A: attack-move · Ctrl+1-9: groups",
      W - 16,
      21,
    );
    ctx.textAlign = "left";

    // bottom command bar
    ctx.fillStyle = "rgba(10,12,16,0.9)";
    ctx.fillRect(0, H - HUD_HEIGHT, W, HUD_HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, H - HUD_HEIGHT, W, 2);

    const sel = game.selectedBuilding;
    const entries = game.currentBuildEntries();
    if (!sel) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("Select a building (click it) to build units or structures.", 20, H - HUD_HEIGHT / 2);
    } else {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText(sel.def.name.toUpperCase(), 16, H - HUD_HEIGHT + 14);
      for (const rect of buttonRects(entries, H)) {
        this.drawBuildButton(ctx, game, rect.entry, rect.x, rect.y, rect.w, rect.h);
      }
      // production queue
      if (sel.queue.length > 0) {
        const qx = 16 + entries.length * 112 + 16;
        const qy = H - HUD_HEIGHT + 18;
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("Queue", qx, qy);
        sel.queue.forEach((item, i) => {
          const bx = qx + i * 44;
          const by = qy + 12;
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.fillRect(bx, by, 38, 38);
          const prog = 1 - item.timeLeft / item.total;
          ctx.fillStyle = "rgba(61,169,252,0.5)";
          ctx.fillRect(bx, by + 38 - 38 * prog, 38, 38 * prog);
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.strokeRect(bx, by, 38, 38);
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "9px system-ui, sans-serif";
          ctx.fillText(UNITS[item.kind].name.slice(0, 7), bx + 2, by + 21);
        });
      }
    }

    if (game.toast) {
      ctx.font = "bold 15px system-ui, sans-serif";
      const tw = ctx.measureText(game.toast).width + 24;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - tw / 2, 50, tw, 28);
      ctx.fillStyle = "#f1f5f9";
      ctx.textAlign = "center";
      ctx.fillText(game.toast, W / 2, 64);
      ctx.textAlign = "left";
    }
  }

  private drawBuildButton(
    ctx: CanvasRenderingContext2D,
    game: Game,
    entry: BuildEntry,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const def = entry.type === "unit" ? UNITS[entry.key as keyof typeof UNITS] : BUILDINGS[entry.key as keyof typeof BUILDINGS];
    const affordable = game.credits["player"] >= def.cost;
    ctx.fillStyle = affordable ? "rgba(61,169,252,0.18)" : "rgba(80,80,90,0.18)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = affordable ? "rgba(61,169,252,0.7)" : "rgba(120,120,130,0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = affordable ? "#e2e8f0" : "#7a8290";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(def.name, x + 7, y + 15);
    ctx.fillStyle = COLORS.supply;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`⛃ ${def.cost}`, x + 7, y + 34);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px system-ui, sans-serif";
    const tag = entry.type === "building" ? "structure" : "unit";
    ctx.fillText(`[${entry.hotkey}] ${tag}`, x + 7, y + 51);
  }

  private drawMinimap(game: Game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const r = minimapRect(W, H);

    ctx.fillStyle = "rgba(8,10,14,0.92)";
    ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);

    // terrain (downsampled)
    const step = 3;
    const sx = r.w / game.grid.w;
    const sy = r.h / game.grid.h;
    for (let ty = 0; ty < game.grid.h; ty += step) {
      for (let tx = 0; tx < game.grid.w; tx += step) {
        const c = game.grid.cell(tx, ty)!;
        ctx.fillStyle = c.terrain === 2 ? COLORS.rock : c.terrain === 1 ? COLORS.dirt : COLORS.grass;
        ctx.fillRect(r.x + tx * sx, r.y + ty * sy, sx * step + 1, sy * step + 1);
      }
    }

    for (const f of game.supplyFields) {
      const p = worldToMinimap(f.x, f.y, W, H);
      ctx.fillStyle = COLORS.supply;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    for (const b of game.buildings) {
      const p = worldToMinimap(b.x, b.y, W, H);
      ctx.fillStyle = b.team === "player" ? COLORS.player : COLORS.enemy;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    for (const u of game.units) {
      const p = worldToMinimap(u.x, u.y, W, H);
      ctx.fillStyle = u.team === "player" ? "#bfe4ff" : "#ffc2cd";
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    // viewport rectangle
    const tl = worldToMinimap(game.camera.x, game.camera.y, W, H);
    const br = worldToMinimap(
      game.camera.x + game.camera.viewW / game.camera.zoom,
      game.camera.y + game.camera.viewH / game.camera.zoom,
      W,
      H,
    );
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
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
  }
}
