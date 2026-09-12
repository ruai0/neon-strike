import * as THREE from 'three';

// GPU 粒子池 —— 爆炸 / 火花共用
export class Particles {
  private points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private count: number;
  private cursor = 0;

  constructor(count = 900) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.14, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  get object() { return this.points; }

  burst(origin: THREE.Vector3, color: THREE.Color, n: number, speed: number) {
    (this.points.material as THREE.PointsMaterial).color.lerp(color, 0.5);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      this.pos[i * 3] = origin.x;
      this.pos[i * 3 + 1] = origin.y;
      this.pos[i * 3 + 2] = origin.z;
      const dir = new THREE.Vector3().randomDirection();
      this.vel[i * 3] = dir.x * speed * (0.3 + Math.random());
      this.vel[i * 3 + 1] = dir.y * speed * (0.3 + Math.random()) + 1.5;
      this.vel[i * 3 + 2] = dir.z * speed * (0.3 + Math.random());
      this.life[i] = 0.5 + Math.random() * 0.4;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
