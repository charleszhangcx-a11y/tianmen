// 天门顺过 - 规则配置
// 所有可调规则集中在这里,方便后续补充天门本地细节,不写死在逻辑里。

const GameConfig = {
  // 点数从小到大。索引即大小,2 最大。
  rankOrder: ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"],

  // 花色从大到小(仅首局比第 5 张牌用)
  suitOrderHighToLow: ["spade", "heart", "club", "diamond"],

  // 牌型开关
  allowSingle: true,
  allowPair: true,
  allowTriple: true,
  allowStraight: true,
  allowDoubleStraight: true,
  allowTripleStraight: true,
  allowBomb: true,

  // 各牌型最小长度
  minStraightLength: 3,        // 顺子最少 3 张
  minDoubleStraightPairs: 2,   // 连对最少 2 对
  minTripleStraightGroups: 2,  // 连三张最少 2 组

  // 万能牌
  allowWildCards: true,
  wildCards: ["BIG_JOKER", "SMALL_JOKER", "WILD_1", "WILD_2"],
  wildCardsMustAttachToNaturalCard: true,
  forbidWildOnlyMove: true,

  // 炸弹
  minBombSize: 4,
  maxBombSize: 8,
  bombCompareMode: "sizeFirstThenRank", // 先比张数,再比点数
  bombCanBeatAnyNormalPattern: true,

  // 待确认规则 —— 默认关闭,确认后改 true 即可,无需改逻辑
  allowTwoInStraight: false,        // 2 能否参与顺子 (QKA2)
  allowTwoInDoubleStraight: false,  // 2 能否参与连对 (AA22)
  allowTwoInTripleStraight: false,  // 2 能否参与连三张 (AAA222)
};

module.exports = { GameConfig };
