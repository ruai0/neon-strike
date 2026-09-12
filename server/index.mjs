// NEON STRIKE 联机服务 v2 —— 多房间（合作 / PvP 大乱斗）
// 合作：服务器权威波次+敌机；PvP：服务器权威玩家血量与击杀
import { WebSocketServer } from 'ws';
import http from 'node:http';
import os from 'node:os';

const PORT = 3001;
const ARENA = 36;
const TICK_MS = 33;
const BROADCAST_EVERY = 2;

const KINDS = {
  swarm:  { hp: 12,  r: 0.42, speed: 6.2, score: 30 },
  drone:  { hp: 30,  r: 0.62, speed: 3.8, score: 50 },
  sentry: { hp: 60,  r: 0.78, speed: 2.6, score: 120 },
  tank:   { hp: 170, r: 1.05, speed: 2.1, score: 200 },
  elite:  { hp: 260, r: 1.2,  speed: 3.4, score: 500 },
  boss:   { hp: 750, r: 2.1,  speed: 1.6, score: 1500 },
};
const PVP_KILL_TARGET = 10;
const PVP_RESPAWN = 3;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('NEON STRIKE WS SERVER OK');
});
const wss = new WebSocketServer({ server });

// 心跳：清理断开的死连接（浏览器崩溃/断网不发送 close 的情况）
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/** @type {Map<string, Room>} */
const rooms = new Map();
let nextId = 1;

function log(...args) { console.log('[ws]', ...args); }
function lanIPs() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const f of ifaces ?? []) if (f.family === 'IPv4' && !f.internal) out.push(f.address);
  }
  return out;
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom(mode) {
  const code = makeCode();
  const room = {
    code, mode,
    map: Math.floor(Math.random() * 3),
    state: 'waiting', // waiting | playing
    host: null,
    players: new Map(),
    enemies: new Map(),
    pickups: new Map(),
    wave: 1,
    queue: [],
    spawnT: 0,
    waveClearT: -1,
    nextId: 1,
    over: false,
    overT: 0,
    tick: 0,
    // PvP
    pvpActive: false,
    pvpCountdown: 0,
    pvpTime: 0,
  };
  rooms.set(code, room);
  return room;
}

function roomInfo(room) {
  return {
    code: room.code,
    mode: room.mode,
    map: room.map,
    state: room.state,
    host: room.host,
    players: [...room.players.values()].map((p) => ({ id: p.id_, name: p.name })),
  };
}

function broadcastRoomUpdate(room) {
  roomBroadcast(room, { t: 'room_update', ...roomInfo(room) });
}

