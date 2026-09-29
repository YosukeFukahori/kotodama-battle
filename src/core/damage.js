// ダメージ計算（docs/SPEC.md §3.4）。DOM に依存しない。
//
// 実際の文字数（回答の有効性・表示に使う）と、ダメージ計算用文字数（上限 maxDamageLength）は分けて扱う。

import { CONFIG } from '../config.js';

/** ダメージ計算用文字数。実際の文字数を上限 maxDamageLength で頭打ちにする。 */
export function damageLength(length, params = CONFIG.damage) {
  return Math.min(length, params.maxDamageLength ?? Infinity);
}

/**
 * 文字数補正 = lengthBase + n × lengthCoef + n² × lengthQuadCoef
 * （n = ダメージ計算用文字数 - minLength。最小文字数未満は 0 とみなす）
 */
export function lengthMultiplier(length, params = CONFIG.damage) {
  const n = Math.max(0, damageLength(length, params) - params.minLength);
  return (params.lengthBase ?? 1) + n * params.lengthCoef + n * n * (params.lengthQuadCoef ?? 0);
}

/** 速度補正。0秒で maxTimeMul、制限時間ちょうどで minTimeMul（直線）。 */
export function timeMultiplier(timeMs, timeLimitMs, params = CONFIG.damage) {
  const ratio = Math.min(1, Math.max(0, timeMs / timeLimitMs));
  return params.maxTimeMul - ratio * (params.maxTimeMul - params.minTimeMul);
}

/**
 * 有効回答1つ分のダメージ。
 * @param {{ length: number, timeMs: number, timeLimitMs: number }} answer length は実際の文字数
 */
export function calcDamage({ length, timeMs, timeLimitMs }, params = CONFIG.damage) {
  const raw = params.base * lengthMultiplier(length, params) * timeMultiplier(timeMs, timeLimitMs, params);
  return Math.max(1, Math.round(raw));
}
