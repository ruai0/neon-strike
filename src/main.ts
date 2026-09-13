import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sfx } from './audio';
import { Particles } from './particles';
import { Enemy, KIND_CFG, EnemyKind, EnemyAffix, ENEMY_AFFIX } from './enemies';
import { Net, wsUrl } from './net';
import { $, spawnFloater, updateFloaters, makeNameTag, drawMinimap } from './ui';

// ============================================================
// NEON STRIKE — 霓虹突袭 v4 · 单机 + 局域网合作
// 强化三选一 · 手雷 · 爆头暴击 · 磁轨炮 · 五种敌机 · BOSS
// ============================================================

const CYAN = 0x00f0ff;
const MAGENTA = 0xff2bd6;
const AMBER = 0xffb300;
const ARENA_HALF = 36;
const EYE_HEIGHT = 1.7;

type GameState = 'menu' | 'lobby' | 'playing' | 'upgrade' | 'dead' | 'over';
type Mode = 'solo' | 'coop' | 'pvp';
type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'plasma' | 'arc' | 'homing' | 'flame';

interface WeaponCfg {
  name: string; dmg: number; rate: number; mag: number; reload: number;
  pellets: number; spread: number; sound: 'rifle' | 'shotgun' | 'railgun' | 'zap' | 'launch' | 'flame';
  pierce?: boolean; kick: number; color: number; launcher?: boolean;
  beam?: boolean; chain?: number; homing?: boolean; flame?: boolean; range?: number;
}
const WEAPONS: Record<WeaponId, WeaponCfg> = {
  rifle:   { name: '脉冲步枪', dmg: 12, rate: 0.105, mag: 30, reload: 1.15, pellets: 1, spread: 0.004, sound: 'rifle', kick: 0.0035, color: CYAN },
  smg:     { name: '蜂刺冲锋枪', dmg: 7, rate: 0.055, mag: 42, reload: 1.0, pellets: 1, spread: 0.02, sound: 'rifle', kick: 0.0018, color: 0x7dff9e },
  shotgun: { name: '重装霰弹', dmg: 9,  rate: 0.75,  mag: 8,  reload: 1.5,  pellets: 8, spread: 0.055, sound: 'shotgun', kick: 0.02, color: MAGENTA },
  railgun: { name: '磁轨炮',   dmg: 90, rate: 1.1,   mag: 5,  reload: 1.7,  pellets: 1, spread: 0,    sound: 'railgun', pierce: true, kick: 0.045, color: AMBER },
  launcher:{ name: '榴弹发射器', dmg: 0, rate: 1.3,  mag: 4,  reload: 1.9,  pellets: 1, spread: 0,    sound: 'shotgun', kick: 0.05, color: 0xff6a00, launcher: true },
  plasma:  { name: '等离子切割机', dmg: 4, rate: 0.06, mag: 100, reload: 1.6, pellets: 1, spread: 0, sound: 'zap', kick: 0, color: 0x9ff2ff, beam: true, range: 13 },
  arc:     { name: '连锁电弧', dmg: 30, rate: 0.5, mag: 14, reload: 1.3, pellets: 1, spread: 0.006, sound: 'zap', kick: 0.008, color: 0xb08cff, chain: 2 },
  homing:  { name: '蜂群导弹', dmg: 0, rate: 0.9, mag: 6, reload: 2.0, pellets: 1, spread: 0, sound: 'launch', kick: 0.03, color: 0xff5577, homing: true },
  flame:   { name: '烈焰喷射器', dmg: 2.2, rate: 0.07, mag: 80, reload: 1.5, pellets: 4, spread: 0.16, sound: 'flame', kick: 0, color: 0xff7a2a, flame: true, range: 9.5 },
};
const ALL_WEAPONS: WeaponId[] = ['rifle', 'smg', 'shotgun', 'railgun', 'launcher', 'plasma', 'arc', 'homing', 'flame'];

// 近战接触伤害
const CONTACT_DMG: Record<EnemyKind, { dmg: number; cd: number }> = {
  swarm: { dmg: 6, cd: 0.6 },
  drone: { dmg: 12, cd: 1.0 },
  sentry: { dmg: 15, cd: 1.0 },
  tank: { dmg: 25, cd: 1.2 },
  elite: { dmg: 18, cd: 1.0 },
  boss: { dmg: 20, cd: 1.0 },
};

const sfx = new Sfx();
const particles = new Particles();
const net = new Net();

// ---------- 渲染器 / 场景 ----------
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a12);
scene.fog = new THREE.FogExp2(0x060a12, 0.013);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';
camera.position.set(0, EYE_HEIGHT, 8);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.75));
composer.addPass(new OutputPass());

// ---------- 灯光 ----------
const hemiLight = new THREE.HemisphereLight(0x3a5a80, 0x18202c, 1.0);
scene.add(hemiLight);
const keyLight = new THREE.DirectionalLight(0x88aaff, 0.95);
keyLight.position.set(10, 20, 6);
scene.add(keyLight);
const magLight = new THREE.PointLight(MAGENTA, 65, 55);
magLight.position.set(-20, 8, -20);
scene.add(magLight);
const cyanLight = new THREE.PointLight(CYAN, 65, 55);
cyanLight.position.set(20, 8, 20);
scene.add(cyanLight);
const boomLight = new THREE.PointLight(AMBER, 0, 30);
scene.add(boomLight);

// ---------- 竞技场 ----------
const collidables: THREE.Object3D[] = [];
const pillarXZ: { x: number; z: number; r: number }[] = [];
const wallRects: { x: number; z: number; hw: number; hd: number; rot: number }[] = [];
const jumpPads: { x: number; z: number; mesh: THREE.Group }[] = [];
const mapNames = ['玄岩要塞', '环塔竞技场', '峡谷废墟', '熔火工厂', '极地观测站'];
let mapIdx = 0;
const mapObjects: THREE.Object3D[] = [];
let horizonRef: THREE.Mesh | null = null;
let floorRef: THREE.Mesh | null = null;
// 动画对象缓存（避免每帧全场景遍历）
const fxRings: THREE.Mesh[] = [];
const fxPulses: THREE.Mesh[] = [];
const fxPadGlows: THREE.Mesh[] = [];

// 长墙等矩形碰撞体：把圆形碰撞体推挤出旋转矩形
function collideWalls(p: { x: number; z: number }, r: number) {  for (const w of wallRects) {
    const dx = p.x - w.x;
    const dz = p.z - w.z;
    const cos = Math.cos(w.rot), sin = Math.sin(w.rot);
    // 世界 → 墙体本地坐标
    const lx = cos * dx - sin * dz;
    const lz = sin * dx + cos * dz;
    const cx = Math.max(-w.hw, Math.min(w.hw, lx));
    const cz = Math.max(-w.hd, Math.min(w.hd, lz));
    const ox = lx - cx, oz = lz - cz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= r * r) continue;
    let plx = 0, plz = 0;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      plx = ox * push;
      plz = oz * push;
    } else {
      // 圆心陷入矩形：沿最浅轴推出
      const penX = w.hw - Math.abs(lx);
      const penZ = w.hd - Math.abs(lz);
      if (penX < penZ) plx = lx >= 0 ? penX + r : -(penX + r);
      else plz = lz >= 0 ? penZ + r : -(penZ + r);
    }
    // 本地 → 世界
    p.x += cos * plx + sin * plz;
    p.z += -sin * plx + cos * plz;
  }
}

// 点是否撞上静态地形（立柱/长墙/高塔）——敌弹、导弹、手雷共用
function hitsStatic(p: THREE.Vector3): boolean {
  if (p.y > 6.2) return false; // 障碍物最高 6 米，越过即畅通
  for (const w of pillarXZ) {
    if (Math.hypot(p.x - w.x, p.z - w.z) < w.r) return true;
  }
  for (const w of wallRects) {
    const dx = p.x - w.x;
    const dz = p.z - w.z;
    const cos = Math.cos(w.rot), sin = Math.sin(w.rot);
    const lx = cos * dx - sin * dz;
    const lz = sin * dx + cos * dz;
    if (Math.abs(lx) < w.hw && Math.abs(lz) < w.hd) return true;
  }
  return false;
}

{
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x0e141d, roughness: 0.35, metalness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.userData.surface = true;
  scene.add(floor);
  collidables.push(floor);
  floorRef = floor;

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(140);
    if (v.y < 5) v.y = Math.abs(v.y) + 5;
    starPos.set([v.x, v.y, v.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x88bbcc, size: 0.9, transparent: true, opacity: 0.7, sizeAttenuation: true,
  })));

  // 地平线光晕环
  horizonRef = new THREE.Mesh(
    new THREE.RingGeometry(52, 130, 64),
    new THREE.MeshBasicMaterial({ color: 0x082433, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
  );
  horizonRef.rotation.x = -Math.PI / 2;
  horizonRef.position.y = 0.02;
  scene.add(horizonRef);

  // 地面脉冲环（从中央舞台向外扩散）
  for (let i = 0; i < 2; i++) {
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1, 64),
      new THREE.MeshBasicMaterial({ color: i % 2 ? MAGENTA : CYAN, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.03;
    pulse.userData.pulseT = i * 0.5;
    scene.add(pulse);
    fxPulses.push(pulse);
  }

  // 弹跳板
  const padSpots: [number, number][] = [[10, 10], [-10, -10], [20, -14], [-20, 14]];
  for (const [x, z] of padSpots) {
    const pad = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.45, 0.14, 24),
      new THREE.MeshStandardMaterial({ color: 0x14301f, roughness: 0.3, metalness: 0.8 }),
    );
    base.position.y = 0.07;
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: 0x3aff8f, emissive: 0x3aff8f, emissiveIntensity: 1.1 }),
    );
    glow.position.y = 0.15;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.045, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x3aff8f, transparent: true, opacity: 0.7 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    pad.add(base, glow, ring);
    pad.position.set(x, 0, z);
    pad.userData.jumpPad = true;
    scene.add(pad);
    jumpPads.push({ x, z, mesh: pad });
    fxPadGlows.push(glow);
  }

  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(9 + i * 7, 0.06, 8, 64),
      new THREE.MeshBasicMaterial({ color: i % 2 ? MAGENTA : CYAN, transparent: true, opacity: 0.35 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    ring.userData.ring = true;
    scene.add(ring);
    fxRings.push(ring);
  }
}

scene.add(particles.object);

// ---------- 地图 ----------
function addMapObj(o: THREE.Object3D, solid = true) {
  scene.add(o);
  mapObjects.push(o);
  if (solid) collidables.push(o);
}

function addPillar(x: number, z: number, i: number, h = 4 + (i % 3)) {
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, h, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x161e2a, roughness: 0.5, metalness: 0.7 }),
  );
  pillar.position.set(x, h / 2, z);
  pillar.userData.surface = true;
  addMapObj(pillar);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, h, 2.2)),
    new THREE.LineBasicMaterial({ color: i % 2 ? CYAN : MAGENTA, transparent: true, opacity: 0.85 }),
  );
  edge.position.copy(pillar.position);
  addMapObj(edge, false);
  const toC = new THREE.Vector3(-x, 0, -z).normalize();
  const stripColor = i % 2 ? CYAN : MAGENTA;
  const lightStrip = new THREE.Mesh(
    new THREE.BoxGeometry(2.24, h * 0.42, 0.06),
    new THREE.MeshStandardMaterial({ color: stripColor, emissive: stripColor, emissiveIntensity: 0.75 }),
  );
  lightStrip.position.set(x + toC.x * 1.13, h * 0.32, z + toC.z * 1.13);
  lightStrip.rotation.y = Math.atan2(toC.x, toC.z);
  addMapObj(lightStrip, false);
  pillarXZ.push({ x, z, r: 1.9 });
}

function buildMap(idx: number) {
  for (const o of mapObjects) { scene.remove(o); disposeObj(o); }
  mapObjects.length = 0;
  pillarXZ.length = 0;
  wallRects.length = 0;
  collidables.length = 1; // 仅保留地板
  mapIdx = ((idx % mapNames.length) + mapNames.length) % mapNames.length;

  // 主题配色：网格 / 边墙 / 雾 / 地平线 / 地板 / 环境光（每图独立基调）
  const themes = [
    { g1: CYAN,     g2: 0x123642, edge: CYAN,     fog: 0x060a12, horizon: 0x0a2c3e, floor: 0x0e141d, hemi: 1.0 },
    { g1: MAGENTA,  g2: 0x3a1430, edge: MAGENTA,  fog: 0x0e0716, horizon: 0x26093a, floor: 0x120e1a, hemi: 1.0 },
    { g1: AMBER,    g2: 0x3a2c10, edge: AMBER,    fog: 0x100b05, horizon: 0x2e2008, floor: 0x17120b, hemi: 1.0 },
    { g1: 0xff7a3c, g2: 0x3a2410, edge: 0xff7a3c, fog: 0x160d06, horizon: 0x301608, floor: 0x1c120a, hemi: 1.15 },
    { g1: 0x9fe8ff, g2: 0x2e4a58, edge: 0x9fe8ff, fog: 0x18262f, horizon: 0x28434f, floor: 0x1e2e38, hemi: 1.4 },
  ];
  const th = themes[mapIdx];
  const grid = new THREE.GridHelper(ARENA_HALF * 2, 36, th.g1, th.g2);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.4;
  grid.position.y = 0.01;
  addMapObj(grid, false);
  const wallEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(ARENA_HALF * 2, 12, ARENA_HALF * 2)),
    new THREE.LineBasicMaterial({ color: th.edge, transparent: true, opacity: 0.6 }),
  );
  wallEdges.position.y = 6;
  addMapObj(wallEdges, false);
  (scene.fog as THREE.FogExp2).color.setHex(th.fog);
  scene.background = new THREE.Color(th.fog);
  if (horizonRef) (horizonRef.material as THREE.MeshBasicMaterial).color.setHex(th.horizon);
  if (floorRef) (floorRef.material as THREE.MeshStandardMaterial).color.setHex(th.floor);
  hemiLight.intensity = th.hemi;

  if (mapIdx === 0) {
    // 玄岩要塞：中央六角舞台 + 8 柱
    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5.6, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x182230, roughness: 0.4, metalness: 0.8 }),
    );
    stage.position.y = 0.25;
    stage.userData.surface = true;
    addMapObj(stage);
    const stageEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(5, 5.6, 0.5, 6)),
      new THREE.LineBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.9 }),
    );
    stageEdge.position.y = 0.25;
    addMapObj(stageEdge, false);
    const spots: [number, number][] = [
      [14, 6], [-14, 6], [14, -10], [-14, -10], [0, 18], [0, -18], [22, 0], [-22, 0],
    ];
    spots.forEach(([x, z], i) => addPillar(x, z, i));
  } else if (mapIdx === 1) {
    // 环塔竞技场：中央高塔（绕柱环绕战） + 环形柱阵
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 3.0, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x182230, roughness: 0.35, metalness: 0.85 }),
    );
    tower.position.y = 3;
    tower.userData.surface = true;
    addMapObj(tower);
    pillarXZ.push({ x: 0, z: 0, r: 3.45 });
    // 塔身四条竖向灯带
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 5.4, 0.12),
        new THREE.MeshStandardMaterial({ color: MAGENTA, emissive: MAGENTA, emissiveIntensity: 1.2 }),
      );
      strip.position.set(Math.cos(a) * 2.85, 3, Math.sin(a) * 2.85);
      addMapObj(strip, false);
    }
    const towerEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(2.6, 3.0, 6, 12)),
      new THREE.LineBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.9 }),
    );
    towerEdge.position.y = 3;
    addMapObj(towerEdge, false);
    const ringGlow = new THREE.Mesh(
      new THREE.TorusGeometry(2.85, 0.05, 8, 40),
      new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.7 }),
    );
    ringGlow.rotation.x = Math.PI / 2;
    ringGlow.position.y = 0.4;
    addMapObj(ringGlow, false);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      addPillar(Math.round(Math.cos(a) * 17), Math.round(Math.sin(a) * 17), i, 3.5 + (i % 3));
    }
  } else if (mapIdx === 2) {
    // 峡谷废墟：长墙巷道 + 散落掩体
    const walls: [number, number, number][] = [
      [-9, 0, 0], [9, 0, 0], [0, -13, Math.PI / 2], [0, 13, Math.PI / 2],
    ];
    walls.forEach(([x, z, ry]) => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(14, 4.2, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x231a10, roughness: 0.6, metalness: 0.6 }),
      );
      wall.position.set(x, 2.1, z);
      wall.rotation.y = ry;
      wall.userData.surface = true;
      addMapObj(wall);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(14, 4.2, 1.6)),
        new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85 }),
      );
      edge.position.copy(wall.position);
      edge.rotation.y = ry;
      addMapObj(edge, false);
      // 真实矩形碰撞（修复穿墙）
      wallRects.push({ x, z, hw: 7, hd: 0.8, rot: ry });
    });
    // 废墟散块（装饰）
    for (let i = 0; i < 14; i++) {
      const rx = (Math.random() - 0.5) * 60;
      const rz = (Math.random() - 0.5) * 60;
      if (Math.abs(rx) < 10 && Math.abs(rz) < 10) continue;
      const rubble = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 + Math.random() * 0.9, 0.3 + Math.random() * 0.5, 0.5 + Math.random() * 0.9),
        new THREE.MeshStandardMaterial({ color: 0x2b2214, roughness: 0.8, metalness: 0.4 }),
      );
      rubble.position.set(rx, 0.2, rz);
      rubble.rotation.y = Math.random() * Math.PI;
      addMapObj(rubble, false);
    }
    const cubes: [number, number][] = [[-18, -14], [18, 14], [-18, 14], [18, -14], [0, 0]];
    cubes.forEach(([x, z], i) => addPillar(x, z, i, 3 + (i % 2)));
  } else if (mapIdx === 3) {
    // 熔火工厂：中央熔炉 + 传送长廊 + 炉体方块阵（暖橙主题）
    const furnace = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 4.2, 2.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x241610, roughness: 0.5, metalness: 0.7 }),
    );
    furnace.position.y = 1.2;
    furnace.userData.surface = true;
    addMapObj(furnace);
    pillarXZ.push({ x: 0, z: 0, r: 4.6 });
    const furnaceEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(3.6, 4.2, 2.4, 10)),
      new THREE.LineBasicMaterial({ color: 0xff7a3c, transparent: true, opacity: 0.9 }),
    );
    furnaceEdge.position.y = 1.2;
    addMapObj(furnaceEdge, false);
    const lavaTop = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.12, 10),
      new THREE.MeshStandardMaterial({ color: 0xff7a3c, emissive: 0xff7a3c, emissiveIntensity: 1.4 }),
    );
    lavaTop.position.y = 2.5;
    addMapObj(lavaTop, false);
    // 两条传送长廊（真实矩形碰撞）
    const lanes: [number, number, number][] = [[-14, 0, 0], [14, 0, 0]];
    lanes.forEach(([x, z, ry]) => {
      const lane = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.6, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x241610, roughness: 0.55, metalness: 0.65 }),
      );
      lane.position.set(x, 1.3, z);
      lane.rotation.y = ry;
      lane.userData.surface = true;
      addMapObj(lane);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(16, 2.6, 1.8)),
        new THREE.LineBasicMaterial({ color: 0xff7a3c, transparent: true, opacity: 0.85 }),
      );
      edge.position.copy(lane.position);
      edge.rotation.y = ry;
      addMapObj(edge, false);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(15.4, 0.12, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xff9a50, emissive: 0xff9a50, emissiveIntensity: 1.0 }),
      );
      strip.position.y = 1.35;
      lane.add(strip);
      wallRects.push({ x, z, hw: 8, hd: 0.9, rot: ry });
    });
    // 地面熔岩辉光碟（装饰）
    for (const [x, z] of [[8, 8], [-8, -8], [8, -8], [-8, 8]] as [number, number][]) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 0.06, 20),
        new THREE.MeshStandardMaterial({ color: 0xff7a3c, emissive: 0xff5a20, emissiveIntensity: 0.9 }),
      );
      disc.position.set(x, 0.03, z);
      addMapObj(disc, false);
    }
    // 四角炉体方块
    const furnSpots: [number, number][] = [[-20, -16], [20, 16], [-20, 16], [20, -16]];
    furnSpots.forEach(([x, z], i) => addPillar(x, z, i, 4));
  } else {
    // 极地观测站：中央圆顶基地 + 冰晶柱环 + 科研舱（明亮冰蓝主题）
    const bldg = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.8, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a3f4e, roughness: 0.45, metalness: 0.6 }),
    );
    bldg.position.y = 0.55;
    bldg.userData.surface = true;
    addMapObj(bldg);
    pillarXZ.push({ x: 0, z: 0, r: 6.2 });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x334e60, roughness: 0.3, metalness: 0.5 }),
    );
    dome.position.y = 1.1;
    dome.userData.surface = true;
    addMapObj(dome);
    const domeEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.SphereGeometry(3.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
      new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9 }),
    );
    domeEdge.position.y = 1.1;
    addMapObj(domeEdge, false);
    // 八方冰晶柱
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * 17);
      const z = Math.round(Math.sin(a) * 17);
      const h = 4.5 + (i % 3);
      const crystal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 1.1, h, 5),
        new THREE.MeshStandardMaterial({ color: 0x2e4756, roughness: 0.35, metalness: 0.4 }),
      );
      crystal.position.set(x, h / 2, z);
      crystal.userData.surface = true;
      addMapObj(crystal);
      const ce = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.5, 1.1, h, 5)),
        new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85 }),
      );
      ce.position.copy(crystal.position);
      addMapObj(ce, false);
      pillarXZ.push({ x, z, r: 1.4 });
    }
    // 两条科研舱长墙（真实矩形碰撞）
    const pods: [number, number, number][] = [[0, -16, Math.PI / 2], [0, 16, Math.PI / 2]];
    pods.forEach(([x, z, ry]) => {
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(12, 3.4, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x2a3f4e, roughness: 0.5, metalness: 0.6 }),
      );
      pod.position.set(x, 1.7, z);
      pod.rotation.y = ry;
      pod.userData.surface = true;
      addMapObj(pod);
      const pe = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(12, 3.4, 2.2)),
        new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85 }),
      );
      pe.position.copy(pod.position);
      pe.rotation.y = ry;
      addMapObj(pe, false);
      wallRects.push({ x, z, hw: 6, hd: 1.1, rot: ry });
    });
    // 极光竖带（装饰）
    for (const [x, z] of [[-24, 0], [24, 0], [0, -24]] as [number, number][]) {
      const aur = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 9, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x7fd8ff, emissive: 0x7fd8ff, emissiveIntensity: 1.1 }),
      );
      aur.position.set(x, 4.5, z);
      addMapObj(aur, false);
    }
  }
}

