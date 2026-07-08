import type { Team } from "./config";
import type { Grid } from "./grid";
import type { Unit, Building, SupplyField } from "./entities";
import type { ParticleSystem } from "./effects";
import type { Sfx } from "./audio";

export interface Vec {
  x: number;
  y: number;
}

// Interface the entities use to talk back to the game world,
// keeping entities.ts free of a hard dependency on Game.
export interface WorldApi {
  grid: Grid;
  units: Unit[];
  buildings: Building[];
  supplyFields: SupplyField[];
  effects: ParticleSystem;
  audio: Sfx;
  spawnProjectile(from: Vec, target: Unit | Building, damage: number, team: Team, splash: number, owner: Unit | null): void;
  findNearestEnemy(x: number, y: number, team: Team, withinSight: number): Unit | Building | null;
  findNearestSupply(x: number, y: number): SupplyField | null;
  nearestDropOff(x: number, y: number, team: Team): Building | null;
  nearestRearm(x: number, y: number, team: Team): Building | null; // friendly Airfield
  addCredits(team: Team, amount: number): void;
  damageArea(x: number, y: number, radius: number, amount: number, casterTeam: Team): void;
  spawnUnitAt(team: Team, kind: import("./config").UnitKind, x: number, y: number): void;
  shake(mag: number): void;
  onBuildingComplete(b: Building): void; // a structure finished construction
  onRepairTick(b: Building): void; // a building was repaired this frame
  reportAttack(x: number, y: number, attackerTeam: Team): void; // trigger alarms
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
