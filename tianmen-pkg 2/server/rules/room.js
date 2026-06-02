// 天门顺过 - 房间状态机
// 管理: 玩家进出 / 发牌 / 轮转出牌 / 摸牌 / pass / 断线重连 / 结算
const { deal, sortHand } = require("./deck");
const { detectPattern, canFollow } = require("./shunguo");

// 房间阶段
const PHASE = { WAITING: "waiting", PLAYING: "playing", FINISHED: "finished" };

class Room {
  constructor(roomId, maxPlayers) {
    this.roomId = roomId;
    this.maxPlayers = maxPlayers;     // 3~6
    this.players = [];                 // { id, name, seat, online, hand:[] }
    this.phase = PHASE.WAITING;
    this.hostId = null;

    this.drawPile = [];                // 摸牌堆
    this.turnSeat = 0;                 // 当前出牌座位
    this.lastPlay = null;              // { seat, cards, pattern } 当前需要被接的牌
    this.passCount = 0;                // 连续要不起人数
    this.winners = [];                 // 出完牌的顺序(座位)
    this.log = [];                     // 简短事件日志
  }

  // ---------- 玩家管理 ----------
  addPlayer(playerId, name) {
    // 重连: 同 id 已存在 -> 标记上线
    const exist = this.players.find((p) => p.id === playerId);
    if (exist) {
      exist.online = true;
      exist.name = name || exist.name;
      return { ok: true, reconnected: true, seat: exist.seat };
    }
    if (this.phase !== PHASE.WAITING) {
      return { ok: false, error: "游戏已开始,无法加入" };
    }
    if (this.players.length >= this.maxPlayers) {
      return { ok: false, error: "房间已满" };
    }
    const seat = this.players.length;
    const player = { id: playerId, name: name || `玩家${seat + 1}`, seat, online: true, hand: [] };
    this.players.push(player);
    if (!this.hostId) this.hostId = playerId; // 第一个进来的是房主
    return { ok: true, reconnected: false, seat };
  }

  setOffline(playerId) {
    const p = this.players.find((x) => x.id === playerId);
    if (p) p.online = false;
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }
  playerBySeat(seat) {
    return this.players.find((p) => p.seat === seat);
  }

  // ---------- 开始游戏 ----------
  start(playerId) {
    if (playerId !== this.hostId) return { ok: false, error: "只有房主能开始" };
    if (this.phase !== PHASE.WAITING) return { ok: false, error: "游戏已开始" };
    if (this.players.length < 3) return { ok: false, error: "至少需要 3 人" };

    const { hands, drawPile } = deal(this.players.length);
    this.players.forEach((p, i) => { p.hand = sortHand(hands[i]); });
    this.drawPile = drawPile;
    this.phase = PHASE.PLAYING;
    this.turnSeat = 0;        // 简单起见: 0 号座位先出 (天门"谁先出"规则可后续替换)
    this.lastPlay = null;
    this.passCount = 0;
    this.winners = [];
    this.log = ["游戏开始,发牌完成"];
    return { ok: true };
  }

  // ---------- 出牌 ----------
  // cardIds: 玩家选择打出的牌 id 列表
  play(playerId, cardIds) {
    if (this.phase !== PHASE.PLAYING) return { ok: false, error: "游戏未进行" };
    const p = this.getPlayer(playerId);
    if (!p) return { ok: false, error: "玩家不存在" };
    if (p.seat !== this.turnSeat) return { ok: false, error: "还没轮到你" };

    // 校验牌在手里
    const cards = [];
    for (const id of cardIds) {
      const c = p.hand.find((x) => x.id === id);
      if (!c) return { ok: false, error: "你没有这张牌" };
      cards.push(c);
    }
    if (cards.length === 0) return { ok: false, error: "请选择要出的牌" };

    // 识别牌型
    const pattern = detectPattern(cards);
    if (!pattern) return { ok: false, error: "不是合法牌型" };

    // 顺过判断
    if (!canFollow(this.lastPlay ? this.lastPlay.pattern : null, pattern)) {
      return { ok: false, error: "不符合顺过规则,接不上" };
    }

    // 合法: 从手牌移除
    p.hand = p.hand.filter((x) => !cardIds.includes(x.id));
    this.lastPlay = { seat: p.seat, cards, pattern };
    this.passCount = 0;
    this.log.push(`${p.name} 出 ${describe(pattern)}`);

    // 出完牌 -> 记入赢家
    let finished = false;
    if (p.hand.length === 0) {
      this.winners.push(p.seat);
      finished = true;
      this.log.push(`${p.name} 出完了!`);
    }

    // 结束判定: 只剩 1 人还有牌
    const stillHaveCards = this.players.filter((x) => x.hand.length > 0);
    if (stillHaveCards.length <= 1) {
      // 最后一名补入排名
      if (stillHaveCards.length === 1) this.winners.push(stillHaveCards[0].seat);
      this.phase = PHASE.FINISHED;
      this.log.push("本局结束");
      return { ok: true, pattern, finished, gameOver: true };
    }

    // 轮转到下一个还有牌的玩家
    this.advanceTurn();
    return { ok: true, pattern, finished, gameOver: false };
  }

