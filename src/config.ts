// Central balance & content definitions.
// Original factions and units — inspired by, but not copied from, C&C: Zero Hour.

export const TILE = 40; // pixel size of one map tile at zoom 1
export const MAP_W = 60; // tiles
export const MAP_H = 60; // tiles

export type Team = "player" | "enemy";

export type UnitKind = "ranger" | "raptor" | "harvester";
export type BuildingKind = "command" | "supply";

export interface UnitDef {
  kind: UnitKind;
  name: string;
  cost: number;
  buildTime: number; // seconds
  maxHp: number;
  speed: number; // pixels / second
  radius: number; // collision / draw radius in pixels
  sight: number; // pixels
  // combat (harvester has no weapon -> damage 0)
  range: number; // pixels
  damage: number;
  fireRate: number; // shots / second
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
    canGather: true,
  },
};

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  cost: number;
  maxHp: number;
  tilesW: number;
  tilesH: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  command: {
    kind: "command",
    name: "Command Center",
    cost: 0,
    maxHp: 3000,
    tilesW: 3,
    tilesH: 3,
  },
  supply: {
    kind: "supply",
    name: "Supply Depot",
    cost: 0,
    maxHp: 1200,
    tilesW: 2,
    tilesH: 2,
  },
};

// Harvester economy
export const GATHER_AMOUNT = 100; // credits per trip
export const GATHER_TIME = 3.5; // seconds to fill up at a supply field
export const SUPPLY_FIELD_START = 4000; // credits available in a field

export const START_CREDITS = 1200;

export const COLORS = {
  player: "#3da9fc",
  playerDark: "#1b6fb0",
  enemy: "#ef4565",
  enemyDark: "#a51d38",
  grass: "#3b4a2f",
  grassAlt: "#42522f",
  dirt: "#5a4a34",
  supply: "#e6c34a",
  rock: "#4a4a52",
};
