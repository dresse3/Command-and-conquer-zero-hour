import { POWERS, POWER_ORDER, type PowerKind, type Team, type FactionDef } from "./config";
import type { WorldApi } from "./types";

type Active =
  | { type: "strike"; x: number; y: number; t: number; dmg: number; team: Team }
  | { type: "plane"; x: number; y: number; vx: number; life: number; dropCd: number; bombs: number; tx: number; team: Team };

// One instance per team. Tracks cooldowns, executes powers, and owns the
// transient visuals (falling shells, the strafing jet).
export class PowerManager {
  ready: Record<PowerKind, number> = { artillery: 0, airstrike: 0, reinforce: 0 };
  unlocked = new Set<PowerKind>();
  private active: Active[] = [];

  // faction traits
  private chargeMult = 1;
  private artilleryBonus = 0;
  private artilleryDamageMult = 1;
  private reinforceBonus = 0;

  constructor() {
    // start fully uncharged and locked — powers must be earned & unlocked
    for (const k of POWER_ORDER) this.ready[k] = POWERS[k].cooldown;
  }

  applyFaction(f: FactionDef) {
    this.chargeMult = f.powerChargeMult;
    this.artilleryBonus = f.artilleryBonus;
    this.artilleryDamageMult = f.artilleryDamageMult;
    this.reinforceBonus = f.reinforceBonus;
  }

  isUnlocked(kind: PowerKind): boolean {
    return this.unlocked.has(kind);
  }

  unlock(kind: PowerKind) {
    this.unlocked.add(kind);
    this.ready[kind] = 0; // ready to fire once on unlock
  }

  canFire(kind: PowerKind): boolean {
    return this.unlocked.has(kind) && this.ready[kind] <= 0;
  }

  chargeFrac(kind: PowerKind): number {
    return 1 - Math.min(1, this.ready[kind] / POWERS[kind].cooldown);
  }

  fire(kind: PowerKind, x: number, y: number, world: WorldApi, team: Team): boolean {
    if (!this.canFire(kind)) return false;
    this.ready[kind] = POWERS[kind].cooldown * this.chargeMult;
    if (kind === "artillery") {
      const strikes = 9 + this.artilleryBonus;
      const dmg = 95 * this.artilleryDamageMult;
      for (let i = 0; i < strikes; i++) {
        this.active.push({
          type: "strike",
          x: x + (Math.random() - 0.5) * 150,
          y: y + (Math.random() - 0.5) * 150,
          t: 0.12 * i + Math.random() * 0.15,
          dmg,
          team,
        });
      }
    } else if (kind === "airstrike") {
      this.active.push({ type: "plane", x: x - 760, y, vx: 620, life: 2.6, dropCd: 0, bombs: 5, tx: x, team });
    } else if (kind === "reinforce") {
      const kinds: ("ranger" | "rocketeer" | "raptor")[] = ["ranger", "ranger", "rocketeer", "raptor"];
      for (let i = 0; i < this.reinforceBonus; i++) kinds.push("ranger");
      kinds.forEach((k, i) => {
        world.spawnUnitAt(team, k, x + (i - kinds.length / 2) * 28, y + (i % 2) * 26);
      });
      world.effects.dust(x, y, 18);
      world.audio.ready();
    }
    return true;
  }

  update(dt: number, world: WorldApi) {
    for (const k of POWER_ORDER) if (this.ready[k] > 0) this.ready[k] = Math.max(0, this.ready[k] - dt);

    for (const a of this.active) {
      if (a.type === "strike") {
        a.t -= dt;
        if (a.t <= 0) {
          world.effects.explosion(a.x, a.y, 1.6);
          world.audio.explosion(0.7);
          world.damageArea(a.x, a.y, 70, a.dmg, a.team);
          world.shake(6);
        }
      } else if (a.type === "plane") {
        a.x += a.vx * dt;
        a.life -= dt;
        a.dropCd -= dt;
        if (a.dropCd <= 0 && a.bombs > 0 && Math.abs(a.x - a.tx) < 260) {
          a.bombs--;
          a.dropCd = 0.16;
          world.effects.explosion(a.x, a.y + 6, 1.9);
          world.audio.explosion(0.85);
          world.damageArea(a.x, a.y, 85, 150, a.team);
          world.shake(7);
        }
      }
    }
    this.active = this.active.filter((a) => (a.type === "strike" ? a.t > -0.1 : a.life > 0));
  }

  // called inside the world (camera) transform
  draw(ctx: CanvasRenderingContext2D) {
    for (const a of this.active) {
      if (a.type === "strike" && a.t > 0) {
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(a.t * 10));
        ctx.strokeStyle = `rgba(255,60,60,${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 26, 0, Math.PI * 2);
        ctx.moveTo(a.x - 32, a.y);
        ctx.lineTo(a.x + 32, a.y);
        ctx.moveTo(a.x, a.y - 32);
        ctx.lineTo(a.x, a.y + 32);
        ctx.stroke();
      } else if (a.type === "plane") {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.fillStyle = "#3a3f4a";
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-12, -9);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-12, 9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#20242c";
        ctx.fillRect(-10, -2, 16, 4);
        ctx.restore();
      }
    }
  }
}
