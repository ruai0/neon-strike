import * as THREE from 'three';

export type EnemyKind = 'swarm' | 'drone' | 'sentry' | 'tank' | 'boss' | 'elite';

// 每种敌机的专属贴图（白底暗纹，叠加到体色上）
const texCache = new Map<string, THREE.CanvasTexture>();
function kindTexture(kind: EnemyKind): THREE.CanvasTexture {
  const hit = texCache.get(kind);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  switch (kind) {
    case 'swarm':
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        ctx.beginPath(); ctx.arc(16 + x * 32, 16 + y * 32, 7, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'drone':
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(128, 0); ctx.lineTo(64, 64); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(0, 128); ctx.lineTo(64, 64); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 128); ctx.stroke();
      break;
    case 'sentry':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a) * 64, 64 + Math.sin(a) * 64); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(64, 64, 30, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'tank':
      ctx.lineWidth = 9;
      for (let i = -4; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(i * 24, 0); ctx.lineTo(i * 24 + 64, 128); ctx.stroke();
      }
      break;
    case 'elite':
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(64, 64, 20, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'boss':
      ctx.lineWidth = 3;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        const cx = x * 32 + (y % 2 ? 16 : 0);
        const cy = y * 28;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(a) * 15;
          const py = cy + Math.sin(a) * 15;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
  }
  const tex = new THREE.CanvasTexture(cv);
  texCache.set(kind, tex);
  return tex;
}

export const KIND_CFG: Record<EnemyKind, {
  hp: number; r: number; speed: number; score: number; color: number; label: string;
}> = {
  swarm:  { hp: 12,  r: 0.42, speed: 6.2, score: 30,   color: 0x6aff8f, label: '蜂群' },
  drone:  { hp: 30,  r: 0.62, speed: 3.8, score: 50,   color: 0x00f0ff, label: '无人机' },
  sentry: { hp: 60,  r: 0.78, speed: 2.6, score: 120,  color: 0xff2bd6, label: '哨兵' },
  tank:   { hp: 170, r: 1.05, speed: 2.1, score: 200,  color: 0xffb300, label: '重装' },
  elite:  { hp: 260, r: 1.2,  speed: 3.4, score: 500,  color: 0xf0f0f0, label: '精英猎手' },
  boss:   { hp: 750, r: 2.1,  speed: 1.6, score: 1500, color: 0xff3838, label: '核心主宰' },
};

// 敌机视图：单机由本地模拟驱动，联机由服务器快照插值
const WHITE = new THREE.Color(0xffffff);

// 精英词缀（Risk of Rain 2 式：光圈颜色 = 威胁可读性）
export type EnemyAffix = 'swift' | 'tough' | 'boom' | 'vamp' | 'split';
export const ENEMY_AFFIX: Record<EnemyAffix, { name: string; color: number }> = {
  swift: { name: '迅捷', color: 0x6aff8f },
  tough: { name: '坚壁', color: 0x4aa8ff },
  boom:  { name: '爆破', color: 0xff3838 },
  vamp:  { name: '虹吸', color: 0xb08cff },
  split: { name: '分裂', color: 0xffd24a },
};

export class Enemy {
  group = new THREE.Group();
  hp = 0;
  alive = true;
  hitCooldown = 0;
  fireTimer = 1.2;
  bobPhase = Math.random() * Math.PI * 2;
  strafeDir = Math.random() < 0.5 ? 1 : -1;
  netId = 0;
  netTarget = new THREE.Vector3();
  enraged = false;
  phase2 = false;
  burnT = 0; // 火焰点燃（单机）
  affix: EnemyAffix | null = null;
  // 坦克冲锋状态
  chargeWind = 0;
  charging = 0;
  chargeCd = 3;
  chargeDir = new THREE.Vector3();

  private core: THREE.Mesh;
  private shellMat: THREE.MeshBasicMaterial;
  private baseColor = new THREE.Color();
  private coreMat: THREE.MeshStandardMaterial;
  private aura: THREE.Mesh | null = null;
  private hpBarGroup = new THREE.Group();
  private hpFill: THREE.Mesh;
  private barW: number;
  private flashT = 0;

