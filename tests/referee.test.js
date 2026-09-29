import { test, assert } from './harness.js';
import { refereeRound, sanitizeAnswer } from '../src/match/referee.js';
import { createBattle } from '../src/core/battle.js';
import { WordValidator } from '../src/dictionary/wordValidator.js';

const LIMIT = 15000;
const PARAMS = { base: 10, minLength: 2, lengthBase: 1, lengthCoef: 0, lengthQuadCoef: 0, maxDamageLength: 20, maxTimeMul: 1, minTimeMul: 1 };

const validator = new WordValidator({
  sources: [{
    name: 'official',
    dictionary: { lookup: async (r) => (['あめ', 'あたため'].includes(r) ? { reading: r, surface: r } : null) },
  }],
  minLength: 2,
});
const PROMPT = { first: 'あ', last: 'め' };
const battle = (hp = { player: 100, opponent: 100 }) => ({ ...createBattle({ maxHp: 100, drawAfterNoAttackRounds: 3 }), hp });
const answered = (input, timeMs) => ({ status: 'answered', input, timeMs });

test('審判：判定 → 攻撃 → HP まで1回で行う', async () => {
  const r = await refereeRound({ validator, state: battle(), prompt: PROMPT, answers: { player: answered('あめ', 1000), opponent: answered('あいうえ', 2000) }, timeLimitMs: LIMIT, damageParams: PARAMS });
  assert.equal(r.judged.player.valid, true);
  assert.equal(r.judged.opponent.valid, false);
  assert.equal(r.resolution.order, 'single');
  assert.equal(r.state.hp.opponent, 90);
  assert.equal(r.state.hp.player, 100);
  assert.equal(r.finished, false);
});

test('審判：HP0 で決着（finished）', async () => {
  const r = await refereeRound({ validator, state: battle({ player: 100, opponent: 5 }), prompt: PROMPT, answers: { player: answered('アメ', 1000), opponent: { status: 'timeout' } }, timeLimitMs: LIMIT, damageParams: PARAMS });
  assert.equal(r.finished, true);
  assert.deepEqual(r.state.result, { outcome: 'player', reason: 'ko' });
});

test('審判：入力が同じなら結果も同じ（どこで動かしても同じ裁定になる）', async () => {
  const args = { validator, state: battle(), prompt: PROMPT, answers: { player: answered('あめ', 1200), opponent: answered('あたため', 3400) }, timeLimitMs: LIMIT, damageParams: PARAMS };
  const a = await refereeRound(args);
  const b = await refereeRound(args);
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.resolution.attacks, b.resolution.attacks);
});

test('申告の検査：正しい回答はそのまま（回答時間は整数に丸める）', () => {
  assert.deepEqual(sanitizeAnswer({ status: 'answered', input: 'あめ', timeMs: 1234.6 }, { timeLimitMs: LIMIT }), { status: 'answered', input: 'あめ', timeMs: 1235 });
});

test('申告の検査：不正な形式・制限時間以上は時間切れ', () => {
  const t = { status: 'timeout' };
  assert.deepEqual(sanitizeAnswer(null, { timeLimitMs: LIMIT }), t);
  assert.deepEqual(sanitizeAnswer({ status: 'answered', input: 3, timeMs: 10 }, { timeLimitMs: LIMIT }), t);
  assert.deepEqual(sanitizeAnswer({ status: 'answered', input: 'あめ', timeMs: 'x' }, { timeLimitMs: LIMIT }), t);
  assert.deepEqual(sanitizeAnswer({ status: 'answered', input: 'あめ', timeMs: LIMIT }, { timeLimitMs: LIMIT }), t);
});

test('申告の検査：負の回答時間は0、長すぎる入力は切り詰める', () => {
  assert.equal(sanitizeAnswer({ status: 'answered', input: 'あめ', timeMs: -50 }, { timeLimitMs: LIMIT }).timeMs, 0);
  assert.equal(sanitizeAnswer({ status: 'answered', input: 'あ'.repeat(500), timeMs: 10 }, { timeLimitMs: LIMIT }).input.length, 200);
});