// ---------- 武器视图（三把独立枪模） ----------
const gun = new THREE.Group();
const gunModels: Record<WeaponId, THREE.Group> = {} as any;
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.4, metalness: 0.8 });
  const darker = new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.5, metalness: 0.7 });
  const mkStrip = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.15 });

  // 脉冲步枪：细长枪身 + 侧光条
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.46), dark);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.34), mkStrip(CYAN));
    strip.position.y = 0.045;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), darker);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.32);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), darker);
    grip.position.set(0, -0.12, 0.14);
    g.add(body, strip, barrel, grip);
    gunModels.rifle = g;
  }
  // 重装霰弹：双管粗犷 + 泵动握把
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.4), dark);
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), darker);
    barrel1.rotation.x = Math.PI / 2;
    barrel1.position.set(-0.035, 0.02, -0.32);
    const barrel2 = barrel1.clone();
    barrel2.position.x = 0.035;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.26), mkStrip(MAGENTA));
    strip.position.y = 0.05;
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.12), darker);
    pump.position.set(0, -0.07, -0.18);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.1), darker);
    grip.position.set(0, -0.12, 0.12);
    g.add(body, barrel1, barrel2, strip, pump, grip);
    gunModels.shotgun = g;
  }
  // 蜂刺冲锋枪：短小紧凑 + 下置长弹匣
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.32), dark);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), darker);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.22);
    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 8), darker);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.01, -0.32);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.22), mkStrip(0x7dff9e));
    strip.position.y = 0.04;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.07), darker);
    mag.position.set(0, -0.13, -0.02);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.09), darker);
    grip.position.set(0, -0.1, 0.1);
    g.add(body, barrel, suppressor, strip, mag, grip);
    gunModels.smg = g;
  }
  // 磁轨炮：粗身 + 三道加速线圈
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.42), dark);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), darker);
    rail.position.set(0, 0.03, -0.4);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.3), mkStrip(AMBER));
    strip.position.y = 0.06;
    for (let i = 0; i < 3; i++) {
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.014, 8, 20),
        mkStrip(AMBER),
      );
      coil.position.set(0, 0.03, -0.28 - i * 0.13);
      g.add(coil);
    }
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.1), darker);
    grip.position.set(0, -0.13, 0.13);
    g.add(body, rail, strip, grip);
    gunModels.railgun = g;
  }
  // 榴弹发射器：粗短炮管 + 转膛鼓
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.3), dark);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12), darker);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.02, -0.28);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.2), mkStrip(0xff6a00));
    strip.position.y = 0.055;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 8), darker);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, -0.05, 0.0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.1), darker);
    grip.position.set(0, -0.13, 0.12);
    g.add(body, tube, strip, drum, grip);
    gunModels.launcher = g;
  }
  // 等离子切割机：粗 emis 枪头 + 散热鳍
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.34), dark);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.2, 10), mkStrip(0x9ff2ff));
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0.02, -0.28);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.24), mkStrip(0x9ff2ff));
    strip.position.y = 0.05;
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.04), darker);
      fin.position.set(0, -0.02, -0.08 + i * 0.08);
      g.add(fin);
    }
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.1), darker);
    grip.position.set(0, -0.12, 0.12);
    g.add(body, emitter, strip, grip);
    gunModels.plasma = g;
  }
  // 连锁电弧：双叉电极
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.3), dark);
    const forkL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.2), mkStrip(0xb08cff));
    forkL.position.set(-0.035, 0.03, -0.22);
    forkL.rotation.y = 0.15;
    const forkR = forkL.clone();
    forkR.position.x = 0.035;
    forkR.rotation.y = -0.15;
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), mkStrip(0xb08cff));
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0, 0.01, -0.08);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), darker);
    grip.position.set(0, -0.12, 0.1);
    g.add(body, forkL, forkR, coil, grip);
    gunModels.arc = g;
  }
  // 蜂群导弹：方形弹舱
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.32), dark);
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.26), mkStrip(0xff5577));
    hatch.position.y = 0.06;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.16), darker);
    barrel.position.set(0, 0, -0.22);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), darker);
    grip.position.set(0, -0.12, 0.11);
    g.add(body, hatch, barrel, grip);
    gunModels.homing = g;
  }
  // 烈焰喷射器：粗燃料罐 + 喷嘴
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.3), dark);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 10), mkStrip(0xff7a2a));
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, 0.09, 0.05);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.22, 10), darker);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0, -0.24);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.2), mkStrip(0xff7a2a));
    strip.position.y = -0.02;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), darker);
    grip.position.set(0, -0.12, 0.1);
    g.add(body, tank, nozzle, strip, grip);
    gunModels.flame = g;
  }

  for (const id of Object.keys(gunModels) as WeaponId[]) {
    gunModels[id].visible = id === 'rifle';
    gun.add(gunModels[id]);
  }
  gun.scale.setScalar(0.68);
  gun.position.set(0.24, -0.21, -0.6);
  camera.add(gun);
}
scene.add(camera);

const muzzleLight = new THREE.PointLight(CYAN, 0, 12);
scene.add(muzzleLight);

const tracers: { line: THREE.Line; life: number }[] = [];
for (let i = 0; i < 30; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const mat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}

// ---------- 敌方弹体 / 手雷 ----------
class EBullet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life = 5;
  constructor(from: THREE.Vector3, dir: THREE.Vector3, speed: number) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: MAGENTA }),
    );
    this.mesh.position.copy(from);
    this.vel = dir.clone().normalize().multiplyScalar(speed);
  }
  update(dt: number): boolean {
    this.life -= dt;
    this.mesh.position.addScaledVector(this.vel, dt);
    return this.life > 0;
  }
}
let ebullets: EBullet[] = [];

interface Grenade {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  fuse: number;
}
let grenades: Grenade[] = [];

function throwGrenade() {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.14, 0),
    new THREE.MeshStandardMaterial({ color: 0x223028, emissive: 0x3aff8f, emissiveIntensity: 1.6 }),
  );
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mesh.position.copy(camera.position).addScaledVector(dir, 0.6);
  const vel = dir.clone().multiplyScalar(19);
  vel.y += 4.5;
  grenades.push({ mesh, vel, fuse: 2.2 });
  scene.add(mesh);
}

function explodeAt(pos: THREE.Vector3, radius = GRENADE.radius, dmgScale = GRENADE.dmgMul, base = 90) {
  sfx.explode();
  particles.burst(pos, new THREE.Color(AMBER), 70, 10);
  particles.burst(pos, new THREE.Color(0xffffff), 30, 7);
  spawnHusk(pos, AMBER, 0.5);
  addShake(0.6);
  boomLight.position.copy(pos);
  boomLight.intensity = 60;
  const baseDmg = base * stats.dmgMul * dmgScale;
  if (mode === 'solo') {
    for (const en of [...enemies]) {
      const d = en.position.distanceTo(pos);
      if (d < radius) {
        const dmg = baseDmg * (1 - d / radius / 1.6);
        spawnFloater(en.position, `${Math.round(dmg)}`, 'crit');
        if (en.damage(dmg)) { trackContract('grenadeKills'); killEnemy(en, true); }
      }
    }
  } else {
    for (const en of enemies) {
      const d = en.position.distanceTo(pos);
      if (d < radius && en.netId) {
        const dmg = Math.round(baseDmg * (1 - d / radius / 1.6));
        net.send({ t: 'hit', id: en.netId, dmg, combo: 1 });
        en.damage(dmg);
        spawnFloater(en.position, `${dmg}`, 'crit');
      }
    }
  }
}

// ---------- 道具 ----------
interface Pickup {
  id: number; kind: 'health' | 'over' | 'core';
  mesh: THREE.Group; pos: THREE.Vector3; phase: number;
}
let pickups: Pickup[] = [];
let pickupId = 1;

function pickupColor(kind: string) {
  return kind === 'health' ? 0x3aff8f : kind === 'core' ? 0xfff7a0 : 0xffd24a;
}

function spawnPickupMesh(id: number, kind: 'health' | 'over' | 'core', x: number, z: number): Pickup {
  const color = pickupColor(kind);
  const group = new THREE.Group();
  const core = kind === 'core'
    ? new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.42),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8 }),
      )
    : new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 }),
      );
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.03, 8, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(core, halo);
  if (kind === 'core') {
    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.025, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
    );
    halo2.rotation.x = Math.PI / 2;
    halo2.rotation.y = Math.PI / 3;
    group.add(halo2);
  }
  const pos = new THREE.Vector3(x, 1, z);
  group.position.copy(pos);
  scene.add(group);
  return { id, kind, mesh: group, pos, phase: Math.random() * Math.PI * 2 };
}

function removePickup(id: number) {
  const idx = pickups.findIndex((p) => p.id === id);
  if (idx >= 0) {
    scene.remove(pickups[idx].mesh);
    pickups.splice(idx, 1);
  }
}

// ---------- 武器箱（地面拾取） ----------
interface WRack { weapon: WeaponId; affix: Affix | null; mesh: THREE.Group; pos: THREE.Vector3; }
let racks: WRack[] = [];

function spawnWeaponRack(w: WeaponId, x: number, z: number, affix: Affix | null = rollAffix()) {
  const cfg = WEAPONS[w];
  const group = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.85, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 0.4, metalness: 0.8 }),
  );
  pad.position.y = 0.05;
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.35, 0.5),
    new THREE.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 0.9 }),
  );
  crate.position.y = 0.75;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.38, 6, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 3;
  group.add(pad, crate, beam);
  group.position.set(x, 0, z);
  scene.add(group);
  racks.push({ weapon: w, affix, mesh: group, pos: new THREE.Vector3(x, 0, z) });
}

function clearRacks() {
  for (const r of racks) { scene.remove(r.mesh); disposeObj(r.mesh); }
  racks = [];
}

function dropRandomRack(x: number, z: number) {
  const candidates = ALL_WEAPONS.filter((w) => w !== 'rifle');
  spawnWeaponRack(candidates[Math.floor(Math.random() * candidates.length)], x, z);
}

function updateRacks(dt: number) {
  for (let i = racks.length - 1; i >= 0; i--) {
    const r = racks[i];
    r.mesh.rotation.y += dt * 1.2;
    const crate = r.mesh.children[1] as THREE.Mesh;
    crate.position.y = 0.75 + Math.sin(performance.now() * 0.003 + i * 2) * 0.08;
    if (state === 'playing' && !myDead) {
      const d = Math.hypot(camera.position.x - r.pos.x, camera.position.z - r.pos.z);
      if (d < 1.6) {
        particles.burst(new THREE.Vector3(r.pos.x, 1, r.pos.z), new THREE.Color(WEAPONS[r.weapon].color), 20, 5);
        if (r.affix && !weaponAffix[r.weapon].includes(r.affix) && weaponAffix[r.weapon].length < 3) weaponAffix[r.weapon].push(r.affix);
        pickupWeapon(r.weapon);
        scene.remove(r.mesh);
        disposeObj(r.mesh);
        racks.splice(i, 1);
      }
    }
  }
}

// ---------- 远程玩家 ----------
interface RemotePlayer {
  id: string; name: string;
  group: THREE.Group; tag: THREE.Sprite;
  hitMeshes: THREE.Mesh[];
  body: THREE.Mesh;
  bubble: THREE.Mesh;
  target: THREE.Vector3; yaw: number;
  score: number; kills: number; dead: boolean; protect: boolean;
}
const remotes = new Map<string, RemotePlayer>();

function addRemote(id: string, name: string, x: number, y: number, z: number): RemotePlayer {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x113344, emissive: 0x2288aa, emissiveIntensity: 0.7, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), bodyMat);
  body.position.y = 0.55;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x0d1b26, emissive: 0x2288aa, emissiveIntensity: 0.5, roughness: 0.4 }),
  );
  head.position.y = 1.32;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.1, 0.08),
    new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 2.2 }),
  );
  visor.position.set(0, 1.33, -0.17);
  // 背部喷射焰
  const jet = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.3, 8),
    new THREE.MeshBasicMaterial({ color: 0x7dff9e, transparent: true, opacity: 0.7 }),
  );
  jet.rotation.x = Math.PI;
  jet.position.set(0, 0.15, 0.32);
  const tag = makeNameTag(name, '#7db8ff');
  tag.position.y = 2.0;
  // 出生保护护盾罩
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 14, 12),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  bubble.position.y = 0.7;
  bubble.visible = false;
  group.add(body, head, visor, jet, bubble, tag);
  group.position.set(x, y - EYE_HEIGHT, z);
  scene.add(group);
  const rp: RemotePlayer = { id, name, group, tag, hitMeshes: [body, head, visor], bubble, body, target: group.position.clone(), yaw: 0, score: 0, kills: 0, dead: false, protect: false };
  for (const m of rp.hitMeshes) m.userData.pvpId = id;
  remotes.set(id, rp);
  return rp;
}

// ============================================================
// 强化系统（Roguelite）
// ============================================================
interface Stats {
  dmgMul: number; rateMul: number; magMul: number; reloadMul: number;
  speedMul: number; maxHp: number; lifesteal: number; critChance: number;
}
let stats: Stats = { dmgMul: 1, rateMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, maxHp: 100, lifesteal: 0, critChance: 0 };

interface Upgrade {
  id: string; name: string; desc: string; level: number; max: number;
  apply: (m?: number) => void;
}
const UPGRADE_POOL: Upgrade[] = [
  { id: 'dmg',    name: '能量放大',   desc: '武器伤害 +25%',        level: 0, max: 6, apply: (m = 1) => { stats.dmgMul += 0.25 * m; } },
  { id: 'rate',   name: '超频扳机',   desc: '射击速率 +18%',        level: 0, max: 5, apply: (m = 1) => { stats.rateMul *= Math.max(0.5, 1 - 0.18 * m); } },
  { id: 'mag',    name: '扩容弹匣',   desc: '弹匣容量 +50%',        level: 0, max: 4, apply: (m = 1) => { stats.magMul += 0.5 * m; ammo = magOf(weapon); } },
  { id: 'reload', name: '快速装填',   desc: '换弹速度 +30%',        level: 0, max: 4, apply: (m = 1) => { stats.reloadMul = Math.max(0.3, stats.reloadMul * (1 - 0.3 * m)); } },
  { id: 'speed',  name: '推进器',     desc: '移动速度 +15%',        level: 0, max: 4, apply: (m = 1) => { stats.speedMul += 0.15 * m; } },
  { id: 'hp',     name: '装甲板',     desc: '护盾上限 +25 并回复',  level: 0, max: 5, apply: (m = 1) => { stats.maxHp += 25 * m; hp = Math.min(hp + 25 * m, stats.maxHp); } },
  { id: 'steal',  name: '虹吸协议',   desc: '击杀回复护盾',         level: 0, max: 3, apply: (m = 1) => { stats.lifesteal += Math.ceil(4 * m); } },
  { id: 'crit',   name: '弱点分析',   desc: '暴击几率 +15%',        level: 0, max: 4, apply: (m = 1) => { stats.critChance += 0.15 * m; } },
  { id: 'nuke',   name: '爆破专家',   desc: '手雷范围与伤害 +30%',  level: 0, max: 3, apply: (m = 1) => { GRENADE.radius *= 1 + 0.3 * m; GRENADE.dmgMul *= 1 + 0.3 * m; } },
];

// 交易型（诅咒）强化：质变 + 代价
const CURSED_POOL: Upgrade[] = [
  { id: 'zerk',  name: '狂战士协议', desc: '伤害 +45% · 护盾上限 -15', level: 0, max: 2, apply: () => { stats.dmgMul += 0.45; stats.maxHp = Math.max(40, stats.maxHp - 15); hp = Math.min(hp, stats.maxHp); } },
  { id: 'glass', name: '玻璃大炮',   desc: '暴击 +30% · 护盾上限 -25', level: 0, max: 2, apply: () => { stats.critChance += 0.3; stats.maxHp = Math.max(40, stats.maxHp - 25); hp = Math.min(hp, stats.maxHp); } },
  { id: 'greed', name: '贪婪契约',   desc: '金币掉落 ×2 · 承伤 +25%',  level: 0, max: 2, apply: () => { cursedGreed = true; cursedFrail = true; } },
  { id: 'swap',  name: '空间换子弹', desc: '弹匣 +80% · 移速 -12%',   level: 0, max: 2, apply: () => { stats.magMul += 0.8; stats.speedMul = Math.max(0.6, stats.speedMul - 0.12); ammo = magOf(weapon); } },
];

// 稀有度
const RARITIES = [
  { name: '普通', mult: 1, cls: '' },
  { name: '稀有', mult: 1.5, cls: 'rare' },
  { name: '史诗', mult: 2, cls: 'epic' },
  { name: '传说', mult: 2.5, cls: 'legend' },
];
function rollRarity() {
  const r = Math.random();
  if (r < 0.6) return 0;
  if (r < 0.85) return 1;
  if (r < 0.97) return 2;
  return 3;
}
const GRENADE = { cdMax: 8, cd: 0, radius: 5.2, dmgMul: 1 };
let cursedGreed = false;
let cursedFrail = false;

// ---------- 武器词缀 ----------
type Affix = 'inferno' | 'vamp' | 'swift' | 'expanded' | 'deadly';
const AFFIX_INFO: Record<Affix, { name: string; desc: string }> = {
  inferno:  { name: '炽热的', desc: '命中点燃目标' },
  vamp:     { name: '虹吸的', desc: '击杀回复 2 护盾' },
  swift:    { name: '迅捷的', desc: '换弹速度 +25%' },
  expanded: { name: '扩容的', desc: '弹匣 +30%' },
  deadly:   { name: '致命的', desc: '暴击率 +10%' },
};
const weaponAffix: Record<WeaponId, Affix[]> = {
  rifle: [], smg: [], shotgun: [], railgun: [], launcher: [],
  plasma: [], arc: [], homing: [], flame: [],
};
function hasAffix(w: WeaponId, a: Affix): boolean { return weaponAffix[w].includes(a); }
function rollAffix(): Affix | null {
  const keys = Object.keys(AFFIX_INFO) as Affix[];
  return Math.random() < 0.65 ? keys[Math.floor(Math.random() * keys.length)] : null;
}
function critRoll() {
  const bonus = hasAffix(weapon, 'deadly') ? 0.1 + 0.05 * (affixLvOf(weapon, 'deadly') - 1) : 0;
  return Math.random() < stats.critChance + bonus;
}

const magOf = (w: WeaponId) => Math.round(WEAPONS[w].mag * stats.magMul * (hasAffix(w, 'expanded') ? 1 + 0.3 * affixLvOf(w, 'expanded') : 1));

interface CardEntry { u: Upgrade; mult: number; cls: string; rname: string; cursed: boolean; }
let currentPicks: CardEntry[] = [];

function redrawCards() {
  const pool = UPGRADE_POOL.filter((u) => u.level < u.max);
  const cursedPool = CURSED_POOL.filter((u) => u.level < u.max);
  currentPicks = [];
  const used = new Set<string>();
  for (let slot = 0; slot < 3; slot++) {
    // 22% 概率出交易（诅咒）强化
    if (cursedPool.length > 0 && Math.random() < 0.22) {
      const avail = cursedPool.filter((u) => !currentPicks.some((p) => p.u.id === u.id));
      if (avail.length > 0) {
        const u = avail[Math.floor(Math.random() * avail.length)];
        currentPicks.push({ u, mult: 1, cls: 'cursed', rname: '⚠ 交易', cursed: true });
        continue;
      }
    }
    const avail = pool.filter((u) => !used.has(u.id) && !currentPicks.some((p) => p.u.id === u.id));
    if (avail.length === 0) break;
    const u = avail[Math.floor(Math.random() * avail.length)];
    used.add(u.id);
    const ri = rollRarity();
    currentPicks.push({ u, mult: RARITIES[ri].mult, cls: RARITIES[ri].cls, rname: RARITIES[ri].name, cursed: false });
  }
  const elCards = $('upgrade-cards');
  elCards.innerHTML = '';
  currentPicks.forEach((entry, i) => {
    const card = document.createElement('button');
    card.className = `upgrade-card ${entry.cls}`;
    card.style.animationDelay = `${i * 0.09}s`;
    card.innerHTML = `
      <div class="uc-key">${i + 1}</div>
      <div class="uc-rar ${entry.cls}">${entry.rname}</div>
      <div class="uc-name">${entry.u.name}</div>
      <div class="uc-desc">${entry.u.desc}${entry.mult > 1 && !entry.cursed ? `（×${entry.mult}）` : ''}</div>
      <div class="uc-lv">${'◆'.repeat(entry.u.level)}${'◇'.repeat(entry.u.max - entry.u.level)}</div>`;
    card.addEventListener('click', () => chooseUpgrade(entry));
    elCards.appendChild(card);
  });
}

