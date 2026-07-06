import {
  UNITS,
  BUILDINGS,
  TILE,
  MAP_W,
  MAP_H,
  START_CREDITS,
  SUPPLY_FIELD_START,
  BUILD_RADIUS,
  type Team,
  type UnitKind,
  type BuildingKind,
  type BuildEntry,
} from "./config";
import { Grid } from "./grid";
import { Camera } from "./camera";
import { Input, type InputHandlers } from "./input";
import { Unit, Building, SupplyField, Projectile, type Target } from "./entities";
import { EnemyAI } from "./ai";
import { ParticleSystem } from "./effects";
import { Sfx } from "./audio";
import { VisibilityMap } from "./fog";
import { PowerManager } from "./powers";
import { POWERS, POWER_ORDER, type PowerKind } from "./config";
import { hudHitTest, isInHud, isInMinimap, minimapToWorld, powerHitTest } from "./hud";
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
  effects = new ParticleSystem();
  audio = new Sfx();

  credits: Record<string, number> = { player: START_CREDITS, enemy: START_CREDITS };
  power: Record<string, number> = { player: 0, enemy: 0 };
  selected: Unit[] = [];
  selectedBuilding: Building | null = null;
  groups: Record<string, Unit[]> = {};

  placement: BuildingKind | null = null;
  pendingAttackMove = false;
  pendingPower: PowerKind | null = null;

  fog = new VisibilityMap(MAP_W, MAP_H);
  playerPowers = new PowerManager();
  enemyPowers = new PowerManager();
  private fogCd = 0;

  status: GameStatus = "playing";
  toast = "";
  private toastCd = 0;

  private ai: EnemyAI;
  input: Input;

  constructor(private canvas: HTMLCanvasElement) {
    this.input = new Input(canvas, this);
    this.setup();
    this.ai = new EnemyAI(this);
    this.camera.resize(canvas.width, canvas.height);
    const base = this.baseOf("player");
    if (base) this.camera.centerOn(base.x, base.y);
    this.recalcPower();
    this.updateFog();
  }

  // ---------------- setup ----------------
  private setup() {
    this.buildBase("player", 4, 49);
    this.buildBase("enemy", MAP_W - 7, 4);

    this.addSupply(11, MAP_H - 8, SUPPLY_FIELD_START);
    this.addSupply(MAP_W - 13, 9, SUPPLY_FIELD_START);
    this.addSupply(Math.floor(MAP_W / 2) - 3, Math.floor(MAP_H / 2), SUPPLY_FIELD_START);
    this.addSupply(Math.floor(MAP_W / 2) + 3, Math.floor(MAP_H / 2) - 2, SUPPLY_FIELD_START);

    for (const team of ["player", "enemy"] as Team[]) {
      const base = this.baseOf(team)!;
      this.spawnUnit(team, "harvester", base.rally.x, base.rally.y);
      this.spawnUnit(team, "ranger", base.rally.x - 34, base.rally.y + 18);
      this.spawnUnit(team, "ranger", base.rally.x + 34, base.rally.y + 18);
    }

    for (const u of this.units) {
      if (u.def.canGather) {
        const f = this.findNearestSupply(u.x, u.y);
        if (f) u.gather(this, f);
      }
    }
  }

  // stamp a starting base cluster for a team around a corner tile
  private buildBase(team: Team, cx: number, cy: number) {
    const dir = team === "player" ? 1 : -1; // player grows up-right, enemy down-left
    this.clearArea(cx - 2, cy - 2, 12, 12);
    this.placeStructure(team, "command", cx, cy);
    this.placeStructure(team, "power", cx + 4 * dir, cy);
    this.placeStructure(team, "barracks", cx, cy - 3 * dir);
    this.placeStructure(team, "factory", cx + 4 * dir, cy - 4 * dir);
  }

  private clearArea(tx: number, ty: number, w: number, h: number) {
    for (let y = ty; y < ty + h; y++)
      for (let x = tx; x < tx + w; x++) {
        const c = this.grid.cell(x, y);
        if (c) {
          if (c.terrain === 2) c.terrain = 0;
          c.blocked = false;
        }
      }
  }

  private addSupply(tx: number, ty: number, amount: number) {
    for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) this.grid.setBlocked(x, y, false);
    this.supplyFields.push(new SupplyField(tx, ty, amount));
  }

  private placeStructure(team: Team, kind: BuildingKind, tx: number, ty: number): Building {
    const b = new Building(team, kind, tx, ty);
    this.buildings.push(b);
    this.blockTiles(b);
    return b;
  }

  private blockTiles(b: Building) {
    for (let y = b.tileY; y < b.tileY + b.def.tilesH; y++)
      for (let x = b.tileX; x < b.tileX + b.def.tilesW; x++) this.grid.setBlocked(x, y, true);
  }

  private unblockTiles(b: Building) {
    for (let y = b.tileY; y < b.tileY + b.def.tilesH; y++)
      for (let x = b.tileX; x < b.tileX + b.def.tilesW; x++) this.grid.setBlocked(x, y, false);
  }

  private spawnUnit(team: Team, kind: UnitKind, x: number, y: number): Unit {
    const u = new Unit(team, kind, x, y);
    this.units.push(u);
    return u;
  }

  // ---------------- WorldApi ----------------
  spawnProjectile(from: Vec, target: Target, damage: number, team: Team, splash: number, owner: Unit | null) {
    this.projectiles.push(new Projectile(from, target, damage, team, splash, owner));
    const ang = Math.atan2(target.y - from.y, target.x - from.x);
    this.effects.muzzleFlash(from.x, from.y, ang);
    this.audio.shoot(splash > 0 ? "cannon" : damage >= 50 ? "rocket" : "gun");
  }

  damageArea(x: number, y: number, radius: number, amount: number, casterTeam: Team) {
    const r2 = radius * radius;
    for (const u of this.units) {
      if (!u.alive || u.team === casterTeam) continue;
      if (dist2(x, y, u.x, u.y) <= r2) u.takeDamage(amount);
    }
    for (const b of this.buildings) {
      if (!b.alive || b.team === casterTeam) continue;
      if (dist2(x, y, b.x, b.y) <= r2) b.takeDamage(amount * 0.7);
    }
  }

  spawnUnitAt(team: Team, kind: UnitKind, x: number, y: number) {
    this.spawnUnit(team, kind, x, y);
  }

  shake(mag: number) {
    this.camera.shake(mag);
  }

  // Used by the AI to place a structure on a free tile near its command center.
  tryAiBuild(team: Team, kind: BuildingKind): boolean {
    const base = this.baseOf(team);
    if (!base) return false;
    const def = BUILDINGS[kind];
    if (this.credits[team] < def.cost) return false;
    const bt = this.grid.worldToTile(base.x, base.y);
    for (let ring = 2; ring < 9; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue; // ring border only
          const tx = bt.tx + dx;
          const ty = bt.ty + dy;
          if (this.canPlace(kind, tx, ty, team)) {
            this.credits[team] -= def.cost;
            this.placeStructure(team, kind, tx, ty);
            this.recalcPower();
            return true;
          }
        }
      }
    }
    return false;
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
      if (!b.alive || b.team !== team || !b.def.isDropoff) continue;
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

  private updateFog() {
    this.fog.clearVisible();
    for (const u of this.units) if (u.team === "player" && u.alive) this.fog.reveal(u.x, u.y, u.def.sight);
    for (const b of this.buildings) if (b.team === "player" && b.alive) this.fog.reveal(b.x, b.y, b.radius + 170);
  }

  playerBase(): Building | null {
    return this.baseOf("player");
  }

  // ---------------- power ----------------
  private recalcPower() {
    for (const team of ["player", "enemy"] as Team[]) {
      let provided = 0;
      let used = 0;
      for (const b of this.buildings) {
        if (!b.alive || b.team !== team) continue;
        provided += b.def.powerProvided;
        used += b.def.powerUsed;
      }
      const net = provided - used;
      if (team === "player" && net < 0 && this.power[team] >= 0) this.audio.lowPower();
      this.power[team] = net;
      for (const b of this.buildings) {
        if (b.team === team) b.powered = net >= 0;
      }
    }
  }

  // ---------------- input handlers ----------------
  onSelect(rect: { x: number; y: number; w: number; h: number }, additive: boolean) {
    this.audio.unlock();
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const isClick = rect.w < 6 && rect.h < 6;

    // power targeting mode
    if (this.pendingPower) {
      if (isInHud(cy, this.canvas.height)) return;
      const w = isInMinimap(cx, cy, this.canvas.width, this.canvas.height)
        ? minimapToWorld(cx, cy, this.canvas.width, this.canvas.height)
        : this.camera.screenToWorld(cx, cy);
      this.firePower(this.pendingPower, w.x, w.y);
      return;
    }

    // building placement mode
    if (this.placement) {
      if (isInHud(cy, this.canvas.height)) return;
      const w = this.camera.screenToWorld(cx, cy);
      this.tryPlace(w.x, w.y);
      return;
    }

    // HUD: power buttons take priority, then build buttons
    if (isInHud(cy, this.canvas.height)) {
      const pk = powerHitTest(cx, cy, this.canvas.width, this.canvas.height);
      if (pk) {
        this.requestPower(pk);
        return;
      }
      const entries = this.currentBuildEntries();
      const entry = hudHitTest(cx, cy, entries, this.canvas.height);
      if (entry) this.requestBuild(entry);
      return;
    }

    // minimap navigation
    if (isInMinimap(cx, cy, this.canvas.width, this.canvas.height)) {
      const w = minimapToWorld(cx, cy, this.canvas.width, this.canvas.height);
      this.camera.centerOn(w.x, w.y);
      return;
    }

    // attack-move target
    if (this.pendingAttackMove && isClick) {
      const w = this.camera.screenToWorld(cx, cy);
      for (const u of this.selected) if (u.def.damage > 0) u.moveTo(this, w.x, w.y, true);
      this.pendingAttackMove = false;
      this.showToast("Attack-move");
      return;
    }

    const a = this.camera.screenToWorld(rect.x, rect.y);
    const b = this.camera.screenToWorld(rect.x + rect.w, rect.y + rect.h);

    // single click may select an own building for its build menu
    if (isClick) {
      const w = this.camera.screenToWorld(cx, cy);
      const hitB = this.pickOwnBuilding(w.x, w.y);
      if (hitB) {
        this.clearSelection();
        this.selectedBuilding = hitB;
        hitB.selected = true;
        this.audio.select();
        return;
      }
    }

    if (!additive) this.clearSelection();
    const before = this.selected.length;
    for (const u of this.units) {
      if (!u.alive || u.team !== "player") continue;
      if (u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y && !u.selected) {
        u.selected = true;
        this.selected.push(u);
      }
    }
    if (this.selected.length > before) this.audio.select();
    if (this.selected.length > 0 && this.selectedBuilding) {
      this.selectedBuilding.selected = false;
      this.selectedBuilding = null;
    }
  }

  onCommand(sx: number, sy: number, _additive: boolean) {
    this.audio.unlock();
    if (this.placement) {
      this.placement = null;
      this.showToast("Placement cancelled");
      return;
    }
    if (this.pendingPower) {
      this.pendingPower = null;
      this.showToast("Power cancelled");
      return;
    }
    this.pendingAttackMove = false;
    if (isInHud(sy, this.canvas.height)) return;
    if (isInMinimap(sx, sy, this.canvas.width, this.canvas.height)) {
      const w = minimapToWorld(sx, sy, this.canvas.width, this.canvas.height);
      this.issueCommand(w.x, w.y);
      return;
    }
    const w = this.camera.screenToWorld(sx, sy);
    this.issueCommand(w.x, w.y);
  }

  private issueCommand(wx: number, wy: number) {
    if (this.selected.length === 0) return;
    this.audio.order();
    const enemy = this.pickTarget(wx, wy, "player");
    if (enemy) {
      for (const u of this.selected) if (u.def.damage > 0) u.attack(enemy);
      this.showToast("Attacking");
      return;
    }
    const field = this.pickSupply(wx, wy);
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
    this.moveFormation(wx, wy);
  }

  onZoom(factor: number, sx: number, sy: number) {
    this.camera.setZoom(factor, sx, sy);
  }

  onHotkey(key: string) {
    this.audio.unlock();
    if (key === "a" && !this.placement) {
      if (this.selected.some((u) => u.def.damage > 0)) {
        this.pendingAttackMove = true;
        this.showToast("Attack-move: pick target");
      }
      return;
    }
    if (key === "escape") {
      if (this.placement) this.placement = null;
      else if (this.pendingPower) this.pendingPower = null;
      else {
        this.clearSelection();
        this.pendingAttackMove = false;
      }
      return;
    }
    // general power hotkeys
    for (const pk of POWER_ORDER) {
      if (POWERS[pk].hotkey.toLowerCase() === key) {
        this.requestPower(pk);
        return;
      }
    }
    const ctrl = this.input.keys.has("control");
    if (/^[1-9]$/.test(key) && ctrl) {
      this.groups[key] = [...this.selected];
      this.showToast(`Group ${key} set (${this.selected.length})`);
      return;
    }
    // context production hotkey (matches selected building's menu)
    if (this.selectedBuilding) {
      const entry = this.selectedBuilding.def.produces.find((e) => e.hotkey.toLowerCase() === key);
      if (entry) {
        this.requestBuild(entry);
        return;
      }
    }
    if (/^[1-9]$/.test(key)) this.selectGroup(key);
  }

  private selectGroup(key: string) {
    const g = (this.groups[key] ?? []).filter((u) => u.alive);
    if (g.length === 0) return;
    this.clearSelection();
    for (const u of g) {
      u.selected = true;
      this.selected.push(u);
    }
  }

  private clearSelection() {
    for (const u of this.selected) u.selected = false;
    this.selected = [];
    if (this.selectedBuilding) {
      this.selectedBuilding.selected = false;
      this.selectedBuilding = null;
    }
  }

  currentBuildEntries(): BuildEntry[] {
    return this.selectedBuilding ? this.selectedBuilding.def.produces : [];
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

  private pickOwnBuilding(wx: number, wy: number): Building | null {
    for (const b of this.buildings) {
      if (!b.alive || b.team !== "player") continue;
      const halfW = (b.def.tilesW * TILE) / 2;
      const halfH = (b.def.tilesH * TILE) / 2;
      if (Math.abs(wx - b.x) <= halfW && Math.abs(wy - b.y) <= halfH) return b;
    }
    return null;
  }

  private pickSupply(wx: number, wy: number): SupplyField | null {
    for (const f of this.supplyFields) {
      if (f.remaining <= 0) continue;
      if (dist2(wx, wy, f.x, f.y) <= TILE * TILE) return f;
    }
    return null;
  }

  // ---------------- general powers ----------------
  private requestPower(kind: PowerKind) {
    if (this.status !== "playing") return;
    if (!this.playerPowers.canFire(kind)) {
      this.showToast(`${POWERS[kind].name} charging…`);
      return;
    }
    this.placement = null;
    this.pendingAttackMove = false;
    this.pendingPower = kind;
    this.showToast(`${POWERS[kind].name}: pick a target`);
  }

  private firePower(kind: PowerKind, wx: number, wy: number) {
    const ok = this.playerPowers.fire(kind, wx, wy, this, "player");
    this.pendingPower = null;
    if (ok) {
      this.showToast(`${POWERS[kind].name} launched`);
      this.audio.order();
    }
  }

  // ---------------- build / placement ----------------
  private requestBuild(entry: BuildEntry) {
    if (this.status !== "playing") return;
    if (entry.type === "building") {
      const def = BUILDINGS[entry.key as BuildingKind];
      if (this.credits["player"] < def.cost) {
        this.showToast("Not enough credits");
        return;
      }
      this.placement = entry.key as BuildingKind;
      this.showToast(`Place ${def.name} (Esc to cancel)`);
      return;
    }
    // unit
    const b = this.selectedBuilding;
    if (!b || !b.def.produces.some((e) => e.key === entry.key)) {
      this.showToast("Select the producing building");
      return;
    }
    if (b.def.needsPower && !b.powered) {
      this.showToast("Building has no power");
      return;
    }
    const def = UNITS[entry.key as UnitKind];
    if (this.credits["player"] < def.cost) {
      this.showToast("Not enough credits");
      return;
    }
    if (b.queue.length >= 6) {
      this.showToast("Queue full");
      return;
    }
    this.credits["player"] -= def.cost;
    b.enqueue(entry.key as UnitKind, def.buildTime);
    this.audio.build();
    this.showToast(`Queued ${def.name}`);
  }

  // top-left tile for a footprint centered under a world point
  placementTile(wx: number, wy: number, kind: BuildingKind): { tx: number; ty: number } {
    const def = BUILDINGS[kind];
    return {
      tx: Math.round(wx / TILE - def.tilesW / 2),
      ty: Math.round(wy / TILE - def.tilesH / 2),
    };
  }

  canPlace(kind: BuildingKind, tx: number, ty: number, team: Team): boolean {
    const def = BUILDINGS[kind];
    for (let y = ty; y < ty + def.tilesH; y++)
      for (let x = tx; x < tx + def.tilesW; x++) {
        if (!this.grid.inBounds(x, y) || this.grid.isBlocked(x, y)) return false;
      }
    // must be within build radius of a friendly building
    const cxp = (tx + def.tilesW / 2) * TILE;
    const cyp = (ty + def.tilesH / 2) * TILE;
    for (const b of this.buildings) {
      if (b.alive && b.team === team && dist2(cxp, cyp, b.x, b.y) <= BUILD_RADIUS * BUILD_RADIUS) return true;
    }
    return false;
  }

  private tryPlace(wx: number, wy: number) {
    const kind = this.placement!;
    const { tx, ty } = this.placementTile(wx, wy, kind);
    const def = BUILDINGS[kind];
    if (!this.canPlace(kind, tx, ty, "player")) {
      this.showToast("Can't build there");
      return;
    }
    if (this.credits["player"] < def.cost) {
      this.showToast("Not enough credits");
      this.placement = null;
      return;
    }
    this.credits["player"] -= def.cost;
    const nb = this.placeStructure("player", kind, tx, ty);
    this.recalcPower();
    this.effects.dust(nb.x, nb.y, 14);
    this.audio.place();
    this.showToast(`${def.name} built`);
    if (!this.input.keys.has("shift")) this.placement = null; // shift = keep placing
  }

  private showToast(msg: string) {
    this.toast = msg;
    this.toastCd = 1.8;
  }

  // ---------------- main update ----------------
  update(dt: number) {
    this.updateCamera(dt);
    this.camera.updateShake(dt);
    this.effects.update(dt);
    if (this.status !== "playing") return;

    this.playerPowers.update(dt, this);
    this.enemyPowers.update(dt, this);
    this.fogCd -= dt;
    if (this.fogCd <= 0) {
      this.updateFog();
      this.fogCd = 0.15;
    }

    let structureChanged = false;

    for (const b of this.buildings) {
      if (!b.alive) continue;
      const finished = b.update(dt, this);
      if (finished) {
        const spawn = this.freeSpawnNear(b);
        const u = this.spawnUnit(b.team, finished, spawn.x, spawn.y);
        u.moveTo(this, b.rally.x, b.rally.y, b.team === "enemy");
        if (b.team === "enemy") this.ai.guard(u);
        if (b.team === "player") this.audio.ready();
      }
    }

    for (const u of this.units) u.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    this.ai.update(dt);

    // cleanup — dead entities emit an explosion once as they are removed
    this.units = this.units.filter((u) => {
      if (!u.alive) {
        this.effects.explosion(u.x, u.y, 0.6 + u.radius / 26);
        this.audio.explosion(0.25);
      }
      return u.alive;
    });
    this.selected = this.selected.filter((u) => u.alive);
    this.buildings = this.buildings.filter((b) => {
      if (!b.alive) {
        this.effects.explosion(b.x, b.y, 2.2);
        this.audio.explosion(0.9);
        this.camera.shake(12);
        this.unblockTiles(b);
        structureChanged = true;
      }
      return b.alive;
    });
    if (this.selectedBuilding && !this.selectedBuilding.alive) this.selectedBuilding = null;
    this.projectiles = this.projectiles.filter((p) => p.alive);
    this.supplyFields = this.supplyFields.filter((f) => f.remaining > 0);

    if (structureChanged) this.recalcPower();

    if (this.toastCd > 0) {
      this.toastCd -= dt;
      if (this.toastCd <= 0) this.toast = "";
    }

    if (!this.baseOf("enemy")) {
      this.status = "won";
      this.audio.fanfare(true);
    } else if (!this.baseOf("player")) {
      this.status = "lost";
      this.audio.fanfare(false);
    }
  }

  private freeSpawnNear(b: Building): Vec {
    return { x: b.x + (Math.random() - 0.5) * TILE, y: b.y + b.radius + TILE * 0.6 };
  }

  private updateCamera(dt: number) {
    const speed = 700 / this.camera.zoom;
    let dx = 0;
    let dy = 0;
    // Arrow keys + edge scroll pan the camera. WASD is intentionally left free
    // so letters (A = attack-move, etc.) can be command hotkeys.
    const k = this.input.keys;
    if (k.has("arrowup")) dy -= 1;
    if (k.has("arrowdown")) dy += 1;
    if (k.has("arrowleft")) dx -= 1;
    if (k.has("arrowright")) dx += 1;

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
