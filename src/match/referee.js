// 審判（docs/SPEC.md §3.2・§10.3）。DOM・タイマー・通信に依存しない純粋な処理。
// お題と両者の回答から、回答判定 → 攻撃順 → ダメージ → HP → ラウンド結果 → 決着判定 までを行う。
//
// 使う場所：
//   - CpuSession（自分の端末）
//   - FriendSession のホスト（Ver.0.2）
//   - 将来の Ranked 戦のサーバー（同じコードをそのまま動かせるよう、ブラウザ固有の API を使わない）

import { judgeAnswer } from '../core/judge.js';
import { resolveRound } from '../core/battle.js';
import { CONFIG } from '../config.js';

const MAX_INPUT_LENGTH = 200;

/**
 * 端末から申告された回答を、審判で扱える形に整える（相手端末の申告は信用しすぎない）。
 * - 形式が不正・回答時間が制限時間以上 → 時間切れ
 * - 回答時間は 0 以上の整数に丸める
 * @returns {{ status: 'timeout' } | { status: 'answered', input: string, timeMs: number }}
 */
export function sanitizeAnswer(answer, { timeLimitMs }) {
  if (!answer || answer.status !== 'answered' || typeof answer.input !== 'string') return { status: 'timeout' };
  const timeMs = Math.round(Number(answer.timeMs));
  if (!Number.isFinite(timeMs) || timeMs >= timeLimitMs) return { status: 'timeout' };
  return {
    status: 'answered',
    input: answer.input.slice(0, MAX_INPUT_LENGTH),
    timeMs: Math.max(0, timeMs),
  };
}

/**
 * 1ラウンドを裁定する。
 * @param {{
 *   validator: { validate(input: string, prompt: object): Promise<object> },
 *   state: object,                                     battle.js の状態
 *   prompt: { first: string, last: string },
 *   answers: { player: object, opponent: object },     sanitizeAnswer 済みの回答
 *   timeLimitMs: number,
 *   damageParams?: object,
 * }} input
 * @returns {Promise<{
 *   judged: { player: object, opponent: object },       judge.js の判定結果
 *   resolution: { state, order, attacks, skipped },     battle.js の resolveRound の結果
 *   state: object,                                     ラウンド後の状態
 *   finished: boolean,
 * }>}
 */
export async function refereeRound({ validator, state, prompt, answers, timeLimitMs, damageParams = CONFIG.damage }) {
  const [player, opponent] = await Promise.all([
    judgeAnswer(validator, answers.player, prompt),
    judgeAnswer(validator, answers.opponent, prompt),
  ]);
  const resolution = resolveRound(state, { player, opponent }, { timeLimitMs, damageParams });
  return {
    judged: { player, opponent },
    resolution,
    state: resolution.state,
    finished: Boolean(resolution.state.result),
  };
}
