import { UNITS, type UnitKind } from "./config";
import type { Building, Unit } from "./entities";
import type { Game } from "./game";

// A deliberately simple opponent: keeps harvesters working, builds an army from
// its barracks and war factory, and periodically attack-moves it at the player.
export class EnemyAI {
  private buildCd = 2;
  private attackCd = 28;

  constructor(private game: Game) {}

  private prod(kind: "barracks" | "factory"): Building | null {
    return this.game.buildings.find((b) => b.team === "enemy" && b.kind === kind && b.alive) ?? null;
  }

  update(dt: number) {
    const base = this.game.baseOf("enemy");
    if (!base) return;
    this.buildCd -= dt;
    this.attackCd -= dt;

    const mine = this.game.units.filter((u) => u.team === "enemy" && u.alive);
    const harvesters = mine.filter((u) => u.def.canGather).length;
    const factory = this.prod("factory");
    const barracks = this.prod("barracks");

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

    if (this.attackCd <= 0) {
      this.attackCd = 32;
      const army = mine.filter((u) => u.def.damage > 0);
      const target = this.game.playerBase();
      if (army.length >= 5 && target) {
        for (const u of army) {
          u.moveTo(
            this.game,
            target.x + (Math.random() - 0.5) * 140,
            target.y + (Math.random() - 0.5) * 140,
            true,
          );
        }
      }
    }
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
