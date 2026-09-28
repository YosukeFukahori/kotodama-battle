// 辞書・プールのデータファイルの整合性チェック。データを編集・再生成したら必ず通すこと。

import { test, assert } from './harness.js';
import { loadJson } from './loadJson.js';
import { normalizeReading, isReading, readingLength, firstChar, lastChar } from '../src/core/kana.js';
import { PromptPool } from '../src/core/prompt.js';
import { chunkFileName } from '../src/dictionary/officialDictionary.js';
import { CONFIG } from '../src/config.js';

const INDEX = 'data/official/index.json';
const EXTRA = 'data/extra-words.json';
const POOL = 'data/prompt-pool.json';

function checkEntries(path, data) {
  assert.ok(Array.isArray(data.entries), `${path}: entries が配列でない`);
  const seen = new Set();
  for (const raw of data.entries) {
    const label = `${path}: ${JSON.stringify(raw)}`;
    assert.ok(Array.isArray(raw) && (raw.length === 1 || raw.length === 2), `${label} の形式が不正`);
    const [reading, surface] = raw;
    assert.ok(isReading(reading), `${label} の読みがひらがな・ー以外を含む`);
    assert.equal(normalizeReading(reading), reading, `${label} の読みが正規化されていない`);
    assert.ok(readingLength(reading) >= CONFIG.word.minLength, `${label} の読みが短すぎる`);
    if (raw.length === 2) {
      assert.ok(typeof surface === 'string' && surface.length > 0, `${label} の表記が空`);
      assert.ok(surface !== reading, `${label} の表記が読みと同じ（省略すること）`);
    }
    assert.ok(!seen.has(reading), `${label} の読みが重複`);
    seen.add(reading);
  }
  return seen;
}

const chunkCache = new Map();
async function officialChunk(first, last) {
  const key = `${first}|${last}`;
  if (!chunkCache.has(key)) {
    const index = await loadJson(INDEX);
    const count = index.counts?.[first]?.[last] ?? 0;
    const data = count > 0 ? await loadJson(`data/official/${chunkFileName(first, last)}`) : { first, last, entries: [] };
    chunkCache.set(key, { count, data });
  }
  return chunkCache.get(key);
}

async function inOfficial(reading) {
  const { data } = await officialChunk(firstChar(reading), lastChar(reading));
  return data.entries.some(([r]) => r === reading);
}

test('データ整合性：公式辞書の目次（出典・ライセンス・語数）', async () => {
  const index = await loadJson(INDEX);
  assert.equal(index.source.name, 'SudachiDict');
  assert.equal(index.source.license, 'Apache-2.0');
  let sum = 0;
  for (const [first, lasts] of Object.entries(index.counts)) {
    assert.ok(isReading(first) && first.length === 1, `目次の最初の文字が不正：${first}`);
    for (const [last, n] of Object.entries(lasts)) {
      assert.ok(isReading(last) && last.length === 1, `目次の最後の文字が不正：${last}`);
      assert.ok(Number.isInteger(n) && n > 0, `目次の語数が不正：${first}→${last}`);
      sum += n;
    }
  }
  assert.equal(sum, index.total, '目次の語数の合計が total と一致しない');
  assert.ok(index.total >= 100000, `公式辞書の語数が少なすぎる（${index.total}）`);
  assert.ok(index.maxReadingLength < 130, `読みが130文字以上の語がある（最長 ${index.maxReadingLength} 文字）`);
});

test('データ整合性：公式辞書のファイル（出題用プールのお題の分）', async () => {
  const pool = (await loadJson(POOL)).entries;
  const pairs = new Set(pool.map(([r]) => `${firstChar(r)}|${lastChar(r)}`));
  for (const key of pairs) {
    const [first, last] = key.split('|');
    const { count, data } = await officialChunk(first, last);
    if (count === 0) continue;
    const path = chunkFileName(first, last);
    checkEntries(path, data);
    assert.equal(data.entries.length, count, `${path} の語数が目次と一致しない`);
    for (const [r] of data.entries) {
      assert.ok(firstChar(r) === first && lastChar(r) === last, `${path} に別のお題の単語がある：${r}`);
      assert.ok(readingLength(r) < 130, `${path} に読みが130文字以上の語がある：${r}`);
    }
  }
});

for (const path of [EXTRA, POOL]) {
  test(`データ整合性：${path}`, async () => {
    checkEntries(path, await loadJson(path));
  });
}

test('データ整合性：追加辞書は公式辞書と重複しない', async () => {
  const extra = checkEntries(EXTRA, await loadJson(EXTRA));
  for (const reading of extra) {
    assert.ok(!(await inOfficial(reading)), `${reading} は公式辞書にもある（追加辞書から削除すること）`);
  }
});

test('データ整合性：出題用プールの単語はすべて公式辞書か追加辞書にある', async () => {
  const extra = checkEntries(EXTRA, await loadJson(EXTRA));
  const pool = checkEntries(POOL, await loadJson(POOL));
  for (const reading of pool) {
    assert.ok(extra.has(reading) || (await inOfficial(reading)), `${reading} が辞書にない（CPU の回答が無効になる）`);
  }
});

test('データ整合性：出題用プールから十分な種類のお題が作れる（候補2語以上の組み合わせのみ）', async () => {
  const pool = new PromptPool((await loadJson(POOL)).entries, { minCandidates: CONFIG.prompt.minCandidates });
  assert.ok(pool.size >= 200, `お題の種類が少なすぎる（${pool.size}）`);
  for (const p of pool.prompts) {
    assert.ok(pool.candidates(p).length >= CONFIG.prompt.minCandidates, `${p.first}→${p.last} の候補が少ない`);
  }
});

test('データ整合性：どのお題にも公式辞書に答えが20語以上ある（極端に難しいお題を出さない）', async () => {
  const index = await loadJson(INDEX);
  const pool = new PromptPool((await loadJson(POOL)).entries, { minCandidates: CONFIG.prompt.minCandidates });
  for (const p of pool.prompts) {
    const n = index.counts?.[p.first]?.[p.last] ?? 0;
    assert.ok(n >= 20, `${p.first}→${p.last} の答えが公式辞書に ${n} 語しかない`);
  }
});

test('データ整合性：公式辞書の代表表記は出題用プールの表記と一致する（プール変更後は辞書を再生成すること）', async () => {
  const pool = (await loadJson(POOL)).entries;
  for (const raw of pool) {
    const [reading, surface = reading] = raw;
    const { data } = await officialChunk(firstChar(reading), lastChar(reading));
    const hit = data.entries.find(([r]) => r === reading);
    if (!hit) continue; // 追加辞書の語
    const officialSurface = hit[1] ?? hit[0];
    assert.equal(officialSurface, surface, `${reading}：公式辞書「${officialSurface}」とプール「${surface}」が違う。python3 tools/build_dictionary.py で再生成する`);
  }
});
