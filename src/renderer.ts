import { TILE, COLORS, UNITS, BUILDINGS, POWERS, POWER_POINT_COST, SELL_REFUND, UPGRADES, type BuildEntry } from "./config";
import type { Game } from "./game";
import { Unit, Building } from "./entities";
import { buttonRects, powerButtonRects, sellButtonRect, HUD_HEIGHT, minimapRect, worldToMinimap } from "./hud";

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

    if (game.phase === "select") {
      this.drawFactionSelect(game);
      return;
    }

    ctx.save();
    ctx.translate(game.camera.shakeX, game.camera.shakeY);
    ctx.scale(game.camera.zoom, game.camera.zoom);
    ctx.translate(-game.camera.x, -game.camera.y);

    this.drawTerrain(game);
    this.drawSupply(game);
    this.drawFog(game);
    if (game.selectedBuilding) this.drawRally(game.selectedBuilding);
    for (const b of game.buildings) {
      if (b.team === "enemy") {
        if (!game.fog.isExploredWorld(b.x, b.y)) continue;
        ctx.globalAlpha = game.fog.isVisibleWorld(b.x, b.y) ? 1 : 0.5;
      }
      this.drawBuilding(ctx, b);
      ctx.globalAlpha = 1;
    }
    for (const u of game.units) {
      if (u.team === "enemy" && !game.fog.isVisibleWorld(u.x, u.y)) continue;
      this.drawUnit(ctx, u);
    }
    this.drawProjectiles(game);
    game.effects.draw(ctx);
    game.playerPowers.draw(ctx);
    game.enemyPowers.draw(ctx);
    if (game.placement) this.drawPlacementGhost(game);

    ctx.restore();

    this.drawSelectionBox(game);
    this.drawHud(game);
    this.drawMinimap(game);
    if (game.pendingPower) this.drawPowerReticle(game);
    if (game.status !== "playing") this.drawEndScreen(game);
  }

  // deterministic per-tile pseudo-random value 0..1
  private tileNoise(tx: number, ty: number): number {
    let h = (tx * 73856093) ^ (ty * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 1000) / 1000;
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
        const n = this.tileNoise(tx, ty);
        const px = tx * TILE;
        const py = ty * TILE;
        if (c.terrain === 2) {
          // rocky outcrop
          ctx.fillStyle = COLORS.dirt;
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          ctx.fillStyle = COLORS.rock;
          ctx.beginPath();
          ctx.ellipse(px + TILE / 2, py + TILE / 2, TILE * 0.42, TILE * 0.34, n * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.beginPath();
          ctx.ellipse(px + TILE * 0.4, py + TILE * 0.4, TILE * 0.2, TILE * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = c.terrain === 1 ? COLORS.dirt : n < 0.5 ? COLORS.grass : COLORS.grassAlt;
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          // subtle grain
          if (n < 0.12) {
            ctx.fillStyle = "rgba(0,0,0,0.05)";
            ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          } else if (n > 0.9) {
            ctx.fillStyle = "rgba(255,255,255,0.05)";
            ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          }
          // speckle
          if (n > 0.4 && n < 0.46) {
            ctx.fillStyle = "rgba(90,70,40,0.35)";
            ctx.fillRect(px + n * TILE, py + (1 - n) * TILE, 2, 2);
          }
        }
      }
    }
  }

  private drawFog(game: Game) {
    const ctx = this.ctx;
    const cam = game.camera;
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(game.grid.w, Math.ceil((cam.x + cam.viewW / cam.zoom) / TILE));
    const y1 = Math.min(game.grid.h, Math.ceil((cam.y + cam.viewH / cam.zoom) / TILE));
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        if (game.fog.isVisibleTile(tx, ty)) continue;
        ctx.fillStyle = game.fog.isExploredTile(tx, ty) ? "rgba(0,0,0,0.5)" : "rgba(4,6,10,1)";
        ctx.fillRect(tx * TILE, ty * TILE, TILE + 0.5, TILE + 0.5);
      }
    }
  }

  private drawSupply(game: Game) {
    const ctx = this.ctx;
    for (const f of game.supplyFields) {
      if (!game.fog.isExploredWorld(f.x, f.y)) continue;
      const frac = Math.max(0.25, f.remaining / 4000);
      const r = f.radius * frac;
      this.shadow(ctx, f.x, f.y + 4, r * 0.7, r * 0.4);
      ctx.fillStyle = COLORS.supply;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.diamond(ctx, f.x + Math.cos(a) * r * 0.5, f.y + Math.sin(a) * r * 0.5, r * 0.5);
      }
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      this.diamond(ctx, f.x, f.y, r * 0.4);
      ctx.fill();
    }
  }

  private diamond(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawRally(b: Building) {
    const ctx = this.ctx;
    if (b.def.produces.length === 0) return;
    ctx.strokeStyle = "rgba(124,252,0,0.5)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.rally.x, b.rally.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(124,252,0,0.8)";
    ctx.beginPath();
    ctx.arc(b.rally.x, b.rally.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building) {
    const px = b.tileX * TILE;
    const py = b.tileY * TILE;
    const w = b.def.tilesW * TILE;
    const h = b.def.tilesH * TILE;
    const main = b.team === "player" ? COLORS.player : COLORS.enemy;
    const dark = b.team === "player" ? COLORS.playerDark : COLORS.enemyDark;

    this.shadow(ctx, b.x, py + h - 6, w * 0.5, h * 0.28);

    // body with bevel
    ctx.fillStyle = "#20242c";
    ctx.fillRect(px + 2, py + 2, w - 4, h - 4);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 4, py + 4, w - 8, h - 8);
    ctx.fillStyle = main;
    ctx.fillRect(px + 8, py + 8, w - 16, h - 16);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(px + 8, py + 8, w - 16, 4); // top highlight
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(px + 8, py + h - 12, w - 16, 4); // bottom shade

    this.buildingGlyph(ctx, b, px, py, w, h);

    if (b.def.needsPower && !b.powered) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(px + 4, py + 4, w - 8, h - 8);
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡ OFFLINE", b.x, b.y);
    }

    // turret barrel (defensive buildings)
    if (b.def.damage > 0) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = "#2b2f38";
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(b.aimAngle);
      ctx.fillStyle = dark;
      ctx.fillRect(0, -2.5, b.radius + 6, 5);
      ctx.restore();
    }

    // damage flames
    const frac = b.hp / b.maxHp;
    if (frac < 0.45) {
      const t = performance.now() / 90 + b.id * 3;
      for (let i = 0; i < 3; i++) {
        const fx = px + 8 + ((b.id * 37 + i * 53) % (w - 16));
        const fy = py + 10 + ((b.id * 17 + i * 29) % (h - 18));
        const flick = 3 + Math.sin(t + i) * 2;
        ctx.fillStyle = i % 2 ? "rgba(255,150,40,0.8)" : "rgba(255,90,30,0.8)";
        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(1, flick), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.hpBar(ctx, b.x, py - 8, w - 6, frac, frac < 1);

    if (b.selected) {
      ctx.strokeStyle = "#7CFC00";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
    }
  }

  private buildingGlyph(ctx: CanvasRenderingContext2D, b: Building, px: number, py: number, w: number, h: number) {
    const cx = px + w / 2;
    const cy = py + h / 2;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    switch (b.kind) {
      case "command":
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(cx - 10, cy - 10, 20, 20);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(cx - 5, cy - 5, 10, 10);
        break;
      case "power": {
        ctx.fillStyle = "rgba(20,24,30,0.6)";
        ctx.beginPath();
        ctx.arc(cx - 7, cy + 2, 6, 0, Math.PI * 2);
        ctx.arc(cx + 7, cy + 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffe27a";
        ctx.font = "bold 14px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⚡", cx, cy - 6);
        break;
      }
      case "barracks":
        ctx.fillStyle = "rgba(20,24,30,0.55)";
        ctx.fillRect(cx - 5, cy - 9, 10, 18);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(cx - 5, cy - 9, 10, 3);
        break;
      case "factory":
        ctx.fillStyle = "rgba(20,24,30,0.5)";
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 9 - 5, cy + 8);
          ctx.lineTo(cx + i * 9, cy - 6);
          ctx.lineTo(cx + i * 9 + 5, cy + 8);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case "supply":
        ctx.fillStyle = "rgba(230,195,74,0.6)";
        ctx.fillRect(cx - 10, cy - 1, 7, 7);
        ctx.fillRect(cx + 3, cy - 1, 7, 7);
        ctx.fillRect(cx - 4, cy - 9, 7, 7);
        break;
    }
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: Unit) {
    const main = u.team === "player" ? COLORS.player : COLORS.enemy;
    const dark = u.team === "player" ? COLORS.playerDark : COLORS.enemyDark;

    this.shadow(ctx, u.x, u.y, u.radius, u.radius * 0.6);

    if (u.selected) {
      ctx.strokeStyle = "#7CFC00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    switch (u.kind) {
      case "raptor":
      case "artillery":
      case "overlord": {
        const long = u.kind === "artillery";
        // hull (body facing movement)
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.angle);
        ctx.fillStyle = "#1a1c22";
        ctx.fillRect(-u.radius - 1, -u.radius * 0.8 - 1, u.radius * 2 + 2, u.radius * 1.6 + 2); // tracks
        ctx.fillStyle = dark;
        ctx.fillRect(-u.radius, -u.radius * 0.7, u.radius * 2, u.radius * 1.4);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        for (let i = -1; i <= 1; i++) ctx.fillRect(-u.radius, i * (u.radius * 0.55) - 1, u.radius * 2, 2);
        ctx.restore();
        // turret (faces target)
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.turretAngle);
        ctx.fillStyle = main;
        ctx.fillRect(-u.radius * 0.55, -u.radius * 0.55, u.radius * 1.1, u.radius * 1.1);
        ctx.fillStyle = "#2b2f38";
        ctx.fillRect(0, -2, u.radius * (long ? 2.4 : 1.5), 4);
        ctx.restore();
        break;
      }
      case "harvester": {
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.angle);
        ctx.fillStyle = "#1a1c22";
        ctx.fillRect(-u.radius - 1, -u.radius - 1, u.radius * 2 + 2, u.radius * 2 + 2);
        ctx.fillStyle = dark;
        ctx.fillRect(-u.radius, -u.radius, u.radius * 2, u.radius * 2);
        ctx.fillStyle = u.carrying > 0 ? COLORS.supply : main;
        ctx.fillRect(-u.radius * 0.6, -u.radius * 0.6, u.radius * 1.2, u.radius * 1.2);
        ctx.fillStyle = "#2b2f38";
        ctx.fillRect(u.radius * 0.4, -u.radius * 0.4, u.radius * 0.8, u.radius * 0.8); // scoop
        ctx.restore();
        break;
      }
      case "technical": {
        // fast light vehicle: open body, mounted gun on turretAngle
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.angle);
        ctx.fillStyle = "#1a1c22";
        ctx.fillRect(-u.radius, -u.radius * 0.55, u.radius * 2, u.radius * 1.1);
        ctx.fillStyle = main;
        ctx.fillRect(-u.radius * 0.8, -u.radius * 0.4, u.radius * 1.4, u.radius * 0.8);
        ctx.restore();
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.turretAngle);
        ctx.fillStyle = "#2b2f38";
        ctx.fillRect(0, -1.5, u.radius + 5, 3);
        ctx.restore();
        break;
      }
      case "marksman": {
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#a7d8a0"; // distinct light-green kit
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.turretAngle);
        ctx.fillStyle = "#20242c";
        ctx.fillRect(0, -1.2, u.radius + 11, 2.4); // long sniper barrel
        ctx.restore();
        break;
      }
      case "rocketeer":
      case "ranger":
      default: {
        // soldier body + helmet, weapon aims at turretAngle
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.turretAngle);
        ctx.fillStyle = "#20242c";
        if (u.kind === "rocketeer") ctx.fillRect(0, -2.5, u.radius + 7, 5);
        else ctx.fillRect(0, -1.5, u.radius + 5, 3);
        ctx.restore();
        break;
      }
    }

    const frac = u.hp / u.maxHp;
    if (frac < 1) this.hpBar(ctx, u.x, u.y - u.radius - 8, u.radius * 2 + 6, frac, true);

    if (u.rank > 0) {
      const cyc = u.y - u.radius - (frac < 1 ? 15 : 9);
      ctx.strokeStyle = u.rank === 2 ? "#ffd23f" : "#e2e8f0";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < u.rank; i++) {
        const yy = cyc - i * 3.5;
        ctx.beginPath();
        ctx.moveTo(u.x - 4, yy);
        ctx.lineTo(u.x, yy - 3);
        ctx.lineTo(u.x + 4, yy);
        ctx.stroke();
      }
    }
  }

  private drawProjectiles(game: Game) {
    const ctx = this.ctx;
    for (const p of game.projectiles) {
      if (!p.target.alive) continue;
      const dx = p.target.x - p.x;
      const dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const len = p.splash > 0 ? 16 : 10;
      ctx.strokeStyle = p.splash > 0 ? "rgba(255,140,50,0.8)" : "rgba(255,230,120,0.8)";
      ctx.lineWidth = p.splash > 0 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - ux * len, p.y - uy * len);
      ctx.stroke();
      ctx.fillStyle = p.splash > 0 ? "#ffb347" : "#fff1a8";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.splash > 0 ? 3.5 : 2, 0, Math.PI * 2);
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
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = ok ? "#4ade80" : "#ef4444";
    ctx.fillRect(tx * TILE, ty * TILE, def.tilesW * TILE, def.tilesH * TILE);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#4ade80" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE, ty * TILE, def.tilesW * TILE, def.tilesH * TILE);
    // build grid hint
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= def.tilesW; gx++)
      ctx.strokeRect(tx * TILE + gx * TILE, ty * TILE, 0.1, def.tilesH * TILE);
  }

  private hpBar(ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, frac: number, show: boolean) {
    if (!show) return;
    const x = cx - width / 2;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
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

    ctx.fillStyle = "rgba(10,12,16,0.85)";
    ctx.fillRect(0, 0, W, 40);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.supply;
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.fillText(`⛃ ${Math.floor(game.credits["player"])}`, 16, 21);

    const pw = game.power["player"];
    ctx.font = "bold 15px system-ui, sans-serif";
    if (game.factions["player"].noPower) {
      ctx.fillStyle = "#7ec46b";
      ctx.fillText("⚡ n/a", 150, 21);
    } else {
      ctx.fillStyle = pw >= 0 ? "#7dd3fc" : "#ef4444";
      ctx.fillText(`⚡ ${pw >= 0 ? "+" : ""}${pw}`, 150, 21);
    }

    const pts = game.promoPoints["player"];
    ctx.fillStyle = pts > 0 ? "#facc15" : "#8a8f99";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(`★ ${pts} pt`, 250, 21);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px system-ui, sans-serif";
    const army = game.units.filter((u) => u.team === "player" && u.alive).length;
    const enemyArmy = game.units.filter((u) => u.team === "enemy" && u.alive).length;
    ctx.fillText(`Units: ${army}`, 340, 21);
    ctx.fillStyle = COLORS.enemy;
    ctx.fillText(`Hostiles: ${enemyArmy}`, 430, 21);

    const pf = game.factions["player"];
    ctx.fillStyle = pf.color;
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.fillText(`⚑ ${pf.name}`, 540, 21);

    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "right";
    ctx.fillText("Arrows/edges: pan · wheel: zoom · A: attack-move · Z/X/C: powers · K: sell · ★ = promotion points", W - 16, 21);
    ctx.textAlign = "left";

    ctx.fillStyle = "rgba(10,12,16,0.92)";
    ctx.fillRect(0, H - HUD_HEIGHT, W, HUD_HEIGHT);
    ctx.fillStyle = "rgba(124,252,0,0.25)";
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
      for (const rect of buttonRects(entries, H)) this.drawBuildButton(ctx, game, rect.entry, rect.x, rect.y, rect.w, rect.h);
      if (sel.team === "player") this.drawSellButton(sel);
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

    this.drawPowerButtons(game);

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
    let name: string;
    let cost: number;
    let tag: string;
    if (entry.type === "unit") {
      name = UNITS[entry.key as keyof typeof UNITS].name;
      cost = game.unitCost(entry.key as keyof typeof UNITS, "player");
      tag = "unit";
    } else if (entry.type === "building") {
      name = BUILDINGS[entry.key as keyof typeof BUILDINGS].name;
      cost = game.buildingCost(entry.key as keyof typeof BUILDINGS, "player");
      tag = "structure";
    } else {
      const d = UPGRADES[entry.key as keyof typeof UPGRADES];
      name = d.name;
      cost = d.cost;
      tag = d.blurb;
    }
    const isUpg = entry.type === "upgrade";
    const affordable = game.credits["player"] >= cost;
    ctx.fillStyle = isUpg ? "rgba(230,195,74,0.14)" : affordable ? "rgba(61,169,252,0.18)" : "rgba(80,80,90,0.18)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = isUpg
      ? affordable
        ? "rgba(230,195,74,0.75)"
        : "rgba(120,110,80,0.5)"
      : affordable
        ? "rgba(61,169,252,0.7)"
        : "rgba(120,120,130,0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = affordable ? "#e2e8f0" : "#7a8290";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(name, x + 7, y + 15);
    ctx.fillStyle = COLORS.supply;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`⛃ ${cost}`, x + 7, y + 34);
    ctx.fillStyle = isUpg ? "#e6c34a" : "#94a3b8";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(`[${entry.hotkey}] ${tag}`, x + 7, y + 51);
  }

  private drawPowerButtons(game: Game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (const r of powerButtonRects(W, H)) {
      const def = POWERS[r.kind];
      const unlocked = game.playerPowers.isUnlocked(r.kind);
      const frac = game.playerPowers.chargeFrac(r.kind);
      const ready = unlocked && frac >= 1;

      if (!unlocked) {
        const affordable = game.promoPoints["player"] >= POWER_POINT_COST[r.kind];
        ctx.fillStyle = "rgba(40,44,54,0.55)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = affordable ? "#facc15" : "rgba(110,110,120,0.6)";
        ctx.lineWidth = affordable ? 2 : 1.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.textAlign = "left";
        ctx.fillStyle = affordable ? "#e2e8f0" : "#7a8290";
        ctx.font = "bold 12px system-ui, sans-serif";
        const words = def.name.split(" ");
        ctx.fillText(words[0], r.x + 7, r.y + 15);
        if (words[1]) ctx.fillText(words.slice(1).join(" "), r.x + 7, r.y + 29);
        ctx.fillStyle = affordable ? "#facc15" : "#8a8f99";
        ctx.font = "10px system-ui, sans-serif";
        const cost = POWER_POINT_COST[r.kind];
        ctx.fillText(`🔒 ${cost} pt [${def.hotkey}]`, r.x + 7, r.y + 50);
        continue;
      }

      ctx.fillStyle = ready ? "rgba(230,195,74,0.18)" : "rgba(50,54,64,0.4)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = "rgba(230,195,74,0.28)";
      ctx.fillRect(r.x, r.y + r.h * (1 - frac), r.w, r.h * frac);
      if (game.pendingPower === r.kind) {
        ctx.strokeStyle = "#7CFC00";
        ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = ready ? "#e6c34a" : "rgba(120,120,130,0.6)";
        ctx.lineWidth = 1.5;
      }
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.textAlign = "left";
      ctx.fillStyle = ready ? "#fff7e0" : "#9aa0aa";
      ctx.font = "bold 12px system-ui, sans-serif";
      const words = def.name.split(" ");
      ctx.fillText(words[0], r.x + 7, r.y + 15);
      if (words[1]) ctx.fillText(words.slice(1).join(" "), r.x + 7, r.y + 29);
      ctx.fillStyle = ready ? "#e6c34a" : "#94a3b8";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(ready ? `[${def.hotkey}] READY` : `${Math.ceil((1 - frac) * def.cooldown)}s`, r.x + 7, r.y + 50);
    }
  }

  private drawSellButton(b: Building) {
    const ctx = this.ctx;
    const r = sellButtonRect(this.canvas.width, this.canvas.height);
    ctx.fillStyle = "rgba(239,68,68,0.22)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "rgba(239,68,68,0.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#fecaca";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`SELL +${Math.round(b.def.cost * SELL_REFUND)}`, r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.textAlign = "left";
  }

  private drawPowerReticle(game: Game) {
    const ctx = this.ctx;
    const mx = game.input.mouseX;
    const my = game.input.mouseY;
    ctx.strokeStyle = "rgba(255,80,80,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 24, 0, Math.PI * 2);
    ctx.moveTo(mx - 34, my);
    ctx.lineTo(mx + 34, my);
    ctx.moveTo(mx, my - 34);
    ctx.lineTo(mx, my + 34);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(POWERS[game.pendingPower!].name, mx, my - 38);
    ctx.textAlign = "left";
  }

  private drawMinimap(game: Game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const r = minimapRect(W, H);

    ctx.fillStyle = "rgba(8,10,14,0.92)";
    ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);

    const step = 3;
    const sx = r.w / game.grid.w;
    const sy = r.h / game.grid.h;
    for (let ty = 0; ty < game.grid.h; ty += step) {
      for (let tx = 0; tx < game.grid.w; tx += step) {
        if (!game.fog.isExploredTile(tx, ty)) {
          ctx.fillStyle = "#05070b";
        } else {
          const c = game.grid.cell(tx, ty)!;
          ctx.fillStyle = c.terrain === 2 ? COLORS.rock : c.terrain === 1 ? COLORS.dirt : COLORS.grass;
        }
        ctx.fillRect(r.x + tx * sx, r.y + ty * sy, sx * step + 1, sy * step + 1);
        if (game.fog.isExploredTile(tx, ty) && !game.fog.isVisibleTile(tx, ty)) {
          ctx.fillStyle = "rgba(0,0,0,0.4)";
          ctx.fillRect(r.x + tx * sx, r.y + ty * sy, sx * step + 1, sy * step + 1);
        }
      }
    }
    for (const f of game.supplyFields) {
      if (!game.fog.isExploredWorld(f.x, f.y)) continue;
      const p = worldToMinimap(f.x, f.y, W, H);
      ctx.fillStyle = COLORS.supply;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    for (const b of game.buildings) {
      if (b.team === "enemy" && !game.fog.isExploredWorld(b.x, b.y)) continue;
      const p = worldToMinimap(b.x, b.y, W, H);
      ctx.fillStyle = b.team === "player" ? COLORS.player : COLORS.enemy;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    for (const u of game.units) {
      if (u.team === "enemy" && !game.fog.isVisibleWorld(u.x, u.y)) continue;
      const p = worldToMinimap(u.x, u.y, W, H);
      ctx.fillStyle = u.team === "player" ? "#bfe4ff" : "#ffc2cd";
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
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

  private drawFactionSelect(game: Game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e6c34a";
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.fillText("CHOOSE YOUR FACTION", W / 2, H / 2 - 240);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Each side plays differently. Your enemy will take one of the others.", W / 2, H / 2 - 210);

    for (const c of game.factionCardRects(W, H)) {
      const f = c.f;
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      // color banner
      ctx.fillStyle = f.color;
      ctx.fillRect(c.x, c.y, c.w, 8);

      ctx.textAlign = "center";
      ctx.fillStyle = f.color;
      ctx.font = "bold 24px system-ui, sans-serif";
      ctx.fillText(f.name, c.x + c.w / 2, c.y + 52);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "italic 14px system-ui, sans-serif";
      ctx.fillText(f.blurb, c.x + c.w / 2, c.y + 78);

      ctx.textAlign = "left";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "#e2e8f0";
      const stats = [
        `Unit cost:  ${this.pct(f.costMult)}`,
        `Build cost: ${this.pct(f.buildCostMult)}`,
        `Health:     ${this.pct(f.hpMult)}`,
        `Speed:      ${this.pct(f.speedMult)}`,
        `Damage:     ${this.pct(f.damageMult)}`,
      ];
      stats.forEach((s, i) => ctx.fillText(s, c.x + 22, c.y + 120 + i * 26));

      ctx.fillStyle = f.color;
      ctx.font = "bold 12px system-ui, sans-serif";
      this.wrapText(ctx, f.trait, c.x + 22, c.y + 262, c.w - 44, 17);

      ctx.textAlign = "center";
      ctx.fillStyle = f.color;
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.fillText("▶ CLICK TO PLAY", c.x + c.w / 2, c.y + c.h - 16);
    }
    ctx.textAlign = "left";
  }

  private pct(m: number): string {
    const d = Math.round((m - 1) * 100);
    return d === 0 ? "standard" : d > 0 ? `+${d}%` : `${d}%`;
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
    const words = text.split(" ");
    let line = "";
    let yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
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
