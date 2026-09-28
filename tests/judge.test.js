import { test, assert } from './harness.js';
import { judgeAnswer } from '../src/core/judge.js';
import { WordValidator, REJECT_REASON } from '../src/dictionary/wordValidator.js';

const dict = (entries) => ({
  lookup: async (reading) => {
    const hit = entries.find(([r]) => r === reading);
    return hit ? { reading: hit[0], surface: hit[1] ?? hit[0] } : null;
  },
});

const validator = new WordValidator({
  sources: [{ name: 'official', dictionary: dict([['こーひー', 'コーヒー']]) }],
  minLength: 2,
});
const PROMPT = { first: 'こ', last: 'ー' };

test('時間切れはそのまま時間切れ', async () => {
  assert.deepEqual(await judgeAnswer(validator, { status: 'timeout' }, PROMPT), { status: 'timeout' });
});

test('有効回答：表記・読み・文字数・回答時間を返す', async () => {
  const j = await judgeAnswer(validator, { status: 'answered', input: 'コーヒー', timeMs: 4210 }, PROMPT);
  assert.equal(j.valid, true);
  assert.equal(j.surface, 'コーヒー');
  assert.equal(j.reading, 'こーひー');
  assert.equal(j.length, 4);
  assert.equal(j.timeMs, 4210);
  assert.equal(j.rejection, null);
});

test('無効回答：入力そのものを表示し、理由を返す（再入力はない）', async () => {
  const j = await judgeAnswer(validator, { status: 'answered', input: ' こあら ', timeMs: 3000 }, PROMPT);
  assert.equal(j.valid, false);
  assert.equal(j.surface, 'こあら');
  assert.equal(j.length, 3);
  assert.equal(j.rejection.reason, REJECT_REASON.LAST_MISMATCH);
});

test('無効回答（使えない文字）も文字数を返す', async () => {
  const j = await judgeAnswer(validator, { status: 'answered', input: 'コ〜ヒ〜', timeMs: 3000 }, PROMPT);
  assert.equal(j.valid, false);
  assert.equal(j.rejection.reason, REJECT_REASON.LONG_VOWEL_LOOKALIKE);
  assert.equal(j.length, 4);
});
