import { test, assert } from './harness.js';
import { WordValidator, REJECT_REASON, rejectMessage } from '../src/dictionary/wordValidator.js';
import { OfficialDictionary } from '../src/dictionary/officialDictionary.js';
import { ExtraDictionary } from '../src/dictionary/extraDictionary.js';

const OFFICIAL = [
  ['こーひー', 'コーヒー'],
  ['ひとで', 'ヒトデ'],
  ['かぼちゃ'],
  ['ぱん', 'パン'],
  ['みかん'],
  ['がっこう', '学校'],
  ['あめ', '雨'],
];
const EXTRA = [['ありあなぐらんで', 'アリアナグランデ']];

function createValidator({ minLength = 2, officialLookup, extraLookup } = {}) {
  const official = officialLookup
    ? { lookup: officialLookup }
    : new OfficialDictionary({ loadChunk: async (first) => OFFICIAL.filter(([r]) => r.startsWith(first)) });
  const extra = extraLookup
    ? { lookup: extraLookup }
    : new ExtraDictionary({ load: async () => ({ entries: EXTRA }) });
  return new WordValidator({
    sources: [
      { name: 'official', dictionary: official },
      { name: 'extra', dictionary: extra },
    ],
    minLength,
  });
}

const P = (first, last) => ({ first, last });

// ---------- 通る ----------

test('公式辞書にあり条件に合えば有効（source: official、表記を返す）', async () => {
  const result = await createValidator().validate('こーひー', P('こ', 'ー'));
  assert.deepEqual(result, { ok: true, reading: 'こーひー', surface: 'コーヒー', source: 'official' });
});

test('カタカナ・半角カナ入力も読みに正規化して判定する', async () => {
  const v = createValidator();
  assert.equal((await v.validate('コーヒー', P('こ', 'ー'))).ok, true);
  assert.equal((await v.validate('ｺｰﾋｰ', P('こ', 'ー'))).ok, true);
  assert.equal((await v.validate('ｶﾞｯｺｳ', P('が', 'う'))).ok, true);
});

test('公式辞書になく追加辞書にあれば有効（source: extra）', async () => {
  const result = await createValidator().validate('アリアナグランデ', P('あ', 'で'));
  assert.deepEqual(result, { ok: true, reading: 'ありあなぐらんで', surface: 'アリアナグランデ', source: 'extra' });
});

test('出題しない文字（ゃ）で終わる言葉も、辞書にあり条件に合えば有効', async () => {
  const result = await createValidator().validate('かぼちゃ', P('か', 'ゃ'));
  assert.equal(result.ok, true);
});

test('「ん」で終わる言葉も有効', async () => {
  assert.equal((await createValidator().validate('みかん', P('み', 'ん'))).ok, true);
});

// ---------- ① 形式 ----------

test('空・空白だけは EMPTY', async () => {
  const v = createValidator();
  assert.equal((await v.validate('', P('あ', 'め'))).reason, REJECT_REASON.EMPTY);
  assert.equal((await v.validate('　 ', P('あ', 'め'))).reason, REJECT_REASON.EMPTY);
});

test('「〜」「－」「-」を長音に使うと LONG_VOWEL_LOOKALIKE', async () => {
  const v = createValidator();
  for (const input of ['コ〜ヒ〜', 'コ～ヒ～', 'コ－ヒ－', 'コ-ヒ-', 'こ―ひ―']) {
    assert.equal((await v.validate(input, P('こ', 'ー'))).reason, REJECT_REASON.LONG_VOWEL_LOOKALIKE, input);
  }
});

test('漢字・英数字・記号・途中の空白は INVALID_CHARS', async () => {
  const v = createValidator();
  for (const input of ['雨', 'あme', 'あめ1', 'あめ!', 'あ め']) {
    assert.equal((await v.validate(input, P('あ', 'め'))).reason, REJECT_REASON.INVALID_CHARS, input);
  }
});

