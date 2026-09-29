import { test, assert } from './harness.js';
import { longWordCallout } from '../src/core/effects.js';

test('長い言葉の演出：8文字以上 LONG WORD! / 12文字以上 SUPER LONG! / 16文字以上 言霊炸裂!!', () => {
  assert.equal(longWordCallout(7), null);
  assert.equal(longWordCallout(8).text, 'LONG WORD!');
  assert.equal(longWordCallout(11).text, 'LONG WORD!');
  assert.equal(longWordCallout(12).text, 'SUPER LONG!');
  assert.equal(longWordCallout(15).text, 'SUPER LONG!');
  assert.equal(longWordCallout(16).text, '言霊炸裂!!');
  assert.equal(longWordCallout(40).text, '言霊炸裂!!');
});

test('閾値と文言は設定で変えられる（順番に依存しない）', () => {
  const tiers = [{ minLength: 5, text: 'A', level: 1 }, { minLength: 10, text: 'B', level: 2 }];
  assert.equal(longWordCallout(4, tiers), null);
  assert.equal(longWordCallout(6, tiers).text, 'A');
  assert.equal(longWordCallout(10, tiers).text, 'B');
});
