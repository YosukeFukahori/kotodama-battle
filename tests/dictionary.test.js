import { test, assert } from './harness.js';
import { toWordEntry, toEntryMap } from '../src/dictionary/wordEntry.js';
import { OfficialDictionary, chunkFileName } from '../src/dictionary/officialDictionary.js';
import { memoryOfficial } from './fakes.js';
import { ExtraDictionary } from '../src/dictionary/extraDictionary.js';

// ---------- wordEntry ----------

test('[読み, 表記] を { reading, surface } にする', () => {
  assert.deepEqual(toWordEntry(['こーひー', 'コーヒー']), { reading: 'こーひー', surface: 'コーヒー' });
});

test('表記を省略すると読みが表記になる', () => {
  assert.deepEqual(toWordEntry(['りんご']), { reading: 'りんご', surface: 'りんご' });
});

test('同じ読みが複数あれば先のものを採用する', () => {
  const map = toEntryMap([['はし', '橋'], ['はし', '箸']]);
  assert.equal(map.size, 1);
  assert.equal(map.get('はし').surface, '橋');
});

// ---------- OfficialDictionary ----------

test('公式辞書：読みで引ける／ないものは null', async () => {
  const dict = memoryOfficial([['こーひー', 'コーヒー'], ['りんご']]);
  assert.deepEqual(await dict.lookup('こーひー'), { reading: 'こーひー', surface: 'コーヒー' });
  assert.equal(await dict.lookup('こあら'), null);
  assert.equal(await dict.lookup(''), null);
});

test('公式辞書：「最初の文字×最後の文字」ごとに1回だけ読み込む', async () => {
  const calls = [];
  const dict = memoryOfficial([['りんご'], ['りす'], ['りぼん'], ['ごりら']], calls);
  await dict.lookup('りんご');
  await dict.lookup('りぼん');
  await dict.lookup('りす');
  await dict.lookup('ごりら');
  await dict.lookup('りす');
  assert.deepEqual(calls, ['り|ご', 'り|ん', 'り|す', 'ご|ら']);
});

test('公式辞書：目次に単語がない組み合わせは読みに行かない', async () => {
  const calls = [];
  const dict = memoryOfficial([['りんご']], calls);
  assert.equal(await dict.lookup('りくらす'), null);
  assert.equal(await dict.count({ first: 'り', last: 'す' }), 0);
  assert.equal(await dict.count({ first: 'り', last: 'ご' }), 1);
  assert.deepEqual(calls, []);
});

test('公式辞書：preload で読み込んだ組み合わせは lookup で再利用する', async () => {
  const calls = [];
  const dict = memoryOfficial([['あめ', '雨']], calls);
  await dict.preload({ first: 'あ', last: 'め' });
  assert.equal((await dict.lookup('あめ')).surface, '雨');
  assert.deepEqual(calls, ['あ|め']);
});

test('公式辞書：読み込みに失敗したファイル・目次は次回また読み込む', async () => {
  let indexAttempt = 0;
  let chunkAttempt = 0;
  const dict = new OfficialDictionary({
    loadIndex: async () => {
      indexAttempt += 1;
      if (indexAttempt === 1) throw new Error('network');
      return { counts: { り: { ご: 1 } } };
    },
    loadChunk: async () => {
      chunkAttempt += 1;
      if (chunkAttempt === 1) throw new Error('network');
      return [['りんご']];
    },
  });
  for (let i = 0; i < 2; i += 1) {
    let failed = false;
    try { await dict.lookup('りんご'); } catch { failed = true; }
    assert.ok(failed, `${i + 1}回目は失敗する`);
  }
  assert.deepEqual(await dict.lookup('りんご'), { reading: 'りんご', surface: 'りんご' });
});

test('公式辞書：ファイル名は最初・最後の文字のコードポイント（build_dictionary.py と同じ規則）', () => {
  assert.equal(chunkFileName('あ', 'で'), '3042-3067.json');
  assert.equal(chunkFileName('こ', 'ー'), '3053-30FC.json');
});

// ---------- ExtraDictionary ----------

test('追加辞書：読みで引ける／ないものは null', async () => {
  let loads = 0;
  const dict = new ExtraDictionary({
    load: async () => {
      loads += 1;
      return { entries: [['ありあなぐらんで', 'アリアナグランデ']] };
    },
  });
  assert.equal((await dict.lookup('ありあなぐらんで')).surface, 'アリアナグランデ');
  assert.equal(await dict.lookup('りんご'), null);
  assert.equal(loads, 1);
});
