// 天门顺过 - 核心规则引擎
// 职责: 牌型识别 (detectPattern) + 顺过接牌判断 (canFollow)
// 设计原则: 规则可配置, 万能牌逻辑统一, 便于后续补充天门本地细节。

const { GameConfig } = require("./config");

// ---------- 牌的表示 ----------
// 一张牌: { rank: "3".."2", suit: "spade"|"heart"|"club"|"diamond" } 普通牌
//        { wild: "BIG_JOKER"|"SMALL_JOKER"|"WILD_1"|"WILD_2" }        万能牌
function isWild(card) {
  return !!card.wild;
}
function rankIndex(rank, cfg = GameConfig) {
  return cfg.rankOrder.indexOf(rank);
}

// 把一手牌拆成 普通牌 / 万能牌
function split(cards) {
  const naturals = cards.filter((c) => !isWild(c));
  const wilds = cards.filter((c) => isWild(c));
  return { naturals, wilds };
}

// 统计普通牌每个点数的数量 -> { "3": 2, "4": 1 }
function rankCounts(naturals) {
  const m = {};
  for (const c of naturals) m[c.rank] = (m[c.rank] || 0) + 1;
  return m;
}

// ====================================================================
// 牌型识别
// 返回 null 表示非法; 否则返回 { type, rank, length, size }
//   rank   : 牌型的"基准点数"(用于顺过比较), 顺子类取最小点数
//   length : 顺子=张数, 连对=对子数, 连三张=三张组数, 其它=1
//   size   : 炸弹的张数
// ====================================================================
function detectPattern(cards, cfg = GameConfig) {
  if (!cards || cards.length === 0) return null;

  const { naturals, wilds } = split(cards);

  // 规则: 不能全是万能牌, 必须至少有 1 张普通牌
  if (cfg.forbidWildOnlyMove && naturals.length === 0) return null;

  const n = cards.length;
  const w = wilds.length;

  // 优先级: 炸弹 > 单 > 对 > 三 > 顺 > 连对 > 连三张
  // (炸弹放最前, 因为 4 张同点既是炸弹优先, 不会误判成别的)

  // ---- 炸弹: 4~8 张同点数 ----
  if (cfg.allowBomb && n >= cfg.minBombSize && n <= cfg.maxBombSize) {
    const r = sameRankWithWild(naturals, w);
    if (r !== null) return { type: "bomb", rank: r, length: 1, size: n };
  }

  // ---- 单张 ----
  if (cfg.allowSingle && n === 1) {
    // 已知 naturals.length>=1, 所以这张是普通牌
    return { type: "single", rank: naturals[0].rank, length: 1 };
  }

  // ---- 对子 ----
  if (cfg.allowPair && n === 2) {
    const r = sameRankWithWild(naturals, w);
    if (r !== null) return { type: "pair", rank: r, length: 1 };
  }

  // ---- 三张 ----
  if (cfg.allowTriple && n === 3) {
    const r = sameRankWithWild(naturals, w);
    if (r !== null) return { type: "triple", rank: r, length: 1 };
  }

  // ---- 顺子: 连续单张, >=3 张 ----
  if (cfg.allowStraight && n >= cfg.minStraightLength) {
    const r = checkConsecutive(naturals, w, 1, cfg, cfg.allowTwoInStraight);
    if (r !== null) return { type: "straight", rank: r, length: n };
  }

  // ---- 连对: 连续对子, 偶数张, >=4 ----
  if (cfg.allowDoubleStraight && n >= cfg.minDoubleStraightPairs * 2 && n % 2 === 0) {
    const groups = n / 2;
    const r = checkConsecutive(naturals, w, 2, cfg, cfg.allowTwoInDoubleStraight);
    if (r !== null) return { type: "doubleStraight", rank: r, length: groups };
  }

  // ---- 连三张: 连续三张, 3 的倍数, >=6 ----
  if (cfg.allowTripleStraight && n >= cfg.minTripleStraightGroups * 3 && n % 3 === 0) {
    const groups = n / 3;
    const r = checkConsecutive(naturals, w, 3, cfg, cfg.allowTwoInTripleStraight);
    if (r !== null) return { type: "tripleStraight", rank: r, length: groups };
  }

  return null;
}

