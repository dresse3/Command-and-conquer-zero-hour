import { UNITS, type UnitKind } from "./config";
import type { Building, Unit } from "./entities";
import type { Game } from "./game";

// A pragmatic opponent: keeps harvesters working, builds an army, defends its
// base when threatened, rebuilds power, adds turrets, and uses its artillery
// power on the player.
export class EnemyAI {
  private buildCd = 2;
  private attackCd = 28;
  private economyCd = 6;
  private powerCd = 12;

  constructor(private game: Game) {}

  private prod(kind: "barracks" | "factory"): Building | null {
    return this.game.buildings.find((b) => b.team === "enemy" && b.kind === kind && b.alive) ?? null;
  }

  private count(kind: string): number {
    return this.game.buildings.filter((b) => b.team === "enemy" && b.kind === kind && b.alive).length;
  }

  update(dt: number) {
    const base = this.game.baseOf("enemy");
    if (!base) return;
    this.buildCd -= dt;
    this.attackCd -= dt;
    this.economyCd -= dt;
    this.powerCd -= dt;

    const mine = this.game.units.filter((u) => u.team === "enemy" && u.alive);
    const harvesters = mine.filter((u) => u.def.canGather).length;
    const factory = this.prod("factory");
    const barracks = this.prod("barracks");
    const army = mine.filter((u) => u.def.damage > 0);

    // --- economy / base upkeep (rebuild power, add turrets) ---
    if (this.economyCd <= 0) {
      this.economyCd = 5;
      if (this.game.power["enemy"] < 0) {
        this.game.tryAiBuild("enemy", "power");
      } else if (this.count("turret") < 2 && Math.random() < 0.5) {
        this.game.tryAiBuild("enemy", "turret");
      }
    }

    // --- production ---
    if (this.buildCd <= 0) {
      this.buildCd = 3;
      const credits = this.game.credits["enemy"];
      if (harvesters < 2 && factory && factory.functional && factory.queue.length === 0) {
        this.tryQueue(factory, "harvester", credits);
      } else if (factory && factory.functional && factory.queue.length < 2 && Math.random() < 0.5) {
        this.tryQueue(factory, Math.random() < 0.35 ? "artillery" : "raptor", credits);
      } else if (barracks && barracks.functional && barracks.queue.length < 2) {
        this.tryQueue(barracks, Math.random() < 0.4 ? "rocketeer" : "ranger", credits);
      }
    }

    // --- defend: pull the army home if the player pushes into our base ---
    const threat = this.nearestPlayerThreat(base, 620);
    if (threat) {
      for (const u of army) {
        const d = Math.hypot(u.x - base.x, u.y - base.y);
        if (d > 260) u.moveTo(this.game, base.rally.x + (Math.random() - 0.5) * 80, base.rally.y, true);
      }
    } else if (this.attackCd <= 0) {
      // --- attack in waves ---
      this.attackCd = 32;
      const target = this.game.playerBase();
      if (army.length >= 5 && target) {
        for (const u of army) {
          u.moveTo(this.game, target.x + (Math.random() - 0.5) * 150, target.y + (Math.random() - 0.5) * 150, true);
        }
      }
    }

    // --- superweapon: artillery on the player ---
    if (this.powerCd <= 0 && this.game.enemyPowers.canFire("artillery")) {
      this.powerCd = 8;
      const tgt = this.bestArtilleryTarget();
      if (tgt) this.game.enemyPowers.fire("artillery", tgt.x, tgt.y, this.game, "enemy");
    }
  }

  private nearestPlayerThreat(base: Building, range: number): Unit | null {
    let best: Unit | null = null;
    let bestD = range * range;
    for (const u of this.game.units) {
      if (!u.alive || u.team !== "player" || u.def.damage <= 0) continue;
      const d = (u.x - base.x) ** 2 + (u.y - base.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  // aim at the densest cluster of player combat units, else the player base
  private bestArtilleryTarget(): { x: number; y: number } | null {
    const players = this.game.units.filter((u) => u.alive && u.team === "player" && u.def.damage > 0);
    if (players.length >= 4) {
      let best = players[0];
      let bestCount = 0;
      for (const c of players) {
        let n = 0;
        for (const o of players) if ((c.x - o.x) ** 2 + (c.y - o.y) ** 2 < 160 * 160) n++;
        if (n > bestCount) {
          bestCount = n;
          best = c;
        }
      }
      if (bestCount >= 3) return { x: best.x, y: best.y };
    }
    const pb = this.game.playerBase();
    return pb ? { x: pb.x, y: pb.y } : null;
  }

  private tryQueue(b: Building, kind: UnitKind, credits: number) {
    const def = UNITS[kind];
    if (credits < def.cost) return;
    this.game.credits["enemy"] -= def.cost;
    b.enqueue(kind, def.buildTime);
  }

  guard(newUnit: Unit) {
    const base = this.game.baseOf("enemy");
    if (!base || newUnit.def.canGather) return;
    newUnit.moveTo(this.game, base.rally.x, base.rally.y, true);
  }
}
