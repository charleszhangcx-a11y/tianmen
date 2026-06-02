// 天门顺过 - 后端服务器
// Express 托管前端静态页 + Socket.IO 处理实时联机
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { Room } = require("./rules/room");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 托管前端
app.use(express.static(path.join(__dirname, "..", "public")));
// 健康检查(给 Railway/Render 用)
app.get("/health", (_, res) => res.json({ ok: true, rooms: rooms.size }));

// ---------- 房间存储(内存) ----------
const rooms = new Map();        // roomId -> Room
const socketInfo = new Map();   // socket.id -> { roomId, playerId }

function genRoomId() {
  let id;
  do { id = Math.floor(1000 + Math.random() * 9000).toString(); }
  while (rooms.has(id));
  return id;
}

// 向房间所有人推送各自的状态视图
function broadcast(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const p of room.players) {
    const sid = findSocketByPlayer(roomId, p.id);
    if (sid) io.to(sid).emit("state", room.viewFor(p.id));
  }
}
function findSocketByPlayer(roomId, playerId) {
  for (const [sid, info] of socketInfo) {
    if (info.roomId === roomId && info.playerId === playerId) return sid;
  }
  return null;
}

io.on("connection", (socket) => {
  // 创建房间
  socket.on("createRoom", ({ name, maxPlayers, playerId }, cb) => {
    const max = Math.min(6, Math.max(3, Number(maxPlayers) || 4));
    const roomId = genRoomId();
    const room = new Room(roomId, max);
    rooms.set(roomId, room);
    const r = room.addPlayer(playerId, name);
    socket.join(roomId);
    socketInfo.set(socket.id, { roomId, playerId });
    cb && cb({ ok: true, roomId, seat: r.seat });
    broadcast(roomId);
  });

  // 加入房间(也用于断线重连)
  socket.on("joinRoom", ({ roomId, name, playerId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb && cb({ ok: false, error: "房间不存在或已关闭" });
    const r = room.addPlayer(playerId, name);
    if (!r.ok) return cb && cb(r);
    socket.join(roomId);
    socketInfo.set(socket.id, { roomId, playerId });
    cb && cb({ ok: true, roomId, seat: r.seat, reconnected: r.reconnected });
    broadcast(roomId);
  });

  // 开始游戏
  socket.on("startGame", (_, cb) => {
    const info = socketInfo.get(socket.id);
    if (!info) return cb && cb({ ok: false, error: "未加入房间" });
    const room = rooms.get(info.roomId);
    const r = room.start(info.playerId);
    cb && cb(r);
    if (r.ok) broadcast(info.roomId);
  });

  // 出牌
  socket.on("play", ({ cardIds }, cb) => {
    const info = socketInfo.get(socket.id);
    if (!info) return cb && cb({ ok: false, error: "未加入房间" });
    const room = rooms.get(info.roomId);
    const r = room.play(info.playerId, cardIds || []);
    cb && cb(r);
    if (r.ok) {
      // 广播一个"出牌动作"事件,供前端触发语音/动画
      io.to(info.roomId).emit("action", {
        type: r.pattern.type, seat: room.getPlayer(info.playerId).seat,
        finished: r.finished, gameOver: r.gameOver,
      });
      broadcast(info.roomId);
    }
  });

  // 要不起/过(摸牌)
  socket.on("pass", (_, cb) => {
    const info = socketInfo.get(socket.id);
    if (!info) return cb && cb({ ok: false, error: "未加入房间" });
    const room = rooms.get(info.roomId);
    const r = room.pass(info.playerId);
    cb && cb(r);
    if (r.ok) {
      io.to(info.roomId).emit("action", {
        type: "pass", seat: room.getPlayer(info.playerId).seat,
      });
      broadcast(info.roomId);
    }
  });

  // 断线
  socket.on("disconnect", () => {
    const info = socketInfo.get(socket.id);
    if (info) {
      const room = rooms.get(info.roomId);
      if (room) {
        room.setOffline(info.playerId);
        broadcast(info.roomId);
      }
      socketInfo.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`天门顺过服务器运行中: http://localhost:${PORT}`);
});