function roomBroadcast(room, obj, exceptId = null) {
  const data = JSON.stringify(obj);
  for (const [id, p] of room.players) {
    if (id === exceptId) continue;
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}

function alivePlayers(room) {
  let n = 0;
  for (const p of room.players.values()) if (!p.dead) n++;
  return n;
}

// ---------- 合作：波次 ----------
function waveRoster(room, n) {
  if (n % 4 === 0 && n % 5 !== 0) {
    const list = [];
    const elites = 2 + Math.floor(n / 5);
    const swarm = Math.floor(n / 3);
    for (let i = 0; i < elites; i++) list.push('elite');
    for (let i = 0; i < swarm; i++) list.push('swarm');
    const scale = 1 + 0.35 * Math.max(0, room.players.size - 1);
    return list.slice(0, Math.max(1, Math.round(list.length * scale)));
  }
  const list = [];
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
  const scale = 1 + 0.35 * Math.max(0, room.players.size - 1);
  return list.slice(0, Math.max(1, Math.round(list.length * scale)));
}

function startWave(room, n) {
  room.wave = n;
  room.queue = waveRoster(room, n);
  room.spawnT = 0.5;
  room.waveClearT = -1;
  roomBroadcast(room, { t: 'wave', n, total: room.queue.length });
}

function spawnEnemy(room, kind, px, pz) {
  const ang = Math.random() * Math.PI * 2;
  const r = 24 + Math.random() * 9;
  const cfg = KINDS[kind];
  const e = {
    id: room.nextId++, kind,
    x: px ?? Math.cos(ang) * r,
    y: kind === 'boss' ? 2.4 : 1.6,
    z: pz ?? Math.sin(ang) * r,
    hp: cfg.hp * (1 + 0.04 * Math.max(0, room.players.size - 1)),
    maxHp: 0,
    hitCd: 0, fireT: 1.5 + Math.random(),
    strafe: Math.random() < 0.5 ? 1 : -1,
    bob: Math.random() * Math.PI * 2,
    chargeCd: 3, chargeWind: 0, charging: 0, chargeDir: null,
    phase2: false,
  };
  e.maxHp = e.hp;
  room.enemies.set(e.id, e);
}

function makePickup(room, kind, x, z) {
  const pk = { id: room.nextId++, kind, x, z };
  room.pickups.set(pk.id, pk);
  roomBroadcast(room, { t: 'pickup', id: pk.id, kind, x, z });
}

function sendState(room) {
  const state = {
    t: 'state',
    wave: room.wave,
    mode: room.mode,
    players: [...room.players.values()].map((p) => ({
      id: p.id_, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw,
      hp: Math.max(0, Math.round(p.hp)), dead: p.dead, score: p.score, kills: p.kills,
      respawn: p.dead && room.mode === 'pvp' ? Math.max(0, Math.ceil(p.respawnT)) : undefined,
      prot: !p.dead && p.protectT > 0 ? true : undefined,
    })),
    enemies: [...room.enemies.values()].map((e) => ({
      id: e.id, k: e.kind, x: e.x, y: e.y, z: e.z, h: Math.max(0, e.hp) / KINDS[e.kind].hp,
    })),
  };
  roomBroadcast(room, state);
}

function resetCoop(room) {
  for (const id of [...room.enemies.keys()]) room.enemies.delete(id);
  for (const id of [...room.pickups.keys()]) room.pickups.delete(id);
  for (const p of room.players.values()) { p.dead = false; p.hp = 100; p.score = 0; p.kills = 0; }
  room.over = false;
  startWave(room, 1);
}

// ---------- PvP ----------
function startPvpRound(room) {
  room.pvpActive = true;
  room.pvpTime = 180;
  for (const p of room.players.values()) {
    p.dead = false;
    p.hp = 100;
    p.kills = 0;
    p.score = 0;
    p.protectT = 2;
    const ang = Math.random() * Math.PI * 2;
    p.x = Math.cos(ang) * 22;
    p.z = Math.sin(ang) * 22;
  }
  for (const id of [...room.enemies.keys()]) room.enemies.delete(id);
  roomBroadcast(room, { t: 'pvp_start', target: PVP_KILL_TARGET, time: room.pvpTime });
  log(`房间 ${room.code} PvP 开始 (${room.players.size}人)`);
}

function endPvpRound(room) {
  room.pvpActive = false;
  const board = [...room.players.values()]
    .map((p) => ({ name: p.name, score: p.kills * 100, kills: p.kills }))
    .sort((a, b) => b.score - a.score);
  roomBroadcast(room, { t: 'pvp_over', board, kills: board });
}

function pvpKill(room, killer, victim) {
  killer.kills += 1;
  killer.score = killer.kills * 100;
  roomBroadcast(room, { t: 'toast', msg: `${killer.name} 击倒了 ${victim.name}（${killer.kills}/${PVP_KILL_TARGET}）` });
  if (killer.kills >= PVP_KILL_TARGET) endPvpRound(room);
}

// ---------- 连接 ----------
wss.on('connection', (ws, req) => {
  const id = `p${nextId++}`;
  /** @type {any} */
  const player = {
    ws, id_: id, name: '玩家', room: null,
    x: 0, y: 1.7, z: 8, yaw: 0,
    hp: 100, dead: false, score: 0, kills: 0,
    respawnT: 0,
  };
  ws.send(JSON.stringify({ t: 'welcome', id, wave: 1 }));
  log(`连接 ${id} 来自 ${req.socket.remoteAddress}`);

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    try {
      handleMessage(m);
    } catch (err) {
      log(`处理消息出错(${m.t}): ${err.message}`);
    }
  });

  function handleMessage(m) {

    // 房间管理消息（无房间时）
    switch (m.t) {
      case 'join':
        player.name = String(m.name ?? '玩家').slice(0, 12) || '玩家';
        return;
      case 'create': {
        const mode = m.mode === 'pvp' ? 'pvp' : 'coop';
        const room = createRoom(mode);
        room.players.set(id, player);
        player.room = room;
        room.host = id;
        ws.send(JSON.stringify({ t: 'room_created', ...roomInfo(room) }));
        log(`房间 ${room.code} (${mode}) 由 ${player.name} 创建`);
        return;
      }
      case 'set_map': {
        const room = player.room;
        if (!room || room.host !== id || room.state === 'playing') return;
        room.map = Math.max(0, Math.min(2, Number(m.map) || 0));
        broadcastRoomUpdate(room);
        return;
      }
      case 'start_game': {
        const room = player.room;
        if (!room || room.host !== id) return;
        if (room.state === 'playing') return;
        room.state = 'playing';
        roomBroadcast(room, { t: 'game_start', map: room.map, mode: room.mode });
        if (room.mode === 'coop') resetCoop(room);
        else startPvpRound(room);
        log(`房间 ${room.code} 开局`);
        return;
      }
      case 'joinRoom': {
        const code = String(m.code ?? '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) { ws.send(JSON.stringify({ t: 'room_error', msg: '房间不存在' })); return; }
        // 若已在别的房间先退出
        if (player.room) leaveRoom(player);
        room.players.set(id, player);
        player.room = room;
        ws.send(JSON.stringify({ t: 'room_joined', ...roomInfo(room) }));
        roomBroadcast(room, { t: 'toast', msg: `${player.name} 加入房间` }, id);
        broadcastRoomUpdate(room);
        if (room.state === 'playing') {
          // 中途加入正在进行的对局：联机合作直接同步；PvP 等下一轮
          if (room.mode === 'pvp') ws.send(JSON.stringify({ t: 'toast', msg: '对局进行中，你将在下一轮加入' }));
        }
        return;
      }
      case 'leaveRoom': {
        leaveRoom(player);
        return;
      }
    }

    // 以下消息需要房间
    const room = player.room;
    if (!room) return;

    switch (m.t) {
      case 'state': {
        player.x = m.p[0]; player.y = m.p[1]; player.z = m.p[2];
        player.yaw = m.yaw;
        // PvP：血量与生死由服务器权威，忽略客户端上报
        if (room.mode === 'coop') {
          player.hp = m.hp;
          player.dead = !!m.dead;
        }
        break;
      }
      case 'hit': {
        if (room.mode !== 'coop') return;
        const e = room.enemies.get(m.id);
        if (!e || room.over) return;
        e.hp -= m.dmg;
        roomBroadcast(room, { t: 'ehit', id: e.id, h: Math.max(0, e.hp) / KINDS[e.kind].hp });
        if (e.hp <= 0) {
          room.enemies.delete(e.id);
          player.score += Math.round(KINDS[e.kind].score * Math.min(m.combo ?? 1, 3));
          player.kills += 1;
          roomBroadcast(room, { t: 'kill', id: e.id, k: e.kind, x: e.x, y: e.y, z: e.z, by: player.name, byId: id });
          const roll = Math.random();
          if (e.kind === 'boss') { makePickup(room, 'health', e.x, e.z); makePickup(room, 'over', e.x + 2, e.z); }
          else if (roll < 0.12) makePickup(room, 'health', e.x, e.z);
          else if (roll < 0.2) makePickup(room, 'over', e.x, e.z);
        }
        break;
      }
      case 'phit': {
        if (room.mode !== 'pvp' || !room.pvpActive || player.dead) return;
        const target = room.players.get(m.target);
        if (!target || target.dead || target.id_ === id) return;
        if (target.protectT > 0) return; // 出生保护
        const dmg = Math.max(0, Math.min(Number(m.dmg) || 0, 100));
        target.hp -= dmg;
        roomBroadcast(room, { t: 'phitfx', target: m.target, h: Math.max(0, target.hp) / 100 });
        if (target.hp <= 0) {
          target.hp = 0;
          target.dead = true;
          target.respawnT = PVP_RESPAWN;
          roomBroadcast(room, { t: 'pdown', id: target.id_, by: player.name, byId: id });
          pvpKill(room, player, target);
        }
        break;
      }
      case 'pickup': {
        if (room.mode !== 'coop') return;
        if (room.pickups.delete(m.id)) roomBroadcast(room, { t: 'pickupGone', id: m.id });
        break;
      }
      case 'restart': {
        if (room.mode === 'coop' && room.over) resetCoop(room);
        if (room.mode === 'pvp' && !room.pvpActive) {
          if (room.players.size >= 2) startPvpRound(room);
          else roomBroadcast(room, { t: 'toast', msg: '等待其他玩家加入…' });
        }
        break;
      }
      case 'again': {
        if (room.mode === 'pvp' && !room.pvpActive && room.players.size >= 2) startPvpRound(room);
        break;
      }
    }
  }

  function leaveRoom(p) {
    const room = p.room;
    if (!room) return;
    room.players.delete(p.id_);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      log(`房间 ${room.code} 已解散（空）`);
    } else {
      if (room.host === p.id_) {
        room.host = [...room.players.keys()][0];
        roomBroadcast(room, { t: 'toast', msg: `${room.players.get(room.host).name} 成为新房主` });
      }
      roomBroadcast(room, { t: 'toast', msg: `${p.name} 离开了` });
      broadcastRoomUpdate(room);
      if (room.mode === 'pvp' && room.pvpActive && room.players.size < 2) {
        room.pvpActive = false;
        roomBroadcast(room, { t: 'toast', msg: '人数不足，对战暂停' });
      }
    }
    p.room = null;
  }

  ws.on('close', () => {
    const room = player.room;
    if (room) {
      const wasEmpty = room.players.size <= 1;
      leaveRoom(player);
      if (wasEmpty && room.mode === 'pvp') { /* handled */ }
    }
    log(`断开 ${id}`);
  });
});

