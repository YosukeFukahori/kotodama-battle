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
  ['あぬぬぬお', 'あ', 'お', REJECT_REASON.NOT_IN_DICTIONARY],
  // 公式辞書（SudachiDict）の収録ルール
  ['たべる', 'た', 'る', 'official'],                 // 動詞の基本形
  ['うつくしかった', 'う', 'た', REJECT_REASON.NOT_IN_DICTIONARY], // 活用形は不可
  ['うつくしい', 'う', 'い', 'official'],             // 形容詞の基本形
  ['おだのぶなが', 'お', 'が', 'official'],           // 人名（フルネーム）
  ['ひろし', 'ひ', 'し', REJECT_REASON.NOT_IN_DICTIONARY], // 人名（名だけ）は不可
  ['とうきょうと', 'と', 'と', 'official'],           // 地名
  ['ちばけんなりたしきたはとり', 'ち', 'り', REJECT_REASON.NOT_IN_DICTIONARY], // 住所のような地名は不可
  ['わごむ', 'わ', 'む', 'extra'],
  ['てぃーしゃつ', 'て', 'つ', 'official'],            // かなを含む表記（Tシャツ等）は収録
  ['えすいーえーぴーしーいーえぬてぃーあーるいー', 'え', 'ー', REJECT_REASON.NOT_IN_DICTIONARY], // 英字だけの略語は除外
  // 130文字未満の長い言葉は有効（ダメージ計算は上限20文字）
  ['ろうどうしゃはけんじぎょうのてきせいなうんえいのかくほおよびはけんろうどうしゃのほごとうにかんするほうりつ', 'ろ', 'つ', 'official'],
  // 読みが130文字以上の言葉は辞書から除外
  ['あなたのしあわせがわたくしのしあわせよのためひとのためじんるいこうふくつながりそうぞうすなわちわれらのしめいなりいままさにへんかくのときここにあつきたましいとあいとじょうてつのゆうきとりたのせいしんをもつものがけっしゅうせりひびかんしゃよろこびえがおつながりをたしかないっぽとしちきゅうのえいぞくをやくそくするこうえきのこころざしあふれるわれらのそくせきにれきしのはながさくいざゆかんろまんかがやくこうかいへ', 'あ', 'へ', REJECT_REASON.NOT_IN_DICTIONARY],
];

for (const [input, first, last, expected] of cases) {
  test(`結合：「${input}」×「${first}→${last}」→ ${expected}`, async () => {
    const result = await validator.validate(input, { first, last });
    if (result.ok) assert.equal(result.source, expected);
    else assert.equal(result.reason, expected);
  });
}