// ---------- 军火商 ----------
const WEAPON_PRICES: Record<string, number> = { smg: 150, shotgun: 180, railgun: 320, launcher: 260, plasma: 380, arc: 340, homing: 420, flame: 300 };

function grantShopWeapon(w: WeaponId) {
  ammoPool[weapon] = ammo;
  owned.push(w);
  ammoPool[w] = magOf(w);
  weapon = w;
  ammo = ammoPool[w];
  reloading = 0;
  showWeaponModel(w);
  updateAmmoUI();
  toast(`购入 ${WEAPONS[w].name} — 按 ${owned.length} 切换`);
}

function renderShop() {
  const el = $('shop-items');
  el.innerHTML = '';
  const items: { label: string; sub: string; price: number; onBuy: () => void; disabled?: boolean }[] = [];
    for (const w of ALL_WEAPONS) {
      if (w === 'rifle') continue;
      const cfg = WEAPONS[w];
      const affs = weaponAffix[w];
      const aff = affs.length ? affs.map((a) => AFFIX_INFO[a].name).join('·') + '·' : '';
      if (!owned.includes(w)) {
        items.push({ label: `购买 ${aff}${cfg.name}`, sub: affs.length ? affs.map((a) => AFFIX_INFO[a].desc).join('；') : '新武器入列', price: WEAPON_PRICES[w], onBuy: () => grantShopWeapon(w) });
      } else if (weaponLv[w] < 3) {
      items.push({ label: `${cfg.name} → ${'I'.repeat(weaponLv[w] + 1)}`, sub: '熟练度 +15% 伤害', price: 130, onBuy: () => { weaponLv[w]++; ammoPool[w] = magOf(w); if (weapon === w) { ammo = ammoPool[w]; updateAmmoUI(); } updateAmmoUI(); } });
    } else {
      items.push({ label: `${cfg.name} 已满级`, sub: '', price: 0, onBuy: () => {}, disabled: true });
    }
  }
  items.push({ label: '护盾修复 +40', sub: '立即回复', price: 60, onBuy: () => { hp = Math.min(hp + 40, stats.maxHp); updateHealthUI(); } });
  items.push({ label: '全弹药补满', sub: '所有持有武器', price: 50, onBuy: () => { for (const w of owned) ammoPool[w] = magOf(w); ammo = ammoPool[weapon]; updateAmmoUI(); } });
  items.push({ label: '随机强化 ×1', sub: '不占用三选一', price: 180, onBuy: () => { autoUpgrade(); } });
  items.push({
    label: '血祭祭坛',
    sub: '支付 30% 当前护盾 → 随机稀有+强化',
    price: 0,
    disabled: hp <= stats.maxHp * 0.4,
    onBuy: () => {
      hp = Math.max(1, Math.round(hp * 0.7));
      updateHealthUI();
      const pool = UPGRADE_POOL.filter((u) => u.level < u.max);
      if (pool.length === 0) { toast('强化已全部满级'); return; }
      const u = pool[Math.floor(Math.random() * pool.length)];
      const mult = 1.5 + Math.random();
      u.level++;
      u.apply(mult);
      toast(`血祭完成：${u.name} ×${mult.toFixed(1)}`);
      checkAchievements();
    },
  });
  items.push({ label: '手雷冷却 -1s', sub: `当前 ${GRENADE.cdMax.toFixed(0)}s`, price: 100, disabled: shopLv.grenade >= 2, onBuy: () => { shopLv.grenade++; GRENADE.cdMax = Math.max(4, GRENADE.cdMax - 1); } });
  items.push({ label: '冲刺冷却 -0.5s', sub: `当前 ${dashCdMax.toFixed(1)}s`, price: 100, disabled: shopLv.dash >= 2, onBuy: () => { shopLv.dash++; dashCdMax = Math.max(2, dashCdMax - 0.5); } });
  items.push({ label: '金币磁吸 +60%', sub: '拾取更顺手', price: 80, disabled: shopLv.magnet >= 1, onBuy: () => { shopLv.magnet++; coinMagnet = 6; } });
  items.push({ label: '生命上限 +20', sub: '可重复购买', price: 120, onBuy: () => { stats.maxHp += 20; hp = Math.min(hp + 20, stats.maxHp); updateHealthUI(); } });

  for (const it of items) {
    const btn = document.createElement('button');
    btn.className = 'shop-item';
    if (it.disabled || coins < it.price) btn.classList.add('off');
    btn.innerHTML = `<span class="si-name">${it.label}</span><span class="si-sub">${it.sub}</span><b class="si-price">${it.disabled ? '—' : it.price > 0 ? it.price + '◆' : '血祭'}</b>`;
    btn.addEventListener('click', () => {
      if (it.disabled || coins < it.price) { sfx.empty(); return; }
      coins -= it.price;
      updateCoinsUI();
      $('shop-coins').textContent = String(coins);
      it.onBuy();
      sfx.pickup();
      renderShop();
    });
    el.appendChild(btn);
  }
  $('shop-coins').textContent = String(coins);
}

function drawUpgradeCards() {
  redrawCards();
  renderShop();
  $('upgrade-title').textContent = `WAVE ${String(wave).padStart(2, '0')} 清除 — 整备阶段`;
  const rerollCost = Math.max(5, 30 - metaLv('reroll') * 5);
  $('btn-reroll').textContent = `↻ 换一批（${rerollCost}◆）`;
  $('upgrades').classList.remove('hidden');
}

$('btn-reroll').addEventListener('click', () => {
  const rerollCost = Math.max(5, 30 - metaLv('reroll') * 5);
  if (coins < rerollCost) { sfx.empty(); return; }
  coins -= rerollCost;
  updateCoinsUI();
  redrawCards();
  renderShop();
  sfx.swap();
});

function chooseUpgrade(entry: CardEntry) {
  entry.u.level++;
  entry.u.apply(entry.mult);
  $('upgrades').classList.add('hidden');
  state = 'playing';
  toast(`${entry.cursed ? '⚠ 交易达成：' : '强化获得：'}${entry.u.name}`);
  sfx.pickup();
  updateHealthUI();
  updateAmmoUI();
  lockPointer();
  startWave(wave + 1);
}

function autoUpgrade() {
  const pool = UPGRADE_POOL.filter((u) => u.level < u.max);
  if (pool.length === 0) return;
  const u = pool[Math.floor(Math.random() * pool.length)];
  u.level++;
  u.apply();
  toast(`系统随机强化：${u.name}`);
  updateHealthUI();
  updateAmmoUI();
}

function resetStats() {
  stats = { dmgMul: 1, rateMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, maxHp: 100, lifesteal: 0, critChance: 0 };
  GRENADE.cd = 0; GRENADE.radius = 5.2; GRENADE.dmgMul = 1; GRENADE.cdMax = 8;
  dashCdMax = 3; coinMagnet = 3.8;
  shopLv.grenade = 0; shopLv.dash = 0; shopLv.magnet = 0;
  cursedGreed = false; cursedFrail = false;
  for (const u of UPGRADE_POOL) u.level = 0;
  for (const u of CURSED_POOL) u.level = 0;
}

// ============================================================
// 游戏状态
// ============================================================
let state: GameState = 'menu';
let mode: Mode = 'solo';
let paused = false;
let enemies: Enemy[] = [];
let enemyMeshes: THREE.Object3D[] = [];

let wave = 1;
let queue: EnemyKind[] = [];
let spawnTimer = 0;
let waveClearTimer = -1;
// 单机模式
let survivalT = 0;
let waveTime = 0;
let eventArmed = false;
let eventFired = false;
let eventAt = -1;
let frenzyT = 0;
let score = 0;
let kills = 0;
let combo = 1;
let comboTimer = 0;
let best = Number(localStorage.getItem('neon-strike-best') ?? 0);

let hp = 100;
let regenDelay = 0;
let weapon: WeaponId = 'rifle';
let owned: WeaponId[] = ['rifle'];                       // 已获得的武器（拾取/商店扩充）
const ammoPool: Record<WeaponId, number> = { rifle: 30, smg: 0, shotgun: 0, railgun: 0, launcher: 0, plasma: 0, arc: 0, homing: 0, flame: 0 };
const weaponLv: Record<WeaponId, number> = { rifle: 0, smg: 0, shotgun: 0, railgun: 0, launcher: 0, plasma: 0, arc: 0, homing: 0, flame: 0 };
let ammo = WEAPONS.rifle.mag;

// 当前武器伤害倍率（全局强化 × 武器熟练度）
function dmgOf() {
  return stats.dmgMul * (1 + 0.15 * weaponLv[weapon]);
}
let reloading = 0;
let fireCooldown = 0;
let firing = false;
let aiming = false;
let gunKick = 0;
let overcharge = 0;
let myDead = false;
let selfProtected = false;
let respawnTimer = 0;
let mpTotalLeft = 0;

const keys = new Set<string>();
const playerVel = new THREE.Vector3();
let grounded = true;
let bobPhase = 0;
let playerName = '玩家';

// 冲刺
let dashCd = 0;
let dashTime = 0;
let dashCdMax = 3;
let coinMagnet = 3.8;
const shopLv = { grenade: 0, dash: 0, magnet: 0 };
const dashDir = new THREE.Vector3();
// 屏幕震动
let shake = 0;
function addShake(amount: number) { shake = Math.min(shake + amount, 1.2); }
// 全屏
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}

// 击毁残骸（扩散消散的线框壳）
const husks: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
function spawnHusk(pos: THREE.Vector3, color: number, size: number) {
  const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.8 });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  husks.push({ mesh, mat, life: 1 });
  if (husks.length > 8) {
    const old = husks.shift()!;
    scene.remove(old.mesh);
  }
}
function updateHusks(dt: number) {
  for (let i = husks.length - 1; i >= 0; i--) {
    const h = husks[i];
    h.life -= dt * 1.8;
    if (h.life <= 0) {
      scene.remove(h.mesh);
      husks.splice(i, 1);
      continue;
    }
    h.mesh.scale.setScalar(1 + (1 - h.life) * 1.8);
    h.mesh.rotation.y += dt * 3;
    h.mesh.rotation.x += dt * 1.5;
    h.mat.opacity = h.life * 0.8;
  }
}

// 出生预警光柱
const beams: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
function spawnBeam(pos: THREE.Vector3, color: number) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 14, 12, 1, true), mat);
  mesh.position.set(pos.x, 7, pos.z);
  scene.add(mesh);
  beams.push({ mesh, mat, life: 1 });
}
function updateBeams(dt: number) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.life -= dt * 1.5;
    if (b.life <= 0) {
      scene.remove(b.mesh);
      beams.splice(i, 1);
      continue;
    }
    b.mat.opacity = b.life * 0.5;
    b.mesh.scale.x = b.mesh.scale.z = 1 + (1 - b.life) * 1.6;
  }
}

// 击杀卡顿帧（打击感）
let hitStop = 0;

// ---------- 等离子光束 / 追踪导弹 ----------
const beamMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
);
beamMesh.visible = false;
scene.add(beamMesh);
let beamActive = false;

interface Missile { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; }
let missiles: Missile[] = [];

function spawnHomingMissile() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x442233, emissive: 0xff5577, emissiveIntensity: 1.6 }),
  );
  mesh.position.copy(camera.position).addScaledVector(dir, 0.6);
  scene.add(mesh);
  missiles.push({ mesh, vel: dir.clone().multiplyScalar(13), life: 4.5 });
}

function updateMissiles(dt: number) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const ms = missiles[i];
    ms.life -= dt;
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(ms.mesh.position);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const desired = best.position.clone().sub(ms.mesh.position).normalize().multiplyScalar(17);
      ms.vel.lerp(desired, Math.min(dt * 3.2, 1));
    }
    ms.vel.y -= 2 * dt;
    ms.mesh.position.addScaledVector(ms.vel, dt);
    ms.mesh.lookAt(ms.mesh.position.clone().add(ms.vel));
    if (Math.random() < 0.5) particles.burst(ms.mesh.position, new THREE.Color(0xff5577), 1, 0.6);
    const boom = ms.life <= 0 || ms.mesh.position.y < 0.1 || hitsStatic(ms.mesh.position) || (best !== null && bd < KIND_CFG[best.kind].r + 0.8);
    if (boom) {
      explodeAt(ms.mesh.position.clone(), 3.4, 1, 60);
      scene.remove(ms.mesh);
      disposeObj(ms.mesh);
      missiles.splice(i, 1);
    }
  }
}

function beamTick(cfg: WeaponCfg) {
  raycaster.far = cfg.range ?? 13;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects([...enemyMeshes, ...collidables], false);
  gun.getWorldPosition(muzzleWorld);
  muzzleWorld.add(tmpVec.set(0, 0.04, -0.35).applyQuaternion(camera.quaternion));
  const end = hits.length > 0 ? hits[0].point.clone() : raycaster.ray.at(cfg.range ?? 13, new THREE.Vector3());
  const len = muzzleWorld.distanceTo(end);
  beamActive = true;
  beamMesh.position.copy(muzzleWorld).add(end).multiplyScalar(0.5);
  beamMesh.scale.set(1, Math.max(len, 0.1), 1);
  beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(muzzleWorld).normalize());
  sfx.beamTick();
  muzzleLight.position.copy(end);
  muzzleLight.intensity = 4;
  if (hits.length > 0) {
    const hitEnemy = hits[0].object.userData.enemy as Enemy | undefined;
    if (hitEnemy && hitEnemy.alive) {
      let dmg = cfg.dmg * dmgOf();
      // 破甲：对重甲单位 1.6 倍
      if (hitEnemy.kind === 'tank' || hitEnemy.kind === 'elite' || hitEnemy.kind === 'boss') dmg *= 1.6;
      const d = Math.round(dmg);
      if (Math.random() < 0.4) spawnFloater(end, String(d), 'dmg');
      if (Math.random() < 0.35) particles.burst(end, new THREE.Color(0x9ff2ff), 2, 2);
      if (mode === 'solo') { if (hitEnemy.damage(d)) killEnemy(hitEnemy); }
      else { hitEnemy.damage(d); net.send({ t: 'hit', id: hitEnemy.netId, dmg: d, combo }); }
    } else if (Math.random() < 0.4) {
      particles.burst(end, new THREE.Color(0x9ff2ff), 2, 2);
    }
  }
}

// ---------- 金币 ----------
interface Coin { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; }
let coinsE: Coin[] = [];
let coins = 0;
const coinGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.045, 10);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffb300, emissiveIntensity: 1.4 });

function dropCoins(pos: THREE.Vector3, n: number) {
  const count = Math.round(n * (cursedGreed ? 2 : 1) * (dailyHas('drich') ? 1.5 : 1));
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2));
    mesh.position.copy(p);
    scene.add(mesh);
    coinsE.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 4 + Math.random() * 2.5, (Math.random() - 0.5) * 3), life: 14 });
  }
}

function updateCoins(dt: number) {
  for (let i = coinsE.length - 1; i >= 0; i--) {
    const c = coinsE[i];
    c.life -= dt;
    if (c.life <= 0) { scene.remove(c.mesh); coinsE.splice(i, 1); continue; }
    const toCam = new THREE.Vector3().subVectors(camera.position, c.mesh.position);
    const d = toCam.length();
    if (d < coinMagnet && !myDead) {
      // 磁吸
      c.vel.addScaledVector(toCam.normalize(), 42 * dt);
    } else {
      c.vel.y -= 16 * dt;
      if (c.mesh.position.y < 0.25) { c.mesh.position.y = 0.25; c.vel.y = Math.abs(c.vel.y) * 0.35; c.vel.x *= 0.8; c.vel.z *= 0.8; }
    }
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.y += dt * 6;
    if (d < 1.1 && !myDead) {
      const amt = gainCoins(5);
      trackContract('coins', amt);
      sfx.hit();
      updateCoinsUI();
      scene.remove(c.mesh);
      coinsE.splice(i, 1);
    }
  }
}

function updateCoinsUI() {
  $('coins').textContent = String(coins);
}

// ---------- 合同任务 ----------
interface Contract { key: string; desc: string; target: number; progress: number; done: boolean; reward: number; }
const CONTRACT_POOL: Omit<Contract, 'progress' | 'done'>[] = [
  { key: 'kills',      desc: '击毁 35 台敌机',        target: 35, reward: 80 },
  { key: 'coins',      desc: '收集 400 金币',         target: 400, reward: 60 },
  { key: 'headshot',   desc: '爆头命中 20 次',        target: 20, reward: 100 },
  { key: 'grenadeKills', desc: '爆破炸毁 10 台敌机',  target: 10, reward: 100 },
  { key: 'combo3',     desc: '打出 8 次 ×3 连杀',     target: 8, reward: 80 },
  { key: 'railKills',  desc: '磁轨炮击毁 10 台',      target: 10, reward: 100 },
  { key: 'pads',       desc: '使用弹跳板 6 次',       target: 6, reward: 50 },
  { key: 'shotgunKills', desc: '霰弹枪击毁 15 台',    target: 15, reward: 90 },
];
let contracts: Contract[] = [];

function rollContracts() {
  const pool = [...CONTRACT_POOL].sort(() => Math.random() - 0.5);
  contracts = pool.slice(0, 3).map((c) => ({ ...c, progress: 0, done: false }));
  renderContracts();
}

function trackContract(key: string, amount = 1) {
  let changed = false;
  for (const c of contracts) {
    if (c.key === key && !c.done) {
      c.progress = Math.min(c.target, c.progress + amount);
      if (c.progress >= c.target) {
        c.done = true;
        const amt = gainCoins(c.reward);
        updateCoinsUI();
        toast(`✔ 合同完成：${c.desc} +${amt}◆`);
        sfx.pickup();
      }
      changed = true;
    }
  }
  if (changed) renderContracts();
}

function renderContracts() {
  const el = $('contracts');
  el.innerHTML = contracts.map((c) =>
    `<div class="contract${c.done ? ' done' : ''}"><span>✦ ${c.desc}</span><b>${c.progress}/${c.target}</b></div>`,
  ).join('');
}

// ---------- 军衔（跨局成长） ----------
let xp = Number(localStorage.getItem('ns-xp') ?? 0);
let prestige = Number(localStorage.getItem('ns-prestige') ?? 0); // 转生次数：每层永久 经验&金币 +10%
let prestigeArmed = false; // 转生二段确认
function getRank() { return Math.max(1, Math.floor(Math.sqrt(xp / 80))); }

function commitXp() {
  xp += Math.max(0, Math.round(score / 10 * (1 + 0.06 * perks.xp) * (1 + 0.1 * prestige)));
  localStorage.setItem('ns-xp', String(xp));
}

// 电磁危险区（单机）
interface Hazard {
  x: number; z: number; r: number;
  ring: THREE.Mesh; fill: THREE.Mesh;
  state: 'warn' | 'active';
  t: number; tickCd: number; activeT: number;
}
let hazards: Hazard[] = [];

function spawnHazard(quick = false) {
  const ang = Math.random() * Math.PI * 2;
  const d = quick ? 3.5 + Math.random() * 5 : 8 + Math.random() * 20;
  const x = quick ? camera.position.x + Math.cos(ang) * d : Math.cos(ang) * d;
  const z = quick ? camera.position.z + Math.sin(ang) * d : Math.sin(ang) * d;
  const r = quick ? 2.6 : 3.2 + Math.random() * 1.2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r - 0.25, r, 48),
    new THREE.MeshBasicMaterial({ color: 0xff3838, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.04, z);
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.25, 48),
    new THREE.MeshBasicMaterial({ color: 0xff3838, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(x, 0.035, z);
  scene.add(ring, fill);
  hazards.push({ x, z, r, ring, fill, state: 'warn', t: quick ? 1.4 : 1.6, tickCd: 0, activeT: quick ? 1.3 : 5 });
  if (!quick) toast('⚠ 电磁区域充能中');
}

function updateHazards(dt: number) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.t -= dt;
    if (h.state === 'warn') {
      // 闪烁预警
      const blink = Math.sin(h.t * 16) > 0;
      (h.ring.material as THREE.MeshBasicMaterial).opacity = blink ? 0.85 : 0.25;
      if (h.t <= 0) {
        h.state = 'active';
        h.t = h.activeT;
        sfx.bossWarn();
        addShake(0.25);
      }
    } else {
      (h.fill.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(h.t * 10) * 0.06;
      (h.ring.material as THREE.MeshBasicMaterial).opacity = 0.8;
      h.tickCd -= dt;
      const pd = Math.hypot(camera.position.x - h.x, camera.position.z - h.z);
      if (pd < h.r && h.tickCd <= 0 && !myDead) {
        h.tickCd = 0.5;
        hp -= 7;
        regenDelay = 4;
        flashDamage();
        addShake(0.2);
        updateHealthUI();
        if (hp <= 0) { hp = 0; updateHealthUI(); if (mode === 'solo') { sfx.death(); gameOver(); } else { myDead = true; respawnTimer = 5; gun.visible = false; firing = false; sfx.death(); elRespawn.classList.remove('hidden'); } }
      }
      if (h.t <= 0) {
        scene.remove(h.ring, h.fill);
        hazards.splice(i, 1);
      }
    }
  }
}

