// Central balance & content definitions.
// Original factions and units — inspired by, but not copied from, C&C: Zero Hour.

export const TILE = 40; // pixel size of one map tile at zoom 1
export const MAP_W = 60; // tiles
export const MAP_H = 60; // tiles

export type Team = "player" | "enemy";

export type UnitKind =
  | "ranger"
  | "rocketeer"
  | "raptor"
  | "artillery"
  | "harvester"
  | "marksman"
  | "overlord"
  | "technical";
export type BuildingKind = "command" | "power" | "barracks" | "factory" | "supply" | "turret";

export interface UnitDef {
  kind: UnitKind;
  name: string;
  cost: number;
  buildTime: number; // seconds
  maxHp: number;
  speed: number; // pixels / second
  radius: number; // collision / draw radius in pixels
  sight: number; // pixels
  range: number; // pixels (0 = no weapon)
  damage: number;
  fireRate: number; // shots / second
  splash: number; // splash radius in px (0 = single target)
  canGather: boolean;
}

export const UNITS: Record<UnitKind, UnitDef> = {
  ranger: {
    kind: "ranger",
    name: "Ranger",
    cost: 150,
    buildTime: 4,
    maxHp: 120,
    speed: 85,
    radius: 9,
    sight: 260,
    range: 150,
    damage: 14,
    fireRate: 1.6,
    splash: 0,
    canGather: false,
  },
  rocketeer: {
    kind: "rocketeer",
    name: "Rocketeer",
    cost: 250,
    buildTime: 6,
    maxHp: 100,
    speed: 78,
    radius: 9,
    sight: 300,
    range: 210,
    damage: 55,
    fireRate: 0.7,
    splash: 0,
    canGather: false,
  },
  raptor: {
    kind: "raptor",
    name: "Raptor Tank",
    cost: 700,
    buildTime: 9,
    maxHp: 420,
    speed: 65,
    radius: 14,
    sight: 300,
    range: 190,
    damage: 45,
    fireRate: 0.9,
    splash: 0,
    canGather: false,
  },
  artillery: {
    kind: "artillery",
    name: "Artillery",
    cost: 900,
    buildTime: 12,
    maxHp: 260,
    speed: 45,
    radius: 13,
    sight: 340,
    range: 320,
    damage: 70,
    fireRate: 0.35,
    splash: 55,
    canGather: false,
  },
  harvester: {
    kind: "harvester",
    name: "Harvester",
    cost: 600,
    buildTime: 8,
    maxHp: 300,
    speed: 55,
    radius: 13,
    sight: 200,
    range: 0,
    damage: 0,
    fireRate: 0,
    splash: 0,
    canGather: true,
  },
  // ---- faction signature units ----
  marksman: {
    kind: "marksman",
    name: "Marksman",
    cost: 350,
    buildTime: 7,
    maxHp: 90,
    speed: 80,
    radius: 9,
    sight: 340,
    range: 300,
    damage: 65,
    fireRate: 0.9,
    splash: 0,
    canGather: false,
  },
  overlord: {
    kind: "overlord",
    name: "Overlord Tank",
    cost: 1400,
    buildTime: 16,
    maxHp: 900,
    speed: 40,
    radius: 18,
    sight: 320,
    range: 200,
    damage: 80,
    fireRate: 0.8,
    splash: 12,
    canGather: false,
  },
  technical: {
    kind: "technical",
    name: "Technical",
    cost: 250,
    buildTime: 4,
    maxHp: 150,
    speed: 130,
    radius: 12,
    sight: 300,
    range: 150,
    damage: 22,
    fireRate: 1.8,
    splash: 0,
    canGather: false,
  },
};

export type UpgradeKind = "weapons" | "armor" | "supply" | "reactors";

export interface BuildEntry {
  type: "unit" | "building" | "upgrade";
  key: UnitKind | BuildingKind | UpgradeKind;
  hotkey: string;
}

export interface UpgradeDef {
  kind: UpgradeKind;
  name: string;
  cost: number;
  building: BuildingKind;
  hotkey: string;
  blurb: string;
}

export const UPGRADES: Record<UpgradeKind, UpgradeDef> = {
  weapons: { kind: "weapons", name: "Weapons Upgrade", cost: 800, building: "barracks", hotkey: "G", blurb: "+20% damage" },
  armor: { kind: "armor", name: "Composite Armor", cost: 1000, building: "factory", hotkey: "J", blurb: "+25% HP" },
  supply: { kind: "supply", name: "Supply Lines", cost: 600, building: "supply", hotkey: "U", blurb: "+50% income" },
  reactors: { kind: "reactors", name: "Overcharged Reactors", cost: 500, building: "power", hotkey: "P", blurb: "+50% power" },
};

