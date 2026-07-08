import {
  UNITS,
  BUILDINGS,
  TILE,
  GATHER_AMOUNT,
  GATHER_TIME,
  BUILD_TIME_MULT,
  HARVESTER_REPAIR_RATE,
  VET_KILLS,
  VET_DAMAGE,
  VET_HP,
  VET_REGEN,
  type Team,
  type UnitKind,
  type BuildingKind,
  type UnitDef,
  type BuildingDef,
} from "./config";
import { findPath } from "./grid";
import type { Vec, WorldApi } from "./types";
import { dist } from "./types";

let NEXT_ID = 1;

export type Target = Unit | Building;

type UnitState =
  | "idle"
  | "moving"
  | "attack-move"
  | "attacking"
  | "gather"
  | "return"
  | "build"
  | "repair"
  | "rearm";

export class Unit {
  id = NEXT_ID++;
  def: UnitDef;
  hp: number;
  radius: number;
  selected = false;
  alive = true;

  x: number;
  y: number;
  angle = 0; // body / movement facing
  turretAngle = 0; // weapon facing
  muzzle = 0; // >0 for a few frames after firing (draws a muzzle flash)
  ammo = 0; // remaining shots for aircraft with an ammo count (jets)

  state: UnitState = "idle";
  path: Vec[] = [];
  target: Target | null = null;
  holdGoal: Vec | null = null; // where an attack-move is headed

  private fireCd = 0;
  private repathCd = 0;

  // local avoidance / stuck detection
  goal: Vec | null = null;
  private stuckTime = 0;
  private progressCd = 0;
  private lastX = 0;
  private lastY = 0;

  // harvester economy
  carrying = 0;
  gatherTimer = 0;
  fieldTarget: SupplyField | null = null;

  // construction / repair (harvester as a builder)
  buildTarget: Building | null = null;
  repairTarget: Building | null = null;

  // veterancy
  kills = 0;
  rank = 0; // 0 rookie, 1 veteran, 2 elite

  // faction + upgrade stat multipliers (assigned by the game on spawn)
  hpMult = 1;
  speedMult = 1;
  dmgMult = 1;
  gatherMult = 1;

  constructor(public team: Team, public kind: UnitKind, x: number, y: number) {
    this.def = UNITS[kind];
    this.hp = this.def.maxHp;
    this.radius = this.def.radius;
    this.x = x;
    this.y = y;
    this.ammo = this.def.ammo ?? 0;
  }

  get maxAmmo() {
    return this.def.ammo ?? 0;
  }

  get maxHp() {
    return this.def.maxHp * VET_HP[this.rank] * this.hpMult;
  }

  get speed() {
    return this.def.speed * this.speedMult;
  }

  get currentDamage() {
    return this.def.damage * VET_DAMAGE[this.rank] * this.dmgMult;
  }

  addKill() {
    this.kills++;
    const newRank = this.kills >= VET_KILLS[1] ? 2 : this.kills >= VET_KILLS[0] ? 1 : 0;
    if (newRank > this.rank) {
      this.rank = newRank;
      this.hp = this.maxHp; // promotion fully heals & raises the cap
    }
  }

  takeDamage(amount: number) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  // --- commands issued by the player / AI ---
  moveTo(world: WorldApi, wx: number, wy: number, attackMove = false) {
    this.target = null;
    this.holdGoal = attackMove ? { x: wx, y: wy } : null;
    this.state = attackMove ? "attack-move" : "moving";
    this.goal = { x: wx, y: wy };
    this.stuckTime = 0;
    this.computePath(world, wx, wy);
  }

  attack(target: Target) {
    this.target = target;
    this.state = "attacking";
    this.path = [];
  }

  gather(world: WorldApi, field: SupplyField) {
    if (!this.def.canGather) return;
    this.fieldTarget = field;
    this.state = "gather";
    this.computePath(world, field.x, field.y);
  }

  // Send a builder to a construction site (the building tracks its own progress).
  goBuild(world: WorldApi, b: Building) {
    if (!this.def.canBuild) return;
    this.buildTarget = b;
    this.target = null;
    this.state = "build";
    this.goal = { x: b.x, y: b.y };
    this.computePath(world, b.x, b.y);
  }

  // Send a builder to repair a damaged friendly building.
  goRepair(world: WorldApi, b: Building) {
    if (!this.def.canBuild) return;
    this.repairTarget = b;
    this.target = null;
    this.state = "repair";
    this.goal = { x: b.x, y: b.y };
    this.computePath(world, b.x, b.y);
  }

