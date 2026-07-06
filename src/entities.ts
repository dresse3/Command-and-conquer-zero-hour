import {
  UNITS,
  BUILDINGS,
  TILE,
  GATHER_AMOUNT,
  GATHER_TIME,
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

type UnitState = "idle" | "moving" | "attack-move" | "attacking" | "gather" | "return";

export class Unit {
  id = NEXT_ID++;
  def: UnitDef;
  hp: number;
  radius: number;
  selected = false;
  alive = true;

  x: number;
  y: number;
  angle = 0;

  state: UnitState = "idle";
  path: Vec[] = [];
  target: Target | null = null;
  holdGoal: Vec | null = null; // where an attack-move is headed

  private fireCd = 0;
  private repathCd = 0;

  // harvester economy
  carrying = 0;
  gatherTimer = 0;
  fieldTarget: SupplyField | null = null;

  constructor(public team: Team, public kind: UnitKind, x: number, y: number) {
    this.def = UNITS[kind];
    this.hp = this.def.maxHp;
    this.radius = this.def.radius;
    this.x = x;
    this.y = y;
  }

  get maxHp() {
    return this.def.maxHp;
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

  private computePath(world: WorldApi, wx: number, wy: number) {
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
        this.doAttack(dt, world);
        break;
      case "gather":
        this.doGather(dt, world);
        break;
      case "return":
        this.doReturn(dt, world);
        break;
    }

    this.separate(world);
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
      this.face(t);
      if (this.repathCd <= 0) {
        this.computePath(world, t.x, t.y);
        this.repathCd = 0.4;
      }
      this.stepAlongPath(dt);
    } else {
      this.path = [];
      this.face(t);
      if (this.fireCd <= 0) {
        world.spawnProjectile({ x: this.x, y: this.y }, t, this.def.damage, this.team, this.def.splash);
        this.fireCd = 1 / this.def.fireRate;
      }
    }
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
      this.stepAlongPath(dt);
      if (this.path.length === 0) this.computePath(world, field.x, field.y);
      return;
    }
    this.gatherTimer += dt;
    if (this.gatherTimer >= GATHER_TIME) {
      this.carrying = field.take(GATHER_AMOUNT);
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
      this.stepAlongPath(dt);
      return;
    }
    world.addCredits(this.team, this.carrying);
    this.carrying = 0;
    this.state = "gather";
    this.path = [];
  }

  private followPath(dt: number, _world: WorldApi) {
    this.stepAlongPath(dt);
    if (this.path.length === 0) this.state = "idle";
  }

  private stepAlongPath(dt: number) {
    if (this.path.length === 0) return;
    const wp = this.path[0];
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.def.speed * dt;
    if (d <= step) {
      this.x = wp.x;
      this.y = wp.y;
      this.path.shift();
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      this.angle = Math.atan2(dy, dx);
    }
  }

  private face(t: Vec) {
    this.angle = Math.atan2(t.y - this.y, t.x - this.x);
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
  private fireCd = 0;

  constructor(public team: Team, public kind: BuildingKind, public tileX: number, public tileY: number) {
    this.def = BUILDINGS[kind];
    this.hp = this.def.maxHp;
    this.x = (tileX + this.def.tilesW / 2) * TILE;
    this.y = (tileY + this.def.tilesH / 2) * TILE;
    this.radius = (Math.max(this.def.tilesW, this.def.tilesH) * TILE) / 2;
    this.rally = { x: this.x, y: this.y + this.radius + TILE };
  }

  get maxHp() {
    return this.def.maxHp;
  }

  get functional(): boolean {
    return this.alive && (!this.def.needsPower || this.powered);
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
    // turret weapon
    if (this.def.damage > 0 && this.functional) {
      this.fireCd -= dt;
      const enemy = world.findNearestEnemy(this.x, this.y, this.team, this.def.range);
      if (enemy && this.fireCd <= 0) {
        world.spawnProjectile({ x: this.x, y: this.y - this.radius }, enemy, this.def.damage, this.team, 0);
        this.fireCd = 1 / this.def.fireRate;
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

  constructor(public tileX: number, public tileY: number, amount: number) {
    this.x = (tileX + 0.5) * TILE;
    this.y = (tileY + 0.5) * TILE;
    this.remaining = amount;
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
    if (this.splash <= 0) {
      this.target.takeDamage(this.damage);
      return;
    }
    const r2 = this.splash * this.splash;
    for (const u of world.units) {
      if (!u.alive || u.team === this.team) continue;
      const dx = u.x - this.target.x;
      const dy = u.y - this.target.y;
      if (dx * dx + dy * dy <= r2) u.takeDamage(this.damage);
    }
    for (const b of world.buildings) {
      if (!b.alive || b.team === this.team) continue;
      const dx = b.x - this.target.x;
      const dy = b.y - this.target.y;
      if (dx * dx + dy * dy <= r2) b.takeDamage(this.damage * 0.6);
    }
  }
}