  // ---------- 要不起 / 过牌(摸牌) ----------
  // 天门规则: 接不上时进入摸牌/过牌流程。这里实现为: 摸一张, 然后过。
  pass(playerId) {
    if (this.phase !== PHASE.PLAYING) return { ok: false, error: "游戏未进行" };
    const p = this.getPlayer(playerId);
    if (!p) return { ok: false, error: "玩家不存在" };
    if (p.seat !== this.turnSeat) return { ok: false, error: "还没轮到你" };
    if (!this.lastPlay) return { ok: false, error: "本轮你是头家,必须出牌" };

    // 摸牌(若牌堆还有)
    let drew = null;
    if (this.drawPile.length > 0) {
      drew = this.drawPile.shift();
      p.hand = sortHand([...p.hand, drew]);
      this.log.push(`${p.name} 接不上,摸了一张`);
    } else {
      this.log.push(`${p.name} 接不上,过`);
    }

    this.passCount++;
    // 一圈都过 -> 上一手出牌者重新获得自由出牌权
    const activeCount = this.players.filter((x) => x.hand.length > 0).length;
    if (this.passCount >= activeCount - 1) {
      this.turnSeat = this.lastPlay.seat;
      this.lastPlay = null;
      this.passCount = 0;
      this.log.push(`一圈过,由 ${this.playerBySeat(this.turnSeat).name} 重新出牌`);
    } else {
      this.advanceTurn();
    }
    return { ok: true, drew };
  }

  // 轮转到下一个仍有手牌的座位
  advanceTurn() {
    const total = this.players.length;
    let next = this.turnSeat;
    for (let i = 0; i < total; i++) {
      next = (next + 1) % total;
      const np = this.playerBySeat(next);
      if (np && np.hand.length > 0) { this.turnSeat = next; return; }
    }
  }

  // ---------- 状态视图 ----------
  // 发给某个玩家的视图: 只能看到自己的手牌, 别人只看张数
  viewFor(playerId) {
    const me = this.getPlayer(playerId);
    return {
      roomId: this.roomId,
      phase: this.phase,
      maxPlayers: this.maxPlayers,
      hostId: this.hostId,
      isHost: playerId === this.hostId,
      turnSeat: this.turnSeat,
      drawPileCount: this.drawPile.length,
      lastPlay: this.lastPlay
        ? { seat: this.lastPlay.seat, cards: this.lastPlay.cards, type: this.lastPlay.pattern.type }
        : null,
      winners: this.winners,
      log: this.log.slice(-8),
      myHand: me ? me.hand : [],
      mySeat: me ? me.seat : -1,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, seat: p.seat,
        online: p.online, cardCount: p.hand.length,
      })),
    };
  }
}

// 牌型描述(中文)
function describe(pattern) {
  const map = {
    single: "单张", pair: "对子", triple: "三张",
    straight: "顺子", doubleStraight: "连对",
    tripleStraight: "连三张", bomb: "炸弹",
  };
  let s = map[pattern.type] || pattern.type;
  if (pattern.type === "bomb") s = `${pattern.size}张炸弹`;
  return s;
}

module.exports = { Room, PHASE };
