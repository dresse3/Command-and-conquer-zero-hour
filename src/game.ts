import {
  UNITS,
  BUILDINGS,
  TILE,
  MAP_W,
  MAP_H,
  START_CREDITS,
  SUPPLY_FIELD_START,
  BUILD_RADIUS,
  STRUCTURE_BUILD,
  FACTORY_HEAL_RATE,
  FACTORY_HEAL_RANGE,
  ATTACK_ALARM_COOLDOWN,
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
import {
  POWERS,
  POWER_ORDER,
  POWER_POINT_COST,
  PROMO_THRESHOLDS,
  SELL_REFUND,
  FACTIONS,
  factionById,
  UPGRADES,
  UPG_WEAPONS_DMG,
  UPG_ARMOR_HP,
  UPG_SUPPLY_GATHER,
  UPG_REACTOR_POWER,
  type PowerKind,
  type FactionDef,
  type UpgradeKind,
} from "./config";
import { hudHitTest, isInHud, isInMinimap, minimapToWorld, powerHitTest, isInSellButton } from "./hud";
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

  // promotion: XP earned by destroying the enemy grants points to spend on powers
  xp: Record<string, number> = { player: 0, enemy: 0 };
  promoPoints: Record<string, number> = { player: 0, enemy: 0 };
  private promoGiven: Record<string, number> = { player: 0, enemy: 0 };

  // researched upgrades per team
  upgrades: Record<string, Set<UpgradeKind>> = { player: new Set(), enemy: new Set() };

  status: GameStatus = "playing";
  phase: "select" | "playing" = "select";
  factions: Record<string, FactionDef> = { player: FACTIONS[0], enemy: FACTIONS[1] };
  toast = "";
  private toastCd = 0;

  // "under attack" alarm + a fading minimap ping at the last hit location
  private alarmCd = 0;
  attackPing: { x: number; y: number; t: number } | null = null;

  private ai: EnemyAI | null = null;
  input: Input;
  readonly isTouch = typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.input = new Input(canvas, this);
    this.camera.resize(canvas.width, canvas.height);
  }

  // Called from the faction-select screen to begin a match.
  startGame(playerFactionId: string) {
    const pf = factionById(playerFactionId);
    const others = FACTIONS.filter((f) => f.id !== pf.id);
    const ef = others[Math.floor(Math.random() * others.length)];
    this.factions = { player: pf, enemy: ef };
    this.playerPowers = new PowerManager();
    this.playerPowers.applyFaction(pf);
    this.enemyPowers = new PowerManager();
    this.enemyPowers.applyFaction(ef);
    this.setup();
    this.ai = new EnemyAI(this);
    const base = this.baseOf("player");
    if (base) this.camera.centerOn(base.x, base.y);
    this.recalcPower();
    this.updateFog();
    this.phase = "playing";
    this.showToast(`${pf.name} vs ${ef.name} — ${pf.trait}`);
  }

  // Tear the match down and return to the faction-select screen so the player
  // can start a fresh game (new random map + enemy) without reloading the page.
  restart() {
    this.grid = new Grid();
    this.units = [];
    this.buildings = [];
    this.supplyFields = [];
    this.projectiles = [];
    this.effects = new ParticleSystem();
    this.credits = { player: START_CREDITS, enemy: START_CREDITS };
    this.power = { player: 0, enemy: 0 };
    this.selected = [];
    this.selectedBuilding = null;
    this.groups = {};
    this.placement = null;
    this.pendingAttackMove = false;
    this.pendingPower = null;
    this.fog = new VisibilityMap(MAP_W, MAP_H);
    this.playerPowers = new PowerManager();
    this.enemyPowers = new PowerManager();
    this.fogCd = 0;
    this.xp = { player: 0, enemy: 0 };
    this.promoPoints = { player: 0, enemy: 0 };
    this.promoGiven = { player: 0, enemy: 0 };
    this.upgrades = { player: new Set(), enemy: new Set() };
    this.status = "playing";
    this.phase = "select";
    this.ai = null;
    this.toast = "";
    this.toastCd = 0;
    this.alarmCd = 0;
    this.attackPing = null;
  }

  // The "Play Again" button on the victory/defeat overlay. Shared by the
  // renderer (to draw it) and input (to hit-test taps/clicks).
  endButtonRect(canvasW: number, canvasH: number) {
    const w = Math.min(260, Math.round(canvasW * 0.6));
    const h = 52;
    return { x: (canvasW - w) / 2, y: canvasH / 2 + 40, w, h };
  }

  private hitEndButton(px: number, py: number): boolean {
    if (this.status === "playing") return false;
    const r = this.endButtonRect(this.canvas.width, this.canvas.height);
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // Layout for the three faction cards on the select screen.
  factionCardRects(canvasW: number, canvasH: number) {
    const n = FACTIONS.length;
    const gap = Math.max(14, Math.round(canvasW * 0.02));
    // scale card width to fit the viewport (with margins), capped at 300
    const w = Math.min(300, Math.floor((canvasW - 48 - (n - 1) * gap) / n));
    const h = Math.min(320, Math.max(240, Math.round(canvasH * 0.5)));
    const total = n * w + (n - 1) * gap;
    const startX = (canvasW - total) / 2;
    const y = (canvasH - h) / 2 + 10;
    return FACTIONS.map((f, i) => ({ f, x: startX + i * (w + gap), y, w, h }));
  }

  private factionCardAt(px: number, py: number): string | null {
    for (const c of this.factionCardRects(this.canvas.width, this.canvas.height)) {
      if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c.f.id;
    }
    return null;
  }

  // ---------------- setup ----------------
  private setup() {
    // The player starts small (Command Center + Power Plant) and must build up
    // the tech tree with harvesters. The AI starts with a full base so it can
    // fight from the opening.
    this.buildBase("player", 4, 49, false);
    this.buildBase("enemy", MAP_W - 7, 4, true);

    this.addSupply(11, MAP_H - 8, SUPPLY_FIELD_START);
    this.addSupply(MAP_W - 13, 9, SUPPLY_FIELD_START);
    this.addSupply(Math.floor(MAP_W / 2) - 3, Math.floor(MAP_H / 2), SUPPLY_FIELD_START);
    this.addSupply(Math.floor(MAP_W / 2) + 3, Math.floor(MAP_H / 2) - 2, SUPPLY_FIELD_START);

    for (const team of ["player", "enemy"] as Team[]) {
      const base = this.baseOf(team)!;
      // player gets an extra harvester to bootstrap building the tech tree
      const harvesters = team === "player" ? 3 : 1;
      for (let i = 0; i < harvesters; i++) {
        this.spawnUnit(team, "harvester", base.rally.x + (i - 1) * 30, base.rally.y);
      }
      this.spawnUnit(team, "ranger", base.rally.x - 34, base.rally.y + 18);
      this.spawnUnit(team, "ranger", base.rally.x + 34, base.rally.y + 18);
    }

    for (const u of this.units) {
      if (u.def.canGather) {
        const f = this.findNearestSupply(u.x, u.y);
        if (f) u.gather(this, f);
      }
    }
    if (this.phase !== "playing") this.showToast("Build a Barracks, then a War Factory to unlock tanks");
  }

  // stamp a starting base cluster for a team around a corner tile
  private buildBase(team: Team, cx: number, cy: number, full: boolean) {
    const dir = team === "player" ? 1 : -1; // player grows up-right, enemy down-left
    this.clearArea(cx - 2, cy - 2, 12, 12);
    this.placeStructure(team, "command", cx, cy);
    this.placeStructure(team, "power", cx + 4 * dir, cy);
    if (full) {
      this.placeStructure(team, "barracks", cx, cy - 3 * dir);
      this.placeStructure(team, "factory", cx + 4 * dir, cy - 4 * dir);
    }
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
    this.applyMods(u);
    u.hp = u.maxHp; // start at full (faction + upgrade HP bonuses applied)
    this.units.push(u);
    return u;
  }

  // Combine faction and researched-upgrade multipliers onto a unit.
  private applyMods(u: Unit) {
    const f = this.factions[u.team];
    const up = this.upgrades[u.team];
    u.hpMult = f.hpMult * (up.has("armor") ? UPG_ARMOR_HP : 1);
    u.dmgMult = f.damageMult * (up.has("weapons") ? UPG_WEAPONS_DMG : 1);
    u.speedMult = f.speedMult;
    u.gatherMult = up.has("supply") ? UPG_SUPPLY_GATHER : 1;
    if (u.hp > u.maxHp) u.hp = u.maxHp;
  }

  private purchaseUpgrade(team: Team, kind: UpgradeKind): boolean {
    const def = UPGRADES[kind];
    if (this.upgrades[team].has(kind)) return false;
    if (this.credits[team] < def.cost) return false;
    this.credits[team] -= def.cost;
    this.upgrades[team].add(kind);
    for (const u of this.units) if (u.team === team) this.applyMods(u);
    if (kind === "reactors") this.recalcPower();
    return true;
  }

  // AI: buy an affordable upgrade whose building it owns
  aiTryUpgrade(team: Team) {
    for (const kind of Object.keys(UPGRADES) as UpgradeKind[]) {
      const def = UPGRADES[kind];
      if (this.upgrades[team].has(kind)) continue;
      if (!this.buildings.some((b) => b.alive && b.team === team && b.kind === def.building)) continue;
      if (this.credits[team] < def.cost) continue;
      this.purchaseUpgrade(team, kind);
      return;
    }
  }

  unitCost(kind: UnitKind, team: Team): number {
    return Math.round(UNITS[kind].cost * this.factions[team].costMult);
  }

  buildingCost(kind: BuildingKind, team: Team): number {
    return Math.round(BUILDINGS[kind].cost * this.factions[team].buildCostMult);
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
    if (casterTeam === "enemy") this.reportAttack(x, y, "enemy");
  }

  spawnUnitAt(team: Team, kind: UnitKind, x: number, y: number) {
    this.spawnUnit(team, kind, x, y);
  }

  shake(mag: number) {
    this.camera.shake(mag);
  }

  // Used by the AI to place a structure on a free tile near its command center.
  tryAiBuild(team: Team, kind: BuildingKind): boolean {
    const base = this.baseOf(team) ?? this.anyBuilding(team);
    if (!base) return false;
    if (!this.structurePrereqMet(kind, team)) return false;
    const cost = this.buildingCost(kind, team);
    if (this.credits[team] < cost) return false;
    const bt = this.grid.worldToTile(base.x, base.y);
    for (let ring = 2; ring < 9; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue; // ring border only
          const tx = bt.tx + dx;
          const ty = bt.ty + dy;
          if (this.canPlace(kind, tx, ty, team)) {
            this.credits[team] -= cost;
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

  // A structure finished construction (called from Building.update).
  onBuildingComplete(b: Building) {
    this.recalcPower();
    if (b.team === "player") {
      this.effects.dust(b.x, b.y, 18);
      this.audio.ready();
      this.showToast(`${b.def.name} online`);
    }
  }

  // A harvester repaired a building this frame — occasional feedback.
  onRepairTick(b: Building) {
    if (b.team === "player" && Math.random() < 0.04) this.effects.dust(b.x, b.y - b.radius * 0.3, 3);
  }

  // Something on the receiving team got hit — raise a throttled alarm if it's
  // the player being attacked, and drop a fading ping on the minimap.
  reportAttack(x: number, y: number, attackerTeam: Team) {
    if (attackerTeam === "enemy") {
      this.attackPing = { x, y, t: 2.5 };
      if (this.alarmCd <= 0) {
        this.alarmCd = ATTACK_ALARM_COOLDOWN;
        this.audio.alarm();
        this.showToast("⚠ Your forces are under attack!");
      }
    }
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

  anyBuilding(team: Team): Building | null {
    return this.buildings.find((b) => b.team === team && b.alive) ?? null;
  }

  powersFor(team: Team): PowerManager {
    return team === "player" ? this.playerPowers : this.enemyPowers;
  }

  // XP toward promotion points, earned by destroying the enemy.
  awardXp(team: Team, amount: number) {
    this.xp[team] += amount;
    let earned = 0;
    while (
      this.promoGiven[team] < PROMO_THRESHOLDS.length &&
      this.xp[team] >= PROMO_THRESHOLDS[this.promoGiven[team]]
    ) {
      this.promoGiven[team]++;
      this.promoPoints[team]++;
      earned++;
    }
    if (earned > 0 && team === "player") {
      this.showToast(`Promotion! +${earned} point — unlock a power`);
      this.audio.ready();
    }
  }

  // Ground vehicles parked near a friendly, working War Factory are slowly
  // repaired — drive damaged tanks home to heal them.
  private applyFactoryHeal(dt: number) {
    const factories = this.buildings.filter((b) => b.alive && b.kind === "factory" && b.functional);
    if (factories.length === 0) return;
    const r2 = FACTORY_HEAL_RANGE * FACTORY_HEAL_RANGE;
    for (const u of this.units) {
      if (!u.alive || u.def.flying || u.def.radius < 12) continue; // vehicles only
      if (u.hp >= u.maxHp) continue;
      for (const f of factories) {
        if (f.team !== u.team) continue;
        if (dist2(u.x, u.y, f.x, f.y) <= r2) {
          u.hp = Math.min(u.maxHp, u.hp + FACTORY_HEAL_RATE * dt);
          break;
        }
      }
    }
  }

  // ---------------- power ----------------
  private recalcPower() {
    for (const team of ["player", "enemy"] as Team[]) {
      let provided = 0;
      let used = 0;
      for (const b of this.buildings) {
        if (!b.alive || b.team !== team || b.constructing) continue; // sites draw no power yet
        provided += b.def.powerProvided;
        used += b.def.powerUsed;
      }
      if (this.upgrades[team].has("reactors")) provided *= UPG_REACTOR_POWER;
      const net = provided - used;
      const noPower = this.factions[team].noPower;
      if (team === "player" && !noPower && net < 0 && this.power[team] >= 0) this.audio.lowPower();
      this.power[team] = net;
      for (const b of this.buildings) {
        if (b.team === team) b.powered = noPower || net >= 0;
      }
    }
  }

  // ---------------- input handlers ----------------
  onSelect(rect: { x: number; y: number; w: number; h: number }, additive: boolean) {
    this.audio.unlock();
    if (this.status !== "playing") {
      if (this.hitEndButton(rect.x + rect.w / 2, rect.y + rect.h / 2)) this.restart();
      return;
    }
    if (this.phase === "select") {
      const id = this.factionCardAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
      if (id) this.startGame(id);
      return;
    }
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

    // HUD: sell button, then power buttons, then build buttons
    if (isInHud(cy, this.canvas.height)) {
      if (
        this.selectedBuilding &&
        this.selectedBuilding.team === "player" &&
        isInSellButton(cx, cy, this.canvas.width, this.canvas.height)
      ) {
        this.sellSelectedBuilding();
        return;
      }
      const pk = powerHitTest(cx, cy, this.canvas.width, this.canvas.height);
      if (pk) {
        this.requestPower(pk);
        return;
      }
      const entries = this.currentBuildEntries();
      const entry = hudHitTest(cx, cy, entries, this.canvas.width, this.canvas.height);
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
    if (this.phase === "select") return;
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
    // Order on a friendly building: harvesters repair it if damaged; vehicles
    // sent to a War Factory roll into its repair bay (heal aura).
    const own = this.pickOwnBuilding(wx, wy);
    if (own) {
      const builders = this.selected.filter((u) => u.def.canBuild);
      if (builders.length > 0 && own.hp < own.maxHp && !own.constructing) {
        for (const u of builders) u.goRepair(this, own);
        this.showToast(`Repairing ${own.def.name}`);
        return;
      }
      if (own.constructing && builders.length > 0) {
        for (const u of builders) u.goBuild(this, own);
        this.showToast(`Building ${own.def.name}…`);
        return;
      }
      if (own.kind === "factory") {
        for (const u of this.selected) u.moveTo(this, own.rally.x, own.rally.y, false);
        this.showToast("Rolling into the repair bay");
        return;
      }
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

  // two-finger drag pans the camera (content follows the fingers)
  onPan(dx: number, dy: number) {
    if (this.phase !== "playing") return;
    this.camera.pan(-dx / this.camera.zoom, -dy / this.camera.zoom);
  }

  // A touch tap: context-sensitive. Menus/placement/powers/selection go through
  // onSelect; but with a live selection, tapping open ground or an enemy issues
  // a command (like a right-click on desktop).
  onTap(sx: number, sy: number) {
    this.audio.unlock();
    if (this.status !== "playing") {
      if (this.hitEndButton(sx, sy)) this.restart();
      return;
    }
    if (this.phase === "select") {
      const id = this.factionCardAt(sx, sy);
      if (id) this.startGame(id);
      return;
    }
    const W = this.canvas.width;
    const H = this.canvas.height;
    const worldTap = !isInHud(sy, H) && !isInMinimap(sx, sy, W, H);
    if (worldTap && !this.placement && !this.pendingPower && this.selected.length > 0) {
      const w = this.camera.screenToWorld(sx, sy);
      if (!this.pickOwnBuilding(w.x, w.y) && !this.pickOwnUnit(w.x, w.y)) {
        this.onCommand(sx, sy, false);
        return;
      }
    }
    this.onSelect({ x: sx - 2, y: sy - 2, w: 4, h: 4 }, false);
  }

  private pickOwnUnit(wx: number, wy: number): Unit | null {
    for (const u of this.units) {
      if (!u.alive || u.team !== "player") continue;
      if (dist2(wx, wy, u.x, u.y) <= (u.radius + 8) * (u.radius + 8)) return u;
    }
    return null;
  }

  onHotkey(key: string) {
    this.audio.unlock();
    if (this.phase === "select") return;
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
    if (key === "k") {
      this.sellSelectedBuilding();
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
      const entry = this.producesFor(this.selectedBuilding).find((e) => e.hotkey.toLowerCase() === key);
      if (entry) {
        this.requestBuild(entry);
        return;
      }
    }
    // structure build hotkeys (1-6) when a harvester/builder is selected
    if (!this.selectedBuilding && this.hasBuilderSelected()) {
      const entry = STRUCTURE_BUILD.find((e) => e.hotkey.toLowerCase() === key);
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

  // Build menu for a building: base units + faction signature + upgrades.
  producesFor(b: Building): BuildEntry[] {
    const entries: BuildEntry[] = [...b.def.produces];
    const sig = this.factions[b.team].signature;
    if (sig && sig.building === b.kind) entries.push({ type: "unit", key: sig.unit, hotkey: sig.hotkey });
    for (const kind of Object.keys(UPGRADES) as UpgradeKind[]) {
      const def = UPGRADES[kind];
      if (def.building === b.kind && !this.upgrades[b.team].has(kind)) {
        entries.push({ type: "upgrade", key: kind, hotkey: def.hotkey });
      }
    }
    return entries;
  }

  currentBuildEntries(): BuildEntry[] {
    if (this.selectedBuilding) return this.producesFor(this.selectedBuilding);
    // With a harvester (builder) selected, show the structure build menu.
    if (this.hasBuilderSelected()) return STRUCTURE_BUILD;
    return [];
  }

  hasBuilderSelected(): boolean {
    return this.selected.some((u) => u.alive && u.team === "player" && u.def.canBuild);
  }

  // Whether a structure can be built now: prereq building must exist & be done.
  structurePrereqMet(kind: BuildingKind, team: Team): boolean {
    const prereq = BUILDINGS[kind].prereq;
    if (!prereq) return true;
    return this.buildings.some((b) => b.alive && !b.constructing && b.team === team && b.kind === prereq);
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
    // must be unlocked with a promotion point first
    if (!this.playerPowers.isUnlocked(kind)) {
      const cost = POWER_POINT_COST[kind];
      if (this.promoPoints["player"] >= cost) {
        this.promoPoints["player"] -= cost;
        this.playerPowers.unlock(kind);
        this.audio.build();
        this.showToast(`${POWERS[kind].name} unlocked!`);
      } else {
        this.showToast(`Need ${cost} promotion point${cost > 1 ? "s" : ""} — destroy enemies to earn`);
      }
      return;
    }
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
    if (entry.type === "upgrade") {
      const key = entry.key as UpgradeKind;
      const def = UPGRADES[key];
      if (this.upgrades["player"].has(key)) {
        this.showToast("Already researched");
        return;
      }
      if (this.credits["player"] < def.cost) {
        this.showToast("Not enough credits");
        return;
      }
      this.purchaseUpgrade("player", key);
      this.audio.build();
      this.showToast(`${def.name} researched — ${def.blurb}`);
      return;
    }
    if (entry.type === "building") {
      const kind = entry.key as BuildingKind;
      const def = BUILDINGS[kind];
      if (!this.hasBuilderSelected()) {
        this.showToast("Select a Harvester to build structures");
        return;
      }
      if (!this.structurePrereqMet(kind, "player")) {
        this.showToast(`Requires ${BUILDINGS[def.prereq!].name} first`);
        return;
      }
      if (this.credits["player"] < this.buildingCost(kind, "player")) {
        this.showToast("Not enough credits");
        return;
      }
      this.placement = kind;
      this.showToast(`Place ${def.name} (Esc to cancel)`);
      return;
    }
    // unit
    const b = this.selectedBuilding;
    if (!b || !this.producesFor(b).some((e) => e.key === entry.key)) {
      this.showToast("Select the producing building");
      return;
    }
    if (b.def.needsPower && !b.powered) {
      this.showToast("Building has no power");
      return;
    }
    const def = UNITS[entry.key as UnitKind];
    const cost = this.unitCost(entry.key as UnitKind, "player");
    if (this.credits["player"] < cost) {
      this.showToast("Not enough credits");
      return;
    }
    if (b.queue.length >= 6) {
      this.showToast("Queue full");
      return;
    }
    this.credits["player"] -= cost;
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
    if (!this.structurePrereqMet(kind, "player")) {
      this.showToast(`Requires ${BUILDINGS[def.prereq!].name} first`);
      this.placement = null;
      return;
    }
    if (!this.canPlace(kind, tx, ty, "player")) {
      this.showToast("Can't build there");
      return;
    }
    const cost = this.buildingCost(kind, "player");
    if (this.credits["player"] < cost) {
      this.showToast("Not enough credits");
      this.placement = null;
      return;
    }
    this.credits["player"] -= cost;
    const nb = this.placeStructure("player", kind, tx, ty);
    nb.beginConstruction(); // rises over its build time
    this.recalcPower();
    this.effects.dust(nb.x, nb.y, 14);
    this.audio.place();
    this.dispatchBuilder(nb);
    this.showToast(`Building ${def.name}…`);
    if (!this.input.keys.has("shift")) this.placement = null; // shift = keep placing
  }

  // Send a harvester to a new construction site: prefer a selected builder,
  // else the nearest idle/gathering player harvester.
  private dispatchBuilder(site: Building) {
    const builders = this.selected.filter((u) => u.alive && u.team === "player" && u.def.canBuild);
    let builder = builders[0] ?? null;
    if (!builder) {
      let bestD = Infinity;
      for (const u of this.units) {
        if (!u.alive || u.team !== "player" || !u.def.canBuild) continue;
        const d = dist2(u.x, u.y, site.x, site.y);
        if (d < bestD) {
          bestD = d;
          builder = u;
        }
      }
    }
    if (builder) builder.goBuild(this, site);
  }

  private showToast(msg: string) {
    this.toast = msg;
    this.toastCd = 1.8;
  }

  // ---------------- main update ----------------
  update(dt: number) {
    if (this.phase !== "playing") return;
    this.updateCamera(dt);
    this.camera.updateShake(dt);
    this.effects.update(dt);
    if (this.status !== "playing") return;

    if (this.alarmCd > 0) this.alarmCd -= dt;
    if (this.attackPing) {
      this.attackPing.t -= dt;
      if (this.attackPing.t <= 0) this.attackPing = null;
    }

    this.playerPowers.update(dt, this);
    this.enemyPowers.update(dt, this);
    this.fogCd -= dt;
    if (this.fogCd <= 0) {
      this.updateFog();
      this.fogCd = 0.15;
    }
    this.applyFactoryHeal(dt);

    let structureChanged = false;

    for (const b of this.buildings) {
      if (!b.alive) continue;
      const finished = b.update(dt, this);
      if (finished) {
        const spawn = this.freeSpawnNear(b);
        const u = this.spawnUnit(b.team, finished, spawn.x, spawn.y);
        if (u.def.canGather) {
          // harvesters & supply choppers roll straight out to work
          const f = this.findNearestSupply(u.x, u.y);
          if (f) u.gather(this, f);
          else u.moveTo(this, b.rally.x, b.rally.y, false);
        } else {
          u.moveTo(this, b.rally.x, b.rally.y, b.team === "enemy");
        }
        if (b.team === "enemy") this.ai?.guard(u);
        if (b.team === "player") this.audio.ready();
      }
    }

    for (const u of this.units) u.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    this.ai?.update(dt);

    // cleanup — dead entities emit an explosion once as they are removed;
    // the opposing team earns promotion XP for the kill.
    this.units = this.units.filter((u) => {
      if (!u.alive) {
        this.effects.explosion(u.x, u.y, 0.6 + u.radius / 26);
        this.audio.explosion(0.25);
        this.awardXp(u.team === "player" ? "enemy" : "player", Math.max(8, Math.round(u.def.cost / 12)));
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
        this.awardXp(b.team === "player" ? "enemy" : "player", Math.round(b.def.cost / 10) + 20);
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

    // Defeat only when ALL of a side's buildings are gone (losing the Command
    // Center alone is survivable — you can still fight and recover).
    const enemyBuildings = this.buildings.some((b) => b.team === "enemy");
    const playerBuildings = this.buildings.some((b) => b.team === "player");
    if (!enemyBuildings) {
      this.status = "won";
      this.audio.fanfare(true);
    } else if (!playerBuildings) {
      this.status = "lost";
      this.audio.fanfare(false);
    }
  }

  sellSelectedBuilding() {
    const b = this.selectedBuilding;
    if (!b || b.team !== "player") {
      this.showToast("Select your building to sell");
      return;
    }
    const refund = Math.round(this.buildingCost(b.kind, "player") * SELL_REFUND);
    this.credits["player"] += refund;
    // remove directly (no explosion / no enemy XP, unlike being destroyed)
    b.alive = false;
    this.buildings = this.buildings.filter((x) => x !== b);
    this.unblockTiles(b);
    this.recalcPower();
    this.effects.dust(b.x, b.y, 16);
    this.audio.place();
    this.selectedBuilding = null;
    this.showToast(`Sold ${b.def.name} (+${refund})`);
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

    // Edge-scroll only with a real pointer — on touch the "mouse" position is
    // the last finger position, which would scroll the map forever near a edge.
    if (!this.isTouch) {
      const edge = 24;
      const mx = this.input.mouseX;
      const my = this.input.mouseY;
      if (mx >= 0 && mx <= this.canvas.width && my >= 0 && my <= this.canvas.height) {
        if (mx < edge) dx -= 1;
        else if (mx > this.canvas.width - edge) dx += 1;
        if (my < edge) dy -= 1;
        else if (my > this.canvas.height - edge) dy += 1;
      }
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
