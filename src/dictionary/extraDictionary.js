// ゲーム独自の追加辞書。公式辞書にない言葉を補う。正誤判定に使う。
// Ver.0.1 では開発側が data/extra-words.json を直接編集して管理する（プレイヤーは追加できない）。
// 将来、共有追加辞書（オンライン）に差し替えるときも lookup(reading) の形を保つこと。

import { toEntryMap } from './wordEntry.js';

export class ExtraDictionary {
  #load;
  #entries = null; // Promise<Map<読み, 単語>>

  /** @param {{ load: () => Promise<{ entries: Array<[string, string?]> }> }} options */
  constructor({ load }) {
    this.#load = load;
  }

  preload() {
    if (!this.#entries) {
      this.#entries = Promise.resolve()
        .then(() => this.#load())
        .then((data) => toEntryMap(data?.entries ?? []));
      this.#entries.catch(() => { this.#entries = null; });
    }
    return this.#entries;
  }

  /** 読みで引く。なければ null。 */
  async lookup(reading) {
    const entries = await this.preload();
    return entries.get(reading) ?? null;
  }
}