  private computePath(world: WorldApi, wx: number, wy: number) {
    // Aircraft ignore terrain and units — fly straight to the destination.
    if (this.def.flying) {
      this.path = [{ x: wx, y: wy }];
      return;
    }
    const from = world.grid.worldToTile(this.x, this.y);
    const to = world.grid.worldToTile(wx, wy);
    const tilePath = findPath(world.grid, from.tx, from.ty, to.tx, to.ty);
    this.path = tilePath.map((t) => world.grid.tileCenter(t.x, t.y));
    if (this.path.length > 0) {
      this.path[this.path.length - 1] = { x: wx, y: wy };
    }
  }

  update(dt: number, world: WorldApi) {
    if (!this.alive) return;
    this.fireCd -= dt;
    this.repathCd -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;

    if (this.rank > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + VET_REGEN[this.rank] * dt);
    }

    // aircraft with an empty magazine break off to rearm at an Airfield
    if (this.maxAmmo > 0 && this.ammo <= 0 && this.state !== "rearm") {
      this.state = "rearm";
      this.target = null;
      this.path = [];
    }

    switch (this.state) {
      case "idle":
        this.autoAcquire(world);
        break;
      case "moving":
        this.followPath(dt, world);
        break;
      case "attack-move":
        if (!this.autoAcquire(world)) this.followPath(dt, world);
        break;
      case "attacking":
        if (this.def.flying) this.doAirAttack(dt, world);
        else this.doAttack(dt, world);
        break;
      case "gather":
        this.doGather(dt, world);
        break;
      case "return":
        this.doReturn(dt, world);
        break;
      case "build":
        this.doBuild(dt, world);
        break;
      case "repair":
        this.doRepair(dt, world);
        break;
      case "rearm":
        this.doRearm(dt, world);
        break;
    }