// ---------- 主循环 ----------
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;
    room.tick++;
    const dt = TICK_MS / 1000;

    if (room.mode === 'pvp') {
      // 重生 + 出生保护计时
      for (const p of room.players.values()) {
        if (p.protectT > 0) p.protectT = Math.max(0, p.protectT - dt);
        if (p.dead) {
          p.respawnT -= dt;
          if (p.respawnT <= 0) {
            p.dead = false;
            p.hp = 100;
            p.protectT = 2;
            const ang = Math.random() * Math.PI * 2;
            p.x = Math.cos(ang) * 20;
            p.z = Math.sin(ang) * 20;
          }
        }
      }
      if (room.pvpActive) {
        room.pvpTime -= dt;
        if (room.pvpTime <= 0) endPvpRound(room);
      }
    } else {
      // 合作模式模拟
      if (!room.over) {
        if (room.queue.length > 0) {
          room.spawnT -= dt;
          if (room.spawnT <= 0 && room.enemies.size < 14) {
            room.spawnT = Math.max(1.0 - room.wave * 0.04, 0.3);
            spawnEnemy(room, room.queue.shift());
          }
        } else if (room.enemies.size === 0) {
          if (room.waveClearT < 0) room.waveClearT = 2.5;
          room.waveClearT -= dt;
          if (room.waveClearT <= 0) startWave(room, room.wave + 1);
        }

        for (const e of room.enemies.values()) {
          const cfg = KINDS[e.kind];
          e.bob += dt * 2;
          let best = null, bd = Infinity;
          for (const p of room.players.values()) {
            if (p.dead) continue;
            const d = (p.x - e.x) ** 2 + (p.z - e.z) ** 2;
            if (d < bd) { bd = d; best = p; }
          }
          if (!best) continue;
          const p = best;
          const d = Math.sqrt(bd);
          let dx = (p.x - e.x) / (d || 1), dz = (p.z - e.z) / (d || 1);

          if (e.kind === 'sentry' || e.kind === 'boss' || e.kind === 'elite') {
            const keep = e.kind === 'boss' ? 12 : (e.kind === 'elite' ? 11 : 14);
            const enraged = e.kind === 'boss' && e.hp < e.maxHp / 2;
            if (e.kind === 'boss' && !e.phase2 && e.hp < e.maxHp * 0.25) {
              e.phase2 = true;
              for (let i = 0; i < 3; i++) spawnEnemy(room, 'swarm');
              const ring = [];
              for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                ring.push({ x: e.x, y: e.y, z: e.z, dx: Math.cos(a), dy: 0, dz: Math.sin(a) });
              }
              roomBroadcast(room, { t: 'eburst', list: ring });
              roomBroadcast(room, { t: 'toast', msg: '⚠ 主宰进入最终阶段！' });
            }
            const spd = cfg.speed * (enraged ? 1.7 : 1);
            let mx = 0, mz = 0;
            if (d > keep + 2) { mx += dx; mz += dz; }
            else if (d < keep - 4) { mx -= dx; mz -= dz; }
            const s = (e.kind === 'boss' ? 0.2 : (e.kind === 'elite' ? 1.0 : 0.7)) * (enraged ? 1.5 : 1);
            mx += -dz * e.strafe * s;
            mz += dx * e.strafe * s;
            const ml = Math.hypot(mx, mz) || 1;
            e.x += (mx / ml) * spd * dt;
            e.z += (mz / ml) * spd * dt;
            e.y = (e.kind === 'boss' ? 2.4 : 2) + Math.sin(e.bob) * 0.3;

            e.fireT -= dt;
            if (e.fireT <= 0 && d < 32) {
              if (e.kind === 'boss') {
                e.fireT = enraged ? 1.5 : 2.6;
                const burst = [];
                for (let i = 0; i < 10; i++) {
                  const a = (i / 10) * Math.PI * 2 + e.bob;
                  burst.push({ x: e.x, y: e.y, z: e.z, dx: Math.cos(a), dy: 0, dz: Math.sin(a) });
                }
                roomBroadcast(room, { t: 'eburst', list: burst });
                roomBroadcast(room, { t: 'efire', x: e.x, y: e.y, z: e.z, tx: p.x, ty: p.y, tz: p.z });
              } else {
                e.fireT = e.kind === 'elite'
                  ? Math.max(1.6 - room.wave * 0.04, 0.9)
                  : Math.max(2.2 - room.wave * 0.06, 1.1);
                roomBroadcast(room, { t: 'efire', x: e.x, y: e.y, z: e.z, tx: p.x, ty: p.y, tz: p.z });
              }
            }
          } else if (e.kind === 'tank') {
            e.chargeCd = (e.chargeCd ?? 3) - dt;
            if (e.chargeWind > 0) {
              e.chargeWind -= dt;
              if (e.chargeWind <= 0) { e.charging = 0.55; e.chargeDir = { x: dx, z: dz }; }
            } else if (e.charging > 0) {
              e.charging -= dt;
              e.x += e.chargeDir.x * 19 * dt;
              e.z += e.chargeDir.z * 19 * dt;
            } else if (e.chargeCd <= 0 && d > 5 && d < 17) {
              e.chargeWind = 0.8;
            } else {
              e.x += dx * cfg.speed * dt;
              e.z += dz * cfg.speed * dt;
            }
            e.y = 1.3 + Math.sin(e.bob) * 0.2;
          } else {
            e.x += dx * cfg.speed * dt;
            e.z += dz * cfg.speed * dt;
            e.y = 1.45 + Math.sin(e.bob) * 0.35;
          }

          e.x = Math.max(-ARENA + 1, Math.min(ARENA - 1, e.x));
          e.z = Math.max(-ARENA + 1, Math.min(ARENA - 1, e.z));
        }

        if (alivePlayers(room) === 0) {
          if (room.overT === 0) room.overT = 2.5;
          room.overT -= dt;
          if (room.overT <= 0) {
            room.over = true;
            room.overT = 0;
            roomBroadcast(room, {
              t: 'over',
              scores: [...room.players.values()].map((p) => ({ name: p.name, score: p.score, kills: p.kills }))
                .sort((a, b) => b.score - a.score),
              wave: room.wave,
            });
          }
        } else {
          room.overT = 0;
        }
      }
    }

    if (room.tick % BROADCAST_EVERY === 0) sendState(room);
  }
}, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  NEON STRIKE 联机服务 v2（多房间：合作/PvP）');
  console.log('  ws://0.0.0.0:' + PORT);
  for (const ip of lanIPs()) console.log(`  局域网: http://${ip}:5173`);
  console.log('==============================================');
});
