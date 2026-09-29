// 判定タイムの演出（docs/SPEC.md §3.8）。DOM に依存しない。

import { CONFIG } from '../config.js';

/**
 * 長い言葉の追加表示。該当しなければ null。
 * @param {number} length 実際の文字数（ダメージ計算用ではない）
 * @param {Array<{ minLength: number, text: string, level: number }>} tiers
 */
export function longWordCallout(length, tiers = CONFIG.effects.longWord) {
  const sorted = [...tiers].sort((a, b) => b.minLength - a.minLength);
  return sorted.find((t) => length >= t.minLength) ?? null;
}
