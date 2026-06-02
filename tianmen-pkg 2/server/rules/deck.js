// 天门顺过 - 牌组管理
// 1 副标准牌(52) + 大王 + 小王 + 2 张赖子 = 56 张
const { GameConfig } = require("./config");

const SUITS = ["spade", "heart", "club", "diamond"];
const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

// 生成一副完整牌, 每张带唯一 id, 便于前后端对应
function createDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `c${id++}`, rank, suit });
    }
  }
  deck.push({ id: `c${id++}`, wild: "BIG_JOKER" });
  deck.push({ id: `c${id++}`, wild: "SMALL_JOKER" });
  deck.push({ id: `c${id++}`, wild: "WILD_1" });
  deck.push({ id: `c${id++}`, wild: "WILD_2" });
  return deck; // 共 56 张
}

// Fisher-Yates 洗牌
function shuffle(deck) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 发牌: 3~6 人, 平均分; 除不尽的牌留作牌堆(摸牌用)
function deal(playerCount) {
  const deck = shuffle(createDeck());
  const perPlayer = Math.floor(deck.length / playerCount);
  const hands = [];
  let idx = 0;
  for (let p = 0; p < playerCount; p++) {
    hands.push(deck.slice(idx, idx + perPlayer));
    idx += perPlayer;
  }
  const drawPile = deck.slice(idx); // 剩余牌堆
  return { hands, drawPile };
}

// 手牌排序(展示用): 普通牌按点数, 万能牌排最后
function sortHand(cards, cfg = GameConfig) {
  const order = cfg.rankOrder;
  return cards.slice().sort((a, b) => {
    const aw = !!a.wild, bw = !!b.wild;
    if (aw && bw) return 0;
    if (aw) return 1;
    if (bw) return -1;
    return order.indexOf(a.rank) - order.indexOf(b.rank);
  });
}

module.exports = { createDeck, shuffle, deal, sortHand, SUITS, RANKS };
