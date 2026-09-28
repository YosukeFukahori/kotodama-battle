import { test, assert } from './harness.js';
import { toWordEntry, toEntryMap } from '../src/dictionary/wordEntry.js';
import { OfficialDictionary, createSeedChunkLoader } from '../src/dictionary/officialDictionary.js';
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

function chunkLoaderFrom(entries, calls = []) {
  return async (first) => {
    calls.push(first);
    return entries.filter(([reading]) => reading.startsWith(first));
  };
}

test('公式辞書：読みで引ける／ないものは null', async () => {
  const dict = new OfficialDictionary({ loadChunk: chunkLoaderFrom([['こーひー', 'コーヒー'], ['りんご']]) });
  assert.deepEqual(await dict.lookup('こーひー'), { reading: 'こーひー', surface: 'コーヒー' });
  assert.equal(await dict.lookup('こあら'), null);
  assert.equal(await dict.lookup(''), null);
});

test('公式辞書：チャンクは最初の文字ごとに1回だけ読み込む', async () => {
  const calls = [];
  const dict = new OfficialDictionary({ loadChunk: chunkLoaderFrom([['りんご'], ['りす'], ['ごりら']], calls) });
  await dict.lookup('りんご');
  await dict.lookup('りす');
  await dict.lookup('りぼん');
  await dict.lookup('ごりら');
  assert.deepEqual(calls, ['り', 'ご']);
});

test('公式辞書：読み込みに失敗したチャンクは次回また読み込む', async () => {
  let attempt = 0;
  const dict = new OfficialDictionary({
    loadChunk: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network');
      return [['りんご']];
    },
  });
  let failed = false;
  try { await dict.lookup('りんご'); } catch { failed = true; }
  assert.ok(failed, '1回目は失敗する');
  assert.deepEqual(await dict.lookup('りんご'), { reading: 'りんご', surface: 'りんご' });
});

test('仮辞書ローダー：1ファイルを1回だけ読み、最初の文字で振り分ける', async () => {
  let loads = 0;
  const loader = createSeedChunkLoader(async () => {
    loads += 1;
    return { entries: [['りんご'], ['りす'], ['ごりら']] };
  });
  assert.deepEqual(await loader('り'), [['りんご'], ['りす']]);
  assert.deepEqual(await loader('ご'), [['ごりら']]);
  assert.deepEqual(await loader('あ'), []);
  assert.equal(loads, 1);
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