// ---------- 成就 ----------
const ACH_DEFS: { id: string; name: string; desc: string; reward: number; test: () => boolean }[] = [
  { id: 'first',  name: '初次击毁',       desc: '摧毁你的第一台敌机',        reward: 50,  test: () => kills >= 1 },
  { id: 'k10',    name: '械斗熟练',       desc: '单局击毁 10 台敌机',        reward: 80,  test: () => kills >= 10 },
  { id: 'k50',    name: '战场清扫者',     desc: '单局击毁 50 台敌机',        reward: 150, test: () => kills >= 50 },
  { id: 's5k',    name: '五千分俱乐部',   desc: '单局得分达到 5000',         reward: 100, test: () => score >= 5000 },
  { id: 's20k',   name: '竞技场传奇',     desc: '单局得分达到 20000',        reward: 300, test: () => score >= 20000 },
  { id: 'w5',     name: '挺过第五波',     desc: '单局到达第 5 波',           reward: 80,  test: () => wave >= 5 },
  { id: 'w10',    name: '双位数波次',     desc: '单局到达第 10 波',          reward: 200, test: () => wave >= 10 },
  { id: 'boss',   name: '弑主者',         desc: '击毁核心主宰',              reward: 250, test: () => bossKills >= 1 },
  { id: 'maxgun', name: '枪械大师',       desc: '任意武器熟练度达到 III',    reward: 200, test: () => ALL_WEAPONS.some((w) => weaponLv[w] >= 3) },
  { id: 'rich',   name: '竞技场富豪',     desc: '单局持有金币达到 500',      reward: 100, test: () => coins >= 500 },
  { id: 'allgun', name: '军火贩子',       desc: '单局集齐全部 5 把武器',     reward: 250, test: () => owned.length >= 5 },
  // 养成向长线成就
  { id: 'loadout2', name: '双枪出征',     desc: '出战装配两把武器',          reward: 150, test: () => vault.loadout.length >= 2 },
  { id: 'mast_full', name: '人枪合一',    desc: '任意武器精通达到仓库 III',  reward: 300, test: () => ALL_WEAPONS.some((w) => (vault.mastery[w] ?? 0) >= 3) },
  { id: 'forge3',   name: '精工锻造',     desc: '任意武器 3 条词缀槽全锻',   reward: 300, test: () => ALL_WEAPONS.some((w) => (vault.affix[w]?.length ?? 0) >= 3) },
  { id: 'meta_max', name: '深谋远虑',     desc: '任一元升级树升到满级',      reward: 250, test: () => META_DEFS.some((m) => metaLv(m.key) >= m.max) },
  { id: 'vault_all', name: '军备收藏家',  desc: '仓库解锁全部 8 把武器',     reward: 400, test: () => vault.weapons.length >= 8 },
  { id: 'w15',      name: '十五波守望',   desc: '单局到达第 15 波',          reward: 400, test: () => wave >= 15 },
  { id: 's50k',     name: '五万分传说',   desc: '单局得分达到 50000',        reward: 500, test: () => score >= 50000 },
];
let bossKills = 0;
let lowHpTime = 0;
const achUnlocked = new Set<string>(JSON.parse(localStorage.getItem('ns-ach') ?? '[]') as string[]);

// ---------- 战绩（持久化） ----------
interface LTK { kills: number; bosses: number; coins: number; bestWave: number; pvpWins: number; runs: number; }
let ltk: LTK = JSON.parse(localStorage.getItem('ns-stats') ?? '{"kills":0,"bosses":0,"coins":0,"bestWave":0,"pvpWins":0,"runs":0}');
function saveLtk() { localStorage.setItem('ns-stats', JSON.stringify(ltk)); }

function renderAchPanel(tab: 'ach' | 'stats') {
  $('achv-title').textContent = tab === 'ach' ? '成就' : '战绩';
  const body = $('achv-body');
  if (tab === 'ach') {
    body.innerHTML = ACH_DEFS.map((a) => {
      const un = achUnlocked.has(a.id);
      return `<div class="ach-row${un ? ' un' : ''}"><span class="ach-ico">${un ? '✅' : '🔒'}</span><div class="ach-txt"><b>${a.name}</b><span>${a.desc} · 奖励 +${a.reward}◆</span></div></div>`;
    }).join('');
  } else {
    body.innerHTML = `
      <div class="stat-grid">
        <div class="stat-cell"><b>${ltk.kills}</b><span>累计击毁</span></div>
        <div class="stat-cell"><b>${ltk.bosses}</b><span>BOSS 击杀</span></div>
        <div class="stat-cell"><b>${ltk.bestWave}</b><span>最高波次</span></div>
        <div class="stat-cell"><b>${ltk.coins}</b><span>累计金币</span></div>
        <div class="stat-cell"><b>${ltk.runs}</b><span>出战次数</span></div>
        <div class="stat-cell"><b>${ltk.pvpWins}</b><span>大乱斗获胜</span></div>
        <div class="stat-cell"><b>${getRank()}${prestige > 0 ? ' ⭐' + prestige : ''}</b><span>当前军衔</span></div>
        <div class="stat-cell"><b>+${prestige * 10}%</b><span>转生加成</span></div>
        <div class="stat-cell"><b>${xp}</b><span>累计经验</span></div>
      </div>`;
  }
  $('achv').classList.remove('hidden');
}
$('btn-ach').addEventListener('click', () => renderAchPanel('ach'));
$('btn-stats').addEventListener('click', () => renderAchPanel('stats'));
$('btn-achv-close').addEventListener('click', () => $('achv').classList.add('hidden'));

// ---------- 军械库（永久商店，花经验） ----------
interface Perks { armor: number; pay: number; fire: number; tactic: number; magnet: number; dash: number; xp: number; }
let perks: Perks = (() => {
  const def: Perks = { armor: 0, pay: 0, fire: 0, tactic: 0, magnet: 0, dash: 0, xp: 0 };
  try { return { ...def, ...(JSON.parse(localStorage.getItem('ns-perks') ?? '{}') as Partial<Perks>) }; }
  catch { return def; }
})();
function savePerks() { localStorage.setItem('ns-perks', JSON.stringify(perks)); }
const PERK_DEFS: { key: keyof Perks; name: string; desc: string; max: number }[] = [
  { key: 'armor',  name: '强化装甲', desc: '初始护盾上限 +8/级',   max: 5 },
  { key: 'pay',    name: '军饷',     desc: '初始金币 +30/级',      max: 5 },
  { key: 'fire',   name: '火力校准', desc: '初始武器伤害 +5%/级',  max: 5 },
  { key: 'tactic', name: '战术装填', desc: '手雷冷却 -8%/级',      max: 5 },
  { key: 'magnet', name: '磁力核心', desc: '金币磁吸半径 +0.5/级', max: 4 },
  { key: 'dash',   name: '战术冲刺', desc: '冲刺冷却 -4%/级',      max: 4 },
  { key: 'xp',     name: '战地学习', desc: '经验获取 +6%/级',      max: 5 },
];
const perkCost = (lv: number) => (lv + 1) * 200;

// ---------- 养成中枢（仓库·金币线 + 军械库·经验线，合并入口） ----------
function progTabsHtml(active: 'vault' | 'armory') {
  return `<div class="prog-tabs">
    <button class="loadout-chip${active === 'vault' ? ' on' : ''}" data-ptab="vault">🎒 仓库·军备 <b>${vault.coins}</b>◆</button>
    <button class="loadout-chip${active === 'armory' ? ' on' : ''}" data-ptab="armory">🛒 军械库·经验 <b>${xp}</b> XP</button>
  </div>`;
}
function wireProgTabs() {
  $('achv-body').querySelectorAll<HTMLElement>('[data-ptab]').forEach((el) =>
    el.addEventListener('click', () => renderProgression(el.dataset.ptab as 'vault' | 'armory')));
}
function renderProgression(tab: 'vault' | 'armory') {
  sfx.init();
  if (tab === 'armory') renderArmory(); else renderVault();
}

function renderArmory() {
  $('achv-title').textContent = '养成中枢 · 军械库（经验线）';
  const body = $('achv-body');
  const prestigeRow = `<div class="vault-sec">⭐ 转生（军衔 Lv.8 解锁 · 二次点击确认）</div>
    <div class="shop-item vault-row${getRank() >= 8 ? '' : ' off'}" id="prestige-row">
      <span class="si-name">转生 <i>${prestige > 0 ? '⭐'.repeat(Math.min(prestige, 5)) + (prestige > 5 ? `×${prestige}` : '') : '未转生'}</i></span>
      <span class="si-sub">保留：武器/词缀/装配/成就/战绩 · 重置：经验军衔/军械库强化/仓库金币/武器精通/元升级 · 永久 经验&金币 +10%/层（当前 +${prestige * 10}%）</span>
      <b class="si-price">${getRank() >= 8 ? (prestigeArmed ? '⚠ 确认转生' : '转生') : 'Lv.8'}</b>
    </div>`;
  body.innerHTML = progTabsHtml('armory') + `<div class="armory-xp">可用经验 <b>${xp}</b> XP · 军衔 Lv.${getRank()}${prestige > 0 ? ' ⭐' + prestige : ''} · 购买永久生效</div>` +
    PERK_DEFS.map((p) => {
      const lv = perks[p.key];
      const maxed = lv >= p.max;
      const cost = perkCost(lv);
      const afford = xp >= cost && !maxed;
      return `<div class="shop-item armory-row${afford ? '' : ' off'}">
        <span class="si-name">${p.name}<i>${'◆'.repeat(lv)}${'◇'.repeat(p.max - lv)}</i></span>
        <span class="si-sub">${p.desc}</span>
        <b class="si-price">${maxed ? 'MAX' : cost + ' XP'}</b>
      </div>`;
    }).join('');
  const rows = [...body.querySelectorAll('.armory-row')];
  rows.forEach((row, i) => {
    const p = PERK_DEFS[i];
    row.addEventListener('click', () => {
      const lv = perks[p.key];
      const cost = perkCost(lv);
      if (lv >= p.max || xp < cost) { sfx.empty(); return; }
      xp -= cost;
      perks[p.key]++;
      localStorage.setItem('ns-xp', String(xp));
      savePerks();
      sfx.pickup();
      refreshMenuMeta();
      renderArmory();
    });
  });
  body.querySelector('#prestige-row')?.addEventListener('click', () => {
    if (getRank() < 8) { sfx.empty(); toast('转生需要军衔 Lv.8'); return; }
    if (!prestigeArmed) { prestigeArmed = true; renderArmory(); return; }
    prestigeArmed = false;
    prestige++;
    localStorage.setItem('ns-prestige', String(prestige));
    xp = 0;
    localStorage.setItem('ns-xp', '0');
    perks = { armor: 0, pay: 0, fire: 0, tactic: 0, magnet: 0, dash: 0, xp: 0 };
    savePerks();
    vault.coins = 0;
    vault.mastery = {};
    vault.meta = {};
    saveVault();
    sfx.pickup();
    refreshMenuMeta();
    toast(`⭐ 转生完成！永久加成：经验与金币 +${prestige * 10}%`);
    renderArmory();
  });
  wireProgTabs();
  $('achv').classList.remove('hidden');
}
$('btn-prog').addEventListener('click', () => { sfx.init(); renderProgression('vault'); });
$('btn-daily').addEventListener('click', () => { sfx.init(); startDailyRun(); });

// ---------- 永久仓库（跨局金币 / 武器解锁 / 词缀锻造 / 出战装配 / 元升级 / 武器精通） ----------
interface VaultAffix { a: Affix; lv: number; }
interface Vault {
  coins: number;
  weapons: WeaponId[];
  affix: Record<string, VaultAffix[]>;         // 每把武器最多 3 条锻造词缀（按槽顺序填充）
  loadout: WeaponId[];                          // 出战装配（最多两把，第一把为主武器）
  mastery: Partial<Record<WeaponId, number>>;   // 永久武器精通（0-3）
  meta: Record<string, number>;                 // 元升级等级（按 key）
}
let vault: Vault = (() => {
  const def: Vault = { coins: 0, weapons: [], affix: {}, loadout: [], mastery: {}, meta: {} };
  try {
    const raw = JSON.parse(localStorage.getItem('ns-vault') ?? '{}') as Partial<Vault> & {
      loadout?: WeaponId | WeaponId[] | null;
      affix?: Record<string, VaultAffix | VaultAffix[] | null>;
    };
    const v = { ...def, ...raw } as Vault;
    // 旧档迁移：单词缀 → 词缀数组；单装配 → 数组
    const affix: Record<string, VaultAffix[]> = {};
    for (const [k, val] of Object.entries(v.affix ?? {})) {
      if (Array.isArray(val)) affix[k] = val;
      else if (val && typeof val === 'object' && 'a' in val) affix[k] = [val as VaultAffix];
      else affix[k] = [];
    }
    v.affix = affix;
    v.loadout = Array.isArray(v.loadout) ? v.loadout : (v.loadout ? [v.loadout as WeaponId] : []);
    return v;
  } catch { return def; }
})();
function saveVault() { localStorage.setItem('ns-vault', JSON.stringify(vault)); }
let runEarned = 0; // 本局累计获得（结算时存入仓库）
let forgeLevel = 1; // 仓库锻造时选择的词缀等级（1-3）
let metaLoot = 0;   // 元升级「财富积累」带来的额外金币（每枚）

// 元升级树：花仓库金币买永久被动
interface MetaDef { key: string; name: string; desc: string; max: number; cost: (lv: number) => number; }
const META_DEFS: MetaDef[] = [
  { key: 'shield', name: '钢铁护盾', desc: '起始护盾上限 +10/级', max: 5, cost: (l) => 200 + l * 120 },
  { key: 'pay',    name: '军火补贴', desc: '起始金币 +40/级',     max: 5, cost: (l) => 200 + l * 120 },
  { key: 'dmg',    name: '杀伤强化', desc: '全武器伤害 +4%/级',   max: 5, cost: (l) => 240 + l * 140 },
  { key: 'wealth', name: '财富积累', desc: '每枚金币掉落 +2/级',  max: 5, cost: (l) => 200 + l * 120 },
  { key: 'forge',  name: '锻造大师', desc: '词缀锻造花费 -10%/级', max: 3, cost: (l) => 300 + l * 150 },
  { key: 'reroll', name: '整备专家', desc: '三选一换批 -5◆/级',  max: 3, cost: (l) => 300 + l * 150 },
];
function metaLv(k: string): number { return vault.meta[k] ?? 0; }

// 出战前选择的挑战（每局可改，不持久化）
let pendingChallenge = { mods: [] as string[], diff: 0 };
let challengeMods: string[] = [];   // 本局生效的协议
let challengeDiff = 0;              // 本局难度档位

// 挑战收益加成：每条协议 +20%，难度档 +25%（高风险 = 更快养成）
function challengeCoinMul(): number {
  return 1 + challengeMods.length * 0.2 + challengeDiff * 0.25;
}
// 统一金币入账：局内可用 + 结算入库；战绩只记基础值，加成不夸大数据
function gainCoins(base: number, lootMul = 1) {
  const amt = Math.round((base + metaLoot * lootMul) * challengeCoinMul() * (1 + 0.1 * prestige));
  coins += amt;
  runEarned += amt;
  ltk.coins += base;
  return amt;
}

// 词缀强度：局内捡到的临时词缀=1级；仓库同类型锻造词缀提供更高等级
function affixLvOf(w: WeaponId, a: Affix): number {
  const pa = (vault.affix[w] ?? []).find((x) => x.a === a);
  return pa ? pa.lv : 1;
}

// ---------- 设置（灵敏度 / 音量，持久化） ----------
const settings = JSON.parse(localStorage.getItem('ns-settings') ?? '{"sens":1,"vol":1}') as { sens: number; vol: number };
function saveSettings() { localStorage.setItem('ns-settings', JSON.stringify(settings)); }

function renderSettings() {
  $('achv-title').textContent = '设置';
  const body = $('achv-body');
  body.innerHTML = `
    <div class="setting-row">
      <span>鼠标灵敏度</span>
      <input id="set-sens" type="range" min="0.3" max="2.5" step="0.05" value="${settings.sens}" />
      <b id="set-sens-v">${settings.sens.toFixed(2)}</b>
    </div>
    <div class="setting-row">
      <span>音量</span>
      <input id="set-vol" type="range" min="0" max="1" step="0.05" value="${settings.vol}" />
      <b id="set-vol-v">${Math.round(settings.vol * 100)}%</b>
    </div>
    <div class="vault-sec" style="margin-top:16px">存档迁移（跨设备）</div>
    <textarea id="save-io" class="save-io" placeholder="导出：存档文本会生成在这里，复制保存 · 导入：把存档文本粘贴到这里再点导入"></textarea>
    <div class="lobby-row" style="margin-top:8px">
      <button id="btn-save-export" class="btn-ghost" style="margin-top:0">📤 导出到文本</button>
      <button id="btn-save-import" class="btn-ghost" style="margin-top:0">📥 从文本导入</button>
    </div>
    <div class="hint" style="margin-top:8px">包含金币/经验/仓库/成就/战绩/设置全部进度 · 导入成功后自动刷新页面</div>`;
  const sens = $('set-sens') as HTMLInputElement;
  const vol = $('set-vol') as HTMLInputElement;
  sens.addEventListener('input', () => {
    settings.sens = Number(sens.value);
    ($('set-sens-v') as HTMLElement).textContent = settings.sens.toFixed(2);
    saveSettings();
  });
  vol.addEventListener('input', () => {
    settings.vol = Number(vol.value);
    ($('set-vol-v') as HTMLElement).textContent = Math.round(settings.vol * 100) + '%';
    sfx.setVolume(settings.vol);
    saveSettings();
  });
  // 存档导出 / 导入
  const collectSave = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (/^ns-/.test(k) || k === 'neon-strike-best') data[k] = localStorage.getItem(k) ?? '';
    }
    return 'NS1.' + btoa(encodeURIComponent(JSON.stringify({ v: 1, ts: Date.now(), data })));
  };
  $('btn-save-export').addEventListener('click', () => {
    const ta = $('save-io') as HTMLTextAreaElement;
    ta.value = collectSave();
    ta.select();
    navigator.clipboard?.writeText(ta.value).then(
      () => toast('📤 存档已生成并复制，粘贴保存到别处'),
      () => toast('📤 存档已生成，请手动全选复制'),
    );
  });
  $('btn-save-import').addEventListener('click', () => {
    const ta = $('save-io') as HTMLTextAreaElement;
    const raw = ta.value.trim();
    try {
      const json = raw.startsWith('NS1.') ? decodeURIComponent(atob(raw.slice(4))) : raw;
      const obj = JSON.parse(json) as { v: number; data: Record<string, string> };
      if (obj.v !== 1 || !obj.data || typeof obj.data !== 'object') throw new Error('bad save');
      for (const [k, val] of Object.entries(obj.data)) {
        if (/^ns-/.test(k) || k === 'neon-strike-best') localStorage.setItem(k, String(val));
      }
      toast('📥 存档导入成功，即将刷新…');
      setTimeout(() => location.reload(), 800);
    } catch {
      toast('❌ 存档格式无效');
      sfx.empty();
    }
  });
  $('achv').classList.remove('hidden');
}
$('btn-settings').addEventListener('click', () => { sfx.init(); sfx.setVolume(settings.vol); sfx.startMusic(); renderSettings(); });
$('btn-challenge').addEventListener('click', () => { sfx.init(); renderChallenge(); });

