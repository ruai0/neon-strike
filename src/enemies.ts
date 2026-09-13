import * as THREE from 'three';

export type EnemyKind = 'swarm' | 'drone' | 'sentry' | 'tank' | 'boss' | 'elite' | 'medic' | 'bomber';

// 每种敌机的专属贴图（白底暗纹，叠加到体色上）
const texCache = new Map<string, THREE.CanvasTexture>();
function kindTexture(kind: EnemyKind): THREE.CanvasTexture {
  const hit = texCache.get(kind);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  const line = (w: number) => { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = w; };
  const fill = (a: number) => { ctx.fillStyle = `rgba(0,0,0,${a})`; };
  switch (kind) {
    case 'swarm': {
      // 蜂群：细密圆点阵 + 翼部斜纹
      fill(0.45);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
        ctx.beginPath(); ctx.arc(24 + x * 42 + (y % 2 ? 21 : 0), 24 + y * 42, 8, 0, Math.PI * 2); ctx.fill();
      }
      line(4);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64 + 40, 256); ctx.stroke();
      }
      break;
    }
    case 'drone': {
      // 无人机：面板线 + 座舱圆 + 人字纹
      line(4);
      ctx.strokeRect(24, 24, 208, 208);
      ctx.beginPath(); ctx.moveTo(24, 128); ctx.lineTo(232, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(128, 24); ctx.lineTo(128, 232); ctx.stroke();
      fill(0.5);
      ctx.beginPath(); ctx.arc(128, 128, 34, 0, Math.PI * 2); ctx.fill();
      line(5);
      for (let i = 0; i < 4; i++) {
        const y = 40 + i * 52;
        ctx.beginPath(); ctx.moveTo(36, y + 18); ctx.lineTo(64, y); ctx.lineTo(92, y + 18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(164, y + 18); ctx.lineTo(192, y); ctx.lineTo(220, y + 18); ctx.stroke();
      }
      break;
    }
    case 'sentry': {
      // 哨兵：辐射段 + 铆钉双环 + 中央炮口
      line(5);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.cos(a) * 122, 128 + Math.sin(a) * 122); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(128, 128, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 84, 0, Math.PI * 2); ctx.stroke();
      fill(0.5);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(128 + Math.cos(a) * 68, 128 + Math.sin(a) * 68, 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(128, 128, 22, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'tank': {
      // 重装：警示斜纹 + 铆钉阵 + 大面板边框
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#000000';
      for (let i = -8; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 40, 0); ctx.lineTo(i * 40 + 20, 0);
        ctx.lineTo(i * 40 + 276, 256); ctx.lineTo(i * 40 + 256, 256);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      line(7);
      ctx.strokeRect(16, 16, 224, 224);
      fill(0.55);
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        ctx.beginPath(); ctx.arc(28 + x * 34, 28 + y * 34, 5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'elite': {
      // 精英：六向星纹 + 同心面板 + 裂纹
      line(5);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); ctx.stroke();
      }
      for (const r of [40, 72, 104]) { ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke(); }
      line(3);
      ctx.beginPath(); ctx.moveTo(60, 40); ctx.lineTo(120, 130); ctx.lineTo(80, 210); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(200, 60); ctx.lineTo(150, 140); ctx.lineTo(210, 200); ctx.stroke();
      fill(0.5);
      ctx.beginPath(); ctx.arc(128, 128, 18, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'boss': {
      // 主宰：六边晶格 + 辐射能量缝 + 中央枢纽
      line(4);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
        const cx = x * 46 + (y % 2 ? 23 : 0);
        const cy = y * 42;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(a) * 26;
          const py = cy + Math.sin(a) * 26;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      fill(0.55);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.save();
        ctx.translate(128, 128); ctx.rotate(a);
        ctx.fillRect(60, -5, 60, 10);
        ctx.restore();
      }
      line(6);
      ctx.beginPath(); ctx.arc(128, 128, 44, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'medic': {
      // 维修蜂：粗十字 + 圆舱 + 上下格栅
      line(10);
      ctx.beginPath(); ctx.moveTo(128, 16); ctx.lineTo(128, 240); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 128); ctx.lineTo(240, 128); ctx.stroke();
      line(5);
      ctx.beginPath(); ctx.arc(128, 128, 56, 0, Math.PI * 2); ctx.stroke();
      fill(0.4);
      for (let i = 0; i < 5; i++) ctx.fillRect(40 + i * 36, 44, 20, 14);
      for (let i = 0; i < 5; i++) ctx.fillRect(40 + i * 36, 200, 20, 14);
      break;
    }
    case 'bomber': {
      // 自爆蜂：同心警示环 + 外圈三角纹
      line(8);
      for (const r of [36, 64, 92]) { ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke(); }
      fill(0.5);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.save();
        ctx.translate(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-14, 12); ctx.lineTo(14, 12); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      fill(0.6);
      ctx.beginPath(); ctx.arc(128, 128, 16, 0, Math.PI * 2); ctx.fill();
      break;
    }
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
  medic:  { hp: 55,  r: 0.6,  speed: 4.2, score: 180,  color: 0x7dffce, label: '维修蜂' },
  bomber: { hp: 25,  r: 0.55, speed: 5.6, score: 80,   color: 0xff6a00, label: '自爆蜂' },
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
  maxHp = 0;
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
  bossVar: 'core' | 'hive' | 'doom' = 'core'; // BOSS 变体
  affix: EnemyAffix | null = null;
  // 坦克冲锋状态
  chargeWind = 0;
  charging = 0;
  chargeCd = 3;
  chargeDir = new THREE.Vector3();

  private core: THREE.Mesh;
  private shellMat: THREE.MeshStandardMaterial;
  private baseColor = new THREE.Color();
  private coreMat: THREE.MeshStandardMaterial;
  private spinParts: THREE.Mesh[] = [];
  private aura: THREE.Mesh | null = null;
  private hpBarGroup = new THREE.Group();
  private hpFill: THREE.Mesh;
  private barW: number;
  private flashT = 0;
  private hpShownAt = 0;

  constructor(public kind: EnemyKind, public speed: number, spawnPos: THREE.Vector3) {
    const cfg = KIND_CFG[kind];
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    // 亮色金属实体：受场景光照产生体积明暗，微自发光保证暗图可见
    const tint = new THREE.Color(cfg.color);
    const bodyMat = () => new THREE.MeshStandardMaterial({
      color: tint, map: kindTexture(kind),
      roughness: 0.32, metalness: 0.5,
      emissive: cfg.color, emissiveIntensity: 0.35,
    });
    const edgeMat = () => new THREE.LineBasicMaterial({ color: 0x04070c, transparent: true, opacity: 0.85 });
    const coreMat = (s: number) => new THREE.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 1.5, roughness: 0.3 });
    const edged = (geo: THREE.BufferGeometry) => {
      const body = new THREE.Mesh(geo, bodyMat());
      body.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat()));
      return body;
    };
    // 部件动画：updateVisual 按 userData.spin 转速旋转
    const spin = (m: THREE.Mesh, s: number) => { m.userData.spin = s; this.spinParts.push(m); };

    let shell: THREE.Mesh;
    let core: THREE.Mesh;

    switch (kind) {
      case 'swarm': {
        // 蜂群：小三棱锥 + 双翼板 + 底部推进光锥
        shell = edged(new THREE.TetrahedronGeometry(cfg.r * 1.5, 0));
        const finG = new THREE.BoxGeometry(cfg.r * 1.1, 0.05, cfg.r * 0.5);
        const finL = new THREE.Mesh(finG, bodyMat());
        finL.position.set(-cfg.r * 0.7, 0, 0); finL.rotation.z = 0.5;
        const finR = new THREE.Mesh(finG, bodyMat());
        finR.position.set(cfg.r * 0.7, 0, 0); finR.rotation.z = -0.5;
        const jet = new THREE.Mesh(new THREE.ConeGeometry(cfg.r * 0.28, cfg.r * 0.7, 6), coreMat(1));
        jet.rotation.x = Math.PI;
        jet.position.y = -cfg.r * 0.9;
        shell.add(finL, finR, jet);
        core = new THREE.Mesh(new THREE.TetrahedronGeometry(cfg.r * 0.45, 0), coreMat(cfg.r * 0.45));
        break;
      }
      case 'drone': {
        // 无人机：二十面体 + 座舱罩 + 双侧推进舱
        shell = edged(new THREE.IcosahedronGeometry(cfg.r, 0));
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(cfg.r * 0.42, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.15, metalness: 0.6, emissive: cfg.color, emissiveIntensity: 0.5 }),
        );
        canopy.position.set(0, cfg.r * 0.5, cfg.r * 0.2);
        const podG = new THREE.CylinderGeometry(cfg.r * 0.16, cfg.r * 0.22, cfg.r * 0.8, 6);
        const podL = new THREE.Mesh(podG, bodyMat());
        podL.rotation.z = Math.PI / 2; podL.position.set(-cfg.r * 1.05, -cfg.r * 0.2, 0);
        const podR = new THREE.Mesh(podG, bodyMat());
        podR.rotation.z = Math.PI / 2; podR.position.set(cfg.r * 1.05, -cfg.r * 0.2, 0);
        shell.add(canopy, podL, podR);
        core = new THREE.Mesh(new THREE.OctahedronGeometry(cfg.r * 0.4, 0), coreMat(cfg.r * 0.4));
        break;
      }
      case 'sentry': {
        // 哨兵：水平陀螺炮环 + 径向主炮 + 三块装甲板 + 炮口光环
        shell = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 0.95, 0.16, 10, 28), bodyMat());
        shell.rotation.x = Math.PI / 2;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(cfg.r * 0.12, cfg.r * 0.16, cfg.r * 1.1, 8), bodyMat());
        barrel.rotation.z = -Math.PI / 2;
        barrel.position.set(cfg.r * 1.2, 0, 0.1);
        for (let p = 0; p < 3; p++) {
          const a = (p / 3) * Math.PI * 2;
          const plate = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 0.5, cfg.r * 0.14, cfg.r * 0.5), bodyMat());
          plate.position.set(Math.cos(a) * cfg.r * 0.72, Math.sin(a) * cfg.r * 0.72, 0.12);
          shell.add(plate);
        }
        const muzzle = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 0.18, 0.03, 6, 14), coreMat(1));
        muzzle.rotation.y = Math.PI / 2;
        muzzle.position.set(cfg.r * 1.78, 0, 0.1);
        shell.add(barrel, muzzle);
        core = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.4, 12, 10), coreMat(cfg.r * 0.4));
        break;
      }
      case 'tank': {
        // 重装：厚甲方块 + 四角护柱 + 顶部发光格栅
        shell = edged(new THREE.BoxGeometry(cfg.r * 1.75, cfg.r * 1.75, cfg.r * 1.75));
        const slab = new THREE.BoxGeometry(cfg.r * 0.6, cfg.r * 1.95, cfg.r * 0.6);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
          const s = new THREE.Mesh(slab, bodyMat());
          s.position.set(sx * cfg.r * 0.85, 0, sz * cfg.r * 0.85);
          shell.add(s);
        }
        const vent = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 1.1, cfg.r * 0.16, cfg.r * 0.5), coreMat(1));
        vent.position.y = cfg.r * 0.95;
        shell.add(vent);
        core = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 0.7, cfg.r * 0.7, cfg.r * 0.7), coreMat(cfg.r * 0.7));
        break;
      }
      case 'elite': {
        // 精英：大八面体 + 旋转刀环（3 片轨道刃）
        shell = edged(new THREE.OctahedronGeometry(cfg.r * 1.05, 0));
        const bladeRing = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 1.35, 0.05, 8, 32), bodyMat());
        spin(bladeRing, 2.2);
        for (let b = 0; b < 3; b++) {
          const a = (b / 3) * Math.PI * 2;
          const blade = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 0.55, 0.08, cfg.r * 0.2), bodyMat());
          blade.position.set(Math.cos(a) * cfg.r * 1.35, 0, Math.sin(a) * cfg.r * 1.35);
          blade.rotation.y = -a;
          bladeRing.add(blade);
        }
        shell.add(bladeRing);
        core = new THREE.Mesh(new THREE.OctahedronGeometry(cfg.r * 0.5, 0), coreMat(cfg.r * 0.5));
        break;
      }
      case 'boss': {
        // 核心主宰：大壳 + 双实体陀螺环（对转） + 四角炮座
        shell = edged(new THREE.IcosahedronGeometry(cfg.r * 0.95, 0));
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 1.2, 0.09, 10, 44), bodyMat());
        ring1.rotation.x = Math.PI / 2.3;
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 1.42, 0.06, 10, 44), bodyMat());
        ring2.rotation.set(Math.PI / 1.8, 0.6, 0);
        shell.add(ring1, ring2);
        spin(ring1, 1.6);
        spin(ring2, -1.1);
        for (let p = 0; p < 4; p++) {
          const a = (p / 4) * Math.PI * 2 + Math.PI / 4;
          const pod = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 0.3, cfg.r * 0.3, cfg.r * 0.55), bodyMat());
          pod.position.set(Math.cos(a) * cfg.r * 0.95, p % 2 ? 0.35 : -0.35, Math.sin(a) * cfg.r * 0.95);
          pod.lookAt(0, 0, 0);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.1, 6, 6), coreMat(1));
          tip.position.set(0, 0, cfg.r * 0.32);
          pod.add(tip);
          shell.add(pod);
        }
        core = new THREE.Mesh(new THREE.IcosahedronGeometry(cfg.r * 0.42, 0), coreMat(cfg.r * 0.42));
        break;
      }
      case 'medic': {
        // 维修蜂：十字机匣 + 旋转发光光环 + 双侧药剂舱
        shell = edged(new THREE.BoxGeometry(cfg.r * 1.5, cfg.r * 0.5, cfg.r * 0.5));
        const bar2 = new THREE.Mesh(new THREE.BoxGeometry(cfg.r * 0.5, cfg.r * 0.5, cfg.r * 1.5), bodyMat());
        bar2.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(cfg.r * 0.5, cfg.r * 0.5, cfg.r * 1.5)), edgeMat()));
        const halo = new THREE.Mesh(new THREE.TorusGeometry(cfg.r * 1.05, 0.05, 8, 26), coreMat(1));
        halo.rotation.x = Math.PI / 2;
        shell.add(bar2, halo);
        spin(halo, 2.5);
        for (const sx of [-1, 1]) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(cfg.r * 0.18, cfg.r * 0.18, cfg.r * 0.7, 8), bodyMat());
          tank.position.set(sx * cfg.r * 0.95, -cfg.r * 0.15, 0);
          shell.add(tank);
        }
        core = new THREE.Mesh(new THREE.OctahedronGeometry(cfg.r * 0.42, 0), coreMat(cfg.r * 0.42));
        break;
      }
      case 'bomber': {
        // 自爆蜂：球体尖刺 + 尾翼 + 顶部引信灯（接近时闪烁）
        shell = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.9, 10, 8), bodyMat());
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * Math.PI * 2;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(cfg.r * 0.22, cfg.r * 0.6, 5), bodyMat());
          spike.position.set(Math.cos(a) * cfg.r * 0.9, s % 2 ? 0.3 : -0.3, Math.sin(a) * cfg.r * 0.9);
          spike.rotation.z = -a + Math.PI / 2;
          shell.add(spike);
        }
        const finG = new THREE.BoxGeometry(0.04, cfg.r * 0.6, cfg.r * 0.45);
        for (const sx of [-1, 1]) {
          const fin = new THREE.Mesh(finG, bodyMat());
          fin.position.set(sx * cfg.r * 0.85, 0, cfg.r * 0.75);
          fin.rotation.y = sx * 0.5;
          shell.add(fin);
        }
        const fuse = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.16, 6, 6), coreMat(1));
        fuse.position.y = cfg.r * 1.0;
        shell.add(fuse);
        core = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.4, 8, 6), coreMat(cfg.r * 0.4));
        break;
      }
      default: {
        // 无人机：经典二十面体（三角板块纹）
        shell = edged(new THREE.IcosahedronGeometry(cfg.r, 0));
        core = new THREE.Mesh(new THREE.OctahedronGeometry(cfg.r * 0.4, 0), coreMat(cfg.r * 0.4));
      }
    }

    this.shellMat = shell.material as THREE.MeshStandardMaterial;
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

  setHp01(ratio: number) {
    const r = Math.max(0, Math.min(1, ratio));
    this.hpBarGroup.visible = r < 0.999;
    if (this.hpBarGroup.visible) this.hpShownAt = performance.now();
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
    // 部件动画：刀环/陀螺环/维修光环按各自转速旋转
    for (const p of this.spinParts) p.rotation.z += dt * (p.userData.spin as number);
    // 自爆蜂核心呼吸（接近玩家时另有 blink 白闪预警）
    if (this.kind === 'bomber' && this.flashT <= 0) {
      this.coreMat.emissiveIntensity = 1.5 + Math.sin(this.bobPhase * 6) * 0.8;
    }

    if (netDriven) this.position.lerp(this.netTarget, Math.min(dt * 10, 1));

    this.hpBarGroup.lookAt(cameraPos);
    // 血条显示 5 秒后自动隐藏，减少视觉噪音
    if (this.hpBarGroup.visible && performance.now() - this.hpShownAt > 5000) {
      this.hpBarGroup.visible = false;
    }
    if (this.aura) {
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.bobPhase * 2) * 0.25;
      this.aura.rotation.z += dt * 1.2;
    }
  }
}
