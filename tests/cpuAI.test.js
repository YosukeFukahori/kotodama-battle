import { test, assert } from './harness.js';
import { planCpuAnswer, pickWord } from '../src/cpu/cpuAI.js';
import { CPU_LIST } from '../src/cpu/enemies.js';
import { readingLength } from '../src/core/kana.js';

const LIMIT = 15000;
const W = (reading) => ({ reading, surface: reading });
const CANDIDATES = [W('あめ'), W('あたま'), W('あいさつ'), W('あさがお'), W('あいすくりーむ'), W('あきたけん')];

function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// 決定的な疑似乱数（テスト用）
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const cpu = (overrides = {}) => ({
  thinkSec: { mean: 5, sd: 1.5, min: 2 },
  typingSecPerChar: 0.4,
  wordLength: { mean: 4, sd: 1 },
  timeoutRate: 0.1,
  ...overrides,
});

test('乱数が時間切れ率未満なら時間切れ', () => {
  assert.deepEqual(planCpuAnswer(cpu({ timeoutRate: 0.25 }), CANDIDATES, { timeLimitMs: LIMIT, random: seq(0.2) }), { status: 'timeout' });
});

test('候補がなければ時間切れ', () => {
  assert.deepEqual(planCpuAnswer(cpu({ timeoutRate: 0 }), [], { timeLimitMs: LIMIT }), { status: 'timeout' });
});

test('回答時間 ＝ 考える時間 ＋ 1文字あたりの入力時間 × 文字数（ミリ秒・整数）', () => {
  const random = seeded(7);
  for (let i = 0; i < 200; i += 1) {
    const plan = planCpuAnswer(cpu({ timeoutRate: 0 }), CANDIDATES, { timeLimitMs: LIMIT, random });
    if (plan.status !== 'answered') continue;
    const minMs = (2 + 0.4 * readingLength(plan.input)) * 1000;
    assert.ok(plan.timeMs >= minMs - 1, `考える時間の下限を下回らない：${plan.timeMs}`);
    assert.ok(plan.timeMs < LIMIT);
    assert.ok(Number.isInteger(plan.timeMs));
  }
});

test('回答時間は毎回ばらつく（機械的に同じ秒数にならない）', () => {
  const random = seeded(3);
  const times = new Set();
  for (let i = 0; i < 50; i += 1) {
    const plan = planCpuAnswer(cpu({ timeoutRate: 0 }), [W('あめ')], { timeLimitMs: LIMIT, random });
    if (plan.status === 'answered') times.add(Math.round(plan.timeMs / 100));
  }
  assert.ok(times.size >= 15, `ばらつきが小さい（${times.size}種類）`);
});

test('考えすぎて制限時間を過ぎたら時間切れ', () => {
  const slow = cpu({ timeoutRate: 0, thinkSec: { mean: 30, sd: 0.1, min: 20 } });
  assert.deepEqual(planCpuAnswer(slow, CANDIDATES, { timeLimitMs: LIMIT, random: seeded(1) }), { status: 'timeout' });
});

test('回答は候補の読み（判定はプレイヤーと同じ処理に通す）', () => {
  const plan = planCpuAnswer(cpu({ timeoutRate: 0 }), [W('あめ')], { timeLimitMs: LIMIT, random: seeded(2) });
  assert.equal(plan.input, 'あめ');
});

test('狙う文字数に近い語を選ぶ（短め・長めの分布）', () => {
  const random = seeded(11);
  const avg = (wordLength) => {
    let sum = 0;
    for (let i = 0; i < 300; i += 1) sum += readingLength(pickWord(CANDIDATES, wordLength, { random }).reading);
    return sum / 300;
  };
  const short = avg({ mean: 2.5, sd: 0.8 });
  const long = avg({ mean: 6.5, sd: 1 });
  assert.ok(short < 3.5, `短め：${short}`);
  assert.ok(long > 5, `長め：${long}`);
});

test('毎回最長語を選ぶわけではない', () => {
  const random = seeded(5);
  const picked = new Set();
  for (let i = 0; i < 100; i += 1) picked.add(pickWord(CANDIDATES, { mean: 6, sd: 1.5 }, { random }).reading);
  assert.ok(picked.size >= 3, [...picked].join(','));
});

test('同じバトルで使った語は、他に候補がある限り選ばない', () => {
  const avoid = new Set(['あめ', 'あたま']);
  const random = seeded(9);
  for (let i = 0; i < 50; i += 1) {
    const w = pickWord([W('あめ'), W('あたま'), W('あいさつ')], { mean: 2, sd: 0.5 }, { random, avoid });
    assert.equal(w.reading, 'あいさつ');
  }
  // 全部使っていたら、その中から選ぶ
  assert.ok(['あめ'].includes(pickWord([W('あめ')], { mean: 2, sd: 0.5 }, { random, avoid }).reading));
});

test('難易度が上がるほど速く・長く・時間切れが少ない設定になっている', () => {
  const [easy, normal, hard] = CPU_LIST;
  assert.ok(easy.thinkSec.mean > normal.thinkSec.mean && normal.thinkSec.mean > hard.thinkSec.mean);
  assert.ok(easy.wordLength.mean < normal.wordLength.mean && normal.wordLength.mean < hard.wordLength.mean);
  assert.ok(easy.timeoutRate > normal.timeoutRate && normal.timeoutRate > hard.timeoutRate);
});