// ---------- 仓库 / 军备（永久经济：解锁武器 · 词缀锻造 · 出战装配） ----------
function renderVault() {
  const body = $('achv-body');
  $('achv-title').textContent = '养成中枢 · 仓库（金币线）';
  const avail = ['rifle', ...vault.weapons] as WeaponId[];

  // ① 武器解锁
  const unlockRows = ALL_WEAPONS.filter((w) => w !== 'rifle').map((w) => {
    const unlocked = vault.weapons.includes(w);
    const price = WEAPON_PRICES[w] ?? 200;
    return `<div class="shop-item vault-row${unlocked ? ' done' : vault.coins >= price ? '' : ' off'}">
      <span class="si-name">${WEAPONS[w].name}</span>
      <span class="si-sub">${unlocked ? '已永久解锁' : '解锁后可装配出战'}</span>
      ${unlocked ? '<b class="si-price ok">✓</b>' : `<button class="mini-btn" data-act="unlock" data-w="${w}">${price}◆</button>`}
    </div>`;
  }).join('');

  // ② 词缀锻造（每枪 3 槽，按序填充；费用 = 150 × 等级 × 槽位倍率）
  const affixRows = avail.map((w) => {
    const slots = vault.affix[w] ?? [];
    const slotTags = [0, 1, 2].map((i) => {
      const pa = slots[i];
      const open = i === 0 || slots.length >= i;
      const label = pa ? `${AFFIX_INFO[pa.a].name.replace('的', '')} Lv.${pa.lv}` : open ? '空' : '未开放';
      return `<span class="slot-tag${pa ? ' on' : ''}">槽${i + 1} ${label}</span>`;
    }).join('');
    const chips = (Object.keys(AFFIX_INFO) as Affix[]).map((a) =>
      `<button class="affix-chip${slots.some((x) => x.a === a) ? ' on' : ''}" data-act="forge" data-w="${w}" data-a="${a}">${AFFIX_INFO[a].name.replace('的', '')}</button>`,
    ).join('');
    const lvSel = [1, 2, 3].map((l) => `<button class="lv-chip${forgeLevel === l ? ' on' : ''}" data-act="lv" data-l="${l}">Lv.${l}</button>`).join('');
    return `<div class="vault-affix">
      <div class="va-head"><span class="si-name">${WEAPONS[w].name}</span><span class="va-slots">${slotTags}</span></div>
      <div class="va-chips">${chips}</div>
      <div class="va-lv">锻造等级 ${lvSel}<span class="va-cost">费用 150◆×等级×槽位（槽1×1 槽2×2 槽3×3，受锻造大师折扣）</span></div>
    </div>`;
  }).join('');

  // ③ 出战装配（最多两把，第一把为主武器 ★）
  const loadout = avail.map((w) =>
    `<button class="loadout-chip${vault.loadout.includes(w) ? ' on' : ''}" data-act="equip" data-w="${w}">${WEAPONS[w].name}${vault.loadout[0] === w ? ' ★' : ''}</button>`,
  ).join('');

  // ④ 永久武器精通（结算沉淀，下局开局携带）
  const mastDisplay = ALL_WEAPONS.map((w) => {
    const mlv = vault.mastery[w] ?? 0;
    return `<span class="mast-chip${mlv > 0 ? ' on' : ''}">${WEAPONS[w].name} ${'Ⅰ'.repeat(mlv) || '—'}</span>`;
  }).join('');

  // ⑤ 元升级树
  const metaRows = META_DEFS.map((m) => {
    const lv = metaLv(m.key);
    const maxed = lv >= m.max;
    const cost = m.cost(lv);
    return `<div class="shop-item vault-row${maxed || vault.coins < cost ? ' off' : ''}">
      <span class="si-name">${m.name}<i>${'◆'.repeat(lv)}${'◇'.repeat(m.max - lv)}</i></span>
      <span class="si-sub">${m.desc}</span>
      ${maxed ? '<b class="si-price ok">MAX</b>' : `<button class="mini-btn" data-act="meta" data-k="${m.key}">${cost}◆</button>`}
    </div>`;
  }).join('');

  body.innerHTML = progTabsHtml('vault') + `
    <div class="vault-head">仓库金币 <b>${vault.coins}</b>◆ · 本局待入库 <b>${runEarned}</b>◆</div>
    <div class="vault-sec">① 武器解锁（永久）</div>
    <div class="vault-list">${unlockRows}</div>
    <div class="vault-sec">② 词缀锻造（每枪 3 槽按序填充 · 先选等级，再点词缀锻入下一个空槽）</div>
    <div class="vault-list">${affixRows}</div>
    <div class="vault-sec">③ 出战装配（最多两把 · ★ 为主武器，点击选中/取消）</div>
    <div class="vault-loadout">${loadout}</div>
    <div class="vault-sec">④ 永久武器精通（局内练级，结算自动沉淀）</div>
    <div class="vault-loadout">${mastDisplay}</div>
    <div class="vault-sec">⑤ 元升级树（花仓库金币买永久被动）</div>
    <div class="vault-list">${metaRows}</div>
    <div class="hint" style="margin-top:10px">装配武器/锻造词缀/元升级/武器精通 均为永久养成；局内军火商仍提供临时加成，互不冲突。</div>`;
  body.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
    el.addEventListener('click', () => {
      const act = el.dataset.act!;
      if (act === 'lv') { forgeLevel = Number(el.dataset.l); renderVault(); return; }
      if (act === 'unlock') {
        const w = el.dataset.w as WeaponId; const price = WEAPON_PRICES[w] ?? 200;
        if (vault.coins < price) { sfx.empty(); return; }
        vault.coins -= price; vault.weapons.push(w); saveVault(); sfx.pickup(); refreshMenuMeta(); renderVault(); return;
      }
      if (act === 'forge') {
        const w = el.dataset.w as WeaponId; const a = el.dataset.a as Affix;
        const slots = vault.affix[w] ?? [];
        const existIdx = slots.findIndex((x) => x.a === a);
        const idx = existIdx >= 0 ? existIdx : slots.length; // 已有该词缀=重锻该槽；否则锻入下一个空槽
        if (idx >= 3) { toast('该武器词缀槽已满（3/3）'); sfx.empty(); return; }
        const cost = Math.max(30, Math.round(150 * forgeLevel * (idx + 1) * (1 - 0.1 * metaLv('forge'))));
        if (vault.coins < cost) { sfx.empty(); return; }
        vault.coins -= cost;
        slots[idx] = { a, lv: forgeLevel };
        vault.affix[w] = slots;
        saveVault(); sfx.pickup(); refreshMenuMeta(); renderVault(); return;
      }
      if (act === 'equip') {
        const w = el.dataset.w as WeaponId;
        const rest = vault.loadout.filter((x) => x !== w);
        vault.loadout = vault.loadout.includes(w) ? rest : (rest.length >= 2 ? [...rest.slice(1), w] : [...rest, w]);
        saveVault(); sfx.pickup(); renderVault(); return;
      }
      if (act === 'meta') {
        const k = el.dataset.k!;
        const m = META_DEFS.find((d) => d.key === k)!;
        const lv = metaLv(k);
        if (lv >= m.max) { sfx.empty(); return; }
        const cost = m.cost(lv);
        if (vault.coins < cost) { sfx.empty(); return; }
        vault.coins -= cost; vault.meta[k] = lv + 1; saveVault(); sfx.pickup(); refreshMenuMeta(); renderVault(); return;
      }
    });
  });
  wireProgTabs();
  $('achv').classList.remove('hidden');
}

// ---------- 挑战模式（协议 + 难度，单机开局生效） ----------
function renderChallenge() {
  const body = $('achv-body');
  $('achv-title').textContent = '挑战模式';
  const mul = (1 + pendingChallenge.mods.length * 0.2 + pendingChallenge.diff * 0.25).toFixed(2);
  const modBtns = WAVE_MODS.map((m) =>
    `<button class="loadout-chip${pendingChallenge.mods.includes(m.id) ? ' on' : ''}" data-mod="${m.id}">${m.label}</button>`,
  ).join('');
  const diffBtns = [
    { d: 0, t: '普通' }, { d: 1, t: '精英 · 敌血/速 +35%' }, { d: 2, t: '噩梦 · 敌血/速 +70%' },
  ].map((x) => `<button class="loadout-chip${pendingChallenge.diff === x.d ? ' on' : ''}" data-diff="${x.d}">${x.t}</button>`).join('');
  body.innerHTML = `
    <div class="vault-head">挑战协议 · 选择后每波生效 · 仅单机 · 金币收益 <b>×${mul}</b></div>
    <div class="vault-sec">变异协议（可多选 · 每条 +20% 收益）</div>
    <div class="vault-loadout">${modBtns}</div>
    <div class="vault-sec">难度档位（+25% 收益/档）</div>
    <div class="vault-loadout">${diffBtns}</div>
    <div class="hint" style="margin-top:10px">挑战加成直接提升所有金币获取（拾取/合同/满级返还），结算全额入库；从主菜单「单机训练」开局即套用，每日挑战与联机不套用。</div>`;
  body.querySelectorAll<HTMLElement>('[data-mod]').forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.mod!;
    const i = pendingChallenge.mods.indexOf(id);
    if (i >= 0) pendingChallenge.mods.splice(i, 1); else pendingChallenge.mods.push(id);
    sfx.pickup(); renderChallenge();
  }));
  body.querySelectorAll<HTMLElement>('[data-diff]').forEach((el) => el.addEventListener('click', () => {
    pendingChallenge.diff = Number(el.dataset.diff); sfx.pickup(); renderChallenge();
  }));
  $('achv').classList.remove('hidden');
}

function checkAchievements() {
  for (const a of ACH_DEFS) {
    if (!achUnlocked.has(a.id) && a.test()) {
      achUnlocked.add(a.id);
      localStorage.setItem('ns-ach', JSON.stringify([...achUnlocked]));
      vault.coins += a.reward; // 成就奖励一次性入库
      saveVault();
      refreshMenuMeta();
      showAchToast(a.name, a.reward);
      sfx.pickup();
    }
  }
}

// 成就专属弹窗（区别于普通 toast）
let achToastTimer: number | undefined;
function showAchToast(name: string, reward = 0) {
  const el = $('achv-toast');
  $('achv-toast-name').textContent = reward > 0 ? `${name} · +${reward}◆ 已入库` : name;
  el.classList.remove('hidden');
  el.classList.remove('play');
  void el.offsetWidth;
  el.classList.add('play');
  clearTimeout(achToastTimer);
  achToastTimer = window.setTimeout(() => el.classList.add('hidden'), 3600);
}

// ---------- 波次变异协议（单机） ----------
const WAVE_MODS = [
  { id: 'swift', label: '迅捷协议 · 敌机速度 +25%' },
  { id: 'armor', label: '装甲协议 · 敌机生命 +30%' },
  { id: 'horde', label: '虫潮协议 · 蜂群增援来袭' },
  { id: 'gold',  label: '赏金协议 · 本波得分 ×1.5' },
];
let waveMod: { id: string; label: string } | null = null;

// ---------- DOM ----------
const elHud = $('hud'), elMenu = $('menu'), elPause = $('pause'), elOver = $('gameover'), elRespawn = $('respawn');
const elScore = $('score'), elCombo = $('combo'), elAmmo = $('ammo');
const elHealth = $('health-fill'), elWaveNum = $('wave-num'), elEnemies = $('enemies-left');
const elReload = $('reload-hint'), elBanner = $('wave-banner'), elCross = $('crosshair'), elHit = $('hitmarker');
const elDmg = $('damage-flash'), elToast = $('toast'), elLowhp = $('lowhp'), elDmgDir = $('dmg-dir');
const elBossBar = $('boss-bar'), elBossFill = $('boss-fill');
const elWeaponName = $('weapon-name'), elOvercharge = $('overcharge'), elGrenade = $('grenade'), elDash = $('dash');
const elPlayersPanel = $('players-panel'), elPlayersList = $('players-list');
const elPvpChip = $('pvp-chip'), elPvpMe = $('pvp-me'), elPvpTop = $('pvp-top');
const elLobby = $('lobby'), elRoom = $('room'), elReloadRing = $('reload-ring');
const elMinimap = $('minimap') as HTMLCanvasElement;
const elNameInput = $('player-name') as HTMLInputElement;
$('menu-best').textContent = String(best);
function refreshMenuMeta() {
  $('menu-rank').textContent = `Lv.${getRank()}${prestige > 0 ? ' ⭐' + prestige : ''}`;
  $('menu-xp').textContent = String(xp);
  $('menu-vault').textContent = String(vault.coins);
  refreshDailyButton();
}
refreshMenuMeta();

function updateAmmoUI() {
  const cfg = WEAPONS[weapon];
  const max = magOf(weapon);
  elAmmo.innerHTML = `${ammo}<span>/${max}</span>`;
  elAmmo.classList.toggle('empty', ammo === 0);
  elReload.classList.toggle('hidden', ammo > 0 || reloading > 0);
  const affName = weaponAffix[weapon].map((a) => AFFIX_INFO[a].name.replace('的', '')).join('·');
  elWeaponName.textContent = (affName ? affName + '·' : '') + cfg.name + (weaponLv[weapon] > 0 ? ' ' + 'I'.repeat(weaponLv[weapon]) : '');
}
function updateHealthUI() {
  const ratio = Math.max(0, hp / stats.maxHp);
  elHealth.style.width = `${ratio * 100}%`;
  elHealth.classList.toggle('low', hp <= stats.maxHp * 0.3);
  elLowhp.classList.toggle('on', hp <= stats.maxHp * 0.3 && !myDead && state === 'playing');
}
function updateGrenadeUI() {
  if (GRENADE.cd > 0) {
    elGrenade.textContent = `手雷 ${GRENADE.cd.toFixed(1)}s`;
    elGrenade.classList.remove('ready');
  } else {
    elGrenade.textContent = '手雷 [G] 就绪';
    elGrenade.classList.add('ready');
  }
}
function updateScoreUI() {
  elScore.textContent = String(score);
  elCombo.classList.toggle('hidden', combo <= 1);
  elCombo.textContent = `×${combo}`;
}
function showBanner(text: string, boss = false) {
  elBanner.textContent = text;
  elBanner.classList.toggle('boss', boss);
  elBanner.classList.remove('hidden');
  void elBanner.offsetWidth;
  elBanner.style.animation = 'none';
  void elBanner.offsetWidth;
  elBanner.style.animation = '';
}
function toast(msg: string) {
  elToast.textContent = msg;
  elToast.classList.remove('hidden');
  void elToast.offsetWidth;
  elToast.style.animation = 'none';
  void elToast.offsetWidth;
  elToast.style.animation = '';
}
function flashHit(kill: boolean) {
  elHit.classList.remove('show', 'kill');
  void elHit.offsetWidth;
  elHit.classList.add('show');
  if (kill) elHit.classList.add('kill');
  setTimeout(() => elHit.classList.remove('show'), 120);
}
function flashDamage() {
  elDmg.classList.remove('show');
  void elDmg.offsetWidth;
  elDmg.classList.add('show');
}
function updatePlayersPanel(list: { id: string; name: string; score: number; dead: boolean }[]) {
  elPlayersList.innerHTML = '';
  for (const p of [...list].sort((a, b) => b.score - a.score)) {
    const row = document.createElement('div');
    row.className = `pl-row${p.dead ? ' dead' : ''}${p.id === net.myId ? ' me' : ''}`;
    row.innerHTML = `<span class="pl-name">${p.name}</span><span class="pl-score">${p.score}</span>`;
    elPlayersList.appendChild(row);
  }
}

// ============================================================
// 输入
// ============================================================
document.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (state === 'upgrade') {
    const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (idx >= 0 && currentPicks[idx]) chooseUpgrade(currentPicks[idx]);
    return;
  }
  if (state !== 'playing' || paused) return;
  if (e.code === 'KeyR' && reloading <= 0 && ammo < magOf(weapon)) startReload();
  const digitMatch = /^Digit([1-9])$/.exec(e.code);
  if (digitMatch) {
    const w = owned[Number(digitMatch[1]) - 1];
    if (w) switchWeapon(w);
  }
  if (e.code === 'KeyQ') {
    const i = owned.indexOf(weapon);
    switchWeapon(owned[(i + 1) % owned.length]);
  }
  if (e.code === 'KeyG' && !myDead && GRENADE.cd <= 0) {
    GRENADE.cd = GRENADE.cdMax;
    throwGrenade();
  }
  if ((e.code === 'KeyF') && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') { toggleFullscreen(); return; }
  if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !myDead && dashCd <= 0) {
    dashCd = dashCdMax;
    dashTime = 0.14;
    const fwd = new THREE.Vector3(-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y));
    dashDir.copy(fwd);
    if (keys.has('KeyW')) dashDir.copy(fwd);
    if (keys.has('KeyS')) dashDir.copy(fwd).negate();
    if (keys.has('KeyA')) dashDir.set(fwd.z, 0, -fwd.x);
    if (keys.has('KeyD')) dashDir.set(-fwd.z, 0, fwd.x);
    addShake(0.3);
    sfx.swap();
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || paused || myDead || document.pointerLockElement !== canvas) return;
  const sens = 0.0022 * settings.sens * (aiming ? 0.55 : 1);
  camera.rotation.y -= e.movementX * sens;
  camera.rotation.x -= e.movementY * sens;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
});

document.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || paused || myDead || document.pointerLockElement !== canvas) return;
  if (e.button === 0) firing = true;
  if (e.button === 2) aiming = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) aiming = false;
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state === 'playing' && !myDead) {
    paused = true;
    firing = false;
    aiming = false;
    $('pause-hint').textContent = mode !== 'solo' ? '联机中，战斗仍在继续！点击画面继续' : '点击画面继续';
    $('btn-pause-leave').classList.toggle('hidden', mode === 'solo');
    elPause.classList.remove('hidden');
  }
});

function lockPointer() {
  const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      // 锁申请失败（浏览器冷却期等）：进入暂停态，点击画面可重试
      if (state === 'playing' && !paused) {
        paused = true;
        $('pause-hint').textContent = '点击画面继续';
        elPause.classList.remove('hidden');
      }
    });
  }
}

// 兜底：开局 600ms 后仍未锁且未暂停 → 显示暂停层供玩家点击恢复
function pointerLockWatchdog() {
  setTimeout(() => {
    if (state === 'playing' && !paused && document.pointerLockElement !== canvas) {
      paused = true;
      $('pause-hint').textContent = '点击画面继续';
      elPause.classList.remove('hidden');
    }
  }, 600);
}

$('btn-fs').addEventListener('click', toggleFullscreen);
$('btn-solo').addEventListener('click', () => { sfx.init(); startGame('solo'); });
$('btn-mp').addEventListener('click', async () => {
  sfx.init();
  try {
    await net.connect(wsUrl());
    // 进入联机大厅
    elMenu.classList.add('hidden');
    elLobby.classList.remove('hidden');
    state = 'lobby';
    $('lobby-name').textContent = elNameInput.value.trim() || '无名特工';
  } catch (err) {
    toast((err as Error).message);
  }
});
$('btn-lobby-back').addEventListener('click', () => {
  elLobby.classList.add('hidden');
  elMenu.classList.remove('hidden');
  state = 'menu';
});
$('btn-create-coop').addEventListener('click', () => {
  playerName = elNameInput.value.trim() || `特工${Math.floor(Math.random() * 900 + 100)}`;
  net.send({ t: 'join', name: playerName });
  net.send({ t: 'create', mode: 'coop' });
});
$('btn-create-pvp').addEventListener('click', () => {
  playerName = elNameInput.value.trim() || `特工${Math.floor(Math.random() * 900 + 100)}`;
  net.send({ t: 'join', name: playerName });
  net.send({ t: 'create', mode: 'pvp' });
});
$('btn-join').addEventListener('click', () => {
  const code = ($('join-code') as HTMLInputElement).value.trim().toUpperCase();
  if (!code) { toast('请输入 4 位房间码'); return; }
  playerName = elNameInput.value.trim() || `特工${Math.floor(Math.random() * 900 + 100)}`;
  net.send({ t: 'join', name: playerName });
  net.send({ t: 'joinRoom', code });
});
// 房间内操作
$('btn-copy-code').addEventListener('click', () => {
  const code = $('room-code').textContent;
  navigator.clipboard?.writeText(code).then(
    () => toast(`已复制房间码 ${code}`),
    () => toast(`房间码 ${code}`),
  );
});
document.querySelectorAll('.map-opt').forEach((el) => {
  el.addEventListener('click', () => {
    if (!roomOpen) return;
    net.send({ t: 'set_map', map: Number((el as HTMLElement).dataset.map) });
  });
});
$('btn-room-start').addEventListener('click', () => {
  net.send({ t: 'start_game' });
});
$('btn-room-leave').addEventListener('click', () => {
  net.send({ t: 'leaveRoom' });
  roomOpen = false;
  elRoom.classList.add('hidden');
  elLobby.classList.remove('hidden');
  state = 'lobby';
});
$('btn-retry').addEventListener('click', () => {
  if (mode === 'pvp') {
    net.send({ t: 'again' });
    closeOver();
    resetLocalRun();
    elRespawn.classList.add('hidden');
    state = 'playing';
    lockPointer();
  } else if (mode === 'coop') {
    net.send({ t: 'restart' });
    closeOver();
    resetLocalRun();
    elRespawn.classList.add('hidden');
    state = 'playing';
    lockPointer();
  } else {
    startGame('solo');
  }
});

// 回到大厅（联机局内 / 结算界面）
function leaveToLobby() {
  if (net.connected) {
    net.send({ t: 'leaveRoom' });
    clearWorld();
    resetLocalRun();
    document.exitPointerLock();
    state = 'lobby';
    mode = 'coop';
    elHud.classList.add('hidden');
    elOver.classList.add('hidden');
    elPause.classList.add('hidden');
    elRespawn.classList.add('hidden');
    $('upgrades').classList.add('hidden');
    elLobby.classList.remove('hidden');
    $('lobby-name').textContent = playerName;
  } else {
    startGame('solo');
  }
}
$('btn-pause-settings').addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.setVolume(settings.vol);
  renderSettings();
});
$('btn-pause-leave').addEventListener('click', (e) => { e.stopPropagation(); leaveToLobby(); });
$('btn-go-leave').addEventListener('click', () => leaveToLobby());
elPause.addEventListener('click', () => {
  elPause.classList.add('hidden');
  paused = false;
  lockPointer();
});

