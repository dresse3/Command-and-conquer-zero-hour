import { UNITS } from "./config";
import type { Building, Unit } from "./entities";
import type { WorldApi } from "./types";

// A deliberately simple opponent: keeps a harvester working, builds an army,
// and periodically attack-moves it toward the player's base.
export class EnemyAI {
  private buildCd = 2;
  private attackCd = 25;

  constructor(private world: WorldApi & { credits: Record<string, number>; playerBase(): Building | null }) {}

  update(dt: number, myBase: Building | null) {
    if (!myBase) return;
    this.buildCd -= dt;
    this.attackCd -= dt;

    const myUnits = this.world.units.filter((u) => u.team === "enemy" && u.alive);
    const harvesters = myUnits.filter((u) => u.def.canGather).length;

    if (this.buildCd <= 0) {
      this.buildCd = 3;
      const credits = this.world.credits["enemy"];
      // keep two harvesters running, otherwise build army
      if (harvesters < 2 && credits >= UNITS.harvester.cost && myBase.queue.length === 0) {
        this.world.credits["enemy"] -= UNITS.harvester.cost;
        myBase.enqueue("harvester", UNITS.harvester.buildTime);
      } else if (myBase.queue.length < 2) {
        const wantTank = Math.random() < 0.4;
        const kind = wantTank ? "raptor" : "ranger";
        const cost = UNITS[kind].cost;
        if (credits >= cost) {
          this.world.credits["enemy"] -= cost;
          myBase.enqueue(kind, UNITS[kind].buildTime);
        }
      }
    }

    if (this.attackCd <= 0) {
      this.attackCd = 30;
      const army = myUnits.filter((u) => u.def.damage > 0);
      const target = this.world.playerBase();
      if (army.length >= 4 && target) {
        for (const u of army) {
          u.moveTo(this.world, target.x + (Math.random() - 0.5) * 120, target.y + (Math.random() - 0.5) * 120, true);
        }
      }
    }
  }

  // send new idle combat units to guard the base rally
  guard(newUnit: Unit, myBase: Building | null) {
    if (!myBase || newUnit.def.canGather) return;
    newUnit.moveTo(this.world, myBase.rally.x, myBase.rally.y, true);
  }
}
