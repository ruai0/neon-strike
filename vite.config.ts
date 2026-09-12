import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import os from 'node:os';

// `npm run dev` 时顺带拉起局域网联机 WebSocket 服务（端口 3001）
function wsServerPlugin() {
  let started = false;
  return {
    name: 'neon-strike-ws-server',
    configureServer(server) {
      // 局域网地址接口：主菜单/房间显示分享链接（浏览器拿不到本机 IP，由 Vite 进程读取网卡）
      server.middlewares.use('/lan-info', (_req, res) => {
        const ips: string[] = [];
        for (const list of Object.values(os.networkInterfaces())) {
          for (const f of list ?? []) if (f.family === 'IPv4' && !f.internal) ips.push(f.address);
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ips, port: server.config.server.port ?? 5173 }));
      });
      if (started || process.env.NEON_STRIKE_NO_WS) return;
      started = true;
      const child = spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) console.log(`[ws-server] 退出码 ${code}`);
        started = false;
      });
    },
  };
}

export default defineConfig({
  server: {
    host: true,
    // 关键：把同源路径 /ws 代理到联机服务。
    // 浏览器环境（包括内嵌浏览器）往往只放行同源连接，直连 3001 会被拦。
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
  plugins: [wsServerPlugin()],
});
