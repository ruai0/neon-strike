// 极简 WebSocket 客户端封装
type Handler = (data: any) => void;

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();
  myId = '';
  connected = false;

  on(type: string, fn: Handler) {
    const list = this.handlers.get(type) ?? [];
    list.push(fn);
    this.handlers.set(type, list);
  }

  send(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private dispatch(msg: any) {
    const list = this.handlers.get(msg.t);
    if (list) for (const fn of list) fn(msg);
  }

  connect(url: string, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('连接联机服务超时'));
      }, timeoutMs);

      ws.onopen = () => { /* 等待 welcome */ };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('无法连接联机服务（服务未启动？）'));
      };
      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(ev.data as string); } catch { return; }
        if (msg.t === 'welcome') {
          clearTimeout(timer);
          this.ws = ws;
          this.myId = msg.id;
          this.connected = true;
          resolve();
          return;
        }
        this.dispatch(msg);
      };
      ws.onclose = () => {
        const was = this.connected;
        this.connected = false;
        this.ws = null;
        if (was) this.dispatch({ t: 'drop' });
      };
    });
  }

  close() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}

// 同源 /ws 由 Vite 代理到联机服务，规避内嵌浏览器/防火墙对跨端口直连的限制
export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