  constructor(public kind: EnemyKind, public speed: number, spawnPos: THREE.Vector3) {
    const cfg = KIND_CFG[kind];
    this.hp = cfg.hp;
    // 自发光亮色实体（黑底可见）× 专属暗纹贴图 + 暗色描边：亮体剪影 + 纹理细节
    const tint = new THREE.Color(cfg.color).multiplyScalar(0.82);
    const bodyMat = () => {
      const m = new THREE.MeshBasicMaterial({ color: tint, map: kindTexture(kind) });
      return m;
    };
    const edgeMat = () => new THREE.LineBasicMaterial({ color: 0x04070c, transparent: true, opacity: 0.85 });
    const coreMat = (s: number) => new THREE.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 1.5, roughness: 0.3 });
    const edged = (geo: THREE.BufferGeometry) => {
      const body = new THREE.Mesh(geo, bodyMat());
      body.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat()));
      return body;
    };

    let shell: THREE.Mesh;
    let core: THREE.Mesh;

    switch (kind) {
      case 'swarm': {
        // 蜂群：小三棱锥
        shell = edged(new THREE.TetrahedronGeometry(cfg.r * 1.5, 0));
        core = new THREE.Mesh(new THREE.TetrahedronGeometry(cfg.r * 0.45, 0), coreMat(cfg.r * 0.45));
        break;
      }
      case 'sentry': {
        // 哨兵：水平陀螺炮环
        shell = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 0.95, 0.16, 10, 28), bodyMat());
        shell.rotation.x = Math.PI / 2;
        core = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.4, 12, 10), coreMat(cfg.r * 0.4));
        break;
      }
      case 'tank': {
        // 重装：厚重装甲方块（警示斜纹）
        shell = edged(new THREE.BoxGeometry(cfg.r * 1.75, cfg.r * 1.75, cfg.r * 1.75));
        core = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 0.7, cfg.r * 0.7, cfg.r * 0.7), coreMat(cfg.r * 0.7));
        break;
      }
      case 'elite': {
        // 精英：大八面体（星纹）
        shell = edged(new THREE.OctahedronGeometry(cfg.r * 1.05, 0));
        core = new THREE.Mesh(new THREE.OctahedronGeometry(cfg.r * 0.5, 0), coreMat(cfg.r * 0.5));
        break;
      }
      case 'boss': {
        // 核心主宰：大壳（六边纹） + 双实体陀螺环
        shell = edged(new THREE.IcosahedronGeometry(cfg.r * 0.95, 0));
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 1.2, 0.09, 10, 44), bodyMat());
        ring1.rotation.x = Math.PI / 2.3;
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 1.42, 0.06, 10, 44), bodyMat());
        ring2.rotation.set(Math.PI / 1.8, 0.6, 0);
        shell.add(ring1, ring2);
        core = new THREE.Mesh(new THREE.IcosahedronGeometry(cfg.r * 0.42, 0), coreMat(cfg.r * 0.42));
        break;
      }
      default: {
        // 无人机：经典二十面体（三角板块纹）
        shell = edged(new THREE.IcosahedronGeometry(cfg.r, 0));
        core = new THREE.Mesh(new THREE.OctahedronGeometry(cfg.r * 0.4, 0), coreMat(cfg.r * 0.4));
      }
    }

    this.shellMat = shell.material as THREE.MeshBasicMaterial;
    this.baseColor = (shell.material as THREE.MeshBasicMaterial).color.clone();
    this.core = core;
    this.coreMat = core.material as THREE.MeshStandardMaterial;
    shell.userData.enemy = this;
    this.core.userData.enemy = this;
    this.group.add(shell, this.core);

    // 悬浮血条（受伤后显示）
    this.barW = Math.max(0.8, cfg.r * 1.6);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(this.barW, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x111820, transparent: true, opacity: 0.75, depthTest: false }),
    );
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(this.barW, 0.09),
      new THREE.MeshBasicMaterial({ color: cfg.color, depthTest: false }),
    );
    this.hpFill.position.z = 0.001;
    this.hpBarGroup.add(bg, this.hpFill);
    this.hpBarGroup.position.y = cfg.r + 0.45;
    this.hpBarGroup.visible = false;
    this.hpBarGroup.renderOrder = 999;
    this.group.add(this.hpBarGroup);

    this.group.position.copy(spawnPos);
    this.group.scale.setScalar(0.01);
  }

  get position() { return this.group.position; }
  get maxHp() { return KIND_CFG[this.kind].hp; }

  setHp01(ratio: number) {
    const r = Math.max(0, Math.min(1, ratio));
    this.hpBarGroup.visible = r < 0.999;
    this.hpFill.scale.x = Math.max(0.001, r);
    this.hpFill.position.x = -(1 - r) * this.barW / 2;
    this.hp = r * this.maxHp;
  }

  damage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.setHp01(this.hp / this.maxHp);
    this.flashT = 1;
    return this.hp <= 0;
  }

  // 受击闪白 + 命中脉冲
  blink() { this.flashT = 1; }

  // 精英词缀：环绕光圈（可读预警）+ 数值修正
  setAffix(a: EnemyAffix) {
    this.affix = a;
    const info = ENEMY_AFFIX[a];
    const r = KIND_CFG[this.kind].r;
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(r * 1.02, r * 1.02 + 0.15, 32),
      new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = -r * 0.55;
    this.group.add(aura);
    this.aura = aura;
    if (a === 'swift') this.speed *= 1.4;
    if (a === 'tough') { this.hp *= 1.8; this.setHp01(1); }
  }

  private applyFlash(dt: number) {
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 6);
      const f = this.flashT;
      // 亮色躯干闪白，衰减回本色
      this.shellMat.color.copy(f > 0.5 ? WHITE : this.baseColor);
      this.coreMat.emissiveIntensity = 1.5 + f * 5;
    }
  }

  // 视觉刷新（旋转 / 出生动画 / 血条朝向 / 联机插值）
  updateVisual(dt: number, cameraPos: THREE.Vector3, netDriven: boolean) {
    this.group.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(dt * 6, 1));
    this.group.rotation.y += dt * 1.5;
    this.group.rotation.x += dt * 0.6;
    this.core.rotation.z -= dt * 2;
    this.bobPhase += dt * 2;
    this.applyFlash(dt);

    if (netDriven) this.position.lerp(this.netTarget, Math.min(dt * 10, 1));

    this.hpBarGroup.lookAt(cameraPos);
    if (this.aura) {
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.bobPhase * 2) * 0.25;
      this.aura.rotation.z += dt * 1.2;
    }
  }
}
