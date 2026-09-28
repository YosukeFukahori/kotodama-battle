import { test, assert } from './harness.js';
import { calcDamage, lengthMultiplier, timeMultiplier } from '../src/core/damage.js';

const PARAMS = { base: 10, minLength: 2, lengthCoef: 0.15, maxTimeMul: 1.5, minTimeMul: 0.5 };
const LIMIT = 15000;

test('長さ補正：最小文字数で1、1文字増えるごとに +0.15', () => {
  assert.equal(lengthMultiplier(2, PARAMS), 1);
  assert.ok(Math.abs(lengthMultiplier(4, PARAMS) - 1.3) < 1e-9);
  assert.equal(lengthMultiplier(1, PARAMS), 1, '最小文字数未満でも1を下回らない');
});

test('時間補正：0秒で1.5、制限時間で0.5、半分で1.0', () => {
  assert.equal(timeMultiplier(0, LIMIT, PARAMS), 1.5);
  assert.equal(timeMultiplier(LIMIT, LIMIT, PARAMS), 0.5);
  assert.equal(timeMultiplier(LIMIT / 2, LIMIT, PARAMS), 1);
  assert.equal(timeMultiplier(LIMIT * 2, LIMIT, PARAMS), 0.5, '範囲外は制限時間扱い');
});

test('ダメージ：基本値 × 長さ補正 × 時間補正 を四捨五入', () => {
  // 10 × 1.3 × 1.0 = 13
  assert.equal(calcDamage({ length: 4, timeMs: 7500, timeLimitMs: LIMIT }, PARAMS), 13);
  // 10 × 1.0 × 1.5 = 15
  assert.equal(calcDamage({ length: 2, timeMs: 0, timeLimitMs: LIMIT }, PARAMS), 15);
  // 10 × 2.2 × 0.5 = 11
  assert.equal(calcDamage({ length: 10, timeMs: LIMIT, timeLimitMs: LIMIT }, PARAMS), 11);
});

test('ダメージ：長いほど・速いほど大きい', () => {
  const at = (length, timeMs) => calcDamage({ length, timeMs, timeLimitMs: LIMIT }, PARAMS);
  assert.ok(at(8, 5000) > at(4, 5000), '長いほど大きい');
  assert.ok(at(4, 2000) > at(4, 9000), '速いほど大きい');
});

test('ダメージは最低1', () => {
  const tiny = { ...PARAMS, base: 0.1 };
  assert.equal(calcDamage({ length: 2, timeMs: LIMIT, timeLimitMs: LIMIT }, tiny), 1);
});
