import {
  UNITS,
  TILE,
  MAP_W,
  MAP_H,
  START_CREDITS,
  SUPPLY_FIELD_START,
  type Team,
  type UnitKind,
} from "./config";
import { Grid } from "./grid";
import { Camera } from "./camera";
import { Input, type InputHandlers } from "./input";
import { Unit, Building, SupplyField, Projectile, type Target } from "./entities";
import { EnemyAI } from "./ai";
import { hudHitTest, isInHud, costOf } from "./hud";
import type { Vec, WorldApi } from "./types";
import { dist2 } from "./types";

export type GameStatus = "playing" | "won" | "lost";

export class Game implements WorldApi, InputHandlers {
  grid = new Grid();
  camera = new Camera();
  units: Unit[] = [];
  buildings: Building[] = [];
  supplyFields: SupplyField[] = [];
  projectiles: Projectile[] = [];

  credits: Record<string, number> = { player: START_CREDITS, enemy: START_CREDITS };
  selected: Unit[] = [];
  status: GameStatus = "playing";
  toast = "";
  private toastCd = 0;

  private ai: EnemyAI;
  input: Input;

  constructor(private canvas: HTMLCanvasElement) {
    this.input = new Input(canvas, this);
    this.setup();
    this.ai = new EnemyAI(this as unknown as WorldApi & { credits: Record<string, number>; playerBase(): Building | null });
    this.camera.resize(canvas.width, canvas.height);
    const base = this.baseOf("player");
    if (base) this.camera.centerOn(base.x, base.y);
  }

  // ---------------- setup ----------------
  private setup() {
    // player base (bottom-left), enemy base (top-right)
    this.placeBase("player", 5, MAP_H - 8);
    this.placeBase("enemy", MAP_W - 8, 5);

    // supply fields near each base + two contested in the middle
    this.addSupply(10, MAP_H - 9, SUPPLY_FIELD_START);
    this.addSupply(MAP_W - 12, 8, SUPPLY_FIELD_START);
    this.addSupply(Math.floor(MAP_W / 2) - 3, Math.floor(MAP_H / 2), SUPPLY_FIELD_START);
    this.addSupply(Math.floor(MAP_W / 2) + 3, Math.floor(MAP_H / 2) - 2, SUPPLY_FIELD_START);

    // starting forces
    const pBase = this.baseOf("player")!;
    const eBase = this.baseOf("enemy")!;
    this.spawnUnit("player", "harvester", pBase.rally.x, pBase.rally.y);
    this.spawnUnit("player", "ranger", pBase.rally.x - 30, pBase.rally.y + 20);
    this.spawnUnit("player", "ranger", pBase.rally.x + 30, pBase.rally.y + 20);
    this.spawnUnit("enemy", "harvester", eBase.rally.x, eBase.rally.y);
    this.spawnUnit("enemy", "ranger", eBase.rally.x - 30, eBase.rally.y);
    this.spawnUnit("enemy", "ranger", eBase.rally.x + 30, eBase.rally.y);

    // send starting harvesters to work
    for (const u of this.units) {
      if (u.def.canGather) {
        const f = this.findNearestSupply(u.x, u.y);
        if (f) u.gather(this, f);
      }
    }
  }

  private placeBase(team: Team, tx: number, ty: number) {
    const b = new Building(team, "command", tx, ty);
    this.buildings.push(b);
    this.blockTiles(b);
  }

  private addSupply(tx: number, ty: number, amount: number) {
    // clear terrain under supply so harvesters can path in
    for (let y = ty; y < ty + 2; y++)
      for (let x = tx; x < tx + 2; x++) this.grid.setBlocked(x, y, false);
    this.supplyFields.push(new SupplyField(tx, ty, amount));
  }

  private blockTiles(b: Building) {
    for (let y = b.tileY; y < b.tileY + b.def.tilesH; y++)
      for (let x = b.tileX; x < b.tileX + b.def.tilesW; x++) this.grid.setBlocked(x, y, true);
  }

  private spawnUnit(team: Team, kind: UnitKind, x: number, y: number): Unit {
    const u = new Unit(team, kind, x, y);
    this.units.push(u);
    return u;
  }

