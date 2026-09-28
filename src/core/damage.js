// ダメージ計算（docs/SPEC.md §3.4）。DOM に依存しない。

import { CONFIG } from '../config.js';

/** 長さ補正。最小文字数ちょうどで 1。 */
export function lengthMultiplier(length, params = CONFIG.damage) {
  return 1 + Math.max(0, length - params.minLength) * params.lengthCoef;
}

/** 時間補正。0秒で maxTimeMul、制限時間ちょうどで minTimeMul。 */
export function timeMultiplier(timeMs, timeLimitMs, params = CONFIG.damage) {
  const ratio = Math.min(1, Math.max(0, timeMs / timeLimitMs));
  return params.maxTimeMul - ratio * (params.maxTimeMul - params.minTimeMul);
}

/**
 * 有効回答1つ分のダメージ。
 * @param {{ length: number, timeMs: number, timeLimitMs: number }} answer
 */
export function calcDamage({ length, timeMs, timeLimitMs }, params = CONFIG.damage) {
  const raw = params.base * lengthMultiplier(length, params) * timeMultiplier(timeMs, timeLimitMs, params);
  return Math.max(1, Math.round(raw));
}
