import { test, assert } from './harness.js';
import { calcDamage, damageLength, lengthMultiplier, timeMultiplier } from '../src/core/damage.js';
import { CONFIG } from '../src/config.js';

const PARAMS = { base: 10, minLength: 2, lengthCoef: 0.15, maxDamageLength: 20, maxTimeMul: 1.5, minTimeMul: 0.5 };
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

// ---------- ダメージ計算用文字数の上限（MAX_DAMAGE_LENGTH） ----------

test('config の MAX_DAMAGE_LENGTH は20', () => {
  assert.equal(CONFIG.damage.maxDamageLength, 20);
});

test('ダメージ計算用文字数：20文字までは実際の文字数、超えたら20', () => {
  assert.equal(damageLength(8, PARAMS), 8);
  assert.equal(damageLength(15, PARAMS), 15);
  assert.equal(damageLength(20, PARAMS), 20);
  assert.equal(damageLength(25, PARAMS), 20);
  assert.equal(damageLength(50, PARAMS), 20);
});

test('20文字を超えるとダメージは20文字のときと同じ', () => {
  const at = (length) => calcDamage({ length, timeMs: 7500, timeLimitMs: LIMIT }, PARAMS);
  assert.equal(at(20), 37); // 10 × (1 + 18 × 0.15) × 1.0 = 37
  assert.equal(at(25), at(20));
  assert.equal(at(50), at(20));
  assert.equal(at(129), at(20));
  assert.ok(at(19) < at(20), '20文字までは長いほど大きい');
});

test('上限は config で変更できる', () => {
  const p10 = { ...PARAMS, maxDamageLength: 10 };
  assert.equal(damageLength(15, p10), 10);
  assert.equal(
    calcDamage({ length: 15, timeMs: 7500, timeLimitMs: LIMIT }, p10),
    calcDamage({ length: 10, timeMs: 7500, timeLimitMs: LIMIT }, p10),
  );
});

// ---------- 採用中の式（config.js）：長い言葉ほど加速度的に増える ----------

test('採用中の式：文字数・秒数ごとのダメージ（SPEC §3.4 の表と一致）', () => {
  const d = (length, sec) => calcDamage({ length, timeMs: sec * 1000, timeLimitMs: LIMIT });
  assert.equal(d(2, 1), 10);
  assert.equal(d(3, 1), 12);
  assert.equal(d(5, 5), 15);
  assert.equal(d(8, 8), 20);
  assert.equal(d(10, 10), 24);
  assert.equal(d(15, 12), 37);
  assert.equal(d(20, 13), 54);
});

test('採用中の式：2〜3文字を1秒前後で答えても 10〜12 ダメージ程度', () => {
  for (const length of [2, 3]) {
    for (const sec of [0.5, 1, 1.5]) {
      const dmg = calcDamage({ length, timeMs: sec * 1000, timeLimitMs: LIMIT });
      assert.ok(dmg >= 10 && dmg <= 12, `${length}文字 ${sec}秒 → ${dmg}`);
    }
  }
});

test('採用中の式：1文字増えるごとの増え幅が大きくなる（加速度的）', () => {
  let prevGain = -Infinity;
  for (let length = 3; length <= 20; length += 1) {
    const gain = lengthMultiplier(length) - lengthMultiplier(length - 1);
    assert.ok(gain > prevGain, `${length}文字で増え幅が減った`);
    prevGain = gain;
  }
});

test('採用中の式：速さより長さの影響が大きい（同じ時間なら長いほうが、即答の短い言葉より強い）', () => {
  const quickShort = calcDamage({ length: 3, timeMs: 1000, timeLimitMs: LIMIT });
  const slowLong = calcDamage({ length: 10, timeMs: 12000, timeLimitMs: LIMIT });
  assert.ok(slowLong >= quickShort * 1.8, `即答3文字 ${quickShort} / 12秒10文字 ${slowLong}`);
});

test('採用中の式：20文字を超えても20文字分で計算', () => {
  const d = (length) => calcDamage({ length, timeMs: 13000, timeLimitMs: LIMIT });
  assert.equal(d(25), d(20));
  assert.equal(d(60), d(20));
});
