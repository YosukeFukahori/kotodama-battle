// 実際のデータファイルを使った結合テスト（src/dictionary/setup.js の組み立て）。

import { test, assert } from './harness.js';
import { loadJson } from './loadJson.js';
import { createDictionaries } from '../src/dictionary/setup.js';
import { REJECT_REASON } from '../src/dictionary/wordValidator.js';

// setup.js は URL で JSON を要求するので、リポジトリ直下からの相対パスに直して読む
const { validator } = createDictionaries({
  loadJson: (url) => loadJson(url.pathname.slice(url.pathname.indexOf('data/'))),
});

const cases = [
  // [入力, お題, 期待結果（source または不合格理由）]
  ['コーヒー', 'こ', 'ー', 'official'],
  ['ひとで', 'ひ', 'で', 'official'],
  ['アリアナグランデ', 'あ', 'で', 'extra'],
  ['ｶﾎﾞﾁｬ', 'か', 'ゃ', 'official'],
  ['らーめん', 'ら', 'ん', 'official'],
  ['コ〜ヒ〜', 'こ', 'ー', REJECT_REASON.LONG_VOWEL_LOOKALIKE],
  ['珈琲', 'こ', 'ー', REJECT_REASON.INVALID_CHARS],
  ['こーひー', 'こ', 'ひ', REJECT_REASON.LAST_MISMATCH],
  ['ぱんだ', 'は', 'だ', REJECT_REASON.FIRST_MISMATCH],
  ['あいうえお', 'あ', 'お', REJECT_REASON.NOT_IN_DICTIONARY],
];

for (const [input, first, last, expected] of cases) {
  test(`結合：「${input}」×「${first}→${last}」→ ${expected}`, async () => {
    const result = await validator.validate(input, { first, last });
    if (result.ok) assert.equal(result.source, expected);
    else assert.equal(result.reason, expected);
  });
}
