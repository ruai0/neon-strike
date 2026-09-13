import * as THREE from 'three';

export const $ = (id: string) => document.getElementById(id)!;

// ---------- 伤害飘字 ----------
interface Floater {
  el: HTMLDivElement;
  world: THREE.Vector3;
  velY: number;
  life: number;
}
const floaters: Floater[] = [];

export function spawnFloater(world: THREE.Vector3, text: string, cls: string) {
  const el = document.createElement('div');
  el.className = `floater ${cls}`;
  el.textContent = text;
  $('floaters').appendChild(el);
  floaters.push({ el, world: world.clone(), velY: 1.8, life: 0.9 });
}

export function updateFloaters(dt: number, camera: THREE.PerspectiveCamera) {
  const w = innerWidth, h = innerHeight;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    if (f.life <= 0) {
      f.el.remove();
      floaters.splice(i, 1);
      continue;
    }
    f.world.y += f.velY * dt;
    f.velY *= 0.95;
    const v = f.world.clone().project(camera);
    if (v.z > 1) { f.el.style.display = 'none'; continue; }
    f.el.style.display = 'block';
    f.el.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
    f.el.style.opacity = String(Math.min(1, f.life / 0.4));
  }
}

// ---------- 玩家名牌（3D Sprite） ----------
export function makeNameTag(name: string, color = '#00f0ff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 34px "Rajdhani", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

// ---------- 小地图 ----------
export function drawMinimap(
  canvas: HTMLCanvasElement,
  self: { x: number; z: number; yaw: number },
  enemies: { x: number; z: number; kind: string }[],
  pickups: { x: number; z: number; kind: string }[],
  players: { x: number; z: number }[],
  arenaHalf: number,
) {
  const ctx = canvas.getContext('2d')!;
  const size = canvas.width;
  const scale = size / (arenaHalf * 2 + 4);
  const toX = (x: number) => (x + arenaHalf + 2) * scale;
  const toY = (z: number) => (z + arenaHalf + 2) * scale;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(3, 6, 12, 0.85)';
  ctx.fillRect(0, 0, size, size);

  // 边框与网格
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(toX(-arenaHalf), toY(-arenaHalf), arenaHalf * 2 * scale, arenaHalf * 2 * scale);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
  ctx.lineWidth = 0.5;
  for (let g = -arenaHalf + 6; g < arenaHalf; g += 6) {
    ctx.beginPath(); ctx.moveTo(toX(g), toY(-arenaHalf)); ctx.lineTo(toX(g), toY(arenaHalf)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX(-arenaHalf), toY(g)); ctx.lineTo(toX(arenaHalf), toY(g)); ctx.stroke();
  }

  const dot = (x: number, z: number, color: string, r: number) => {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  for (const p of pickups) {
    dot(p.x, p.z, p.kind === 'health' ? '#3aff8f' : p.kind === 'core' ? '#fff7a0' : '#ffd24a', p.kind === 'core' ? 4 : 2.5);
  }
  for (const p of players) dot(p.x, p.z, '#7db8ff', 3);

  const enemyColor: Record<string, string> = {
    swarm: '#6aff8f', drone: '#00f0ff', sentry: '#ff2bd6', tank: '#ffb300', boss: '#ff3838', elite: '#f0f0f0',
    medic: '#7dffce', bomber: '#ff6a00',
  };
  for (const e of enemies) dot(e.x, e.z, enemyColor[e.kind] ?? '#fff', e.kind === 'boss' ? 6 : e.kind === 'tank' ? 4 : 2.5);

  // 自身箭头
  const sx = toX(self.x), sy = toY(self.z);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-self.yaw);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}