  // ---------------- WorldApi ----------------
  spawnProjectile(from: Vec, target: Target, damage: number, team: Team) {
    this.projectiles.push(new Projectile(from, target, damage, team));
  }

  findNearestEnemy(x: number, y: number, team: Team, withinSight: number): Target | null {
    let best: Target | null = null;
    let bestD = withinSight * withinSight;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const d = dist2(x, y, u.x, u.y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (!best) {
      for (const b of this.buildings) {
        if (!b.alive || b.team === team) continue;
        const d = dist2(x, y, b.x, b.y);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
    }
    return best;
  }

  findNearestSupply(x: number, y: number): SupplyField | null {
    let best: SupplyField | null = null;
    let bestD = Infinity;
    for (const f of this.supplyFields) {
      if (f.remaining <= 0) continue;
      const d = dist2(x, y, f.x, f.y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  nearestDropOff(x: number, y: number, team: Team): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (!b.alive || b.team !== team) continue;
      const d = dist2(x, y, b.x, b.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  addCredits(team: Team, amount: number) {
    this.credits[team] += amount;
  }

  baseOf(team: Team): Building | null {
    return this.buildings.find((b) => b.team === team && b.kind === "command" && b.alive) ?? null;
  }

  playerBase(): Building | null {
    return this.baseOf("player");
  }

  // ---------------- input handlers ----------------
  onSelect(rect: { x: number; y: number; w: number; h: number }, additive: boolean) {
    const cy = rect.y + rect.h / 2;
    if (isInHud(cy, this.canvas.height)) {
      const kind = hudHitTest(rect.x + rect.w / 2, cy, this.canvas.width, this.canvas.height);
      if (kind) this.requestBuild(kind);
      return;
    }
    const a = this.camera.screenToWorld(rect.x, rect.y);
    const b = this.camera.screenToWorld(rect.x + rect.w, rect.y + rect.h);
    if (!additive) {
      for (const u of this.selected) u.selected = false;
      this.selected = [];
    }
    for (const u of this.units) {
      if (!u.alive || u.team !== "player") continue;
      if (u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y) {
        if (!u.selected) {
          u.selected = true;
          this.selected.push(u);
        }
      }
    }
  }

  onCommand(sx: number, sy: number, _additive: boolean) {
    if (isInHud(sy, this.canvas.height)) return;
    if (this.selected.length === 0) return;
    const w = this.camera.screenToWorld(sx, sy);

    // enemy target under cursor?
    const enemy = this.pickTarget(w.x, w.y, "player");
    if (enemy) {
      for (const u of this.selected) if (u.def.damage > 0) u.attack(enemy);
      this.showToast("Attacking");
      return;
    }

    // supply field under cursor (for harvesters)?
    const field = this.pickSupply(w.x, w.y);
    if (field) {
      let sent = false;
      for (const u of this.selected)
        if (u.def.canGather) {
          u.gather(this, field);
          sent = true;
        }
      if (sent) {
        this.showToast("Harvesting");
        return;
      }
    }

    // otherwise move in a loose formation
    this.moveFormation(w.x, w.y);
  }

  onZoom(factor: number, sx: number, sy: number) {
    this.camera.setZoom(factor, sx, sy);
  }

  onHotkey(key: string) {
    if (key === "r") this.requestBuild("ranger");
    else if (key === "t") this.requestBuild("raptor");
    else if (key === "h") this.requestBuild("harvester");
    else if (key === "escape") {
      for (const u of this.selected) u.selected = false;
      this.selected = [];
    }
  }

  private moveFormation(wx: number, wy: number) {
    const n = this.selected.length;
    const cols = Math.ceil(Math.sqrt(n));
    const spacing = 34;
    this.selected.forEach((u, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ox = (col - (cols - 1) / 2) * spacing;
      const oy = (row - (cols - 1) / 2) * spacing;
      u.moveTo(this, wx + ox, wy + oy, false);
    });
    this.showToast("Move order");
  }

  private pickTarget(wx: number, wy: number, myTeam: Team): Target | null {
    for (const u of this.units) {
      if (!u.alive || u.team === myTeam) continue;
      if (dist2(wx, wy, u.x, u.y) <= (u.radius + 6) * (u.radius + 6)) return u;
    }
    for (const b of this.buildings) {
      if (!b.alive || b.team === myTeam) continue;
      if (dist2(wx, wy, b.x, b.y) <= b.radius * b.radius) return b;
    }
    return null;
  }

  private pickSupply(wx: number, wy: number): SupplyField | null {
    for (const f of this.supplyFields) {
      if (f.remaining <= 0) continue;
      const r = TILE;
      if (dist2(wx, wy, f.x, f.y) <= r * r) return f;
    }
    return null;
  }

  private requestBuild(kind: UnitKind) {
    if (this.status !== "playing") return;
    const base = this.baseOf("player");
    if (!base) return;
    const cost = costOf(kind);
    if (this.credits["player"] < cost) {
      this.showToast("Not enough credits");
      return;
    }
    if (base.queue.length >= 5) {
      this.showToast("Queue full");
      return;
    }
    this.credits["player"] -= cost;
    base.enqueue(kind, UNITS[kind].buildTime);
    this.showToast(`Queued ${UNITS[kind].name}`);
  }

  private showToast(msg: string) {
    this.toast = msg;
    this.toastCd = 1.8;
  }

  // ---------------- main update ----------------
  update(dt: number) {
    if (this.status !== "playing") {
      this.updateCamera(dt);
      return;
    }
    this.updateCamera(dt);

    // production
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const finished = b.update(dt);
      if (finished) {
        const spawn = this.freeSpawnNear(b);
        const u = this.spawnUnit(b.team, finished, spawn.x, spawn.y);
        u.moveTo(this, b.rally.x, b.rally.y, b.team === "enemy");
        if (b.team === "enemy") this.ai.guard(u, b);
      }
    }

    for (const u of this.units) u.update(dt, this);
    for (const p of this.projectiles) p.update(dt);
    this.ai.update(dt, this.baseOf("enemy"));

    // cleanup
    this.units = this.units.filter((u) => u.alive);
    this.selected = this.selected.filter((u) => u.alive);
    this.buildings = this.buildings.filter((b) => {
      if (!b.alive) this.unblockTiles(b);
      return b.alive;
    });
    this.projectiles = this.projectiles.filter((p) => p.alive);
    this.supplyFields = this.supplyFields.filter((f) => f.remaining > 0);

    if (this.toastCd > 0) {
      this.toastCd -= dt;
      if (this.toastCd <= 0) this.toast = "";
    }

    // win / lose
    if (!this.baseOf("enemy")) this.status = "won";
    else if (!this.baseOf("player")) this.status = "lost";
  }

  private unblockTiles(b: Building) {
    for (let y = b.tileY; y < b.tileY + b.def.tilesH; y++)
      for (let x = b.tileX; x < b.tileX + b.def.tilesW; x++) this.grid.setBlocked(x, y, false);
  }

  private freeSpawnNear(b: Building): Vec {
    // spawn just below the building footprint
    return { x: b.x + (Math.random() - 0.5) * TILE, y: b.y + b.radius + TILE * 0.6 };
  }

  private updateCamera(dt: number) {
    const speed = 700 / this.camera.zoom;
    let dx = 0;
    let dy = 0;
    const k = this.input.keys;
    if (k.has("w") || k.has("arrowup")) dy -= 1;
    if (k.has("s") || k.has("arrowdown")) dy += 1;
    if (k.has("a") || k.has("arrowleft")) dx -= 1;
    if (k.has("d") || k.has("arrowright")) dx += 1;

    // edge scrolling
    const edge = 24;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    if (mx >= 0 && mx <= this.canvas.width && my >= 0 && my <= this.canvas.height) {
      if (mx < edge) dx -= 1;
      else if (mx > this.canvas.width - edge) dx += 1;
      if (my < edge) dy -= 1;
      else if (my > this.canvas.height - edge) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      this.camera.pan((dx / len) * speed * dt, (dy / len) * speed * dt);
    }
  }

  resize(w: number, h: number) {
    this.camera.resize(w, h);
  }
}