// ============================================================
// 流程控制
// ============================================================
// 释放对象资源（几何体/材质），防止重开局后卡顿
function disposeObj(root: THREE.Object3D) {
  root.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

function clearWorld() {
  for (const en of enemies) { scene.remove(en.group); disposeObj(en.group); }
  enemies = [];
  enemyMeshes = [];
  for (const b of ebullets) { scene.remove(b.mesh); disposeObj(b.mesh); }
  ebullets = [];
  for (const g of grenades) { scene.remove(g.mesh); disposeObj(g.mesh); }
  grenades = [];
  for (const p of pickups) { scene.remove(p.mesh); disposeObj(p.mesh); }
  pickups = [];
  for (const h of hazards) { scene.remove(h.ring, h.fill); disposeObj(h.ring); disposeObj(h.fill); }
  hazards = [];
  clearRacks();
  for (const c of coinsE) scene.remove(c.mesh);
  coinsE = [];
  for (const h of husks) scene.remove(h.mesh);
  husks.length = 0;
  for (const b of beams) scene.remove(b.mesh);
  beams.length = 0;
  for (const rp of remotes.values()) { scene.remove(rp.group); disposeObj(rp.group); }
  remotes.clear();
}

function resetLocalRun() {
  score = 0; kills = 0; combo = 1; comboTimer = 0;
  resetStats();
  // 军衔 + 军械库永久加成（必须在 resetStats 之后应用）
  const rank = getRank();
  if (rank >= 2) stats.maxHp += 10;
  coins = rank >= 4 ? 60 : 0;
  stats.maxHp += perks.armor * 8;
  stats.dmgMul += perks.fire * 0.05;
  GRENADE.cdMax = Math.max(4, 8 * (1 - 0.08 * perks.tactic));
  coinMagnet += perks.magnet * 0.5;
  dashCdMax = Math.max(1.8, dashCdMax - perks.dash * 0.12);
  // 仓库元升级（永久被动，必须在 resetStats 之后、hp 赋值之前应用）
  coins += metaLv('pay') * 40;
  metaLoot = metaLv('wealth') * 2;
  stats.maxHp += metaLv('shield') * 10;
  stats.dmgMul += metaLv('dmg') * 0.04;
  // 军衔特权延伸
  if (rank >= 8) stats.maxHp += 15;
  if (rank >= 10) autoUpgrade(); // 开局自带 1 个随机强化
  for (const c of coinsE) scene.remove(c.mesh);
  coinsE = [];
  rollContracts();
  hp = stats.maxHp; regenDelay = 0; overcharge = 0;
  weapon = 'rifle';
  owned = ['rifle'];
  if (rank >= 6) { owned.push('smg'); ammoPool.smg = WEAPONS.smg.mag; }
  for (const w of ALL_WEAPONS) {
    ammoPool[w] = w === 'rifle' ? WEAPONS.rifle.mag : (w === 'smg' && rank >= 6 ? WEAPONS.smg.mag : 0);
    weaponLv[w] = 0;
    weaponAffix[w] = [];
  }
  // 永久武器精通：开局即携带仓库中沉淀的武器等级
  for (const w of ALL_WEAPONS) weaponLv[w] = Math.min(3, vault.mastery[w] ?? 0);
  ammo = ammoPool.rifle;
  // 出战装配：仓库已解锁并选定的武器（最多两把），开局直接携带（含全部锻造词缀）
  const carried = vault.loadout.filter((w) => vault.weapons.includes(w));
  for (const w of carried) {
    if (!owned.includes(w)) owned.push(w);
    weaponAffix[w] = (vault.affix[w] ?? []).map((x) => x.a);
    ammoPool[w] = magOf(w);
  }
  if (carried.length) {
    weapon = carried[0];
    ammo = ammoPool[weapon];
    showWeaponModel(weapon);
  }
  reloading = 0;
  firing = false; aiming = false; myDead = false; respawnTimer = 0;
  dashCd = 0; dashTime = 0; shake = 0;
  bossKills = 0;
  lowHpTime = 0;
  waveTime = 0;
  eventArmed = false; eventFired = false; eventAt = -1;
  frenzyT = 0; survivalT = 0;
  showWeaponModel('rifle');
  camera.position.set(0, EYE_HEIGHT, 8);
  camera.rotation.set(0, 0, 0);
  playerVel.set(0, 0, 0);
  wave = 1; queue = []; waveClearTimer = -1; mpTotalLeft = 0;
}

function startGame(m: Mode, map?: number) {
  dailyActive = pendingDaily && m === 'solo';
  pendingDaily = false;
  mode = m;
  // 挑战协议仅单机生效（每日/联机不套用）
  const useChallenge = m === 'solo' && !dailyActive;
  challengeMods = useChallenge ? pendingChallenge.mods.slice() : [];
  challengeDiff = useChallenge ? pendingChallenge.diff : 0;
  clearWorld();
  resetLocalRun();
  buildMap(m === 'solo' ? Math.floor(Math.random() * mapNames.length) : (map ?? 0));

  elMenu.classList.add('hidden');
  elOver.classList.add('hidden');
  elPause.classList.add('hidden');
  elRespawn.classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('upgrades').classList.add('hidden');
  elHud.classList.remove('hidden');
  elPlayersPanel.classList.toggle('hidden', m === 'solo');
  elPvpChip.classList.toggle('hidden', m !== 'pvp');
  updateAmmoUI(); updateHealthUI(); updateScoreUI(); updateGrenadeUI();
  gun.visible = true;

  state = 'playing';
  paused = false;
  lockPointer();
  pointerLockWatchdog();
  toast(`地图：${mapNames[mapIdx]}`);
  sfx.setVolume(settings.vol);
  sfx.startMusic();

  if (m === 'solo') {
    if (soloMode === 'survival') {
      survivalT = 300;
      startWave(1);
      toast('⏱ 限时生存 — 活过 5 分钟！');
    } else if (soloMode === 'clear') {
      wave = 1;
      queue = waveRoster(10);
      spawnTimer = 1.2;
      waveClearTimer = -1;
      waveTime = 0;
      eventArmed = false; eventFired = false; eventAt = -1;
      elWaveNum.textContent = '⏱ 0:00';
      showBanner('歼灭竞速 — 清空全场！');
      sfx.wave();
    } else {
      startWave(1);
    }
  } else {
    playerName = elNameInput.value.trim() || `特工${Math.floor(Math.random() * 900 + 100)}`;
    net.send({ t: 'join', name: playerName });
    if (m === 'pvp') {
      elWaveNum.textContent = '大乱斗';
      elEnemies.textContent = '';
      toast('等待玩家加入（至少 2 人开局）…');
    } else {
      toast('已连接联机服务，等待波次同步…');
    }
  }
}

function closeOver() { elOver.classList.add('hidden'); }

function gameOver(board?: { name: string; score: number; kills: number }[], title = '防线失守') {
  state = 'over';
  firing = false;
  gun.visible = false;
  if (score > best) { best = score; localStorage.setItem('neon-strike-best', String(best)); }
  ltk.bestWave = Math.max(ltk.bestWave, wave);
  ltk.runs++;
  saveLtk();
  // 本局金币入库（永久仓库）
  vault.coins += runEarned;
  const banked = runEarned;
  runEarned = 0;
  // 武器精通沉淀：把本局练到的武器等级写入仓库（取历史最高）
  for (const w of ALL_WEAPONS) {
    if (weaponLv[w] > 0) vault.mastery[w] = Math.max(vault.mastery[w] ?? 0, weaponLv[w]);
  }
  saveVault();
  commitXp();
  refreshMenuMeta();
  if (dailyActive) {
    const b = dailyBest();
    if (score > b) {
      localStorage.setItem(dailyBestKey(), String(score));
      toast('📅 每日挑战新纪录！');
    }
    // 每日首通奖励（每天一次，直接入库）
    const rk = `ns-daily-reward-${dailyBestKey()}`;
    if (score > 0 && !localStorage.getItem(rk)) {
      localStorage.setItem(rk, '1');
      vault.coins += 150;
      saveVault();
      refreshMenuMeta();
      toast('📅 每日首通奖励 +150◆ 已入库');
    }
    dailyActive = false;
  }
  $('go-title').textContent = title;
  $('go-score').textContent = String(score);
  $('go-wave').textContent = String(wave);
  $('go-kills').textContent = String(kills);
  $('go-best').textContent = String(best);
  $('go-vault').textContent = `+${banked}◆`;
  $('btn-retry').textContent = mode === 'pvp' ? '再来一局' : '重新部署';
  $('btn-go-leave').classList.toggle('hidden', mode === 'solo');
  const elBoard = $('go-board');
  if (board && board.length > 0) {
    elBoard.classList.remove('hidden');
    elBoard.innerHTML = board.map((b) =>
      `<div class="go-row"><span class="go-name">${b.name}</span><span class="go-val">${b.score}</span><span class="go-kills">${b.kills} 击杀</span></div>`,
    ).join('');
  } else {
    elBoard.classList.add('hidden');
  }
  elHud.classList.add('hidden');
  elOver.classList.remove('hidden');
  document.exitPointerLock();
}

// ---------- 波次 ----------
function waveRoster(n: number): EnemyKind[] {
  // 精英猎杀波：每 4 波（非 BOSS 波）节奏突变
  if (n % 4 === 0 && n % 5 !== 0) {
    const elites = 2 + Math.floor(n / 5);
    const swarm = Math.floor(n / 3);
    const list: EnemyKind[] = [];
    for (let i = 0; i < elites; i++) list.push('elite');
    for (let i = 0; i < swarm; i++) list.push('swarm');
    return list;
  }
  const list: EnemyKind[] = [];
  const drones = 2 + Math.floor(n * 1.4);
  const swarm = n >= 2 ? Math.floor(n * 1.2) : 0;
  const sentries = n >= 3 ? Math.floor((n - 1) / 2) + 1 : 0;
  const tanks = n >= 4 ? Math.floor((n - 2) / 3) : 0;
  for (let i = 0; i < drones; i++) list.push('drone');
  for (let i = 0; i < swarm; i++) list.push('swarm');
  for (let i = 0; i < sentries; i++) list.push('sentry');
  for (let i = 0; i < tanks; i++) list.push('tank');
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (n % 5 === 0) list.push('boss');
  return list;
}

function startWave(n: number) {
  wave = n;
  queue = waveRoster(n);
  spawnTimer = 0.5;
  waveClearTimer = -1;
  waveTime = 0;
  // 波内事件（第2波起 45%）
  eventArmed = n >= 2 && Math.random() < (dailyHas('dstrike') ? 0.85 : 0.45);
  eventFired = false;
  eventAt = 7 + Math.random() * 10;
  // 波次变异（第2波起 50% 概率）
  waveMod = n >= 2
    ? (challengeMods.length
        ? WAVE_MODS.find((m) => m.id === challengeMods[(n - 2) % challengeMods.length])!
        : (Math.random() < 0.5 ? WAVE_MODS[Math.floor(Math.random() * WAVE_MODS.length)] : null))
    : null;
  if (waveMod?.id === 'horde') for (let i = 0; i < 3; i++) queue.push('swarm');
  if (dailyHas('dswarm')) for (let i = 0; i < 2; i++) queue.push('swarm');
  const isBoss = n % 5 === 0;
  showBanner(isBoss ? `WAVE ${String(n).padStart(2, '0')} · 核心主宰来袭` : `WAVE ${String(n).padStart(2, '0')}`, isBoss);
  elWaveNum.textContent = `WAVE ${String(n).padStart(2, '0')}`;
  if (isBoss) sfx.bossWarn(); else sfx.wave();
  if (waveMod) setTimeout(() => toast(`⚠ ${waveMod!.label}`), 1200);
  // 危险区（第3波起）
  if (n >= 3) {
    const count = 1 + Math.floor(n / 7);
    for (let i = 0; i < count; i++) spawnHazard();
  }
  // 补给核心空投（第2波起 65%）
  if (n >= 2 && Math.random() < 0.65) dropSupplyCore();
  // 武器箱（第2波起 70%）
  if (n >= 2 && Math.random() < 0.7) {
    const ang = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 16;
    dropRandomRack(Math.round(Math.cos(ang) * d), Math.round(Math.sin(ang) * d));
  }
  checkAchievements();
}

function spawnEnemyLocal(kind: EnemyKind) {
  const ang = Math.random() * Math.PI * 2;
  const r = 24 + Math.random() * 9;
  const pos = new THREE.Vector3(Math.cos(ang) * r, KIND_CFG[kind].r + 1, Math.sin(ang) * r);
  spawnBeam(pos, KIND_CFG[kind].color);
  const chSwift = challengeMods.includes('swift');
  const chArmor = challengeMods.includes('armor');
  const speedBoost = (waveMod?.id === 'swift' || chSwift ? 1.25 : 1) * (dailyHas('dfast') ? 1.2 : 1) * (1 + 0.2 * challengeDiff);
  const enemy = new Enemy(kind, (KIND_CFG[kind].speed + (kind === 'drone' || kind === 'swarm' ? wave * 0.12 : 0)) * speedBoost, pos);
  if (waveMod?.id === 'armor' || chArmor) {
    enemy.hp = KIND_CFG[kind].hp * 1.3;
  }
  if (challengeDiff > 0) { const m = 1 + 0.35 * challengeDiff; enemy.maxHp *= m; enemy.hp *= m; }
  // 精英词缀（第5波起 15%，BOSS 除外）
  if (wave >= 5 && kind !== 'boss' && Math.random() < 0.15) {
    const keys = Object.keys(ENEMY_AFFIX) as EnemyAffix[];
    enemy.setAffix(keys[Math.floor(Math.random() * keys.length)]);
  }
  enemies.push(enemy);
  scene.add(enemy.group);
  enemy.group.traverse((o) => { if (o.userData.enemy) enemyMeshes.push(o); });
}

// 补给核心空投（随机位置，捡到 = 2 个随机强化）
function dropSupplyCore() {
  const ang = Math.random() * Math.PI * 2;
  const d = 12 + Math.random() * 14;
  const x = Math.round(Math.cos(ang) * d);
  const z = Math.round(Math.sin(ang) * d);
  pickups.push(spawnPickupMesh(pickupId++, 'core', x, z));
  spawnBeam(new THREE.Vector3(x, 1, z), 0xfff7a0);
  toast('▼ 补给核心空投 — 前往拾取');
}

function startReload() {
  reloadTotal = WEAPONS[weapon].reload * stats.reloadMul * (hasAffix(weapon, 'swift') ? 0.75 : 1);
  reloading = reloadTotal;
  if (weapon === 'shotgun') sfx.pump(); else sfx.reload();
}
let reloadTotal = 1;

function showWeaponModel(w: WeaponId) {
  for (const id of Object.keys(gunModels) as WeaponId[]) gunModels[id].visible = id === w;
}

function switchWeapon(w: WeaponId) {
  if (!owned.includes(w) || w === weapon) return;
  ammoPool[weapon] = ammo;
  weapon = w;
  ammo = ammoPool[w];
  reloading = 0.35 * stats.reloadMul;
  showWeaponModel(w);
  sfx.swap();
  updateAmmoUI();
}

function pickupWeapon(w: WeaponId) {
  ammoPool[weapon] = ammo;
  const aff = weaponAffix[w].map((a) => AFFIX_INFO[a].name.replace('的', '')).join('·');
  if (!owned.includes(w)) {
    owned.push(w);
    ammoPool[w] = magOf(w);
    toast(`获得 ${aff}${aff ? '·' : ''}${WEAPONS[w].name} — 按 ${owned.length} 切换`);
  } else if (weaponLv[w] < 3) {
    weaponLv[w]++;
    ammoPool[w] = magOf(w);
    toast(`${aff}${aff ? '·' : ''}${WEAPONS[w].name} 熟练度提升 → ${'I'.repeat(weaponLv[w])}（伤害 +15%）`);
  } else {
    ammoPool[w] = magOf(w);
    gainCoins(30, 6);
    updateCoinsUI();
    toast(`${WEAPONS[w].name} 已满熟练 · 弹药补满 +30◆`);
  }
  weapon = w;
  ammo = ammoPool[w];
  reloading = 0;
  showWeaponModel(w);
  sfx.pickup();
  updateAmmoUI();
}

// ============================================================
// 击杀 / 射击
// ============================================================
function killEnemy(en: Enemy, silentCombo = false) {
  en.alive = false;
  kills++;
  ltk.kills++;
  if (en.kind === 'boss') ltk.bosses++;
  saveLtk();
  hitStop = en.kind === 'boss' ? 0.12 : 0.05;
  dropCoins(en.position, en.kind === 'boss' ? 20 : en.kind === 'elite' ? 6 : (en.kind === 'swarm' ? 1 : 2));
  trackContract('kills');
  if (weapon === 'railgun') trackContract('railKills');
  if (weapon === 'shotgun') trackContract('shotgunKills');
  // 用当前连击结算，击杀后再递增（首杀不翻倍）
  const gained = Math.round(KIND_CFG[en.kind].score * combo * (waveMod?.id === 'gold' ? 1.5 : 1));
  score += gained;
  spawnFloater(en.position, `+${gained}`, 'crit');
  if (!silentCombo) {
    comboTimer = 3;
    if (combo >= 3) toast(`连杀 ×${combo}！`);
    combo = Math.min(combo + 1, 3);
    if (combo === 3) trackContract('combo3');
  }
  if (en.kind === 'boss') bossKills++;
  checkAchievements();
  sfx.explode();
  particles.burst(en.position, new THREE.Color(KIND_CFG[en.kind].color), en.kind === 'boss' ? 120 : 36, en.kind === 'boss' ? 12 : 7);
  spawnHusk(en.position, KIND_CFG[en.kind].color, KIND_CFG[en.kind].r);
  addShake(en.kind === 'boss' ? 0.9 : 0.25);
  // 精英词缀死亡效果
  if (en.affix === 'boom') {
    explodeAt(en.position.clone(), 3.6, 1, 45);
    const pd = camera.position.distanceTo(en.position);
    if (pd < 4.4) damagePlayer(Math.round(22 * (1 - pd / 4.4)), en.position);
  }
  if (en.affix === 'split' && en.kind !== 'swarm') {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = new Enemy('swarm', KIND_CFG.swarm.speed, en.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 0.5, Math.sin(a) * 1.2)));
      enemies.push(s);
      scene.add(s.group);
      s.group.traverse((o) => { if (o.userData.enemy) enemyMeshes.push(o); });
    }
  }
  if (stats.lifesteal > 0 && hp < stats.maxHp) {
    hp = Math.min(hp + stats.lifesteal, stats.maxHp);
    updateHealthUI();
  }
  if (hasAffix(weapon, 'vamp') && hp < stats.maxHp) {
    hp = Math.min(hp + 2, stats.maxHp);
    updateHealthUI();
  }
  rollDrop(en);
  // 精英/BOSS 掉武器箱
  if (en.kind === 'elite' && Math.random() < 0.45) spawnWeaponRack(ALL_WEAPONS[1 + Math.floor(Math.random() * 4)], en.position.x, en.position.z);
  if (en.kind === 'boss') spawnWeaponRack(ALL_WEAPONS[1 + Math.floor(Math.random() * 4)], en.position.x + 2, en.position.z);
  updateScoreUI();
}

const raycaster = new THREE.Raycaster();
const muzzleWorld = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function fire() {
  const cfg = WEAPONS[weapon];
  if (reloading > 0) return;
  if (ammo <= 0) { sfx.empty(); startReload(); return; }
  ammo--;
  fireCooldown = cfg.rate * stats.rateMul * (overcharge > 0 ? 0.55 : 1);
  gunKick = 1;
  if (!cfg.beam) {
    if (cfg.sound === 'rifle') sfx.rifle();
    else if (cfg.sound === 'shotgun') sfx.shotgun();
    else if (cfg.sound === 'zap') sfx.zap();
    else if (cfg.sound === 'launch') sfx.launch();
    else if (cfg.sound === 'flame') sfx.flameTick();
    else sfx.railgun();
  }
  elCross.classList.add('firing');
  setTimeout(() => elCross.classList.remove('firing'), 90);

  // 榴弹发射器：抛射爆炸弹
  if (cfg.launcher) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.17, 0),
      new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xff6a00, emissiveIntensity: 2 }),
    );
    mesh.position.copy(camera.position).addScaledVector(dir, 0.6);
    const vel = dir.clone().multiplyScalar(24);
    vel.y += 2.5;
    grenades.push({ mesh, vel, fuse: 2.4 });
    scene.add(mesh);
    addShake(0.3);
    updateAmmoUI();
    if (ammo === 0) startReload();
    return;
  }

  // 等离子光束：持续切割
  if (cfg.beam) {
    beamTick(cfg);
    updateAmmoUI();
    if (ammo === 0) startReload();
    return;
  }

  // 追踪导弹
  if (cfg.homing) {
    spawnHomingMissile();
    updateAmmoUI();
    if (ammo === 0) startReload();
    return;
  }

  gun.getWorldPosition(muzzleWorld);
  muzzleWorld.add(tmpVec.set(0, 0.04, -0.3).applyQuaternion(camera.quaternion));
  muzzleLight.position.copy(muzzleWorld);
  muzzleLight.intensity = 10;
  camera.rotation.x += cfg.kick;

  const killed = new Set<Enemy>();
  let tracerColor = cfg.color;
  let furthest = 70;
  let chainFrom: Enemy | null = null;

  raycaster.far = cfg.range ?? Infinity;

  for (let p = 0; p < cfg.pellets; p++) {
    raycaster.setFromCamera(new THREE.Vector2(
      (Math.random() - 0.5) * cfg.spread * 2,
      (Math.random() - 0.5) * cfg.spread * 2,
    ), camera);
    const pvpList = mode === 'pvp'
      ? [...remotes.values()].filter((r) => !r.dead).flatMap((r) => r.hitMeshes)
      : [];
    const hits = raycaster.intersectObjects([...enemyMeshes, ...collidables, ...pvpList], false);
    if (hits.length === 0) {
      furthest = Math.min(furthest, cfg.range ?? 70);
      continue;
    }

    for (const h of hits) {
      // PvP：命中真人玩家
      const pvpId = h.object.userData.pvpId as string | undefined;
      if (pvpId && mode === 'pvp') {
        const isCrit = critRoll();
        const dmg = Math.round(cfg.dmg * dmgOf() * (isCrit ? 2 : 1));
        net.send({ t: 'phit', target: pvpId, dmg });
        flashHit(false);
        sfx.hit();
        spawnFloater(h.point, `${dmg}`, isCrit ? 'crit' : 'dmg');
        particles.burst(h.point, new THREE.Color(0xff5577), 6, 3);
        if (!cfg.pierce) break;
        continue;
      }
      const hitEnemy = h.object.userData.enemy as Enemy | undefined;
      if (hitEnemy && hitEnemy.alive) {
        // 爆头判定：命中点高于机体中心
        const headY = hitEnemy.position.y + KIND_CFG[hitEnemy.kind].r * 0.35;
        const isHead = h.point.y > headY;
        const isCrit = isHead || critRoll();
        const dmg = Math.round(cfg.dmg * dmgOf() * (isCrit ? 2 : 1));
        if (isHead) trackContract('headshot');
        // 词缀：炽热的 → 点燃
        if ((hasAffix(weapon, 'inferno') || cfg.flame) && mode === 'solo') hitEnemy.burnT = Math.max(hitEnemy.burnT, cfg.flame ? 2 : 1.2);
        spawnFloater(h.point, `${dmg}${isCrit ? '!' : ''}`, isCrit ? 'crit' : 'dmg');
        particles.burst(h.point, new THREE.Color(isCrit ? AMBER : cfg.flame ? 0xff7a2a : 0xffffff), isCrit ? 10 : 5, 3);
        flashHit(false);
        sfx.hit();
        // 连锁电弧：记录起始目标
        if (cfg.chain && !chainFrom) chainFrom = hitEnemy;

        if (mode === 'solo') {
          if (hitEnemy.damage(dmg)) killed.add(hitEnemy);
        } else {
          hitEnemy.damage(dmg);
          net.send({ t: 'hit', id: hitEnemy.netId, dmg, combo });
        }
        if (!cfg.pierce) break;
      } else if (h.object.userData.surface) {
        particles.burst(h.point, new THREE.Color(CYAN), 7, 3.5);
        furthest = Math.min(furthest, h.distance);
        if (!cfg.pierce) break;
      }
    }
  }

  // 连锁电弧：跳向附近敌机
  if (cfg.chain && chainFrom && chainFrom.alive) {
    const near = enemies
      .filter((e) => e !== chainFrom && e.alive && e.position.distanceTo(chainFrom!.position) < 8)
      .sort((a, b) => a.position.distanceTo(chainFrom!.position) - b.position.distanceTo(chainFrom!.position))
      .slice(0, cfg.chain);
    let prev = chainFrom.position.clone();
    let mul = 0.6;
    for (const t of near) {
      const dmg = Math.max(1, Math.round(cfg.dmg * dmgOf() * mul));
      mul *= 0.7;
      const tr = tracers.find((x) => x.life <= 0) ?? tracers[0];
      tr.line.geometry.setFromPoints([prev, t.position.clone()]);
      (tr.line.material as THREE.LineBasicMaterial).color.setHex(cfg.color);
      tr.life = 1;
      spawnFloater(t.position, `${dmg}`, 'dmg');
      particles.burst(t.position, new THREE.Color(cfg.color), 4, 2);
      if (mode === 'solo') { if (t.damage(dmg)) killEnemy(t); }
      else { t.damage(dmg); net.send({ t: 'hit', id: t.netId, dmg, combo }); }
      prev = t.position.clone();
    }
  }

  // 单机击杀结算
  if (mode === 'solo') {
    for (const en of killed) killEnemy(en);
  }

  // 曳光
  const tr = tracers.find((t) => t.life <= 0) ?? tracers[0];
  const end = raycaster.ray.at(furthest, new THREE.Vector3());
  tr.line.geometry.setFromPoints([muzzleWorld.clone(), end]);
  (tr.line.material as THREE.LineBasicMaterial).color.setHex(tracerColor);
  tr.life = 1;

  updateAmmoUI();
  if (ammo === 0) startReload();
}

