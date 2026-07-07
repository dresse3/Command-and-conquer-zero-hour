// Fully synthesized sound effects via the Web Audio API — no asset files, so it
// works identically on Windows and macOS. Every call is guarded: if audio is
// unavailable (or not yet unlocked by a user gesture) it silently no-ops.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private enabled = true;
  private lastPlay: Record<string, number> = {};

  constructor() {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
    } catch {
      this.enabled = false;
    }
  }

  // Call from the first user gesture to satisfy autoplay policies.
  unlock() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setVolume(v: number) {
    if (this.master) this.master.gain.value = v;
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // limit how often a given sound may retrigger, to avoid audio mush
  private throttle(key: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if (this.lastPlay[key] !== undefined && t - this.lastPlay[key] < minGap) return false;
    this.lastPlay[key] = t;
    return true;
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    return src;
  }

  shoot(kind: "gun" | "rocket" | "cannon") {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (!this.throttle("shoot-" + kind, 0.05)) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(this.master);
    const src = this.noiseSource();
    if (!src) return;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    let dur: number;
    if (kind === "gun") {
      filter.frequency.value = 1400;
      g.gain.setValueAtTime(0.5, now);
      dur = 0.08;
    } else if (kind === "rocket") {
      filter.frequency.value = 700;
      g.gain.setValueAtTime(0.45, now);
      dur = 0.22;
    } else {
      filter.frequency.value = 300;
      g.gain.setValueAtTime(0.7, now);
      dur = 0.18;
    }
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(g);
    src.start(now); // start MUST precede stop
    src.stop(now + dur + 0.02);
    if (kind === "cannon") this.thump(60, 0.18, 0.5);
  }

  explosion(size: number) {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (!this.throttle("expl", 0.04)) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.35 + size * 0.4;
    const src = this.noiseSource();
    if (!src) return;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6 + size * 0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
    this.thump(50 + size * 20, dur * 0.8, 0.6 + size * 0.2);
  }

  private thump(freq: number, dur: number, vol: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private blip(freq: number, dur: number, type: OscillatorType = "square", vol = 0.25) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  select() {
    if (!this.throttle("select", 0.06)) return;
    this.blip(880, 0.06, "triangle", 0.18);
  }
  order() {
    if (!this.throttle("order", 0.06)) return;
    this.blip(560, 0.07, "sine", 0.18);
  }
  build() {
    this.blip(440, 0.09, "square", 0.22);
    setTimeout(() => this.blip(660, 0.1, "square", 0.22), 90);
  }
  place() {
    this.blip(300, 0.12, "sawtooth", 0.25);
  }
  ready() {
    this.blip(520, 0.1, "sine", 0.2);
    setTimeout(() => this.blip(780, 0.12, "sine", 0.2), 100);
  }
  lowPower() {
    if (!this.throttle("lowpower", 2)) return;
    this.blip(120, 0.4, "sawtooth", 0.18);
  }
  // urgent two-tone klaxon when the player's forces come under attack
  alarm() {
    if (!this.throttle("alarm", 1)) return;
    this.blip(740, 0.16, "square", 0.24);
    setTimeout(() => this.blip(560, 0.2, "square", 0.24), 150);
  }
  fanfare(win: boolean) {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.3, "triangle", 0.25), i * 160));
  }
}
