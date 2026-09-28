// CPU の回答を決める（docs/SPEC.md §4）。DOM・タイマーに依存しない。
// 強さは 回答時間・選ぶ単語の文字数・時間切れ率 だけで決まる。
// 決めた回答はプレイヤーと同じく判定タイムで判定する。
//
// 人間らしさのために：
// - 回答時間 ＝ 考える時間（正規分布でばらつく）＋ 1文字あたりの入力時間 × 文字数
//   （同じCPUでも毎回違う秒数になり、長い言葉ほど時間がかかる）
// - 文字数は、難易度ごとの分布から「狙う文字数」を引き、候補の中で最も近い語を選ぶ
//   （毎回最長語を選ぶわけではない）
// - 同じバトルの中で使った語は、他に候補がある限り選ばない

import { readingLength } from '../core/kana.js';
import { normal } from '../core/random.js';

/**
 * 候補から1語選ぶ。
 * @param {Array<{ reading: string }>} candidates
 * @param {{ mean: number, sd: number }} wordLength 狙う文字数の分布
 * @param {{ random?: () => number, avoid?: Set<string> }} options avoid：使いたくない読み
 */
export function pickWord(candidates, wordLength, { random = Math.random, avoid = new Set() } = {}) {
  const fresh = candidates.filter((c) => !avoid.has(c.reading));
  const list = fresh.length > 0 ? fresh : candidates;
  const target = normal(random, wordLength.mean, wordLength.sd);
  let best = null;
  let bestScore = Infinity;
  for (const c of list) {
    // 同じくらいの距離なら毎回同じ語にならないよう、少しだけ揺らす
    const score = Math.abs(readingLength(c.reading) - target) + random() * 0.75;
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/**
 * この問題での CPU の回答を決める。
 * @param {{
 *   thinkSec: { mean: number, sd: number, min: number },
 *   typingSecPerChar: number,
 *   wordLength: { mean: number, sd: number },
 *   timeoutRate: number,
 * }} cpu
 * @param {Array<{ reading: string, surface: string }>} candidates お題に合うプールの単語
 * @param {{ timeLimitMs: number, random?: () => number, avoid?: Set<string> }} options
 * @returns {{ status: 'timeout' } | { status: 'answered', input: string, timeMs: number }}
 */
export function planCpuAnswer(cpu, candidates, { timeLimitMs, random = Math.random, avoid = new Set() }) {
  if (candidates.length === 0 || random() < cpu.timeoutRate) return { status: 'timeout' };

  const word = pickWord(candidates, cpu.wordLength, { random, avoid });
  const thinkSec = Math.max(cpu.thinkSec.min, normal(random, cpu.thinkSec.mean, cpu.thinkSec.sd));
  const timeMs = Math.round((thinkSec + cpu.typingSecPerChar * readingLength(word.reading)) * 1000);

  // 考え込んで制限時間を過ぎたら時間切れ
  if (timeMs >= timeLimitMs) return { status: 'timeout' };
  return { status: 'answered', input: word.reading, timeMs };
}
