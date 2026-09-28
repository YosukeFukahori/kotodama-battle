// 判定タイムの1人分の判定（docs/SPEC.md §3.2）。DOM に依存しない。
// プレイヤーも CPU も同じ関数を通す（将来の対人戦でも同じ）。

import { readingLength } from './kana.js';

/**
 * ロック済みの回答を判定する。
 * @param {{ validate(input: string, prompt: object): Promise<object> }} validator
 * @param {{ status: 'timeout' } | { status: 'answered', input: string, timeMs: number }} answer
 * @param {{ first: string, last: string }} prompt
 * @returns {Promise<
 *   { status: 'timeout' } |
 *   { status: 'answered', input: string, timeMs: number, valid: boolean,
 *     reading: string, surface: string, length: number, rejection: object | null }
 * >}
 */
export async function judgeAnswer(validator, answer, prompt) {
  if (answer.status !== 'answered') return { status: 'timeout' };

  const result = await validator.validate(answer.input, prompt);
  const reading = result.reading ?? '';
  return {
    status: 'answered',
    input: answer.input,
    timeMs: answer.timeMs,
    valid: result.ok,
    reading,
    surface: result.ok ? result.surface : answer.input.trim(),
    length: readingLength(reading),
    rejection: result.ok ? null : result,
  };
}
