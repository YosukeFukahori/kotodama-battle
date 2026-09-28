// 公式辞書（SudachiDict から生成。tools/build_dictionary.py）。読み取り専用。正誤判定に使う。
// ※出題と CPU 回答には使わない（それは prompt-pool の役割。CLAUDE.md 参照）。
//
// データは「最初の文字 × 最後の文字」ごとのファイルに分かれている。
// 判定ではお題の条件（最初・最後の文字）を通った読みしか辞書を引かないので、
// 1問につき1ファイル（中央値 0.5KB・最大 100KB 程度）だけ読めばよい。
// 目次（index.json）で、単語がある組み合わせかどうかを先に確認する（ない組み合わせは読みに行かない）。
//
// 取得方法は外から注入する：
//   loadIndex()              → { counts: { 最初の文字: { 最後の文字: 語数 } } }
//   loadChunk(first, last)   → [[読み, 表記?], ...]

import { firstChar, lastChar } from '../core/kana.js';
import { toEntryMap } from './wordEntry.js';

const hex = (ch) => ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

/** 組み合わせごとのファイル名。tools/build_dictionary.py の chunk_filename と同じ規則。 */
export function chunkFileName(first, last) {
  return `${hex(first)}-${hex(last)}.json`;
}

export class OfficialDictionary {
  #loadIndex;
  #loadChunk;
  #index = null;          // Promise<{ counts }>
  #chunks = new Map();    // "最初|最後" → Promise<Map<読み, 単語>>

  /**
   * @param {{
   *   loadIndex: () => Promise<{ counts: Record<string, Record<string, number>> }>,
   *   loadChunk: (first: string, last: string) => Promise<Array<[string, string?]>>,
   * }} options
   */
  constructor({ loadIndex, loadChunk }) {
    this.#loadIndex = loadIndex;
    this.#loadChunk = loadChunk;
  }

  #getIndex() {
    if (!this.#index) {
      this.#index = Promise.resolve().then(() => this.#loadIndex());
      this.#index.catch(() => { this.#index = null; });
    }
    return this.#index;
  }

  /** お題の組み合わせの語数（目次による）。 */
  async count({ first, last }) {
    const index = await this.#getIndex();
    return index.counts?.[first]?.[last] ?? 0;
  }

  /**
   * お題の組み合わせのデータを読み込む。読み込みに失敗した場合は次回また読み込みを試みる。
   * 回答受付の前に呼んでおくと、判定タイムでの読み込み失敗を防げる。
   */
  preload({ first, last }) {
    const key = `${first}|${last}`;
    let chunk = this.#chunks.get(key);
    if (!chunk) {
      chunk = this.count({ first, last })
        .then((n) => (n > 0 ? this.#loadChunk(first, last) : []))
        .then((raw) => toEntryMap(raw ?? []));
      chunk.catch(() => this.#chunks.delete(key));
      this.#chunks.set(key, chunk);
    }
    return chunk;
  }

  /** 読みで引く。なければ null。 */
  async lookup(reading) {
    const first = firstChar(reading);
    if (!first) return null;
    const chunk = await this.preload({ first, last: lastChar(reading) });
    return chunk.get(reading) ?? null;
  }
}
