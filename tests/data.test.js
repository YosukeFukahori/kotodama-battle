// 辞書・プールのデータファイルの整合性チェック。データを編集したら必ず通すこと。

import { test, assert } from './harness.js';
import { loadJson } from './loadJson.js';
import { normalizeReading, isReading, readingLength } from '../src/core/kana.js';
import { PromptPool } from '../src/core/prompt.js';
import { CONFIG } from '../src/config.js';

const OFFICIAL = 'data/official-seed.json';
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

for (const path of [OFFICIAL, EXTRA, POOL]) {
  test(`データ整合性：${path}`, async () => {
    checkEntries(path, await loadJson(path));
  });
}

test('データ整合性：追加辞書は公式辞書と重複しない', async () => {
  const official = checkEntries(OFFICIAL, await loadJson(OFFICIAL));
  const extra = checkEntries(EXTRA, await loadJson(EXTRA));
  for (const reading of extra) {
    assert.ok(!official.has(reading), `${reading} は公式辞書にもある（追加辞書から削除すること）`);
  }
});

test('データ整合性：出題用プールの単語はすべて公式辞書か追加辞書にある', async () => {
  const official = checkEntries(OFFICIAL, await loadJson(OFFICIAL));
  const extra = checkEntries(EXTRA, await loadJson(EXTRA));
  const pool = checkEntries(POOL, await loadJson(POOL));
  for (const reading of pool) {
    assert.ok(official.has(reading) || extra.has(reading), `${reading} が辞書にない（CPU の回答が無効になる）`);
  }
});

test('データ整合性：出題用プールから十分な種類のお題が作れる', async () => {
  const pool = new PromptPool((await loadJson(POOL)).entries);
  const keys = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const p = pool.next();
    keys.add(`${p.first}|${p.last}`);
  }
  assert.ok(pool.size >= 100, `お題の元にできる単語が少なすぎる（${pool.size}）`);
  assert.ok(keys.size >= 100, `お題の種類が少なすぎる（${keys.size}）`);
});