    if (!this.def.flying) this.separate(world);
  }

  private autoAcquire(world: WorldApi): boolean {
    if (this.def.damage <= 0) return false;
    const enemy = world.findNearestEnemy(this.x, this.y, this.team, this.def.sight);
    if (enemy) {
      this.target = enemy;
      this.state = "attacking";
      return true;
    }
    return false;
  }

  private doAttack(dt: number, world: WorldApi) {
    const t = this.target;
    if (!t || !t.alive) {
      this.target = null;
      if (this.holdGoal) {
        this.moveTo(world, this.holdGoal.x, this.holdGoal.y, true);
      } else {
        this.state = "idle";
      }
      return;
    }
    const d = dist(this, t);
    const reach = this.def.range + t.radius;
    if (d > reach) {
      this.turretAngle = Math.atan2(t.y - this.y, t.x - this.x);
      if (this.repathCd <= 0) {
        this.computePath(world, t.x, t.y);
        this.repathCd = 0.4;
      }
      this.stepAlongPath(dt, world);
    } else {
      this.path = [];
      this.turretAngle = Math.atan2(t.y - this.y, t.x - this.x);
      if (this.fireCd <= 0) {
        world.spawnProjectile({ x: this.x, y: this.y }, t, this.currentDamage, this.team, this.def.splash, this);
        this.fireCd = 1 / this.def.fireRate;
        this.muzzle = 0.09;
      }
    }
  }

  // Aircraft attack: never stop — close in, then wheel around the target at
  // weapon range firing on each pass until the magazine is dry.
  private doAirAttack(dt: number, world: WorldApi) {
    const t = this.target;
    if (!t || !t.alive) {
      this.target = null;
      this.state = this.ammo > 0 ? "idle" : "rearm";
      return;
    }
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.turretAngle = Math.atan2(dy, dx);
    const range = this.def.range;
    let vx: number;
    let vy: number;
    if (d > range * 0.85) {
      // approach run
      vx = dx / d;
      vy = dy / d;
    } else {
      // bank around the target (tangential) holding roughly weapon range
      const tx = -dy / d;
      const ty = dx / d;
      const radial = d < range * 0.5 ? -0.5 : d > range * 0.78 ? 0.5 : 0;
      vx = tx + (dx / d) * radial;
      vy = ty + (dy / d) * radial;
      const l = Math.hypot(vx, vy) || 1;
      vx /= l;
      vy /= l;
    }
    this.x += vx * this.speed * dt;
    this.y += vy * this.speed * dt;
    this.angle = Math.atan2(vy, vx);
    if (d <= range + t.radius && this.fireCd <= 0 && this.ammo > 0) {
      world.spawnProjectile({ x: this.x, y: this.y }, t, this.currentDamage, this.team, this.def.splash, this);
      this.fireCd = 1 / this.def.fireRate;
      this.muzzle = 0.09;
      this.ammo--;
    }
  }

  // Fly back to the nearest friendly Airfield and reload; then return to duty.
  private doRearm(dt: number, world: WorldApi) {
    if (this.ammo >= this.maxAmmo) {
      this.state = "idle";
      return;
    }
    const pad = world.nearestRearm(this.x, this.y, this.team);
    if (!pad) {
      // no hangar left — slowly self-rearm in the field so it isn't useless
      this.ammo = Math.min(this.maxAmmo, this.ammo + (this.maxAmmo / ((this.def.rearmTime ?? 8) * 3)) * dt);
      return;
    }
    if (dist(this, pad) > pad.radius + this.radius + 4) {
      this.path = [{ x: pad.x, y: pad.y }]; // flying: straight line
      this.stepAlongPath(dt, world);
      return;
    }
    // docked over the hangar: rearm
    this.ammo = Math.min(this.maxAmmo, this.ammo + (this.maxAmmo / (this.def.rearmTime ?? 8)) * dt);
  }

  private doGather(dt: number, world: WorldApi) {
    let field = this.fieldTarget;
    if (!field || field.remaining <= 0) {
      field = world.findNearestSupply(this.x, this.y);
      this.fieldTarget = field;
      if (!field) {
        this.state = "idle";
        return;
      }
      this.computePath(world, field.x, field.y);
    }
    if (dist(this, field) > TILE * 0.9) {
      this.stepAlongPath(dt, world);
      if (this.path.length === 0) this.computePath(world, field.x, field.y);
      return;
    }
    this.gatherTimer += dt;
    if (this.gatherTimer >= GATHER_TIME) {
      this.carrying = field.take((this.def.gatherAmount ?? GATHER_AMOUNT) * this.gatherMult);
      this.gatherTimer = 0;
      this.state = "return";
      this.path = [];
    }
  }

  private doReturn(dt: number, world: WorldApi) {
    const drop = world.nearestDropOff(this.x, this.y, this.team);
    if (!drop) {
      this.state = "idle";
      return;
    }
    if (dist(this, drop) > drop.radius + TILE) {
      if (this.path.length === 0) this.computePath(world, drop.x, drop.y);
      this.stepAlongPath(dt, world);
      return;
    }
    world.addCredits(this.team, this.carrying);
    this.carrying = 0;
    this.state = "gather";
    this.path = [];
  }

  // Walk to a construction site and stay put until the building finishes
  // raising itself. The building advances its own timer (see Building.update),
  // so the harvester is simply occupied for the build duration.
  private doBuild(dt: number, world: WorldApi) {
    const b = this.buildTarget;
    if (!b || !b.alive || !b.constructing) {
      this.buildTarget = null;
      this.resumeWork(world);
      return;
    }
    if (dist(this, b) > b.radius + this.radius + 6) {
      if (this.path.length === 0) this.computePath(world, b.x, b.y);
      this.stepAlongPath(dt, world);
    }
    // once complete, Building.update flips constructing=false and we resume
  }

  // Walk to a damaged friendly building and heal it while adjacent.
  private doRepair(dt: number, world: WorldApi) {
    const b = this.repairTarget;
    if (!b || !b.alive || b.hp >= b.maxHp) {
      this.repairTarget = null;
      this.resumeWork(world);
      return;
    }
    if (dist(this, b) > b.radius + this.radius + 6) {
      if (this.path.length === 0) this.computePath(world, b.x, b.y);
      this.stepAlongPath(dt, world);
      return;
    }
    b.hp = Math.min(b.maxHp, b.hp + HARVESTER_REPAIR_RATE * dt);
    world.onRepairTick(b);
  }

  // After building/repairing, go back to gathering if we can, else idle.
  private resumeWork(world: WorldApi) {
    this.path = [];
    if (this.def.canGather) {
      const f = world.findNearestSupply(this.x, this.y);
      if (f) {
        this.gather(world, f);
        return;
      }
    }
    this.state = "idle";
  }

  private followPath(dt: number, world: WorldApi) {
    if (this.path.length === 0) {
      this.state = "idle";
      return;
    }
    this.stepAlongPath(dt, world);
    if (this.path.length === 0) {
      this.state = "idle";
    } else {
      this.trackStuck(dt, world);
    }
  }

  // Detects when a unit has stopped making progress (usually blocked by
  // friendly units at a crowded destination) and either repaths or accepts
  // its current spot so it stops shoving.
  private trackStuck(dt: number, world: WorldApi) {
    this.progressCd -= dt;
    if (this.progressCd > 0) return;
    this.progressCd = 0.5;
    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x;
    this.lastY = this.y;
    if (moved < this.speed * 0.5 * 0.3) {
      this.stuckTime += 0.5;
    } else {
      this.stuckTime = 0;
    }
    if (this.stuckTime >= 1.5) {
      this.stuckTime = 0;
      const g = this.goal;
      const distToGoal = g ? Math.hypot(this.x - g.x, this.y - g.y) : Infinity;
      if (distToGoal < TILE * 2.2) {
        // close enough — give up the exact spot instead of pushing forever
        this.path = [];
        this.state = "idle";
      } else if (g) {
        this.computePath(world, g.x, g.y);
      }
    }
  }

  private stepAlongPath(dt: number, world: WorldApi) {
    // advance past waypoints we're already near (bigger tolerance on the last)
    while (this.path.length > 0) {
      const wp = this.path[0];
      const dd = Math.hypot(wp.x - this.x, wp.y - this.y);
      const arrive = this.path.length === 1 ? this.radius + 8 : this.radius + 2;
      if (dd <= arrive) this.path.shift();
      else break;
    }
    if (this.path.length === 0) return;

    const wp = this.path[0];
    let vx = wp.x - this.x;
    let vy = wp.y - this.y;
    const d = Math.hypot(vx, vy) || 1;
    vx /= d;
    vy /= d; // seek direction (unit vector)

    // blend in local avoidance so units flow around each other (aircraft don't)
    if (!this.def.flying) {
      const av = this.avoidance(world);
      vx += av.x;
      vy += av.y;
      const vl = Math.hypot(vx, vy) || 1;
      vx /= vl;
      vy /= vl;
    }

    const step = this.speed * dt;
    this.x += vx * step;
    this.y += vy * step;
    this.angle = Math.atan2(vy, vx);
    this.turretAngle = this.angle;
  }

  // Repulsion from nearby units plus a consistent tangential nudge, which
  // breaks head-on deadlocks by making both units veer to opposite sides.
  private avoidance(world: WorldApi): Vec {
    let ax = 0;
    let ay = 0;
    for (const o of world.units) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const rad = this.radius + o.radius + 16;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 0 || d2 >= rad * rad) continue;
      const d = Math.sqrt(d2);
      const w = (rad - d) / rad; // 0 far .. 1 touching
      const nx = dx / d;
      const ny = dy / d;
      ax += nx * w + -ny * w * 0.6; // push away + swirl tangentially
      ay += ny * w + nx * w * 0.6;
    }
    return { x: ax * 1.3, y: ay * 1.3 };
  }

  private separate(world: WorldApi) {
    for (const o of world.units) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const minD = this.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < minD * minD) {
        const d = Math.sqrt(d2);
        const push = (minD - d) / 2;
        this.x += (dx / d) * push;
        this.y += (dy / d) * push;
      }
    }
  }
}

