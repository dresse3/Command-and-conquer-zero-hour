// Lightweight particle system for muzzle flashes, explosions, smoke, sparks and
// debris. Drawn in world space (inside the camera transform).

type PKind = "fire" | "smoke" | "spark" | "debris" | "flash" | "ring";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: PKind;
  hue: number; // for fire/spark color
  rot: number;
}

const MAX_PARTICLES = 900;

export class ParticleSystem {
  private ps: Particle[] = [];

  get count() {
    return this.ps.length;
  }

  private push(p: Particle) {
    if (this.ps.length >= MAX_PARTICLES) return;
    this.ps.push(p);
  }

  private rand(a: number, b: number) {
    return a + Math.random() * (b - a);
  }

  muzzleFlash(x: number, y: number, angle: number) {
    this.push({
      x, y, vx: 0, vy: 0, life: 0.07, maxLife: 0.07, size: 9, kind: "flash", hue: 45, rot: angle,
    });
    for (let i = 0; i < 3; i++) {
      const a = angle + this.rand(-0.4, 0.4);
      const s = this.rand(60, 160);
      this.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.18, maxLife: 0.18, size: this.rand(1.5, 3), kind: "spark", hue: 48, rot: 0,
      });
    }
  }

  hit(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const a = this.rand(0, Math.PI * 2);
      const s = this.rand(40, 130);
      this.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: this.rand(0.15, 0.3), maxLife: 0.3, size: this.rand(1, 2.5), kind: "spark", hue: 40, rot: 0,
      });
    }
  }

  explosion(x: number, y: number, size: number) {
    // size ~ 0.5 (unit) .. 2.5 (building)
    const scale = size;
    this.push({ x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, size: 14 * scale, kind: "ring", hue: 30, rot: 0 });
    const fires = Math.floor(10 * scale);
    for (let i = 0; i < fires; i++) {
      const a = this.rand(0, Math.PI * 2);
      const sp = this.rand(20, 120) * scale;
      this.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: this.rand(0.3, 0.7), maxLife: 0.7, size: this.rand(6, 14) * scale, kind: "fire",
        hue: this.rand(15, 45), rot: 0,
      });
    }
    const smokes = Math.floor(6 * scale);
    for (let i = 0; i < smokes; i++) {
      const a = this.rand(0, Math.PI * 2);
      const sp = this.rand(10, 50) * scale;
      this.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: this.rand(0.7, 1.4), maxLife: 1.4, size: this.rand(10, 20) * scale, kind: "smoke", hue: 0, rot: 0,
      });
    }
    const debris = Math.floor(5 * scale);
    for (let i = 0; i < debris; i++) {
      const a = this.rand(0, Math.PI * 2);
      const sp = this.rand(80, 220) * scale;
      this.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: this.rand(0.4, 0.8), maxLife: 0.8, size: this.rand(2, 4), kind: "debris",
        hue: 0, rot: this.rand(0, Math.PI * 2),
      });
    }
  }

  dust(x: number, y: number, amount = 6) {
    for (let i = 0; i < amount; i++) {
      const a = this.rand(0, Math.PI * 2);
      const sp = this.rand(10, 45);
      this.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10,
        life: this.rand(0.4, 0.9), maxLife: 0.9, size: this.rand(6, 12), kind: "smoke", hue: 40, rot: 0,
      });
    }
  }

  update(dt: number) {
    for (const p of this.ps) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "smoke") {
        p.vx *= 0.92;
        p.vy = p.vy * 0.92 - 8 * dt;
        p.size += 14 * dt;
      } else if (p.kind === "fire") {
        p.vx *= 0.88;
        p.vy *= 0.88;
        p.size *= 1 - 0.9 * dt;
      } else if (p.kind === "spark") {
        p.vy += 160 * dt; // gravity
        p.vx *= 0.96;
      } else if (p.kind === "debris") {
        p.vy += 260 * dt;
        p.vx *= 0.98;
        p.rot += dt * 8;
      }
    }
    this.ps = this.ps.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.ps) {
      const t = Math.max(0, p.life / p.maxLife); // 1 -> 0
      switch (p.kind) {
        case "flash": {
          ctx.globalAlpha = t;
          ctx.fillStyle = "#fff2b0";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + t * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "ring": {
          ctx.globalAlpha = t * 0.7;
          ctx.strokeStyle = "#ffd27a";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.4 - t), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "fire": {
          ctx.globalAlpha = t;
          const l = 55 + t * 25;
          ctx.fillStyle = `hsl(${p.hue}, 100%, ${l}%)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "smoke": {
          ctx.globalAlpha = t * 0.4;
          const shade = p.hue > 20 ? 120 : 60; // dust lighter than smoke
          ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 14})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "spark": {
          ctx.globalAlpha = t;
          ctx.fillStyle = `hsl(${p.hue}, 100%, 65%)`;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        }
        case "debris": {
          ctx.globalAlpha = t;
          ctx.fillStyle = "#2a2a2e";
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
