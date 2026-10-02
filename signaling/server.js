// ============================================================
// 信令服务器 —— 只在建连时用，建连后数据走 P2P 直连，不经过这里。
// 职责：
//   1. 管理房间码 -> 最多 2 个 WebSocket 连接
//   2. 转发 offer / answer / ice 候选给同房间另一个人
//   3. 第二个人进房时通知 host 发起 offer
//
// 运行：  npm install && npm start
// 默认端口 8080，可用 PORT 环境变量覆盖。
// 建议用 Render/Railway/Fly 免费档部署，必须配 HTTPS（WebRTC 需要 wss://）。
// ============================================================
import { WebSocketServer } from 'ws';
import http from 'http';

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const rooms = new Map(); // roomCode -> Set<ws>

// 托管平台的反向代理会断开空闲连接；定时 ping，顺便清掉已经死掉的连接
const HEARTBEAT_MS = 25000;
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { type, room, payload } = msg;

    if (type === 'join') {
      if (typeof room !== 'string' || room.length === 0 || room.length > 16) {
        ws.send(JSON.stringify({ type: 'error', code: 'invalid_room', message: 'invalid room' }));
        return;
      }
      if (ws.room) return;
      // create=true 是房主建房；加入方不能凭空建房，否则输错房间码会一直空等
      if (msg.create) {
        if (rooms.has(room)) {
          ws.send(JSON.stringify({ type: 'error', code: 'room_exists', message: 'room exists' }));
          return;
        }
        rooms.set(room, new Set());
      } else if (!rooms.has(room)) {
        ws.send(JSON.stringify({ type: 'error', code: 'room_not_found', message: 'room not found' }));
        return;
      }
      const set = rooms.get(room);
      if (set.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', code: 'room_full', message: 'room full' }));
        return;
      }
      set.add(ws);
      ws.room = room;
      ws.isHost = set.size === 1;   // 第一个进房的是 host
      ws.send(JSON.stringify({ type: 'joined', peers: set.size, isHost: ws.isHost }));
      // 第二个人进房时，通知 host（先来的那个）发起 offer
      if (set.size === 2) {
        for (const peer of set) {
          if (peer !== ws && peer.readyState === 1 && peer.isHost) {
            peer.send(JSON.stringify({ type: 'start' }));
          }
        }
      }
      return;
    }

    // offer / answer / ice —— 转发给同房间另一个人
    if (type === 'offer' || type === 'answer' || type === 'ice') {
      const set = rooms.get(ws.room);
      if (!set) return;
      for (const peer of set) {
        if (peer !== ws && peer.readyState === 1) {
          peer.send(JSON.stringify({ type, payload }));
        }
      }
      return;
    }

    if (type === 'leave') {
      _remove(ws);
    }
  });

  ws.on('close', () => _remove(ws));
  ws.on('error', () => _remove(ws));
});

function _remove(ws) {
  const set = rooms.get(ws.room);
  if (!set) return;
  set.delete(ws);
  ws.room = null;
  // 通知剩下的人对方离开了
  for (const peer of set) {
    if (peer.readyState === 1) peer.send(JSON.stringify({ type: 'peer_left' }));
  }
  if (set.size === 0) rooms.delete(ws.room);
}

server.listen(PORT, () => {
  console.log(`signaling server on :${PORT}`);
});