export class Building {
  id = NEXT_ID++;
  def: BuildingDef;
  hp: number;
  alive = true;
  x: number; // center px
  y: number;
  radius: number;
  selected = false;
  powered = true; // set each tick by the game's power calculation

  queue: { kind: UnitKind; timeLeft: number; total: number }[] = [];
  rally: Vec;
  aimAngle = -Math.PI / 2; // turret facing (default: up)
  muzzle = 0; // >0 briefly after the turret fires (muzzle flash)
  private fireCd = 0;

  // construction: while `constructing`, the building is inert (no power, no
  // production, no weapon) and rises from 0 to full over its build time.
  constructing = false;
  buildProgress = 1; // 0..1

  constructor(public team: Team, public kind: BuildingKind, public tileX: number, public tileY: number) {
    this.def = BUILDINGS[kind];
    this.hp = this.def.maxHp;
    this.x = (tileX + this.def.tilesW / 2) * TILE;
    this.y = (tileY + this.def.tilesH / 2) * TILE;
    this.radius = (Math.max(this.def.tilesW, this.def.tilesH) * TILE) / 2;
    this.rally = { x: this.x, y: this.y + this.radius + TILE };
  }

  // Put the building into "under construction" state (called on player placement).
  beginConstruction() {
    this.constructing = true;
    this.buildProgress = 0;
    this.hp = Math.max(1, Math.round(this.def.maxHp * 0.1));
  }