test('最小文字数未満は TOO_SHORT', async () => {
  const result = await createValidator({ minLength: 2 }).validate('あ', P('あ', 'あ'));
  assert.equal(result.reason, REJECT_REASON.TOO_SHORT);
  assert.equal(result.minLength, 2);
});

test('形式チェックは辞書を引かない', async () => {
  let calls = 0;
  const lookup = async () => { calls += 1; return null; };
  const v = createValidator({ officialLookup: lookup, extraLookup: lookup });
  await v.validate('雨', P('あ', 'め'));
  await v.validate('あ', P('あ', 'あ'));
  assert.equal(calls, 0);
});

// ---------- ② 条件 ----------

test('最初の文字が違えば FIRST_MISMATCH', async () => {
  const result = await createValidator().validate('こーひー', P('か', 'ー'));
  assert.equal(result.reason, REJECT_REASON.FIRST_MISMATCH);
});

test('最後の文字が違えば LAST_MISMATCH（ー を別の文字とみなさない）', async () => {
  const v = createValidator();
  assert.equal((await v.validate('こーひー', P('こ', 'ひ'))).reason, REJECT_REASON.LAST_MISMATCH);
  assert.equal((await v.validate('こーひー', P('こ', 'い'))).reason, REJECT_REASON.LAST_MISMATCH);
});

test('濁点・半濁点は区別する', async () => {
  const v = createValidator();
  assert.equal((await v.validate('アリアナグランデ', P('あ', 'て'))).reason, REJECT_REASON.LAST_MISMATCH);
  assert.equal((await v.validate('パン', P('は', 'ん'))).reason, REJECT_REASON.FIRST_MISMATCH);
  assert.equal((await v.validate('パン', P('ば', 'ん'))).reason, REJECT_REASON.FIRST_MISMATCH);
  assert.equal((await v.validate('パン', P('ぱ', 'ん'))).ok, true);
});

test('条件に合わない言葉は辞書を引かない', async () => {
  let calls = 0;
  const lookup = async () => { calls += 1; return null; };
  const v = createValidator({ officialLookup: lookup, extraLookup: lookup });
  await v.validate('こーひー', P('か', 'ー'));
  assert.equal(calls, 0);
});

// ---------- ③④ 辞書 ----------

test('どちらの辞書にもなければ NOT_IN_DICTIONARY', async () => {
  const result = await createValidator().validate('あいうえお', P('あ', 'お'));
  assert.equal(result.reason, REJECT_REASON.NOT_IN_DICTIONARY);
  assert.equal(result.reading, 'あいうえお');
});

test('公式辞書で見つかれば追加辞書は引かない', async () => {
  let extraCalls = 0;
  const v = createValidator({ extraLookup: async () => { extraCalls += 1; return null; } });
  await v.validate('あめ', P('あ', 'め'));
  assert.equal(extraCalls, 0);
});

test('辞書の読み込みに失敗したら LOOKUP_FAILED（再送信できる）', async () => {
  const v = createValidator({ officialLookup: async () => { throw new Error('network'); } });
  const result = await v.validate('あめ', P('あ', 'め'));
  assert.equal(result.reason, REJECT_REASON.LOOKUP_FAILED);
  assert.equal(result.source, 'official');
});

// ---------- メッセージ ----------

test('すべての不合格理由に表示メッセージがある', () => {
  for (const reason of Object.values(REJECT_REASON)) {
    const message = rejectMessage({ reason, minLength: 2, prompt: P('あ', 'で') });
    assert.ok(message.length > 0, reason);
  }
});

test('メッセージにお題の文字・最小文字数が入る', () => {
  assert.equal(rejectMessage({ reason: REJECT_REASON.FIRST_MISMATCH, prompt: P('あ', 'で') }), '「あ」から始まる言葉ではありません');
  assert.equal(rejectMessage({ reason: REJECT_REASON.LAST_MISMATCH, prompt: P('あ', 'で') }), '「で」で終わる言葉ではありません');
  assert.equal(rejectMessage({ reason: REJECT_REASON.TOO_SHORT, minLength: 2 }), '2文字以上で入力してください');
});