// upgrade effect magnitudes
export const UPG_WEAPONS_DMG = 1.2;
export const UPG_ARMOR_HP = 1.25;
export const UPG_SUPPLY_GATHER = 1.5;
export const UPG_REACTOR_POWER = 1.5;

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  cost: number;
  maxHp: number;
  tilesW: number;
  tilesH: number;
  powerProvided: number; // positive adds to grid
  powerUsed: number; // draws from grid
  needsPower: boolean; // stops working when grid power < 0
  isDropoff: boolean; // harvesters can unload here
  // turret weapon (0 damage = no weapon)
  range: number;
  damage: number;
  fireRate: number;
  produces: BuildEntry[];
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  command: {
    kind: "command",
    name: "Command Center",
    cost: 2000,
    maxHp: 3000,
    tilesW: 3,
    tilesH: 3,
    powerProvided: 40,
    powerUsed: 0,
    needsPower: false,
    isDropoff: true,
    range: 0,
    damage: 0,
    fireRate: 0,
    produces: [
      { type: "unit", key: "harvester", hotkey: "H" },
      { type: "building", key: "power", hotkey: "1" },
      { type: "building", key: "barracks", hotkey: "2" },
      { type: "building", key: "factory", hotkey: "3" },
      { type: "building", key: "supply", hotkey: "4" },
      { type: "building", key: "turret", hotkey: "5" },
    ],
  },
  power: {
    kind: "power",
    name: "Power Plant",
    cost: 300,
    maxHp: 800,
    tilesW: 2,
    tilesH: 2,
    powerProvided: 100,
    powerUsed: 0,
    needsPower: false,
    isDropoff: false,
    range: 0,
    damage: 0,
    fireRate: 0,
    produces: [],
  },
  barracks: {
    kind: "barracks",
    name: "Barracks",
    cost: 400,
    maxHp: 1000,
    tilesW: 2,
    tilesH: 2,
    powerProvided: 0,
    powerUsed: 25,
    needsPower: true,
    isDropoff: false,
    range: 0,
    damage: 0,
    fireRate: 0,
    produces: [
      { type: "unit", key: "ranger", hotkey: "R" },
      { type: "unit", key: "rocketeer", hotkey: "E" },
    ],
  },
  factory: {
    kind: "factory",
    name: "War Factory",
    cost: 800,
    maxHp: 1400,
    tilesW: 3,
    tilesH: 3,
    powerProvided: 0,
    powerUsed: 50,
    needsPower: true,
    isDropoff: false,
    range: 0,
    damage: 0,
    fireRate: 0,
    produces: [
      { type: "unit", key: "raptor", hotkey: "T" },
      { type: "unit", key: "artillery", hotkey: "Y" },
      { type: "unit", key: "harvester", hotkey: "H" },
    ],
  },
  supply: {
    kind: "supply",
    name: "Supply Depot",
    cost: 300,
    maxHp: 1200,
    tilesW: 2,
    tilesH: 2,
    powerProvided: 0,
    powerUsed: 0,
    needsPower: false,
    isDropoff: true,
    range: 0,
    damage: 0,
    fireRate: 0,
    produces: [],
  },
  turret: {
    kind: "turret",
    name: "Gun Turret",
    cost: 500,
    maxHp: 900,
    tilesW: 1,
    tilesH: 1,
    powerProvided: 0,
    powerUsed: 25,
    needsPower: true,
    isDropoff: false,
    range: 240,
    damage: 30,
    fireRate: 1.4,
    produces: [],
  },
};

// Harvester economy
export const GATHER_AMOUNT = 100; // credits per trip
export const GATHER_TIME = 3.5; // seconds to fill up at a supply field
export const SUPPLY_FIELD_START = 4000; // credits available in a field
export const BUILD_RADIUS = TILE * 7; // how far from own buildings you may place

export const START_CREDITS = 2000;

// Veterancy: index 0 rookie, 1 veteran, 2 elite
export const VET_KILLS = [2, 5]; // kills needed to reach veteran, then elite
export const VET_DAMAGE = [1, 1.25, 1.55];
export const VET_HP = [1, 1.25, 1.5];
export const VET_REGEN = [0, 5, 11]; // hp per second (0 = no regen)

