// 出題（docs/SPEC.md §8.1）。DOM に依存しない。
//
// お題は出題用プールの単語から作る。単語を1つ選び、その最初の文字・最後の文字をお題にするので、
// 必ず答えのある組み合わせになる。出題できない文字（kana.js）を含む単語はお題の元にしない。
// よく出てくる組み合わせほど出やすくなる（単語単位で選ぶため）。

import { firstChar, lastChar, isPromptFirstChar, isPromptLastChar } from './kana.js';
import { toWordEntry } from '../dictionary/wordEntry.js';

export function promptKey({ first, last }) {
  return `${first}|${last}`;
}

export class PromptPool {
  #eligible = [];          // お題の元にできる単語
  #byKey = new Map();      // "最初|最後" → 単語[]（CPU の回答候補）

  /** @param {Array<[string, string?]>} rawEntries 辞書データと同じ形式 */
  constructor(rawEntries) {
    const seen = new Set();
    for (const raw of rawEntries) {
      const entry = toWordEntry(raw);
      if (seen.has(entry.reading)) continue;
      seen.add(entry.reading);

      const first = firstChar(entry.reading);
      const last = lastChar(entry.reading);
      const key = promptKey({ first, last });
      if (!this.#byKey.has(key)) this.#byKey.set(key, []);
      this.#byKey.get(key).push(entry);

      if (isPromptFirstChar(first) && isPromptLastChar(last)) this.#eligible.push(entry);
    }
  }

  /** お題の元にできる単語数 */
  get size() {
    return this.#eligible.length;
  }

  /**
   * 次のお題を作る。
   * @param {{ random?: () => number, avoid?: { first: string, last: string } | null }} options
   *   avoid：直前のお題。他の組み合わせがある限り、同じお題を続けて出さない。
   */
  next({ random = Math.random, avoid = null } = {}) {
    if (this.#eligible.length === 0) throw new Error('出題できる単語がありません');
    const avoidKey = avoid ? promptKey(avoid) : null;
    const candidates = avoidKey
      ? this.#eligible.filter((e) => promptKey({ first: firstChar(e.reading), last: lastChar(e.reading) }) !== avoidKey)
      : this.#eligible;
    const list = candidates.length > 0 ? candidates : this.#eligible;
    const entry = list[Math.floor(random() * list.length)];
    return Object.freeze({ first: firstChar(entry.reading), last: lastChar(entry.reading) });
  }

  /** お題に合うプールの単語（CPU の回答候補）。 */
  candidates(prompt) {
    return this.#byKey.get(promptKey(prompt)) ?? [];
  }
}
