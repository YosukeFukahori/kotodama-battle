import { test, assert } from './harness.js';
import {
  toHiragana,
  normalizeReading,
  isReading,
  readingLength,
  firstChar,
  lastChar,
  isSmallKana,
  isPromptFirstChar,
  isPromptLastChar,
  matchesPrompt,
} from '../src/core/kana.js';

// ---------- 正規化 ----------

test('カタカナはひらがなに変換される', () => {
  assert.equal(toHiragana('アリアナグランデ'), 'ありあなぐらんで');
  assert.equal(normalizeReading('アリアナグランデ'), 'ありあなぐらんで');
});

test('長音符「ー」は変換されずに残る', () => {
  assert.equal(normalizeReading('コーヒー'), 'こーひー');
  assert.equal(normalizeReading('らーめん'), 'らーめん');
});

test('ヴ・ヵ・ヶ は対応するひらがなになる', () => {
  assert.equal(normalizeReading('ヴァイオリン'), 'ゔぁいおりん');
  assert.equal(normalizeReading('ヵヶ'), 'ゕゖ');
});

test('ひらがな・カタカナ混在も正規化できる', () => {
  assert.equal(normalizeReading('ぱんケーキ'), 'ぱんけーき');
});

test('半角カナは全角ひらがなに、半角長音「ｰ」は「ー」になる', () => {
  assert.equal(normalizeReading('ｶﾞｯｺｳ'), 'がっこう');
  assert.equal(normalizeReading('ｺｰﾋｰ'), 'こーひー');
  assert.equal(normalizeReading('ﾊﾟﾝ'), 'ぱん');
});

test('結合文字の濁点・半濁点は1文字に合成される', () => {
  assert.equal(normalizeReading('が'), 'が');
  assert.equal(normalizeReading('ぱ'), 'ぱ');
  assert.equal(readingLength(normalizeReading('がき')), 2);
});

test('前後の空白（全角含む）は除去される', () => {
  assert.equal(normalizeReading('　 りんご \n'), 'りんご');
});

test('文字列以外は空文字になる', () => {
  assert.equal(normalizeReading(null), '');
  assert.equal(normalizeReading(undefined), '');
  assert.equal(normalizeReading(123), '');
});

// ---------- 読みとしての妥当性 ----------

test('ひらがなと「ー」だけなら有効な読み', () => {
  assert.ok(isReading('ありあなぐらんで'));
  assert.ok(isReading('こーひー'));
  assert.ok(isReading('ゔぁいおりん'));
});

test('漢字・英数字・記号・空白・空文字は無効', () => {
  assert.notOk(isReading('東京'));
  assert.notOk(isReading('とうきょう都'));
  assert.notOk(isReading('abc'));
  assert.notOk(isReading('あ1'));
  assert.notOk(isReading('あ〜'));
  assert.notOk(isReading('あ い'));
  assert.notOk(isReading(''));
});

test('正規化前のカタカナは読みとしては無効（必ず normalizeReading を通す）', () => {
  assert.notOk(isReading('コーヒー'));
  assert.ok(isReading(normalizeReading('コーヒー')));
});

test('長音として有効なのは「ー」だけ（〜 ～ － - ‐ ― − ~ は無効）', () => {
  for (const input of ['コ〜ヒ〜', 'コ～ヒ～', 'コ－ヒ－', 'コ-ヒ-', 'コ‐ヒ‐', 'コ―ヒ―', 'コ−ヒ−', 'コ~ヒ~']) {
    assert.notOk(isReading(normalizeReading(input)), input);
  }
  assert.ok(isReading(normalizeReading('コーヒー')));
});

test('踊り字（ゝゞ）は読みとして無効', () => {
  assert.notOk(isReading('いすゞ'));
});

// ---------- 文字数・最初と最後の文字 ----------

test('文字数は読みの文字数（小書き文字・ー も1文字）', () => {
  assert.equal(readingLength('きゃ'), 2);
  assert.equal(readingLength('こーひー'), 4);
  assert.equal(readingLength('ありあなぐらんで'), 8);
  assert.equal(readingLength('とうきょうとちよだく'), 10);
});

test('最初の文字・最後の文字', () => {
  assert.equal(firstChar('ありあなぐらんで'), 'あ');
  assert.equal(lastChar('ありあなぐらんで'), 'で');
});

test('「ー」で終わる言葉の最後の文字は「ー」', () => {
  assert.equal(lastChar('こーひー'), 'ー');
  assert.equal(lastChar('すきー'), 'ー');
});

test('「ん」で終わる言葉の最後の文字は「ん」', () => {
  assert.equal(lastChar('みかん'), 'ん');
});