// General Powers / superweapons
export type PowerKind = "artillery" | "airstrike" | "reinforce";

export interface PowerDef {
  kind: PowerKind;
  name: string;
  hotkey: string;
  cooldown: number; // seconds to recharge
  startCharge: number; // seconds already charged at game start
}

export const POWERS: Record<PowerKind, PowerDef> = {
  artillery: { kind: "artillery", name: "Artillery Barrage", hotkey: "Z", cooldown: 50, startCharge: 25 },
  airstrike: { kind: "airstrike", name: "Airstrike", hotkey: "X", cooldown: 65, startCharge: 20 },
  reinforce: { kind: "reinforce", name: "Reinforcements", hotkey: "C", cooldown: 80, startCharge: 30 },
};

export const POWER_ORDER: PowerKind[] = ["artillery", "airstrike", "reinforce"];

// Promotion: earn XP by destroying enemy units/buildings; each threshold grants
// one promotion point, spent to unlock a general power. Powers are NOT free.
export const POWER_POINT_COST: Record<PowerKind, number> = { artillery: 1, airstrike: 2, reinforce: 1 };
export const PROMO_THRESHOLDS = [120, 320, 640, 1100, 1700]; // cumulative XP per point

// Refund fraction when selling a building
export const SELL_REFUND = 0.5;

// ---- Factions (asymmetric sides, inspired by Zero Hour's generals) ----
export interface FactionDef {
  id: string;
  name: string;
  blurb: string;
  color: string; // menu accent
  costMult: number; // unit cost
  buildCostMult: number; // building cost
  hpMult: number;
  speedMult: number;
  damageMult: number;
  powerChargeMult: number; // <1 = powers recharge faster
  artilleryBonus: number; // extra artillery strikes
  artilleryDamageMult: number;
  reinforceBonus: number; // extra reinforcement units
  noPower: boolean; // structures work without a power grid
  signature?: { building: BuildingKind; unit: UnitKind; hotkey: string };
  trait: string;
}

export const FACTIONS: FactionDef[] = [
  {
    id: "coalition",
    name: "Vanguard Coalition",
    blurb: "Balanced high-tech force",
    color: "#3da9fc",
    costMult: 1,
    buildCostMult: 1,
    hpMult: 1,
    speedMult: 1,
    damageMult: 1,
    powerChargeMult: 0.8,
    artilleryBonus: 0,
    artilleryDamageMult: 1,
    reinforceBonus: 0,
    noPower: false,
    signature: { building: "barracks", unit: "marksman", hotkey: "M" },
    trait: "Marksman snipers; general powers recharge 20% faster.",
  },
  {
    id: "legion",
    name: "Iron Legion",
    blurb: "Heavy armor & massed numbers",
    color: "#ef8c3d",
    costMult: 0.85,
    buildCostMult: 0.9,
    hpMult: 1.25,
    speedMult: 0.9,
    damageMult: 1,
    powerChargeMult: 1.1,
    artilleryBonus: 3,
    artilleryDamageMult: 1.3,
    reinforceBonus: 0,
    noPower: false,
    signature: { building: "factory", unit: "overlord", hotkey: "O" },
    trait: "Overlord super-heavy tanks; tougher, cheaper units; brutal artillery.",
  },
  {
    id: "wolves",
    name: "Desert Wolves",
    blurb: "Cheap, fast guerrillas",
    color: "#7ec46b",
    costMult: 0.7,
    buildCostMult: 0.85,
    hpMult: 0.8,
    speedMult: 1.2,
    damageMult: 0.95,
    powerChargeMult: 1,
    artilleryBonus: 0,
    artilleryDamageMult: 1,
    reinforceBonus: 2,
    noPower: true,
    signature: { building: "factory", unit: "technical", hotkey: "V" },
    trait: "Fast Technicals; structures need no power; larger reinforcements.",
  },
];

export function factionById(id: string): FactionDef {
  return FACTIONS.find((f) => f.id === id) ?? FACTIONS[0];
}

export const COLORS = {
  player: "#3da9fc",
  playerDark: "#1b6fb0",
  enemy: "#ef4565",
  enemyDark: "#a51d38",
  // desert palette (keys kept for compatibility)
  grass: "#c9a96a", // sand
  grassAlt: "#bd9c58", // sand alt
  dirt: "#a37f47", // dirt track
  supply: "#e6c34a",
  rock: "#6d5d45", // rocky outcrop
};
