// 合成音效 —— 纯 WebAudio，零素材
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  private noise(dur: number, vol: number, freq: number, delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq, t);
    filt.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  rifle() { this.tone('square', 720, 180, 0.09, 0.12); this.noise(0.06, 0.08, 3000); }
  zap() { this.tone('sawtooth', 1800, 260, 0.13, 0.16); this.noise(0.08, 0.1, 4000); }
  beamTick() { this.tone('square', 920 + Math.random() * 160, 880, 0.05, 0.05); }
  launch() { this.noise(0.25, 0.2, 600); this.tone('sine', 520, 180, 0.3, 0.14); }
  flameTick() { this.noise(0.09, 0.07, 900); }
  railgun() { this.tone('sawtooth', 1400, 90, 0.35, 0.22); this.tone('sine', 2200, 200, 0.3, 0.12); this.noise(0.2, 0.2, 5000); }
  shotgun() { this.noise(0.22, 0.35, 1600); this.tone('square', 300, 60, 0.16, 0.2); }
  hit() { this.tone('sine', 1300, 900, 0.05, 0.1); }
  explode() { this.noise(0.35, 0.35, 900); this.tone('sine', 160, 40, 0.3, 0.25); }
  hurt() { this.tone('sawtooth', 220, 70, 0.22, 0.2); }
  reload() { this.tone('square', 480, 480, 0.04, 0.08); setTimeout(() => this.tone('square', 700, 700, 0.05, 0.08), 160); }
  pump() { this.tone('square', 380, 380, 0.04, 0.09); setTimeout(() => this.tone('square', 300, 300, 0.05, 0.09), 110); }
  swap() { this.tone('square', 900, 600, 0.05, 0.07); }
  wave() { this.tone('triangle', 440, 440, 0.35, 0.12); setTimeout(() => this.tone('triangle', 660, 660, 0.4, 0.12), 120); }
  bossWarn() { this.tone('sawtooth', 90, 55, 0.9, 0.3); this.tone('sawtooth', 110, 60, 0.9, 0.2, 0.15); }
  pickup() { this.tone('sine', 700, 700, 0.08, 0.12); setTimeout(() => this.tone('sine', 1050, 1050, 0.1, 0.12), 80); }
  over() { this.tone('sawtooth', 1200, 200, 0.25, 0.12); setTimeout(() => this.tone('sawtooth', 1200, 200, 0.25, 0.12), 100); }
  empty() { this.tone('square', 200, 180, 0.05, 0.06); }
  death() { this.tone('sawtooth', 300, 30, 1.2, 0.3); this.noise(1.0, 0.25, 600); }
}
