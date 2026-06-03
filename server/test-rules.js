// 天门顺过规则引擎 - 48 个用例测试
const { detectPattern, canFollow } = require("./rules/shunguo");

// 牌构造助手
const N = (rank, suit = "spade") => ({ rank, suit }); // 普通牌
const BJ = { wild: "BIG_JOKER" };   // 大王
const SJ = { wild: "SMALL_JOKER" };  // 小王
const W = { wild: "WILD_1" };        // 赖子
const W2 = { wild: "WILD_2" };       // 赖子2

let pass = 0, fail = 0;
const fails = [];

function check(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else { fail++; fails.push({ desc, actual, expected }); }
}
// 断言牌型类型
function type(cards) {
  const p = detectPattern(cards);
  return p ? p.type : null;
}
// 断言能否接
function follow(prevCards, curCards) {
  return canFollow(detectPattern(prevCards), detectPattern(curCards));
}

// ===== 基础牌型 =====
check("1. 单张3合法", type([N("3")]), "single");
check("2. 单张2合法", type([N("2")]), "single");
check("3. 33合法对子", type([N("3"), N("3")]), "pair");
check("4. 333合法三张", type([N("3"), N("3"), N("3")]), "triple");
check("5. 345合法顺子", type([N("3"), N("4"), N("5")]), "straight");
// 34 两张不同点 -> 不是对子也不是顺子 -> null (顺子最少3张)
check("6. 34不是顺子(null)", type([N("3"), N("4")]), null);
check("7. 3344合法连对", type([N("3"), N("3"), N("4"), N("4")]), "doubleStraight");
check("8. 33是对子不是连对", type([N("3"), N("3")]), "pair");
check("9. 333444合法连三张",
  type([N("3"), N("3"), N("3"), N("4"), N("4"), N("4")]), "tripleStraight");
check("10. 333是三张不是连三张", type([N("3"), N("3"), N("3")]), "triple");

// ===== 万能牌 =====
check("11. 单独大王非法", type([BJ]), null);
check("12. 单独小王非法", type([SJ]), null);
check("13. 单独赖子非法", type([W]), null);
check("14. 两张赖子非法", type([W, W2]), null);
check("15. 大王+小王+两赖子非法", type([BJ, SJ, W, W2]), null);
check("16. 3+赖子=对子", type([N("3"), W]), "pair");
check("17. 3+王=对子", type([N("3"), BJ]), "pair");
check("18. 3+4+赖子=顺子", type([N("3"), N("4"), W]), "straight");
check("19. 33+赖子=三张", type([N("3"), N("3"), W]), "triple");
check("20. 333+赖子=炸弹", type([N("3"), N("3"), N("3"), W]), "bomb");

// ===== 顺过接牌 =====
check("21. 单张3后接4", follow([N("3")], [N("4")]), true);
check("22. 单张3后不能接5", follow([N("3")], [N("5")]), false);
check("23. 对33后接44", follow([N("3"), N("3")], [N("4"), N("4")]), true);
check("24. 对33后不能接55", follow([N("3"), N("3")], [N("5"), N("5")]), false);
check("25. 三333后接444",
  follow([N("3"), N("3"), N("3")], [N("4"), N("4"), N("4")]), true);
check("26. 顺345后接456",
  follow([N("3"), N("4"), N("5")], [N("4"), N("5"), N("6")]), true);
check("27. 顺345后不能接567",
  follow([N("3"), N("4"), N("5")], [N("5"), N("6"), N("7")]), false);
check("28. 连对3344后接4455",
  follow([N("3"), N("3"), N("4"), N("4")], [N("4"), N("4"), N("5"), N("5")]), true);
check("29. 连对3344后不能接5566",
  follow([N("3"), N("3"), N("4"), N("4")], [N("5"), N("5"), N("6"), N("6")]), false);
check("30. 连三333444后接444555",
  follow([N("3"),N("3"),N("3"),N("4"),N("4"),N("4")],
         [N("4"),N("4"),N("4"),N("5"),N("5"),N("5")]), true);
check("31. 连三333444后不能接555666",
  follow([N("3"),N("3"),N("3"),N("4"),N("4"),N("4")],
         [N("5"),N("5"),N("5"),N("6"),N("6"),N("6")]), false);

// ===== 炸弹 =====
check("32. 3333是炸弹", type([N("3"),N("3"),N("3"),N("3")]), "bomb");
check("33. 333不是炸弹", type([N("3"),N("3"),N("3")]), "triple");
check("34. 333+赖子=四张3炸弹", type([N("3"),N("3"),N("3"),W]), "bomb");
check("35. 33+两赖子=四张3炸弹", type([N("3"),N("3"),W,W2]), "bomb");
check("36. 四张全王/赖子不能炸", type([BJ,SJ,W,W2]), null);
// 37-41 炸弹比大小
const b4_3 = detectPattern([N("3"),N("3"),N("3"),N("3")]);
const b4_4 = detectPattern([N("4"),N("4"),N("4"),N("4")]);
const b4_A = detectPattern([N("A"),N("A"),N("A"),N("A")]);
const b4_2 = detectPattern([N("2"),N("2"),N("2"),N("2")]);
const b5_3 = detectPattern([N("3"),N("3"),N("3"),N("3"),W]);
check("37. 四张4>四张3", canFollow(b4_3, b4_4), true);
check("38. 四张2>四张A", canFollow(b4_A, b4_2), true);
check("39. 五张3>四张2", canFollow(b4_2, b5_3), true);
check("40. 四张2不能压五张3", canFollow(b5_3, b4_2), false);
check("41. 八张2是最大炸弹(识别)",
  type([N("2"),N("2"),N("2"),N("2"),BJ,SJ,W,W2]), "bomb");
// 42-47 炸弹压普通牌型
check("42. 炸弹压单张", canFollow(detectPattern([N("5")]), b4_3), true);
check("43. 炸弹压对子", canFollow(detectPattern([N("5"),N("5")]), b4_3), true);
check("44. 炸弹压三张", canFollow(detectPattern([N("5"),N("5"),N("5")]), b4_3), true);
check("45. 炸弹压顺子",
  canFollow(detectPattern([N("5"),N("6"),N("7")]), b4_3), true);
check("46. 炸弹压连对",
  canFollow(detectPattern([N("5"),N("5"),N("6"),N("6")]), b4_3), true);
check("47. 炸弹压连三张",
  canFollow(detectPattern([N("5"),N("5"),N("5"),N("6"),N("6"),N("6")]), b4_3), true);
check("48. 普通牌型不能压炸弹",
  canFollow(b4_3, detectPattern([N("4"),N("4"),N("4"),N("4")])) === true /* 这是炸弹压炸弹 */
  ? true : null, true);
// 48 真正含义: 普通牌不能压炸弹
check("48b. 单张不能压炸弹", canFollow(b4_3, detectPattern([N("3")])), false);

// ===== 输出 =====
console.log(`\n通过: ${pass}  失败: ${fail}\n`);
if (fails.length) {
  console.log("失败用例:");
  for (const f of fails) {
    console.log(`  ✗ ${f.desc}`);
    console.log(`    实际: ${JSON.stringify(f.actual)}  期望: ${JSON.stringify(f.expected)}`);
  }
  process.exit(1);
} else {
  console.log("✓ 全部用例通过");
}
