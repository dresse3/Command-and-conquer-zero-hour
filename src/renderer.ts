import { TILE, COLORS, UNITS, BUILDINGS, POWERS, POWER_POINT_COST, SELL_REFUND, UPGRADES, AI_CONFIGS, type BuildEntry } from "./config";
import type { Game } from "./game";
import { Unit, Building } from "./entities";
import { buttonRects, powerButtonRects, sellButtonRect, topRowY, HUD_HEIGHT, minimapRect, worldToMinimap } from "./hud";

export class Renderer {
  ctx: CanvasRenderingContext2D;

  private touch = typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  // truncate text with an ellipsis so it fits within maxW
  private fit(text: string, maxW: number): string {
    if (this.ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && this.ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
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
          // rocky outcrop — layered boulder for depth
          ctx.fillStyle = COLORS.dirt;
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.beginPath();
          ctx.ellipse(px + TILE / 2 + 2, py + TILE / 2 + 3, TILE * 0.44, TILE * 0.34, n * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLORS.rock;
          ctx.beginPath();
          ctx.ellipse(px + TILE / 2, py + TILE / 2, TILE * 0.42, TILE * 0.32, n * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.beginPath();
          ctx.ellipse(px + TILE * 0.38, py + TILE * 0.36, TILE * 0.2, TILE * 0.13, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Organic sand: a single low-contrast base (no checkerboard) plus a
          // slow dune gradient for large-scale shading. "Dirt" tiles are drawn
          // as soft blotches over the sand rather than hard squares.
          const dune = this.dune(tx, ty); // 0..1 smooth
          ctx.fillStyle = COLORS.grass;
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          // dune light/shadow bands
          const shade = (dune - 0.5) * 0.14;
          ctx.fillStyle = shade >= 0 ? `rgba(255,240,200,${shade})` : `rgba(60,45,25,${-shade})`;
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          if (c.terrain === 1) {
            // soft dirt patch — overlaps tile edges so it never reads as a grid
            ctx.fillStyle = "rgba(140,105,58,0.55)";
            ctx.beginPath();
            ctx.ellipse(px + TILE / 2, py + TILE / 2, TILE * 0.62, TILE * 0.52, n * 3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // faint wind ripples
            ctx.strokeStyle = "rgba(120,95,55,0.10)";
            ctx.lineWidth = 1;
            const oy = py + n * TILE;
            ctx.beginPath();
            ctx.moveTo(px, oy);
            ctx.quadraticCurveTo(px + TILE / 2, oy - 3, px + TILE, oy);
            ctx.stroke();
          }
          // sparse pebbles / scrub, deterministic per tile
          if (n > 0.86) {
            ctx.fillStyle = "rgba(80,62,38,0.5)";
            ctx.beginPath();
            ctx.arc(px + n * TILE, py + (1 - n) * TILE, 1.6, 0, Math.PI * 2);
            ctx.fill();
          } else if (n < 0.06) {
            ctx.fillStyle = "rgba(150,120,70,0.35)";
            ctx.beginPath();
            ctx.arc(px + (1 - n) * TILE * 4 % TILE, py + n * TILE * 5 % TILE, 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  // Smooth low-frequency field (bilinear-interpolated tile noise) for dunes.
  private dune(tx: number, ty: number): number {
    const s = 6; // dune wavelength in tiles
    const gx = Math.floor(tx / s), gy = Math.floor(ty / s);
    const fx = (tx % s) / s, fy = (ty % s) / s;
    const a = this.tileNoise(gx, gy);
    const b = this.tileNoise(gx + 1, gy);
    const c = this.tileNoise(gx, gy + 1);
    const d = this.tileNoise(gx + 1, gy + 1);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
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
      const frac = Math.max(0.25, Math.min(1, f.remaining / f.initial));
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

  // A brief muzzle flash at the end of a barrel: yellow-white star + glow.
  private muzzleFlash(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, size: number) {
    const mx = x + Math.cos(angle) * len;
    const my = y + Math.sin(angle) * len;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(255,210,90,0.5)";
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff2c4";
    ctx.beginPath();
    ctx.moveTo(size * 1.8, 0);
    ctx.lineTo(0, -size * 0.7);
    ctx.lineTo(size * 0.5, 0);
    ctx.lineTo(0, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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

  // A structure under construction: a foundation with the body rising from the
  // bottom behind scaffolding, plus a progress bar.
  private drawConstruction(
    ctx: CanvasRenderingContext2D,
    b: Building,
    px: number,
    py: number,
    w: number,
    h: number,
    main: string
  ) {
    const p = b.buildProgress;
    // foundation pad
    ctx.fillStyle = "#1b1e26";
    ctx.fillRect(px + 2, py + 2, w - 4, h - 4);
    ctx.strokeStyle = "rgba(230,195,74,0.5)";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 3, py + 3, w - 6, h - 6);
    ctx.setLineDash([]);
    // body rising from the bottom
    const bh = Math.max(2, (h - 10) * p);
    ctx.fillStyle = "#2c313b";
    ctx.fillRect(px + 5, py + h - 5 - bh, w - 10, bh);
    ctx.fillStyle = main;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(px + 5, py + h - 5 - bh, w - 10, 3);
    ctx.globalAlpha = 1;
    // scaffolding uprights
    ctx.strokeStyle = "rgba(230,195,74,0.6)";
    ctx.lineWidth = 1.5;
    for (let sx = px + 8; sx < px + w - 6; sx += 16) {
      ctx.beginPath();
      ctx.moveTo(sx, py + 5);
      ctx.lineTo(sx, py + h - 5);
      ctx.stroke();
    }
    // progress bar + label
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(px + 5, py - 9, w - 10, 6);
    ctx.fillStyle = "#e6c34a";
    ctx.fillRect(px + 6, py - 8, (w - 12) * p, 4);
    ctx.fillStyle = "#ffe27a";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(p * 100)}%`, b.x, b.y);
    ctx.textAlign = "left";
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: Building) {
    const px = b.tileX * TILE;
    const py = b.tileY * TILE;
    const w = b.def.tilesW * TILE;
    const h = b.def.tilesH * TILE;
    const main = b.team === "player" ? COLORS.player : COLORS.enemy;
    const dark = b.team === "player" ? COLORS.playerDark : COLORS.enemyDark;

    this.shadow(ctx, b.x, py + h - 6, w * 0.5, h * 0.28);

    if (b.constructing) {
      this.drawConstruction(ctx, b, px, py, w, h, main);
      if (b.selected) {
        ctx.strokeStyle = "#7CFC00";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);
      }
      return;
    }

    // Concrete pad + metal body. The bulk is neutral (like the real game's
    // structures); the team colour lives in the trim, corner pylons and roof
    // detail so sides stay readable without looking like flat coloured boxes.
    ctx.fillStyle = "#15171d";
    ctx.fillRect(px + 1, py + 1, w - 2, h - 2);
    ctx.fillStyle = "#2c313b"; // metal body
    ctx.fillRect(px + 4, py + 4, w - 8, h - 8);
    // panel seams
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    for (let gx = px + 4 + 14; gx < px + w - 6; gx += 14) {
      ctx.beginPath();
      ctx.moveTo(gx, py + 5);
      ctx.lineTo(gx, py + h - 5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(px + 4, py + 4, w - 8, 3); // top light
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(px + 4, py + h - 6, w - 8, 2); // ground shade
    // team-colour corner pylons
    ctx.fillStyle = main;
    const cs = 7;
    ctx.fillRect(px + 3, py + 3, cs, cs);
    ctx.fillRect(px + w - 3 - cs, py + 3, cs, cs);
    ctx.fillRect(px + 3, py + h - 3 - cs, cs, cs);
    ctx.fillRect(px + w - 3 - cs, py + h - 3 - cs, cs, cs);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3.5, py + 3.5, w - 7, h - 7);

    this.buildingGlyph(ctx, b, px, py, w, h, main, dark);

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
      if (b.muzzle > 0) this.muzzleFlash(ctx, b.x, b.y, b.aimAngle, b.radius + 6, 4);
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

  private buildingGlyph(
    ctx: CanvasRenderingContext2D,
    b: Building,
    px: number,
    py: number,
    w: number,
    h: number,
    main: string,
    dark: string
  ) {
    const cx = px + w / 2;
    const cy = py + h / 2;
    switch (b.kind) {
      case "command": {
        // central bunker with a slow-spinning radar dish + comms mast
        ctx.fillStyle = "#3a4150";
        ctx.fillRect(cx - 16, cy - 16, 32, 32);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(cx - 16, cy - 16, 32, 32);
        ctx.strokeStyle = main;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 16, cy - 16, 32, 32);
        // rooftop landing "H"
        ctx.fillStyle = main;
        ctx.font = "bold 18px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("★", cx, cy - 1);
        // rotating radar dish on a corner
        const t = performance.now() / 700 + b.id;
        const rx = px + w - 14, ry = py + 14;
        ctx.fillStyle = "#20242c";
        ctx.beginPath();
        ctx.arc(rx, ry, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cdd6e4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(t) * 8, ry + Math.sin(t) * 8);
        ctx.stroke();
        break;
      }
      case "power": {
        // two cooling towers + a pulsing energy core
        ctx.fillStyle = "#3a4150";
        for (const dx of [-9, 9]) {
          ctx.beginPath();
          ctx.moveTo(cx + dx - 6, cy + 10);
          ctx.lineTo(cx + dx - 4, cy - 8);
          ctx.lineTo(cx + dx + 4, cy - 8);
          ctx.lineTo(cx + dx + 6, cy + 10);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(cx + dx - 4, cy - 8, 8, 3);
          ctx.fillStyle = "#3a4150";
        }
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260 + b.id);
        ctx.fillStyle = b.powered ? `rgba(120,220,255,${pulse})` : "rgba(90,90,90,0.5)";
        ctx.beginPath();
        ctx.arc(cx, cy + 1, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "barracks": {
        // quonset hut with a doorway + flag
        ctx.fillStyle = "#454b57";
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy + 12);
        ctx.arc(cx, cy + 12, 16, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.arc(cx, cy + 12, 16, Math.PI, Math.PI * 1.5);
        ctx.lineTo(cx, cy + 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1a1d24";
        ctx.fillRect(cx - 5, cy - 1, 10, 13); // doorway
        // flagpole
        ctx.strokeStyle = "#20242c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + 13, cy + 12);
        ctx.lineTo(cx + 13, cy - 14);
        ctx.stroke();
        ctx.fillStyle = main;
        ctx.fillRect(cx + 13, cy - 14, 9, 6);
        break;
      }
      case "factory": {
        // saw-tooth hangar roof + roll-up bay door
        ctx.fillStyle = "#3a4150";
        ctx.fillRect(cx - 20, cy - 14, 40, 28);
        ctx.fillStyle = "#2a2f38";
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 8 - 4, cy - 4);
          ctx.lineTo(cx + i * 8, cy - 14);
          ctx.lineTo(cx + i * 8 + 4, cy - 4);
          ctx.closePath();
          ctx.fill();
        }
        // bay door with team stripe
        ctx.fillStyle = "#1a1d24";
        ctx.fillRect(cx - 12, cy + 1, 24, 13);
        ctx.fillStyle = main;
        ctx.fillRect(cx - 12, cy + 1, 24, 2);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        for (let dy = cy + 4; dy < cy + 14; dy += 3) {
          ctx.beginPath();
          ctx.moveTo(cx - 12, dy);
          ctx.lineTo(cx + 12, dy);
          ctx.stroke();
        }
        break;
      }
      case "supply": {
        // stacked shipping containers + a team-marked crate
        ctx.fillStyle = COLORS.supply;
        ctx.fillRect(cx - 14, cy - 2, 11, 10);
        ctx.fillStyle = "#b98b3a";
        ctx.fillRect(cx - 2, cy - 2, 11, 10);
        ctx.fillStyle = "#8a6d3b";
        ctx.fillRect(cx - 8, cy - 12, 11, 10);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 14, cy - 2, 11, 10);
        ctx.strokeRect(cx - 2, cy - 2, 11, 10);
        ctx.strokeRect(cx - 8, cy - 12, 11, 10);
        ctx.fillStyle = main;
        ctx.fillRect(cx + 9, cy + 2, 6, 6); // team marker
        break;
      }
      case "turret":
        // base ring is enough — the barrel is drawn separately
        ctx.fillStyle = "#20242c";
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        ctx.stroke();
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
      case "chinook": {
        // twin-rotor supply helicopter, drawn elevated with a ground shadow
        const lift = 10;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.ellipse(u.x + 4, u.y + lift, u.radius, u.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(u.x, u.y - lift);
        ctx.rotate(u.angle);
        ctx.fillStyle = dark;
        ctx.fillRect(-u.radius, -u.radius * 0.5, u.radius * 2, u.radius); // fuselage
        ctx.fillStyle = u.carrying > 0 ? COLORS.supply : main;
        ctx.fillRect(-u.radius * 0.5, -u.radius * 0.4, u.radius, u.radius * 0.8); // cargo box
        ctx.fillStyle = "#2b2f38";
        ctx.fillRect(u.radius * 0.8, -3, u.radius * 0.7, 6); // tail
        // two spinning rotor discs
        const spin = performance.now() / 40;
        ctx.strokeStyle = "rgba(210,220,235,0.5)";
        ctx.lineWidth = 2;
        for (const rx of [-u.radius * 0.55, u.radius * 0.55]) {
          ctx.beginPath();
          ctx.moveTo(rx - Math.cos(spin) * u.radius, -Math.sin(spin) * u.radius);
          ctx.lineTo(rx + Math.cos(spin) * u.radius, Math.sin(spin) * u.radius);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case "jet": {
        // swept-wing strike fighter, flown high with a ground shadow + afterburner
        const lift = 16;
        const rearming = u.state === "rearm";
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(u.x + 6, u.y + lift, u.radius * 0.9, u.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(u.x, u.y - lift);
        ctx.rotate(u.angle);
        // afterburner flame (dim while rearming/low throttle)
        ctx.fillStyle = rearming ? "rgba(120,150,200,0.5)" : "rgba(255,170,60,0.85)";
        ctx.beginPath();
        ctx.moveTo(-u.radius - 6 - Math.random() * 3, 0);
        ctx.lineTo(-u.radius, -2.4);
        ctx.lineTo(-u.radius, 2.4);
        ctx.closePath();
        ctx.fill();
        // swept delta wings
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(-u.radius * 0.2, 0);
        ctx.lineTo(-u.radius * 0.9, -u.radius);
        ctx.lineTo(-u.radius * 0.2, -u.radius * 0.2);
        ctx.lineTo(-u.radius * 0.2, u.radius * 0.2);
        ctx.lineTo(-u.radius * 0.9, u.radius);
        ctx.closePath();
        ctx.fill();
        // fuselage (nose forward)
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.moveTo(u.radius + 3, 0);
        ctx.lineTo(-u.radius, -u.radius * 0.42);
        ctx.lineTo(-u.radius, u.radius * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#cdd6e4";
        ctx.fillRect(u.radius * 0.1, -1.6, u.radius * 0.5, 3.2); // canopy
        ctx.restore();
        // ammo pips + rearm marker above the jet
        const pipY = u.y - lift - u.radius - 6;
        for (let i = 0; i < u.maxAmmo; i++) {
          ctx.fillStyle = i < u.ammo ? "#7dd3fc" : "rgba(120,130,145,0.5)";
          ctx.fillRect(u.x - u.maxAmmo * 2 + i * 4, pipY, 3, 3);
        }
        if (rearming) {
          ctx.fillStyle = "#facc15";
          ctx.font = "9px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("rearming", u.x, pipY - 5);
          ctx.textAlign = "left";
        }
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

    if (u.muzzle > 0 && u.def.damage > 0) {
      const barrel =
        u.kind === "marksman" ? u.radius + 11 : u.kind === "artillery" ? u.radius * 2.4 : u.radius + 6;
      const sz = u.kind === "artillery" || u.kind === "overlord" ? 5 : u.kind === "rocketeer" ? 4.5 : 3;
      this.muzzleFlash(ctx, u.x, u.y, u.turretAngle, barrel, sz);
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
    const flag = `⚑ ${pf.name}`;
    ctx.fillText(flag, 540, 21);
    const factionEnd = 540 + ctx.measureText(flag).width;

    // Controls hint, right-aligned — only drawn if it clears the faction label
    // (otherwise it collided with it on medium widths).
    const hint =
      this.touch || W < 1180
        ? "Tap: select / order · drag: box-select · 2 fingers: pan · pinch: zoom"
        : "Arrows: pan · wheel: zoom · A: attack-move · Z/X/C: powers · K: sell";
    ctx.font = "14px system-ui, sans-serif";
    const hintW = ctx.measureText(hint).width;
    if (W - 16 - hintW > factionEnd + 24) {
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "right";
      ctx.fillText(hint, W - 16, 21);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = "rgba(10,12,16,0.92)";
    ctx.fillRect(0, H - HUD_HEIGHT, W, HUD_HEIGHT);
    ctx.fillStyle = "rgba(124,252,0,0.25)";
    ctx.fillRect(0, H - HUD_HEIGHT, W, 2);

    const sel = game.selectedBuilding;
    const entries = game.currentBuildEntries();
    const tY = topRowY(H);
    ctx.textBaseline = "middle";
    if (!sel && game.hasBuilderSelected()) {
      // builder selected: show the structure build menu
      ctx.fillStyle = "#7ec46b";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText("HARVESTER — build structures", 16, tY + 12);
      for (const rect of buttonRects(entries, W, H)) this.drawBuildButton(ctx, game, rect.entry, rect.x, rect.y, rect.w, rect.h);
    } else if (!sel) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(
        this.touch
          ? "Select a Harvester to build · tap a building for its units."
          : "Select a Harvester to build structures · a building for its units.",
        20,
        H - HUD_HEIGHT / 2,
      );
    } else {
      // top row: building name + production queue + sell
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 13px system-ui, sans-serif";
      const upper = sel.def.name.toUpperCase();
      ctx.fillText(upper, 16, tY + 12);
      if (sel.queue.length > 0) {
        const qx = 16 + ctx.measureText(upper).width + 20;
        sel.queue.slice(0, 6).forEach((item, i) => {
          const bx = qx + i * 26;
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.fillRect(bx, tY, 22, 22);
          const prog = 1 - item.timeLeft / item.total;
          ctx.fillStyle = "rgba(61,169,252,0.55)";
          ctx.fillRect(bx, tY + 22 - 22 * prog, 22, 22 * prog);
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.strokeRect(bx, tY, 22, 22);
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "9px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(UNITS[item.kind].name.slice(0, 3), bx + 11, tY + 11);
          ctx.textAlign = "left";
          ctx.font = "bold 13px system-ui, sans-serif";
        });
      }
      // main row: build buttons
      for (const rect of buttonRects(entries, W, H)) this.drawBuildButton(ctx, game, rect.entry, rect.x, rect.y, rect.w, rect.h);
      if (sel.team === "player") this.drawSellButton(sel);
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
      const bkind = entry.key as keyof typeof BUILDINGS;
      name = BUILDINGS[bkind].name;
      cost = game.buildingCost(bkind, "player");
      tag = "structure";
      // locked by tech tree — draw greyed with the prerequisite and bail
      if (!game.structurePrereqMet(bkind, "player")) {
        const prereq = BUILDINGS[BUILDINGS[bkind].prereq!].name;
        ctx.fillStyle = "rgba(40,44,54,0.55)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(110,110,120,0.5)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "#7a8290";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(this.fit(name, w - 12), x + 7, y + 15);
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(this.fit(`🔒 needs ${prereq}`, w - 12), x + 7, y + 34);
        ctx.fillText(`[${entry.hotkey}]`, x + 7, y + 51);
        return;
      }
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
    ctx.fillText(this.fit(name, w - 12), x + 7, y + 15);
    ctx.fillStyle = COLORS.supply;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`⛃ ${cost}`, x + 7, y + 34);
    ctx.fillStyle = isUpg ? "#e6c34a" : "#94a3b8";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(this.fit(`[${entry.hotkey}] ${tag}`, w - 12), x + 7, y + 51);
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
    // "under attack" ping — an expanding red ring at the last hit location
    if (game.attackPing) {
      const p = worldToMinimap(game.attackPing.x, game.attackPing.y, W, H);
      const phase = 1 - (game.attackPing.t % 0.8) / 0.8;
      ctx.strokeStyle = `rgba(255,60,70,${0.9 * (1 - phase)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + phase * 10, 0, Math.PI * 2);
      ctx.stroke();
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

    const cards = game.factionCardRects(W, H);
    const topY = cards.length ? cards[0].y : H / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e6c34a";
    ctx.font = `bold ${Math.min(36, Math.round(W * 0.032))}px system-ui, sans-serif`;
    ctx.fillText("CHOOSE YOUR FACTION", W / 2, topY - 150);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText("Each side plays differently — your enemy takes one of the others.", W / 2, topY - 126);

    // --- AI difficulty selector ---
    const diffRects = game.difficultyButtonRects(W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#8a93a3";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillText("AI DIFFICULTY", W / 2, diffRects[0].y - 12);
    for (const r of diffRects) {
      const sel = game.difficulty === r.diff;
      const cfg = AI_CONFIGS[r.diff];
      ctx.fillStyle = sel ? "rgba(230,195,74,0.9)" : "rgba(255,255,255,0.05)";
      this.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fill();
      ctx.strokeStyle = sel ? "#e6c34a" : "rgba(148,163,184,0.5)";
      ctx.lineWidth = sel ? 2.5 : 1.5;
      this.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.stroke();
      ctx.fillStyle = sel ? "#1a1206" : "#cbd5e1";
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(cfg.label, r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.textBaseline = "alphabetic";
    }
    // blurb for the selected difficulty
    const last = diffRects[diffRects.length - 1];
    ctx.fillStyle = "#94a3b8";
    ctx.font = "italic 13px system-ui, sans-serif";
    ctx.fillText(AI_CONFIGS[game.difficulty].blurb, W / 2, last.y + last.h + 18);

    const cta = this.touch ? "▶ TAP TO PLAY" : "▶ CLICK TO PLAY";
    for (const c of cards) {
      const f = c.f;
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = f.color;
      ctx.fillRect(c.x, c.y, c.w, 8);

      ctx.textAlign = "center";
      ctx.fillStyle = f.color;
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.fillText(this.fit(f.name, c.w - 20), c.x + c.w / 2, c.y + 42);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "italic 13px system-ui, sans-serif";
      ctx.fillText(this.fit(f.blurb, c.w - 20), c.x + c.w / 2, c.y + 64);

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
      const sp = Math.min(24, (c.h - 150) / stats.length);
      stats.forEach((s, i) => ctx.fillText(s, c.x + 20, c.y + 96 + i * sp));

      ctx.fillStyle = f.color;
      ctx.font = "bold 12px system-ui, sans-serif";
      this.wrapText(ctx, f.trait, c.x + 20, c.y + c.h - 52, c.w - 40, 16);

      ctx.textAlign = "center";
      ctx.fillStyle = f.color;
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.fillText(cta, c.x + c.w / 2, c.y + c.h - 14);
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

  // Build a rounded-rect path on the current context (caller fills/strokes).
  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawEndScreen(game: Game) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    const won = game.status === "won";
    ctx.fillStyle = won ? "#4ade80" : "#ef4565";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText(won ? "VICTORY" : "DEFEAT", W / 2, H / 2 - 40);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText(
      won ? "The enemy base has been destroyed." : "Your base has fallen.",
      W / 2,
      H / 2 - 2
    );

    // Play Again button
    const r = game.endButtonRect(W, H);
    ctx.fillStyle = won ? "#16a34a" : "#dc2626";
    this.roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    this.roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("Play Again", r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
}
