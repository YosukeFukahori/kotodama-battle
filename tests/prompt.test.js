import { test, assert } from './harness.js';
import { PromptPool } from '../src/core/prompt.js';
import { isPromptFirstChar, isPromptLastChar } from '../src/core/kana.js';

function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('お題はプールの単語の最初・最後の文字から作られる', () => {
  const pool = new PromptPool([['こーひー', 'コーヒー']]);
  assert.deepEqual(pool.next(), { first: 'こ', last: 'ー' });
});

test('出題できない文字を含む単語はお題の元にしない', () => {
  const pool = new PromptPool([
    ['かぼちゃ'],   // 最後が「ゃ」
    ['んじゃめな'], // 最初が「ん」
    ['ーあ'],       // 最初が「ー」
    ['みかん'],     // OK（最後の「ん」は出題可）
  ]);
  assert.equal(pool.size, 1);
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(pool.next(), { first: 'み', last: 'ん' });
  }
});

test('出題できない単語も CPU の回答候補には残る', () => {
  const pool = new PromptPool([['かぼちゃ'], ['みかん']]);
  assert.equal(pool.candidates({ first: 'か', last: 'ゃ' }).length, 1);
});

test('お題に合う候補を返す（同じ組み合わせの単語をまとめる）', () => {
  const pool = new PromptPool([['あめ', '雨'], ['あさがお', '朝顔'], ['あたま', '頭'], ['あいすくりーむ']]);
  const c = pool.candidates({ first: 'あ', last: 'め' });
  assert.deepEqual(c.map((e) => e.surface), ['雨']);
  assert.deepEqual(pool.candidates({ first: 'ぬ', last: 'ま' }), []);
});

test('直前と同じお題は、他の組み合わせがある限り続けて出さない', () => {
  const pool = new PromptPool([['あめ'], ['いぬ']]);
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(pool.next({ avoid: { first: 'あ', last: 'め' }, random: Math.random }), { first: 'い', last: 'ぬ' });
  }
});

test('組み合わせが1つしかなければ同じお題でも出す', () => {
  const pool = new PromptPool([['あめ']]);
  assert.deepEqual(pool.next({ avoid: { first: 'あ', last: 'め' } }), { first: 'あ', last: 'め' });
});

test('random で選ぶ単語が決まる', () => {
  const pool = new PromptPool([['あめ'], ['いぬ'], ['うみ']]);
  assert.deepEqual(pool.next({ random: seq(0) }), { first: 'あ', last: 'め' });
  assert.deepEqual(pool.next({ random: seq(0.99) }), { first: 'う', last: 'み' });
});

test('同じ読みの重複は1つにまとめる', () => {
  const pool = new PromptPool([['あめ', '雨'], ['あめ', '飴']]);
  assert.equal(pool.size, 1);
  assert.equal(pool.candidates({ first: 'あ', last: 'め' }).length, 1);
});

test('出題できる単語がなければ例外', () => {
  const pool = new PromptPool([['かぼちゃ']]);
  let threw = false;
  try { pool.next(); } catch { threw = true; }
  assert.ok(threw);
});

test('出題されるお題の文字は必ず出題可能文字', () => {
  const pool = new PromptPool([['あめ'], ['かぼちゃ'], ['らーめん'], ['すきー'], ['ちょうちょ']]);
  for (let i = 0; i < 50; i += 1) {
    const p = pool.next();
    assert.ok(isPromptFirstChar(p.first), p.first);
    assert.ok(isPromptLastChar(p.last), p.last);
  }
});
