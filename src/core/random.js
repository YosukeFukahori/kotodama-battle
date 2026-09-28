// 乱数ユーティリティ。random は 0以上1未満を返す関数（テストでは固定値を渡す）。

/** 正規分布に従う値（Box-Muller 法）。 */
export function normal(random, mean, sd) {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 配列から1つ選ぶ。 */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}