function rollDrop(en: Enemy) {
  const times = dailyHas('dfat') ? 2 : 1;
  for (let i = 0; i < times; i++) rollDropOnce(en);
}
function rollDropOnce(en: Enemy) {
  const roll = Math.random();
  if (en.kind === 'boss') {
    pickups.push(spawnPickupMesh(pickupId++, 'health', en.position.x, en.position.z));
    pickups.push(spawnPickupMesh(pickupId++, 'over', en.position.x + 2, en.position.z));
  } else if (roll < 0.12) {
    pickups.push(spawnPickupMesh(pickupId++, 'health', en.position.x, en.position.z));
  } else if (roll < 0.2) {
    pickups.push(spawnPickupMesh(pickupId++, 'over', en.position.x, en.position.z));
  }
}

// ============================================================
// 玩家受伤 / 死亡
// ============================================================
function damagePlayer(amount: number, from?: THREE.Vector3) {
  if (state !== 'playing' || myDead || mode === 'pvp') return;
  hp -= Math.round(amount * (cursedFrail ? 1.25 : 1) * (dailyHas('dglass') ? 1.2 : 1));
  regenDelay = 4;
  flashDamage();
  addShake(0.45);
  sfx.hurt();
  // 受击方向指示
  if (from) {
    const dx = from.x - camera.position.x;
    const dz = from.z - camera.position.z;
    const attacker = Math.atan2(dx, dz);
    const facing = Math.atan2(-Math.sin(camera.rotation.y), -Math.cos(camera.rotation.y));
    elDmgDir.style.transform = `translate(-50%,-50%) rotate(${-(attacker - facing)}rad)`;
    elDmgDir.classList.remove('show');
    void elDmgDir.offsetWidth;
    elDmgDir.classList.add('show');
  }
  updateHealthUI();
  if (hp <= 0) {
    hp = 0;
    updateHealthUI();
    if (mode === 'solo') {
      sfx.death();
      gameOver();
    } else {
      myDead = true;
      respawnTimer = 5;
      gun.visible = false;
      firing = false;
      sfx.death();
      elRespawn.classList.remove('hidden');
    }
  }
}

function respawnPlayer() {
  const ang = Math.random() * Math.PI * 2;
  camera.position.set(Math.cos(ang) * 20, EYE_HEIGHT, Math.sin(ang) * 20);
  camera.rotation.set(0, ang + Math.PI, 0);
  hp = stats.maxHp;
  myDead = false;
  respawnTimer = 0;
  ammo = magOf(weapon);
  gun.visible = true;
  elRespawn.classList.add('hidden');
  updateHealthUI();
  updateAmmoUI();
  toast('重新部署完成');
}

// ============================================================
// 联机事件
// ============================================================
net.on('wave', (m: { n: number; total: number }) => {
  const first = wave === 1 && m.n === 1;
  wave = m.n;
  mpTotalLeft = m.total;
  const isBoss = m.n % 5 === 0;
  showBanner(isBoss ? `WAVE ${String(m.n).padStart(2, '0')} · 核心主宰来袭` : `WAVE ${String(m.n).padStart(2, '0')}`, isBoss);
  elWaveNum.textContent = `WAVE ${String(m.n).padStart(2, '0')}`;
  if (isBoss) sfx.bossWarn(); else sfx.wave();
  if (state === 'over') { closeOver(); resetLocalRun(); state = 'playing'; lockPointer(); }
  else if (!first) autoUpgrade();
  if (m.n >= 2 && Math.random() < 0.65) dropSupplyCore();
  if (m.n >= 2 && Math.random() < 0.7) {
    const ang = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 16;
    dropRandomRack(Math.round(Math.cos(ang) * d), Math.round(Math.sin(ang) * d));
  }
});

net.on('state', (m: { players: any[]; enemies: { id: number; k: EnemyKind; x: number; y: number; z: number; h: number }[] }) => {
  const seen = new Set<number>();
  if (mode === 'coop') {
    for (const e of m.enemies) {
      seen.add(e.id);
      let en = enemies.find((x) => x.netId === e.id);
      if (!en) {
        en = new Enemy(e.k, KIND_CFG[e.k].speed, new THREE.Vector3(e.x, e.y, e.z));
        en.netId = e.id;
        en.netTarget.set(e.x, e.y, e.z);
        enemies.push(en);
        scene.add(en.group);
        en.group.traverse((o) => { if (o.userData.enemy) enemyMeshes.push(o); });
        spawnBeam(new THREE.Vector3(e.x, e.y, e.z), KIND_CFG[e.k].color);
      }
      en.netTarget.set(e.x, e.y, e.z);
      if (Math.abs(en.hp / en.maxHp - e.h) > 0.01) en.setHp01(e.h);
      en.alive = true;
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].netId !== 0 && !seen.has(enemies[i].netId)) {
        scene.remove(enemies[i].group);
        enemyMeshes = enemyMeshes.filter((mm) => mm.userData.enemy !== enemies[i]);
        enemies.splice(i, 1);
      }
    }
    mpTotalLeft = m.enemies.length;
  }

  for (const p of m.players) {
    if (p.id === net.myId) {
      score = p.score; kills = p.kills;
      updateScoreUI();
      if (mode === 'pvp') {
        hp = p.hp;
        updateHealthUI();
        elPvpMe.textContent = String(p.kills);
        // 自己的出生保护提示
        if (p.prot && !selfProtected) { selfProtected = true; toast('🛡 出生保护 2 秒'); }
        if (!p.prot && selfProtected) selfProtected = false;
        if (p.dead && !myDead) {
          myDead = true;
          gun.visible = false;
          firing = false;
          elRespawn.classList.remove('hidden');
        } else if (!p.dead && myDead) {
          // 服务器已重生：瞬移到服务器位置
          myDead = false;
          respawnTimer = 0;
          hp = p.hp;
          camera.position.set(p.x, EYE_HEIGHT, p.z);
          gun.visible = true;
          ammo = magOf(weapon);
          elRespawn.classList.add('hidden');
          updateHealthUI();
          updateAmmoUI();
          toast('重新部署完成');
        } else if (p.dead) {
          respawnTimer = p.respawn ?? 0;
        }
      }
      continue;
    }
    let rp = remotes.get(p.id);
    if (!rp) rp = addRemote(p.id, p.name, p.x, p.y, p.z);
    rp.target.set(p.x, p.y - EYE_HEIGHT, p.z);
    rp.yaw = p.yaw;
    rp.score = p.score;
    rp.kills = p.kills;
    rp.dead = p.dead;
    rp.protect = p.prot === true;
    rp.bubble.visible = rp.protect;
    rp.group.visible = !p.dead;
  }
  for (const id of [...remotes.keys()]) {
    if (!m.players.some((p) => p.id === id)) {
      const rp = remotes.get(id)!;
      scene.remove(rp.group);
      disposeObj(rp.group);
      remotes.delete(id);
    }
  }
  updatePlayersPanel(m.players.map((p) => ({ id: p.id, name: p.name, score: p.score, dead: p.dead })));
  if (mode === 'pvp') {
    const top = [...m.players].sort((a, b) => b.kills - a.kills)[0];
    elPvpTop.textContent = `${top ? top.kills : 0} 杀领先`;
  }
});

net.on('kill', (m: { id: number; k: EnemyKind; x: number; y: number; z: number; by: string; byId: string }) => {
  const en = enemies.find((x) => x.netId === m.id);
  if (en) {
    en.alive = false;
    if (m.byId === net.myId) {
      flashHit(true);
      kills++;
      ltk.kills++;
      hitStop = m.k === 'boss' ? 0.12 : 0.05;
      dropCoins(new THREE.Vector3(m.x, m.y, m.z), m.k === 'boss' ? 20 : m.k === 'elite' ? 6 : (m.k === 'swarm' ? 1 : 2));
      trackContract('kills');
      if (weapon === 'railgun') trackContract('railKills');
      if (weapon === 'shotgun') trackContract('shotgunKills');
      if (m.k === 'boss') { bossKills++; ltk.bosses++; }
      saveLtk();
      checkAchievements();
      comboTimer = 3;
      combo = Math.min(combo + 1, 3);
      if (combo === 3) trackContract('combo3');
      score += KIND_CFG[m.k].score;
      if (stats.lifesteal > 0 && hp < stats.maxHp) {
        hp = Math.min(hp + stats.lifesteal, stats.maxHp);
        updateHealthUI();
      }
      updateScoreUI();
      spawnFloater(en.position, `+${KIND_CFG[m.k].score}`, 'crit');
    } else {
      spawnFloater(en.position, `${m.by} 击毁`, 'heal');
    }
    sfx.explode();
    particles.burst(en.position, new THREE.Color(KIND_CFG[m.k].color), m.k === 'boss' ? 120 : 36, m.k === 'boss' ? 12 : 7);
    spawnHusk(en.position, KIND_CFG[m.k].color, KIND_CFG[m.k].r);
    if (m.byId === net.myId) addShake(m.k === 'boss' ? 0.9 : 0.25);
    scene.remove(en.group);
    enemyMeshes = enemyMeshes.filter((mm) => mm.userData.enemy !== en);
    enemies = enemies.filter((x) => x !== en);
  }
});

net.on('ehit', (m: { id: number; h: number }) => {
  const en = enemies.find((x) => x.netId === m.id);
  if (en) en.setHp01(m.h);
});

net.on('efire', (m: { x: number; y: number; z: number; tx: number; ty: number; tz: number }) => {
  const from = new THREE.Vector3(m.x, m.y, m.z);
  const dir = new THREE.Vector3(m.tx - m.x, m.ty - m.y, m.tz - m.z);
  const b = new EBullet(from, dir, 13);
  ebullets.push(b);
  scene.add(b.mesh);
});

net.on('eburst', (m: { list: { x: number; y: number; z: number; dx: number; dy: number; dz: number }[] }) => {
  for (const item of m.list) {
    const b = new EBullet(new THREE.Vector3(item.x, item.y, item.z), new THREE.Vector3(item.dx, item.dy, item.dz), 9);
    ebullets.push(b);
    scene.add(b.mesh);
  }
});

net.on('pickup', (m: { id: number; kind: 'health' | 'over' | 'core'; x: number; z: number }) => {
  pickups.push(spawnPickupMesh(m.id, m.kind, m.x, m.z));
});
net.on('pickupGone', (m: { id: number }) => removePickup(m.id));

net.on('over', (m: { scores: { name: string; score: number; kills: number }[]; wave: number }) => {
  wave = m.wave;
  gameOver(m.scores);
});

net.on('toast', (m: { msg: string }) => toast(m.msg));
// ---------- 房间 / PvP 事件 ----------
let roomOpen = false;
let roomMode: 'coop' | 'pvp' = 'coop';

function showRoom(info: { code: string; mode: 'coop' | 'pvp'; map: number; state: string; host: string; players: { id: string; name: string }[] }) {
  roomOpen = true;
  roomMode = info.mode;
  mode = info.mode;
  state = 'lobby';
  elMenu.classList.add('hidden');
  elLobby.classList.add('hidden');
  elHud.classList.add('hidden');
  elOver.classList.add('hidden');
  elRoom.classList.remove('hidden');
  renderRoom(info);
}

function renderRoom(info: { code: string; mode: 'coop' | 'pvp'; map: number; state: string; host: string; players: { id: string; name: string }[] }) {
  $('room-code').textContent = info.code;
  $('room-count').textContent = `${info.players.length} 人`;
  $('room-players').innerHTML = info.players.map((p) =>
    `<div class="room-player${p.id === net.myId ? ' me' : ''}">${p.id === info.host ? '👑 ' : ''}${p.name}${p.id === net.myId ? '（你）' : ''}</div>`,
  ).join('');
  const isHost = info.host === net.myId;
  document.querySelectorAll('.map-opt').forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.map);
    el.classList.toggle('sel', idx === info.map);
    el.classList.toggle('lock', !isHost);
  });
  $('btn-room-start').classList.toggle('hidden', !isHost);
  $('room-wait').classList.toggle('hidden', isHost);
}

net.on('room_update', (info: any) => { if (roomOpen) renderRoom(info); });
net.on('game_start', (m: { map: number; mode: 'coop' | 'pvp' }) => {
  roomOpen = false;
  elRoom.classList.add('hidden');
  startGame(m.mode, m.map);
});
net.on('room_created', (info: any) => showRoom(info));
net.on('room_joined', (info: any) => {
  if (info.state === 'playing') {
    // 中途加入对局
    startGame(info.mode, info.map);
    toast(`已加入房间 ${info.code}`);
  } else {
    showRoom(info);
    toast(`已加入房间 ${info.code}`);
  }
});
net.on('room_error', (m: { msg: string }) => toast(`✕ ${m.msg}`));

net.on('pvp_start', (m: { target: number; time: number }) => {
  closeOver();
  resetLocalRun();
  elHud.classList.remove('hidden');
  elPvpChip.classList.remove('hidden');
  gun.visible = true;
  state = 'playing';
  paused = false;
  lockPointer();
  pointerLockWatchdog();
  elWaveNum.textContent = '大乱斗';
  elPvpTop.textContent = `${m.target} 杀获胜`;
  showBanner('大乱斗开始', true);
  sfx.wave();
});

net.on('pvp_over', (m: { board: { name: string; score: number; kills: number }[] }) => {
  const myRow = m.board.find((b) => b.name === playerName);
  const top = m.board[0];
  if (myRow && top && myRow.kills === top.kills && myRow.kills > 0) {
    ltk.pvpWins++;
    saveLtk();
    toast('🏆 你是大乱斗冠军！');
  }
  gameOver(m.board, '大乱斗结束');
});

net.on('phitfx', (m: { target: string; h: number }) => {
  const rp = remotes.get(m.target);
  if (rp) {
    // 受击闪红
    const mesh = rp.hitMeshes[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(0xff3050);
    mat.emissiveIntensity = 2.5;
    setTimeout(() => { mat.emissive.setHex(0x2288aa); mat.emissiveIntensity = 0.7; }, 90);
  }
});

net.on('pdown', (m: { id: string; by: string; byId: string }) => {
  const rp = remotes.get(m.id);
  if (rp) particles.burst(rp.group.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Color(MAGENTA), 30, 6);
  if (m.byId === net.myId) {
    flashHit(true);
    sfx.explode();
    addShake(0.3);
  }
});

net.on('drop', () => {
  toast('与联机服务断开连接');
  if (state !== 'menu') {
    state = 'menu';
    mode = 'solo';
    clearWorld();
    elHud.classList.add('hidden');
    elOver.classList.add('hidden');
    elRespawn.classList.add('hidden');
    elLobby.classList.add('hidden');
    $('upgrades').classList.add('hidden');
    elMenu.classList.remove('hidden');
  }
});

setInterval(() => {
  if (mode !== 'solo' && net.connected && state === 'playing') {
    net.send({
      t: 'state',
      p: [camera.position.x, camera.position.y, camera.position.z],
      yaw: camera.rotation.y,
      hp: Math.round(hp),
      dead: myDead,
    });
  }
}, 66);

// ============================================================
// 单机模拟
// ============================================================
function updateSoloEnemies(dt: number) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const en = enemies[i];
    if (!en.alive) {
      scene.remove(en.group);
      enemyMeshes = enemyMeshes.filter((m) => m.userData.enemy !== en);
      enemies.splice(i, 1);
      continue;
    }
    en.updateVisual(dt, camera.position, false);

    // 火焰点燃 DoT（单机）
    if (en.burnT > 0) {
      en.burnT -= dt;
      en.hp -= 8 * dt;
      en.setHp01(Math.max(0, en.hp) / en.maxHp);
      if (Math.random() < 0.3) particles.burst(en.position, new THREE.Color(0xff7a2a), 2, 1.5);
      if (en.hp <= 0) { killEnemy(en); continue; }
    }

    const toPlayer = new THREE.Vector3().subVectors(camera.position, en.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    toPlayer.normalize();

    const contact = CONTACT_DMG[en.kind];
    en.hitCooldown -= dt;

    if (en.kind === 'sentry' || en.kind === 'boss' || en.kind === 'elite') {
      const keep = en.kind === 'boss' ? 12 : (en.kind === 'elite' ? 11 : 14);
      // BOSS 半血狂暴
      let enrageMul = 1;
      if (en.kind === 'boss' && en.hp < en.maxHp * 0.5) {
        if (!en.enraged) {
          en.enraged = true;
          toast('⚠ 核心主宰进入狂暴！');
          sfx.bossWarn();
        }
        enrageMul = 1.7;
      }
      // BOSS 最终阶段：25% 血量召唤增援 + 环形弹幕
      if (en.kind === 'boss' && !en.phase2 && en.hp < en.maxHp * 0.25) {
        en.phase2 = true;
        toast('⚠ 主宰进入最终阶段！');
        addShake(0.9);
        sfx.bossWarn();
        for (let b = 0; b < 16; b++) {
          const a = (b / 16) * Math.PI * 2;
          const eb = new EBullet(en.position.clone(), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 10);
          ebullets.push(eb);
          scene.add(eb.mesh);
        }
        for (let s = 0; s < 3; s++) spawnEnemyLocal('swarm');
      }
      const move = new THREE.Vector3();
      if (dist > keep + 2) move.add(toPlayer);
      else if (dist < keep - 4) move.sub(toPlayer);
      move.add(new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(en.strafeDir * (en.kind === 'boss' ? 0.2 : (en.kind === 'elite' ? 1.0 : 0.7))));
      if (move.lengthSq() > 0) move.normalize();
      en.position.addScaledVector(move, KIND_CFG[en.kind].speed * enrageMul * dt);
      en.position.y = (en.kind === 'boss' ? 2.4 : 2) + Math.sin(en.bobPhase) * 0.3;

      en.fireTimer -= dt;
      if (en.fireTimer <= 0 && dist < 32) {
        if (en.kind === 'boss') {
          en.fireTimer = enrageMul > 1 ? 1.5 : 2.6;
          for (let b = 0; b < 10; b++) {
            const a = (b / 10) * Math.PI * 2 + en.bobPhase;
            const eb = new EBullet(en.position.clone(), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 9);
            ebullets.push(eb);
            scene.add(eb.mesh);
          }
          const eb2 = new EBullet(en.position.clone(), toPlayer.clone(), 13);
          ebullets.push(eb2);
          scene.add(eb2.mesh);
        } else {
          en.fireTimer = en.kind === 'elite'
            ? Math.max(1.6 - wave * 0.04, 0.9)
            : Math.max(2.2 - wave * 0.06, 1.1);
          const eb = new EBullet(en.position.clone(), toPlayer.clone(), 13);
          ebullets.push(eb);
          scene.add(eb.mesh);
        }
      }
    } else if (en.kind === 'tank') {
      // 重装：蓄力冲锋（白闪预警）
      en.chargeCd -= dt;
      if (en.chargeWind > 0) {
        en.chargeWind -= dt;
        en.blink();
        if (en.chargeWind <= 0) {
          en.charging = 0.55;
          en.chargeDir.copy(toPlayer);
          sfx.bossWarn();
        }
      } else if (en.charging > 0) {
        en.charging -= dt;
        en.position.addScaledVector(en.chargeDir, 19 * dt);
        if (dist < KIND_CFG.tank.r + 1.4) {
          damagePlayer(20, en.position);
          addShake(0.8);
          en.charging = 0;
          en.chargeCd = 5;
        }
      } else if (en.chargeCd <= 0 && dist > 5 && dist < 17) {
        en.chargeWind = 0.8;
      } else {
        en.position.addScaledVector(toPlayer, en.speed * (frenzyT > 0 ? 1.35 : 1) * dt);
      }
      en.position.y = 1.3 + Math.sin(en.bobPhase) * 0.2;
    } else {
      en.position.addScaledVector(toPlayer, en.speed * (frenzyT > 0 ? 1.35 : 1) * dt);
      en.position.y = 1.45 + Math.sin(en.bobPhase) * 0.35;
    }

    const touchR = KIND_CFG[en.kind].r + 1.1;
    if (dist < touchR && en.hitCooldown <= 0 && en.charging <= 0) {
      en.hitCooldown = contact.cd;
      damagePlayer(contact.dmg, en.position);
      // 虹吸词缀：攻击回血
      if (en.affix === 'vamp') {
        en.hp = Math.min(en.maxHp, en.hp + 12);
        en.setHp01(en.hp / en.maxHp);
      }
      if (en.kind === 'swarm') {
        en.alive = false;
        particles.burst(en.position, new THREE.Color(KIND_CFG.swarm.color), 20, 6);
      } else {
        en.position.addScaledVector(toPlayer, -2.5);
      }
    }

    for (const p of pillarXZ) {
      const dx = en.position.x - p.x;
      const dz = en.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < p.r + 0.5 && d > 0.001) {
        en.position.x = p.x + (dx / d) * (p.r + 0.5);
        en.position.z = p.z + (dz / d) * (p.r + 0.5);
      }
    }
    collideWalls(en.position, KIND_CFG[en.kind].r + 0.3);
    en.position.x = THREE.MathUtils.clamp(en.position.x, -ARENA_HALF + 1, ARENA_HALF - 1);
    en.position.z = THREE.MathUtils.clamp(en.position.z, -ARENA_HALF + 1, ARENA_HALF - 1);
  }
  elEnemies.textContent = enemies.length + queue.length > 0 ? `剩余敌机 ${enemies.length + queue.length}` : '区域清空';
}

