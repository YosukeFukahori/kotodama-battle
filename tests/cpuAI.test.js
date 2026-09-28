import { test, assert } from './harness.js';
import { planCpuAnswer, pickByLength } from '../src/cpu/cpuAI.js';

const LIMIT = 15000;
const W = (reading) => ({ reading, surface: reading });
const CANDIDATES = [W('あめ'), W('あいさつ'), W('あいすくりーむ'), W('あさがお'), W('あたま'), W('あひる')];

function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const cpu = (overrides = {}) => ({ answerTimeSec: [5, 9], lengthPreference: 'normal', timeoutRate: 0.1, ...overrides });

test('乱数が時間切れ率未満なら時間切れ', () => {
  assert.deepEqual(planCpuAnswer(cpu({ timeoutRate: 0.25 }), CANDIDATES, { timeLimitMs: LIMIT, random: seq(0.2) }), { status: 'timeout' });
});

test('時間切れでなければ、回答時間は設定範囲内（ミリ秒・整数）', () => {
  const low = planCpuAnswer(cpu(), CANDIDATES, { timeLimitMs: LIMIT, random: seq(0.5, 0, 0) });
  assert.equal(low.status, 'answered');
  assert.equal(low.timeMs, 5000);
  const high = planCpuAnswer(cpu(), CANDIDATES, { timeLimitMs: LIMIT, random: seq(0.5, 0.999, 0) });
  assert.ok(high.timeMs <= 9000 && high.timeMs >= 8990);
  assert.ok(Number.isInteger(high.timeMs));
});

test('回答時間は制限時間より前に収まる', () => {
  const plan = planCpuAnswer(cpu({ answerTimeSec: [14, 20] }), CANDIDATES, { timeLimitMs: LIMIT, random: seq(0.5, 0.99, 0) });
  assert.ok(plan.timeMs < LIMIT);
});

test('回答は候補の読み（判定はプレイヤーと同じ処理に通す）', () => {
  const plan = planCpuAnswer(cpu(), [W('あめ')], { timeLimitMs: LIMIT, random: seq(0.5) });
  assert.equal(plan.input, 'あめ');
});

test('候補がなければ時間切れ', () => {
  assert.deepEqual(planCpuAnswer(cpu({ timeoutRate: 0 }), [], { timeLimitMs: LIMIT }), { status: 'timeout' });
});

test('short は短いほう、long は長いほうから選ぶ', () => {
  for (let i = 0; i < 20; i += 1) {
    const short = pickByLength(CANDIDATES, 'short');
    const long = pickByLength(CANDIDATES, 'long');
    assert.ok(['あめ', 'あたま', 'あひる'].includes(short.reading), short.reading);
    assert.ok(['あいすくりーむ', 'あいさつ', 'あさがお'].includes(long.reading), long.reading);
  }
});

test('候補が1つなら好みに関係なくそれを選ぶ', () => {
  for (const pref of ['short', 'normal', 'long']) {
    assert.equal(pickByLength([W('あめ')], pref).reading, 'あめ');
  }
});
