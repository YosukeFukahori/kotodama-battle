// かな処理の集約モジュール。DOM に依存しない。
// 文字判定・文字数はすべて「読み」（正規化済みひらがな）で行う（docs/SPEC.md §3.4）。
//
// 2種類の判定を分離している：
// - 回答として有効な文字（isReading / isReadingChar）：ひらがな（ぁ〜ゖ）と長音符「ー」
// - お題として出題できる文字（isPromptFirstChar / isPromptLastChar）：ランダム出題で
//   不自然なお題を作らないための制限。回答の有効性には影響しない。

const LONG_VOWEL = 'ー';

// 小書き文字。最初の文字として出題しない。
const SMALL_KANA = new Set([
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ',
  'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ',
  'ゕ', 'ゖ',
]);

// 最初の文字として出題しない文字（小書き文字以外）
const NON_PROMPT_FIRST = new Set([LONG_VOWEL, 'ん', 'を', 'ゔ', 'ゐ', 'ゑ']);

// 最後の文字として出題しない文字（小書き文字以外）。「ん」「ー」は出題可。
const NON_PROMPT_LAST = new Set(['を', 'ゔ', 'ゐ', 'ゑ']);

// 読みとして有効な1文字：ぁ(3041)〜ゖ(3096) と ー(30FC)
// 長音として有効なのは「ー」だけ。「〜」「－」「-」などは無効（ー とはみなさない）。
const READING_CHAR = /^[ぁ-ゖー]$/u;
const READING = /^[ぁ-ゖー]+$/u;

// 前後の空白（全角スペース含む）
const EDGE_SPACES = /^[\s　]+|[\s　]+$/gu;

/**
 * カタカナ1文字をひらがなに変換する。対象外の文字はそのまま返す。
 * ァ(30A1)〜ヶ(30F6) は 0x60 引くとひらがなに対応する（ヴ→ゔ、ヵ→ゕ、ヶ→ゖ を含む）。
 * 長音符「ー」(30FC) は範囲外なのでそのまま残る。
 */
function katakanaCharToHiragana(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x30A1 && code <= 0x30F6) {
    return String.fromCodePoint(code - 0x60);
  }
  return ch;
}

/** 文字列中のカタカナをひらがなに変換する。 */
export function toHiragana(str) {
  return Array.from(str, katakanaCharToHiragana).join('');
}

/**
 * 入力文字列を判定用の「読み」に正規化する。
 * - 前後の空白を除去
 * - NFKC 正規化（半角カナ→全角、結合濁点・半濁点の合成、半角「ｰ」→「ー」）
 * - カタカナ→ひらがな（「ー」は保持）
 * 濁点・半濁点は区別したまま残す（て／で、は／ば／ぱ は別の文字）。
 * 読みとして使えない文字（漢字・英数字など）が含まれていても変換はするので、
 * 有効かどうかは isReading() で確認すること。
 */
export function normalizeReading(input) {
  if (typeof input !== 'string') return '';
  return toHiragana(input.replace(EDGE_SPACES, '').normalize('NFKC'));
}

/** 正規化済みの読みとして有効か（ひらがなと「ー」のみ、1文字以上）。 */
export function isReading(str) {
  return typeof str === 'string' && READING.test(str);
}

/** 読みとして有効な1文字か。 */
export function isReadingChar(ch) {
  return typeof ch === 'string' && READING_CHAR.test(ch);
}

/** 読みの文字数（「きゃ」=2、「ー」=1）。 */
export function readingLength(reading) {
  return Array.from(reading).length;
}

/** 最初の文字。空文字なら ''。 */
export function firstChar(reading) {
  return Array.from(reading)[0] ?? '';
}

/** 最後の文字。「ー」で終わる場合は「ー」を返す。空文字なら ''。 */
export function lastChar(reading) {
  const chars = Array.from(reading);
  return chars[chars.length - 1] ?? '';
}

export function isSmallKana(ch) {
  return SMALL_KANA.has(ch);
}

/**
 * お題の「最初の文字」として出題できるか（ー・ん・を・ゔ・ゐ・ゑ・小書き文字 は不可）。
 * 出題専用の制限。回答の有効性には使わないこと。
 */
export function isPromptFirstChar(ch) {
  return isReadingChar(ch) && !SMALL_KANA.has(ch) && !NON_PROMPT_FIRST.has(ch);
}

/**
 * お題の「最後の文字」として出題できるか（小書き文字・を・ゔ・ゐ・ゑ は不可。ん・ー は可）。
 * 出題専用の制限。これらの文字で終わる回答自体は、辞書にあれば有効。
 */
export function isPromptLastChar(ch) {
  return isReadingChar(ch) && !SMALL_KANA.has(ch) && !NON_PROMPT_LAST.has(ch);
}

/**
 * 読みがお題（最初の文字・最後の文字）に一致するか。読みは正規化済みであること。
 * 出題可能文字の制限は関係しない（純粋に文字の一致だけを見る）。
 */
export function matchesPrompt(reading, prompt) {
  return firstChar(reading) === prompt.first && lastChar(reading) === prompt.last;
}
