// 端到端联机模拟: 启动服务器 -> 4 客户端 -> 创建/加入 -> 开局 -> 出牌 -> 断线重连
const { io } = require("socket.io-client");
const { spawn } = require("child_process");

const PORT = 3999;
const URL = `http://localhost:${PORT}`;

// 启动服务器子进程
const srv = spawn("node", ["server/index.js"], {
  cwd: __dirname + "/..",
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", (d) => process.stdout.write("[srv] " + d));
srv.stderr.on("data", (d) => process.stderr.write("[srv-err] " + d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function emit(sock, ev, data) {
  return new Promise((res) => sock.emit(ev, data, res));
}
function mkClient(pid) {
  const s = io(URL, { transports: ["websocket"] });
  s._pid = pid;
  s._state = null;
  s.on("state", (st) => { s._state = st; });
  return s;
}

let failed = false;
function assert(cond, msg) {
  if (cond) console.log("  ✓ " + msg);
  else { console.log("  ✗ " + msg); failed = true; }
}

(async () => {
  await sleep(800); // 等服务器起来

  console.log("\n== 联机流程测试 ==");

  // 4 个玩家
  const A = mkClient("PA"), B = mkClient("PB"), C = mkClient("PC"), D = mkClient("PD");
  await sleep(300);

  // A 创建 4 人房
  const cr = await emit(A, "createRoom", { name: "阿坨", maxPlayers: 4, playerId: "PA" });
  assert(cr.ok && cr.roomId, "A 创建房间成功, 房号=" + cr.roomId);
  const roomId = cr.roomId;

  // B C D 加入
  const jb = await emit(B, "joinRoom", { roomId, name: "二妹", playerId: "PB" });
  const jc = await emit(C, "joinRoom", { roomId, name: "三爷", playerId: "PC" });
  const jd = await emit(D, "joinRoom", { roomId, name: "四毛", playerId: "PD" });
  assert(jb.ok && jc.ok && jd.ok, "B/C/D 加入成功");
  await sleep(200);

  assert(A._state.players.length === 4, "房间内 4 人");
  assert(A._state.isHost === true, "A 是房主");
  assert(B._state.isHost === false, "B 不是房主");

  // 非房主开局应失败
  const badStart = await emit(B, "startGame", {});
  assert(!badStart.ok, "非房主开局被拒: " + badStart.error);

  // 房主开局
  const st = await emit(A, "startGame", {});
  assert(st.ok, "房主开局成功");
  await sleep(200);

  assert(A._state.phase === "playing", "进入游戏阶段");
  const totalCards = [A, B, C, D].reduce((sum, c) => sum + c._state.myHand.length, 0);
  assert(totalCards === 56 - A._state.drawPileCount, "手牌总数 + 牌堆 = 56");
  console.log("    每人手牌:", [A, B, C, D].map((c) => c._state.myHand.length).join("/"), "牌堆:", A._state.drawPileCount);

  // 找到当前出牌的客户端
  const clients = { 0: A, 1: B, 2: C, 3: D };
  function currentClient() {
    const seat = A._state.turnSeat;
    return Object.values(clients).find((c) => c._state.mySeat === seat);
  }

  // 当前玩家出一张最小的单牌(自由出牌)
  let cur = currentClient();
  assert(cur._state.turnSeat === cur._state.mySeat, "轮到 " + cur._pid);
  // 找一张普通牌出(避免万能牌单出非法)
  const normalCard = cur._state.myHand.find((c) => !c.wild);
  const beforeCount = cur._state.myHand.length;
  const play1 = await emit(cur, "play", { cardIds: [normalCard.id] });
  assert(play1.ok, cur._pid + " 自由出单张成功: " + (play1.pattern && play1.pattern.type));
  await sleep(150);
  assert(cur._state.myHand.length === beforeCount - 1, "出牌后手牌 -1");
  assert(A._state.lastPlay !== null, "中央出现 lastPlay");

  // 下家若接不上 -> pass(摸牌)
  let next = currentClient();
  const lastRank = A._state.lastPlay.cards[0].rank;
  // 尝试找能 +1 接的牌; 找不到就 pass
  const order = ["3","4","5","6","7","8","9","10","J","Q","K","A","2"];
  const needRank = order[order.indexOf(lastRank) + 1];
  const followCard = next._state.myHand.find((c) => !c.wild && c.rank === needRank);
  if (followCard) {
    const pf = await emit(next, "play", { cardIds: [followCard.id] });
    assert(pf.ok, next._pid + " 顺过+1 接牌成功(" + lastRank + "->" + needRank + ")");
  } else {
    const pp = await emit(next, "pass", {});
    assert(pp.ok, next._pid + " 接不上, pass/摸牌成功");
  }
  await sleep(150);

  // 测试非法出牌被拒
  let nn = currentClient();
  const wilds = nn._state.myHand.filter((c) => c.wild);
  if (wilds.length >= 1) {
    const badPlay = await emit(nn, "play", { cardIds: [wilds[0].id] });
    assert(!badPlay.ok, "单出万能牌被拒: " + badPlay.error);
  } else {
    console.log("  - (该玩家无万能牌,跳过单出万能牌测试)");
  }

  // 非当前玩家出牌被拒
  const notTurn = Object.values(clients).find((c) => c._state.mySeat !== A._state.turnSeat);
  const someCard = notTurn._state.myHand.find((c) => !c.wild);
  const notTurnPlay = await emit(notTurn, "play", { cardIds: [someCard.id] });
  assert(!notTurnPlay.ok, "未轮到的玩家出牌被拒: " + notTurnPlay.error);

  // ---- 断线重连测试 ----
  console.log("\n== 断线重连测试 ==");
  const dSeatBefore = D._state.mySeat;
  const dHandBefore = D._state.myHand.length;
  D.disconnect();
  await sleep(300);
  // A 看到 D 掉线
  const dInList = A._state.players.find((p) => p.id === "PD");
  assert(dInList && dInList.online === false, "D 掉线后其他人看到 offline 标记");

  // D 用同 playerId 重连
  const D2 = mkClient("PD");
  await sleep(200);
  const reconn = await emit(D2, "joinRoom", { roomId, name: "四毛", playerId: "PD" });
  assert(reconn.ok && reconn.reconnected === true, "D 重连成功(reconnected=true)");
  await sleep(200);
  assert(D2._state.mySeat === dSeatBefore, "重连后座位不变");
  assert(D2._state.myHand.length === dHandBefore, "重连后手牌恢复(" + D2._state.myHand.length + "张)");
  assert(D2._state.phase === "playing", "重连后游戏状态保持");

  console.log("\n" + (failed ? "✗ 有用例失败" : "✓ 联机全流程通过"));

  [A, B, C, D2].forEach((c) => c.disconnect());
  srv.kill();
  await sleep(200);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("测试异常:", e);
  srv.kill();
  process.exit(1);
});