// 判断 普通牌 + w 张万能牌 能否凑成"全部同一点数"
// 返回该点数, 否则 null
function sameRankWithWild(naturals, w) {
  if (naturals.length === 0) return null; // 必须有普通牌依附
  const counts = rankCounts(naturals);
  const ranks = Object.keys(counts);
  if (ranks.length > 1) return null; // 普通牌点数不一致, 万能牌无法统一
  // 只有一种点数, 万能牌全部补成该点数即可
  return ranks[0];
}

// 通用: 判断能否组成 连续的 groupSize 组
//   groupSize=1 顺子, =2 连对, =3 连三张
// 思路: 枚举"起始点数"和长度, 看普通牌缺口能否用 w 张万能牌补齐。
// 返回最小点数(基准), 否则 null
function checkConsecutive(naturals, w, groupSize, cfg, allowTwo) {
  const total = naturals.length + w;
  if (total % groupSize !== 0) return null;
  const groups = total / groupSize;
  if (groups < 2 && groupSize > 1) return null;       // 连对/连三张至少 2 组
  if (groupSize === 1 && groups < cfg.minStraightLength) return null;

  const counts = rankCounts(naturals);

  // 可用点数区间: rankOrder 索引。2 是否能参与由 allowTwo 决定。
  const order = cfg.rankOrder;
  const maxIdx = allowTwo ? order.length - 1 : order.indexOf("2") - 1; // 默认到 A

  // 普通牌涉及的点数索引, 任何一张超出可用区间 -> 该牌型不可能(比如 2 不让进顺子)
  for (const rk of Object.keys(counts)) {
    const idx = order.indexOf(rk);
    if (idx > maxIdx) return null;
    if (counts[rk] > groupSize) return null; // 某点数超过一组所需, 不可能是纯连续结构
  }

  // 枚举起始索引, 连续 groups 个点数, 检查每个点数缺口总和 <= w 且正好用完
  for (let start = 0; start + groups - 1 <= maxIdx; start++) {
    let need = 0;
    let ok = true;
    for (let g = 0; g < groups; g++) {
      const rk = order[start + g];
      const have = counts[rk] || 0;
      if (have > groupSize) { ok = false; break; }
      need += groupSize - have;
    }
    if (!ok) continue;
    // 普通牌必须全部落在 [start, start+groups-1] 区间内, 不能有多余点数
    const span = new Set();
    for (let g = 0; g < groups; g++) span.add(order[start + g]);
    const allInSpan = Object.keys(counts).every((rk) => span.has(rk));
    if (!allInSpan) continue;

    if (need === w) {
      return order[start]; // 基准 = 最小点数
    }
  }
  return null;
}

// ====================================================================
// 顺过接牌判断
// prev: 上一手的 pattern (detectPattern 结果)
// cur : 当前要出的 pattern
// 返回 true 表示 cur 可以接 prev
// ====================================================================
function canFollow(prev, cur, cfg = GameConfig) {
  if (!cur) return false;
  if (!prev) return true; // 自由出牌(本轮第一手)

  // 炸弹规则
  if (cur.type === "bomb") {
    if (prev.type !== "bomb") return true; // 炸弹压普通牌型
    return bombGreater(cur, prev, cfg);    // 炸弹压炸弹: 比大小
  }
  if (prev.type === "bomb") return false;  // 普通牌型不能压炸弹

  // 普通牌型: 必须同类型、同长度、点数整体 +1
  if (cur.type !== prev.type) return false;
  if ((cur.length || 1) !== (prev.length || 1)) return false;

  const prevIdx = rankIndex(prev.rank, cfg);
  const curIdx = rankIndex(cur.rank, cfg);
  return curIdx === prevIdx + 1; // 严格 +1
}

// 炸弹比大小: 先比张数, 再比点数
function bombGreater(a, b, cfg = GameConfig) {
  if (a.size !== b.size) return a.size > b.size;
  return rankIndex(a.rank, cfg) > rankIndex(b.rank, cfg);
}

module.exports = {
  detectPattern,
  canFollow,
  bombGreater,
  isWild,
  rankIndex,
  GameConfig,
};