// 波内动态事件
function fireRandomEvent() {
  const pool = ['airstrike', 'reinforce', 'supply', 'frenzy'];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === 'airstrike') {
    toast('⚠ 空袭警报 — 远离红圈！');
    sfx.bossWarn();
    for (let i = 0; i < 3; i++) spawnHazard(true);
  } else if (pick === 'reinforce') {
    toast('⚠ 敌方增援抵达！');
    for (let i = 0; i < 3; i++) {
      const kinds: EnemyKind[] = wave >= 5 ? ['drone', 'sentry', 'swarm'] : ['drone', 'swarm'];
      spawnEnemyLocal(kinds[Math.floor(Math.random() * kinds.length)]);
    }
  } else if (pick === 'supply') {
    toast('▼ 补给雨 — 快去捡！');
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 8 + Math.random() * 16;
      const kind: 'health' | 'over' = Math.random() < 0.55 ? 'health' : 'over';
      pickups.push(spawnPickupMesh(pickupId++, kind, Math.round(Math.cos(ang) * d), Math.round(Math.sin(ang) * d)));
      spawnBeam(new THREE.Vector3(Math.cos(ang) * d, 1, Math.sin(ang) * d), pickupColor(kind));
    }
  } else {
    frenzyT = 10;
    toast('⚠ 狂暴时刻 — 全场敌机提速！');
    sfx.bossWarn();
  }
}

function updateSoloWaves(dt: number) {
  waveTime += dt;
  frenzyT = Math.max(0, frenzyT - dt);

  // 波内事件触发
  if (eventArmed && !eventFired && waveTime >= eventAt && queue.length > 0) {
    eventFired = true;
    fireRandomEvent();
  }

  if (queue.length > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < 14) {
      spawnTimer = Math.max(1.0 - wave * 0.04, 0.3) * (soloMode === 'survival' ? 0.6 : 1);
      spawnEnemyLocal(queue.shift()!);
    }
  } else if (enemies.length === 0) {
    // 歼灭竞速：清空即胜利
    if (soloMode === 'clear') {
      const bonus = Math.max(0, Math.round((240 - waveTime) * 15));
      score += bonus;
      updateScoreUI();
      gameOver(undefined, `歼灭完成 · 速通奖励 +${bonus}`);
      return;
    }
    if (waveClearTimer < 0) waveClearTimer = 1.5;
    waveClearTimer -= dt;
    if (waveClearTimer <= 0) {
      waveClearTimer = -1;
      hp = Math.min(hp + 25, stats.maxHp);
      updateHealthUI();
      // 进入强化选择（Roguelite）
      state = 'upgrade';
      firing = false;
      document.exitPointerLock();
      drawUpgradeCards();
    }
  }
}

// ============================================================
// 通用更新
// ============================================================
function updateBullets(dt: number) {
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    if (!b.update(dt) || b.mesh.position.y < 0 || hitsStatic(b.mesh.position)) {
      // 撞墙/落地：火花反馈
      if (b.mesh.position.y >= 0) particles.burst(b.mesh.position, new THREE.Color(MAGENTA), 6, 3);
      scene.remove(b.mesh);
      ebullets.splice(i, 1);
      continue;
    }
    if (!myDead && b.mesh.position.distanceTo(camera.position) < 0.9) {
      damagePlayer(10, b.mesh.position);
      particles.burst(b.mesh.position, new THREE.Color(MAGENTA), 10, 4);
      scene.remove(b.mesh);
      ebullets.splice(i, 1);
    }
  }
}

function updateGrenades(dt: number) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 20 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.12) { g.mesh.position.y = 0.12; g.vel.y *= -0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    // 撞墙反弹
    if (hitsStatic(g.mesh.position)) {
      collideWalls(g.mesh.position, 0.2);
      g.vel.x *= -0.45;
      g.vel.z *= -0.45;
    }
    // 撞到敌机直接引爆
    let hitEnemy = false;
    for (const en of enemies) {
      if (en.alive && g.mesh.position.distanceTo(en.position) < KIND_CFG[en.kind].r + 0.9) { hitEnemy = true; break; }
    }
    if (g.fuse <= 0 || hitEnemy) {
      explodeAt(g.mesh.position.clone(), hitEnemy ? 4.4 : GRENADE.radius, GRENADE.dmgMul);
      scene.remove(g.mesh);
      disposeObj(g.mesh);
      grenades.splice(i, 1);
    }
  }
  if (GRENADE.cd > 0) {
    GRENADE.cd -= dt;
    if (GRENADE.cd <= 0) { GRENADE.cd = 0; sfx.pickup(); }
    updateGrenadeUI();
  }
}

function updatePickupsAndContact(dt: number) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.phase += dt * 2;
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = 1 + Math.sin(p.phase) * 0.2;
    if (!myDead && state === 'playing') {
      const d = Math.hypot(camera.position.x - p.pos.x, camera.position.z - p.pos.z);
      if (d < 1.6) {
        if (p.kind === 'health') {
          hp = Math.min(hp + 30, stats.maxHp);
          spawnFloater(camera.position.clone().add(new THREE.Vector3(0, 0, -2)), '+30 护盾', 'heal');
          updateHealthUI();
        } else if (p.kind === 'core') {
          hp = Math.min(hp + 15, stats.maxHp);
          autoUpgrade();
          autoUpgrade();
          spawnFloater(camera.position.clone().add(new THREE.Vector3(0, 0, -2)), '补给核心 ×2 强化!', 'pick');
          updateHealthUI();
        } else {
          overcharge = 8;
          spawnFloater(camera.position.clone().add(new THREE.Vector3(0, 0, -2)), '火力过载!', 'pick');
        }
        sfx.pickup();
        if (mode === 'coop') net.send({ t: 'pickup', id: p.id });
        removePickup(p.id);
      }
    }
  }

  if (mode === 'coop') {
    for (const en of enemies) {
      const contact = CONTACT_DMG[en.kind];
      en.hitCooldown -= dt;
      const dx = camera.position.x - en.position.x;
      const dz = camera.position.z - en.position.z;
      const dist = Math.hypot(dx, dz);
      const touchR = KIND_CFG[en.kind].r + 1.1;
      if (dist < touchR && en.hitCooldown <= 0 && !myDead) {
        en.hitCooldown = contact.cd;
        damagePlayer(contact.dmg, en.position);
      }
    }
    elEnemies.textContent = mpTotalLeft > 0 ? `当前敌机 ${enemies.length}` : '区域清空';
  }
}

function movePlayer(dt: number) {
  if (myDead) return;
  const forward = new THREE.Vector3(-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const wish = new THREE.Vector3();
  if (keys.has('KeyW')) wish.add(forward);
  if (keys.has('KeyS')) wish.sub(forward);
  if (keys.has('KeyD')) wish.add(right);
  if (keys.has('KeyA')) wish.sub(right);
  if (wish.lengthSq() > 0) wish.normalize();

  const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !aiming;
  const maxSpeed = (sprinting ? 11 : (aiming ? 4 : 7.2)) * stats.speedMul;
  const accel = grounded ? 60 : 15;
  playerVel.x += wish.x * accel * dt;
  playerVel.z += wish.z * accel * dt;

  const damp = Math.exp(-(grounded ? 10 : 2) * dt);
  playerVel.x *= damp;
  playerVel.z *= damp;
  const hSpeed = Math.hypot(playerVel.x, playerVel.z);
  if (hSpeed > maxSpeed) {
    playerVel.x *= maxSpeed / hSpeed;
    playerVel.z *= maxSpeed / hSpeed;
  }

  // 冲刺：短时高速位移
  if (dashTime > 0) {
    dashTime -= dt;
    playerVel.x = dashDir.x * 30;
    playerVel.z = dashDir.z * 30;
  } else if (dashCd > 0) {
    dashCd -= dt;
  }
  elDash.textContent = dashCd > 0 ? `冲刺 ${dashCd.toFixed(1)}s` : '冲刺 [C] 就绪';
  elDash.classList.toggle('ready', dashCd <= 0);

  if (keys.has('Space') && grounded) { playerVel.y = 8.5; grounded = false; }
  // 弹跳板
  if (grounded) {
    for (const p of jumpPads) {
      if (Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 1.4) {
        playerVel.y = 15;
        grounded = false;
        sfx.pump();
        addShake(0.15);
        trackContract('pads');
        particles.burst(new THREE.Vector3(p.x, 0.4, p.z), new THREE.Color(0x3aff8f), 18, 5);
        break;
      }
    }
  }
  playerVel.y -= 24 * dt;

  camera.position.addScaledVector(playerVel, dt);
  if (camera.position.y <= EYE_HEIGHT) {
    camera.position.y = EYE_HEIGHT;
    playerVel.y = 0;
    grounded = true;
  }

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -ARENA_HALF + 1, ARENA_HALF - 1);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -ARENA_HALF + 1, ARENA_HALF - 1);

  for (const p of pillarXZ) {
    const dx = camera.position.x - p.x;
    const dz = camera.position.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < p.r && d > 0.001) {
      camera.position.x = p.x + (dx / d) * p.r;
      camera.position.z = p.z + (dz / d) * p.r;
    }
  }
  collideWalls(camera.position, 0.55);

  if (grounded && hSpeed > 1) {
    bobPhase += dt * hSpeed * 1.4;
    camera.position.y = EYE_HEIGHT + Math.sin(bobPhase) * 0.045;
  }
}

// ============================================================
// 主循环
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const raw = Math.min(clock.getDelta(), 0.05);
  let dt = raw;
  if (hitStop > 0) { hitStop -= raw; dt *= 0.18; } // 击杀卡顿帧
  const running = state === 'playing' && !paused;

  if (running) {
    movePlayer(dt);

    if (!myDead) {
      fireCooldown -= dt;
      if (firing && fireCooldown <= 0) fire();

      if (reloading > 0) {
        reloading -= dt;
        if (reloading <= 0) { ammo = magOf(weapon); updateAmmoUI(); }
      }

      if (overcharge > 0) {
        overcharge -= dt;
        elOvercharge.classList.remove('hidden');
        elOvercharge.textContent = `过载 ${Math.max(0, overcharge).toFixed(1)}s`;
        if (overcharge <= 0) elOvercharge.classList.add('hidden');
      }

      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) { combo = 1; updateScoreUI(); }
      }

      regenDelay -= dt;
      if (regenDelay <= 0 && hp < stats.maxHp && hp > 0) {
        hp = Math.min(hp + 9 * dt, stats.maxHp);
        updateHealthUI();
      }
      // 刀尖舞者：低血量存活计时
      if (hp <= stats.maxHp * 0.1) {
        lowHpTime += dt;
        checkAchievements();
      }
    } else {
      respawnTimer -= dt;
      $('respawn-count').textContent = String(Math.max(0, Math.ceil(respawnTimer)));
      if (mode !== 'pvp' && respawnTimer <= 0) respawnPlayer();
    }

    // 模式计时
    if (mode === 'solo' && soloMode === 'survival') {
      survivalT -= dt;
      const t = Math.max(0, survivalT);
      elWaveNum.textContent = `⏱ ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      if (survivalT <= 0) {
        score += 5000;
        updateScoreUI();
        gameOver(undefined, '生存成功 · 奖励 +5000');
      }
    } else if (mode === 'solo' && soloMode === 'clear') {
      const t = Math.floor(waveTime);
      elWaveNum.textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }

    if (mode === 'solo') {
      updateSoloEnemies(dt);
      updateSoloWaves(dt);
    } else {
      for (const en of enemies) en.updateVisual(dt, camera.position, true);
      let ri = 0;
      for (const rp of remotes.values()) {
        rp.group.position.lerp(rp.target, Math.min(dt * 12, 1));
        rp.group.rotation.y = rp.yaw + Math.PI;
        // 悬浮呼吸 + 喷焰闪烁
        rp.body.position.y = 0.55 + Math.sin(performance.now() * 0.003 + ri * 2) * 0.05;
        ri++;
      }
    }

    updateBullets(dt);
    updateGrenades(dt);
    updateMissiles(dt);
    updateHazards(dt);
    updateRacks(dt);
    updateCoins(dt);
    updatePickupsAndContact(dt);
    updateFloaters(dt, camera);
    drawMinimap(
      elMinimap,
      { x: camera.position.x, z: camera.position.z, yaw: camera.rotation.y },
      enemies.map((e) => ({ x: e.position.x, z: e.position.z, kind: e.kind })),
      pickups.map((p) => ({ x: p.pos.x, z: p.pos.z, kind: p.kind })),
      [...remotes.values()].filter((r) => !r.dead).map((r) => ({ x: r.group.position.x, z: r.group.position.z })),
      ARENA_HALF,
    );
  }

  particles.update(dt);
  muzzleLight.intensity *= Math.exp(-dt * 26);
  boomLight.intensity *= Math.exp(-dt * 14);
  gunKick *= Math.exp(-dt * 14);
  const gunBase = aiming ? new THREE.Vector3(0, -0.135, -0.5) : new THREE.Vector3(0.24, -0.21, -0.6);
  gun.position.lerp(gunBase, dt * 12);
  gun.position.z += gunKick * 0.07;
  gun.rotation.x = gunKick * 0.12;
  // 换弹动作：枪下沉翻转 + 准星进度环
  if (reloading > 0 && state === 'playing') {
    const prog = 1 - reloading / Math.max(reloadTotal, 0.001);
    const dip = Math.sin(Math.min(prog * 1.15, 1) * Math.PI);
    gun.position.y -= dip * 0.22;
    gun.rotation.x -= dip * 1.5;
    elReloadRing.classList.remove('hidden');
    elReloadRing.style.setProperty('--p', String(prog * 100));
  } else if (!elReloadRing.classList.contains('hidden')) {
    elReloadRing.classList.add('hidden');
  }

  const targetFov = aiming ? 50 : 75;
  camera.fov += (targetFov - camera.fov) * Math.min(dt * 10, 1);
  camera.updateProjectionMatrix();

  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt * 9;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(t.life, 0);
    }
  }
  // 光束只在发射帧显示
  beamMesh.visible = beamActive;
  beamActive = false;

  magLight.intensity = 30 + Math.sin(performance.now() * 0.003) * 14;
  cyanLight.intensity = 30 + Math.sin(performance.now() * 0.004 + 2) * 14;
  for (const r of fxRings) r.rotation.z += dt * 0.15;
  for (const p of fxPulses) {
    p.userData.pulseT = (p.userData.pulseT + dt / 7) % 1;
    const t = p.userData.pulseT as number;
    p.scale.setScalar(1 + t * ARENA_HALF * 1.9);
    (p.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - t);
  }
  for (const g of fxPadGlows) {
    (g.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 + Math.sin(performance.now() * 0.005) * 0.5;
  }
  updateHusks(dt);
  updateBeams(dt);

  // BOSS 顶部血条
  const boss = state !== 'menu' ? enemies.find((e) => e.kind === 'boss') : undefined;
  elBossBar.classList.toggle('hidden', !boss);
  if (boss) elBossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;

  // 屏幕震动（用未使用的 roll 轴 + 轻微 y 抖动）
  shake *= Math.exp(-dt * 7);
  camera.rotation.z = (Math.random() - 0.5) * shake * 0.05;
  camera.position.y += (Math.random() - 0.5) * shake * 0.07;

  composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- 局域网分享链接（主菜单 + 房间界面，点击复制） ----------
async function loadLanInfo() {
  const targets = [$('mp-hint'), $('room-lan')];
  try {
    const r = await fetch('/lan-info');
    const data = await r.json();
    const port = data.port ?? location.port ?? 5173;
    const links: string[] = data.ips.map((ip: string) => `http://${ip}:${port}`);
    if (links.length === 0) {
      targets.forEach((t) => { t.textContent = '本机无局域网地址，仅限本机游玩'; });
      return;
    }
    for (const container of targets) {
      container.textContent = '好友访问：';
      links.forEach((url, i) => {
        const a = document.createElement('a');
        a.className = 'lan-link';
        a.textContent = url;
        a.title = '点击复制';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          navigator.clipboard?.writeText(url).then(
            () => toast(`已复制 ${url}`),
            () => toast(url),
          );
        });
        container.appendChild(a);
        if (i < links.length - 1) container.appendChild(document.createTextNode(' / '));
      });
      container.appendChild(document.createTextNode('（点击复制）'));
    }
  } catch {
    for (const t of targets) t.textContent = '联机：好友访问 http://你的IP:5173（需同一局域网）';
  }
}

elNameInput.value = `特工${Math.floor(Math.random() * 900 + 100)}`;
loadLanInfo();

// ---------- 每日挑战（共享种子 + 2 词条 + 当日榜单） ----------
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DAILY_MODS_POOL = [
  { id: 'dfast', name: '高速协议', desc: '敌机速度 +20%' },
  { id: 'drich', name: '赏金猎场', desc: '金币掉落 ×1.5' },
  { id: 'dstrike', name: '空袭频发', desc: '波内事件更频繁' },
  { id: 'dglass', name: '易伤', desc: '承伤 +20%' },
  { id: 'dswarm', name: '虫潮', desc: '每波额外蜂群' },
  { id: 'dfat', name: '丰收', desc: '道具掉率 ×2' },
];
let dailyActive = false;
let pendingDaily = false;
let dailyMods: string[] = [];
function dailyHas(id: string) { return dailyActive && dailyMods.includes(id); }
function dailyBestKey() { return `ns-daily-${new Date().toISOString().slice(0, 10)}`; }
function dailyBest() { return Number(localStorage.getItem(dailyBestKey()) ?? 0); }
function refreshDailyButton() {
  const b = dailyBest();
  const tag = localStorage.getItem(`ns-daily-reward-${dailyBestKey()}`) ? '' : ' · 首通 +150◆';
  $('btn-daily').textContent = b > 0 ? `📅 每日挑战 · 今日最佳 ${b}${tag}` : `📅 每日挑战${tag}`;
}
function startDailyRun() {
  pendingDaily = true;
  soloMode = 'endless';
  document.querySelectorAll('.mode-chip').forEach((m) => m.classList.toggle('sel', (m as HTMLElement).dataset.mode === 'endless'));
  const now = new Date();
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const rng = mulberry32(seed);
  const map = Math.floor(rng() * mapNames.length);
  const pool = [...DAILY_MODS_POOL];
  dailyMods = [];
  for (let i = 0; i < 2; i++) dailyMods.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  startGame('solo', map);
  const names = dailyMods.map((id) => DAILY_MODS_POOL.find((x) => x.id === id)!.name).join(' + ');
  setTimeout(() => toast(`📅 每日挑战：${names}`), 1600);
}
type SoloMode = 'endless' | 'survival' | 'clear';
let soloMode: SoloMode = 'endless';
document.querySelectorAll('.mode-chip').forEach((el) => {
  el.addEventListener('click', () => {
    soloMode = (el as HTMLElement).dataset.mode as SoloMode;
    document.querySelectorAll('.mode-chip').forEach((m) => m.classList.toggle('sel', m === el));
  });
});
updateAmmoUI();
animate();
