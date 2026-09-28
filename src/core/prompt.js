// 出題（docs/SPEC.md §8.1）。DOM に依存しない。
//
// お題はプールの単語から作るので、必ず答えのある組み合わせになる。
// お題にするのは、次を満たす「最初×最後の文字」の組み合わせだけ：
//   - 出題できない文字（kana.js）を含まない
//   - プール内に候補が minCandidates 語以上ある（答えがほぼ1語のお題を避け、CPU の回答にも幅を持たせる）
// 組み合わせは均等に選ぶ（同じお題ばかり出ないように）。

import { firstChar, lastChar, isPromptFirstChar, isPromptLastChar } from './kana.js';
import { toWordEntry } from '../dictionary/wordEntry.js';

export function promptKey({ first, last }) {
  return `${first}|${last}`;
}

export class PromptPool {
  #byKey = new Map();      // "最初|最後" → 単語[]（CPU の回答候補）
  #prompts = [];           // お題にできる組み合わせ

  /**
   * @param {Array<[string, string?]>} rawEntries 辞書データと同じ形式
   * @param {{ minCandidates?: number }} options
   */
  constructor(rawEntries, { minCandidates = 1 } = {}) {
    const seen = new Set();
    for (const raw of rawEntries) {
      const entry = toWordEntry(raw);
      if (seen.has(entry.reading)) continue;
      seen.add(entry.reading);
      const key = promptKey({ first: firstChar(entry.reading), last: lastChar(entry.reading) });
      if (!this.#byKey.has(key)) this.#byKey.set(key, []);
      this.#byKey.get(key).push(entry);
    }
    for (const words of this.#byKey.values()) {
      const first = firstChar(words[0].reading);
      const last = lastChar(words[0].reading);
      if (isPromptFirstChar(first) && isPromptLastChar(last) && words.length >= minCandidates) {
        this.#prompts.push(Object.freeze({ first, last }));
      }
    }
  }

  /** お題にできる組み合わせの数 */
  get size() {
    return this.#prompts.length;
  }

  /** お題にできる組み合わせの一覧 */
  get prompts() {
    return [...this.#prompts];
  }

  /**
   * 次のお題を作る。
   * @param {{ random?: () => number, avoid?: { first: string, last: string } | null }} options
   *   avoid：直前のお題。他の組み合わせがある限り、同じお題を続けて出さない。
   */
  next({ random = Math.random, avoid = null } = {}) {
    if (this.#prompts.length === 0) throw new Error('出題できる組み合わせがありません');
    const avoidKey = avoid ? promptKey(avoid) : null;
    const list = avoidKey && this.#prompts.length > 1
      ? this.#prompts.filter((p) => promptKey(p) !== avoidKey)
      : this.#prompts;
    return list[Math.floor(random() * list.length)];
  }

  /** お題に合うプールの単語（CPU の回答候補）。 */
  candidates(prompt) {
    return this.#byKey.get(promptKey(prompt)) ?? [];
  }
}