test('小書き文字で終わる言葉の最後の文字はその小書き文字', () => {
  assert.equal(lastChar('ちょっ'), 'っ');
  assert.equal(lastChar('しゃ'), 'ゃ');
});

test('空文字の最初・最後の文字は空文字', () => {
  assert.equal(firstChar(''), '');
  assert.equal(lastChar(''), '');
});

// ---------- 出題可能な文字 ----------

test('通常のかなは最初の文字として出題できる', () => {
  for (const ch of ['あ', 'か', 'が', 'ぱ', 'わ', 'ぴ']) {
    assert.ok(isPromptFirstChar(ch), ch);
  }
});

test('ー・ん・を・ゔ・ゐ・ゑ は最初の文字として出題しない', () => {
  for (const ch of ['ー', 'ん', 'を', 'ゔ', 'ゐ', 'ゑ']) {
    assert.notOk(isPromptFirstChar(ch), ch);
  }
});

test('小書き文字は最初の文字として出題しない', () => {
  for (const ch of ['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ', 'ゕ', 'ゖ']) {
    assert.ok(isSmallKana(ch), ch);
    assert.notOk(isPromptFirstChar(ch), ch);
  }
});

test('カタカナ・漢字・複数文字は出題文字として扱わない', () => {
  assert.notOk(isPromptFirstChar('ア'));
  assert.notOk(isPromptFirstChar('亜'));
  assert.notOk(isPromptFirstChar('あい'));
  assert.notOk(isPromptFirstChar(''));
});

test('「ー」「ん」は最後の文字として出題できる', () => {
  assert.ok(isPromptLastChar('ー'));
  assert.ok(isPromptLastChar('ん'));
  assert.ok(isPromptLastChar('で'));
  assert.ok(isPromptLastChar('ぱ'));
});

test('小書き文字・を・ゔ・ゐ・ゑ は最後の文字として出題しない', () => {
  for (const ch of ['を', 'ゔ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'っ', 'ゎ', 'ゕ', 'ゖ', 'ゐ', 'ゑ']) {
    assert.notOk(isPromptLastChar(ch), ch);
  }
});

test('カタカナ・漢字・複数文字・空文字は最後の文字として出題しない', () => {
  assert.notOk(isPromptLastChar('ン'));
  assert.notOk(isPromptLastChar('亜'));
  assert.notOk(isPromptLastChar('んー'));
  assert.notOk(isPromptLastChar(''));
});

// ---------- 出題制限と回答の有効性は別 ----------

test('出題しない文字で終わる言葉も、回答の読みとしては有効', () => {
  for (const word of ['ちょっ', 'しゃ', 'きゅ', 'ぴゅ', 'ぅぉ']) {
    assert.ok(isReading(word), word);
    assert.notOk(isPromptLastChar(lastChar(word)), word);
  }
});

test('出題しない文字で始まる言葉も、回答の読みとしては有効', () => {
  for (const word of ['んじゃめな', 'ぁぃ', 'ーあ']) {
    assert.ok(isReading(word), word);
    assert.notOk(isPromptFirstChar(firstChar(word)), word);
  }
});

// ---------- お題との一致 ----------

test('SPEC の例：アリアナグランデ は「あ→で」に一致', () => {
  const reading = normalizeReading('アリアナグランデ');
  assert.ok(matchesPrompt(reading, { first: 'あ', last: 'で' }));
});

test('濁点・半濁点は区別する（て／で、は／ば／ぱ）', () => {
  const reading = normalizeReading('アリアナグランデ');
  assert.notOk(matchesPrompt(reading, { first: 'あ', last: 'て' }));

  assert.ok(matchesPrompt('ぱん', { first: 'ぱ', last: 'ん' }));
  assert.notOk(matchesPrompt('ぱん', { first: 'は', last: 'ん' }));
  assert.notOk(matchesPrompt('ぱん', { first: 'ば', last: 'ん' }));
});

test('「ー」終わりのお題は「ー」で終わる言葉だけが一致', () => {
  const coffee = normalizeReading('コーヒー');
  assert.ok(matchesPrompt(coffee, { first: 'こ', last: 'ー' }));
  assert.notOk(matchesPrompt(coffee, { first: 'こ', last: 'ひ' }));
  assert.notOk(matchesPrompt(coffee, { first: 'こ', last: 'い' }));
});

test('小書き文字は大きい文字と区別する', () => {
  assert.notOk(matchesPrompt('しゃ', { first: 'し', last: 'や' }));
  assert.ok(matchesPrompt('しゃ', { first: 'し', last: 'ゃ' }));
});
