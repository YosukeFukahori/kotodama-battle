// 辞書データの共通フォーマット。
//
// JSON ファイルでは容量を抑えるため、1語を配列で表す：
//   ["こーひー", "コーヒー"]   … [読み, 表記]
//   ["りんご"]                 … 表記が読みと同じなら省略可
//
// 読みは kana.js の normalizeReading 済みのひらがな（「ー」は保持）であること。
// 同じ読みが複数ある場合は先に出てきたものを採用する（判定は読みだけで行うため）。

/** 生データ1件を { reading, surface } に変換する。 */
export function toWordEntry(raw) {
  const [reading, surface] = raw;
  return Object.freeze({ reading, surface: surface || reading });
}

/** 生データ配列を「読み → 単語」の Map にする。 */
export function toEntryMap(rawEntries) {
  const map = new Map();
  for (const raw of rawEntries) {
    const entry = toWordEntry(raw);
    if (!map.has(entry.reading)) map.set(entry.reading, entry);
  }
  return map;
}
