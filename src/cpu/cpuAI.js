// CPU の回答を決める（docs/SPEC.md §4）。DOM・タイマーに依存しない。
// 強さは 回答時間・選ぶ単語の長さ・時間切れ率 だけで決まる。
// 決めた回答はプレイヤーと同じく判定タイムで判定する。

import { readingLength } from '../core/kana.js';

/**
 * 候補を長さ順に並べ、好みに応じた範囲から1つ選ぶ。
 * short：短いほうの3分の1、long：長いほうの3分の1、normal：全体
 */
export function pickByLength(candidates, lengthPreference, random = Math.random) {
  const sorted = [...candidates].sort((a, b) => readingLength(a.reading) - readingLength(b.reading));
  const third = Math.max(1, Math.ceil(sorted.length / 3));
  let range = sorted;
  if (lengthPreference === 'short') range = sorted.slice(0, third);
  else if (lengthPreference === 'long') range = sorted.slice(sorted.length - third);
  return range[Math.floor(random() * range.length)];
}

/**
 * この問題での CPU の回答を決める。
 * @param {{ answerTimeSec: [number, number], lengthPreference: string, timeoutRate: number }} cpu
 * @param {Array<{ reading: string, surface: string }>} candidates お題に合うプールの単語
 * @param {{ timeLimitMs: number, random?: () => number }} options
 * @returns {{ status: 'timeout' } | { status: 'answered', input: string, timeMs: number }}
 */
export function planCpuAnswer(cpu, candidates, { timeLimitMs, random = Math.random }) {
  if (candidates.length === 0 || random() < cpu.timeoutRate) return { status: 'timeout' };

  const [minSec, maxSec] = cpu.answerTimeSec;
  const timeMs = Math.round((minSec + random() * (maxSec - minSec)) * 1000);
  const word = pickByLength(candidates, cpu.lengthPreference, random);

  return {
    status: 'answered',
    input: word.reading,
    // 制限時間ちょうど以降は時間切れ扱いになるので、その手前に収める
    timeMs: Math.max(0, Math.min(timeLimitMs - 1, timeMs)),
  };
}