  get maxHp() {
    return this.def.maxHp;
  }

  get functional(): boolean {
    return this.alive && !this.constructing && (!this.def.needsPower || this.powered);
  }

  takeDamage(amount: number) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  enqueue(kind: UnitKind, buildTime: number) {
    this.queue.push({ kind, timeLeft: buildTime, total: buildTime });
  }

  // Advances production and fires turret weapon.
  // Returns a finished unit kind to spawn, or null.
  update(dt: number, world: WorldApi): UnitKind | null {
    // rise from the ground while under construction — inert until finished
    if (this.constructing) {
      this.buildProgress += dt / (this.def.buildTime * BUILD_TIME_MULT);
      this.hp = Math.min(this.maxHp, this.maxHp * (0.1 + 0.9 * this.buildProgress));
      if (this.buildProgress >= 1) {
        this.buildProgress = 1;
        this.constructing = false;
        this.hp = this.maxHp;
        world.onBuildingComplete(this);
      }
      return null;
    }

    // turret weapon
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.def.damage > 0 && this.functional) {
      this.fireCd -= dt;
      const enemy = world.findNearestEnemy(this.x, this.y, this.team, this.def.range);
      if (enemy) {
        this.aimAngle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
        if (this.fireCd <= 0) {
          const muzzle = {
            x: this.x + Math.cos(this.aimAngle) * this.radius,
            y: this.y + Math.sin(this.aimAngle) * this.radius,
          };
          world.spawnProjectile(muzzle, enemy, this.def.damage, this.team, 0, null);
          this.fireCd = 1 / this.def.fireRate;
          this.muzzle = 0.09;
        }
      }
    }

    if (this.queue.length === 0) return null;
    if (this.def.needsPower && !this.powered) return null; // stalled, no power
    const head = this.queue[0];
    head.timeLeft -= dt;
    if (head.timeLeft <= 0) {
      this.queue.shift();
      return head.kind;
    }
    return null;
  }
}

export class SupplyField {
  id = NEXT_ID++;
  x: number;
  y: number;
  radius = TILE * 0.9;
  remaining: number;
  readonly initial: number;

  constructor(public tileX: number, public tileY: number, amount: number) {
    this.x = (tileX + 0.5) * TILE;
    this.y = (tileY + 0.5) * TILE;
    this.remaining = amount;
    this.initial = amount;
  }

  get alive() {
    return this.remaining > 0;
  }

  take(amount: number): number {
    const taken = Math.min(amount, this.remaining);
    this.remaining -= taken;
    return taken;
  }
}

export class Projectile {
  x: number;
  y: number;
  alive = true;
  private speed = 480;

  constructor(
    from: Vec,
    public target: Target,
    public damage: number,
    public team: Team,
    public splash: number,
    public owner: Unit | null,
  ) {
    this.x = from.x;
    this.y = from.y;
  }

  update(dt: number, world: WorldApi) {
    if (!this.target.alive) {
      this.alive = false;
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step + this.target.radius) {
      this.impact(world);
      this.alive = false;
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
  }

  private impact(world: WorldApi) {
    const ix = this.target.x;
    const iy = this.target.y;
    if (this.team !== this.target.team) world.reportAttack(ix, iy, this.team);
    if (this.splash <= 0) {
      const wasAlive = this.target.alive;
      this.target.takeDamage(this.damage);
      if (wasAlive && !this.target.alive && this.owner && this.owner.alive) this.owner.addKill();
      world.effects.hit(ix, iy);
      return;
    }
    world.effects.explosion(ix, iy, 1.1);
    world.audio.explosion(0.4);
    const r2 = this.splash * this.splash;
    let kills = 0;
    for (const u of world.units) {
      if (!u.alive || u.team === this.team) continue;
      const dx = u.x - ix;
      const dy = u.y - iy;
      if (dx * dx + dy * dy <= r2) {
        const wasAlive = u.alive;
        u.takeDamage(this.damage);
        if (wasAlive && !u.alive) kills++;
      }
    }
    if (this.owner && this.owner.alive) for (let i = 0; i < kills; i++) this.owner.addKill();
    for (const b of world.buildings) {
      if (!b.alive || b.team === this.team) continue;
      const dx = b.x - ix;
      const dy = b.y - iy;
      if (dx * dx + dy * dy <= r2) b.takeDamage(this.damage * 0.6);
    }
  }
}
