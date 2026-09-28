// 公式辞書（ライセンス上問題のない既存日本語辞書）。読み取り専用。正誤判定に使う。
// ※出題と CPU 回答には使わない（それは prompt-pool の役割。CLAUDE.md 参照）。
//
// データは「最初の文字」単位のチャンクで読み込む。出題時点で最初の文字が分かるので、
// 必要なチャンクだけを読めばよい（スマホでの初回読み込みを軽くするため）。
// チャンクの取得方法は loadChunk として外から注入する：
//   - Ver.0.1 仮辞書：1ファイルを読み込んで最初の文字で振り分ける（createSeedChunkLoader）
//   - 実装順序6：最初の文字ごとの JSON ファイルを読む

import { firstChar } from '../core/kana.js';
import { toEntryMap } from './wordEntry.js';

export class OfficialDictionary {
  #loadChunk;
  #chunks = new Map(); // 最初の文字 → Promise<Map<読み, 単語>>

  /** @param {{ loadChunk: (firstChar: string) => Promise<Array<[string, string?]>> }} options */
  constructor({ loadChunk }) {
    this.#loadChunk = loadChunk;
  }

  /** 指定した最初の文字のチャンクを読み込む。失敗した場合は次回また読み込みを試みる。 */
  preload(first) {
    let chunk = this.#chunks.get(first);
    if (!chunk) {
      chunk = Promise.resolve()
        .then(() => this.#loadChunk(first))
        .then((raw) => toEntryMap(raw ?? []));
      chunk.catch(() => this.#chunks.delete(first));
      this.#chunks.set(first, chunk);
    }
    return chunk;
  }

  /** 読みで引く。なければ null。 */
  async lookup(reading) {
    const first = firstChar(reading);
    if (!first) return null;
    const chunk = await this.preload(first);
    return chunk.get(reading) ?? null;
  }
}

/**
 * 1つの JSON（{ entries: [...] }）を読み込み、最初の文字ごとに振り分けるローダー。
 * 仮辞書用。読み込みは初回の1回だけ。
 * @param {() => Promise<{ entries: Array<[string, string?]> }>} loadAll
 */
export function createSeedChunkLoader(loadAll) {
  let grouped = null; // Promise<Map<最初の文字, 生データ[]>>
  return async (first) => {
    if (!grouped) {
      grouped = Promise.resolve().then(loadAll).then((data) => {
        const map = new Map();
        for (const raw of data.entries) {
          const key = firstChar(raw[0]);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(raw);
        }
        return map;
      });
      grouped.catch(() => { grouped = null; });
    }
    return (await grouped).get(first) ?? [];
  };
}
