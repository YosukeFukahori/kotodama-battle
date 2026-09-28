// 単語判定の入口。判定はすべてここを通す（docs/SPEC.md §8）。
//
//   入力
//    ↓ ① 形式チェック（空でない・長音は「ー」のみ・かなのみ・最小文字数）
//    ↓ ② 条件チェック（最初の文字・最後の文字）
//    ↓ ③ 公式辞書
//    ↓ ④ 追加辞書
//    → どこかで不合格なら無効（判定タイムで判定。その問題では再入力できない）
//
// 辞書は { name, dictionary: { lookup(reading) => Promise<entry|null> } } の配列で受け取り、
// 先頭から順に引く。将来、審議や共有追加辞書を差し込むときもこの順序付きリストに足す。

import { normalizeReading, isReading, readingLength, firstChar, lastChar } from '../core/kana.js';

export const REJECT_REASON = Object.freeze({
  EMPTY: 'EMPTY',
  LONG_VOWEL_LOOKALIKE: 'LONG_VOWEL_LOOKALIKE',
  INVALID_CHARS: 'INVALID_CHARS',
  TOO_SHORT: 'TOO_SHORT',
  FIRST_MISMATCH: 'FIRST_MISMATCH',
  LAST_MISMATCH: 'LAST_MISMATCH',
  NOT_IN_DICTIONARY: 'NOT_IN_DICTIONARY',
  LOOKUP_FAILED: 'LOOKUP_FAILED',
});

// 「ー」と紛らわしい文字。NFKC 後の形（～→~、－→-）で判定する。
// これらは「ー」とはみなさず無効。判定タイムで理由が分かるよう専用のメッセージを出す。
const LONG_VOWEL_LOOKALIKES = /[~\-〜‐‑–—―−]/u;

/** 判定結果から画面表示用のメッセージを作る。 */
export function rejectMessage(result) {
  switch (result.reason) {
    case REJECT_REASON.EMPTY: return '言葉を入力してください';
    case REJECT_REASON.LONG_VOWEL_LOOKALIKE: return '長音は「ー」で入力してください';
    case REJECT_REASON.INVALID_CHARS: return 'ひらがな・カタカナで入力してください';
    case REJECT_REASON.TOO_SHORT: return `${result.minLength}文字以上で入力してください`;
    case REJECT_REASON.FIRST_MISMATCH: return `「${result.prompt.first}」から始まる言葉ではありません`;
    case REJECT_REASON.LAST_MISMATCH: return `「${result.prompt.last}」で終わる言葉ではありません`;
    case REJECT_REASON.NOT_IN_DICTIONARY: return '辞書にない言葉です';
    case REJECT_REASON.LOOKUP_FAILED: return '辞書を読み込めませんでした。もう一度送信してください';
    default: return '';
  }
}

export class WordValidator {
  #sources;
  #minLength;

  /**
   * @param {{
   *   sources: Array<{ name: string, dictionary: { lookup(reading: string): Promise<{reading: string, surface: string}|null> } }>,
   *   minLength: number,
   * }} options
   */
  constructor({ sources, minLength }) {
    this.#sources = sources;
    this.#minLength = minLength;
  }

  /** ① 形式チェック（同期）。通れば正規化済みの読みを返す。 */
  checkFormat(input) {
    const reading = normalizeReading(input);
    if (reading === '') return reject(REJECT_REASON.EMPTY, { reading });
    if (LONG_VOWEL_LOOKALIKES.test(reading)) return reject(REJECT_REASON.LONG_VOWEL_LOOKALIKE, { reading });
    if (!isReading(reading)) return reject(REJECT_REASON.INVALID_CHARS, { reading });
    if (readingLength(reading) < this.#minLength) {
      return reject(REJECT_REASON.TOO_SHORT, { reading, minLength: this.#minLength });
    }
    return { ok: true, reading };
  }

  /**
   * 入力を判定する。
   * @returns {Promise<
   *   { ok: true, reading: string, surface: string, source: string } |
   *   { ok: false, reason: string, reading: string, ... }
   * >}
   */
  async validate(input, prompt) {
    const format = this.checkFormat(input);
    if (!format.ok) return format;
    const { reading } = format;

    // ② 条件チェック
    if (firstChar(reading) !== prompt.first) return reject(REJECT_REASON.FIRST_MISMATCH, { reading, prompt });
    if (lastChar(reading) !== prompt.last) return reject(REJECT_REASON.LAST_MISMATCH, { reading, prompt });

    // ③④ 辞書（登録順に引く）
    for (const { name, dictionary } of this.#sources) {
      let entry;
      try {
        entry = await dictionary.lookup(reading);
      } catch (error) {
        return reject(REJECT_REASON.LOOKUP_FAILED, { reading, source: name, error });
      }
      if (entry) return { ok: true, reading: entry.reading, surface: entry.surface, source: name };
    }

    return reject(REJECT_REASON.NOT_IN_DICTIONARY, { reading });
  }
}

function reject(reason, detail) {
  return { ok: false, reason, ...detail };
}
