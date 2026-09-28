// テスト用のメモリ上の辞書。

import { OfficialDictionary } from '../src/dictionary/officialDictionary.js';

/**
 * 生データ（[読み, 表記?] の配列）から、本番と同じ形の公式辞書を作る。
 * calls を渡すと、読み込んだファイル（"最初|最後"）が記録される。
 */
export function memoryOfficial(entries, calls = []) {
  const counts = {};
  for (const [reading] of entries) {
    const first = reading[0];
    const last = reading[reading.length - 1];
    counts[first] ??= {};
    counts[first][last] = (counts[first][last] ?? 0) + 1;
  }
  return new OfficialDictionary({
    loadIndex: async () => ({ counts }),
    loadChunk: async (first, last) => {
      calls.push(`${first}|${last}`);
      return entries.filter(([r]) => r[0] === first && r[r.length - 1] === last);
    },
  });
}
