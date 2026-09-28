import { test, assert } from './harness.js';
import { createBattle, resolveRound, forfeit } from '../src/core/battle.js';

const LIMIT = 15000;
// ダメージ = 10 × 長さ補正 × 時間補正。length 2・timeMs 7500 なら 10 × 1 × 1 = 10
const PARAMS = { base: 10, minLength: 2, lengthCoef: 0.15, maxTimeMul: 1.5, minTimeMul: 0.5 };
const opts = { timeLimitMs: LIMIT, damageParams: PARAMS };

const valid = (timeMs, length = 2) => ({ status: 'answered', valid: true, timeMs, length });
const invalid = (timeMs, length = 2) => ({ status: 'answered', valid: false, timeMs, length });
const timeout = () => ({ status: 'timeout' });

function battleWith(hp = { player: 100, opponent: 100 }, extra = {}) {
  return { ...createBattle({ maxHp: 100, drawAfterNoAttackRounds: 3 }), hp, ...extra };
}

// ---------- 攻撃順 ----------

test('両者有効：回答時間が短い側が先攻、その後に後攻も攻撃', () => {
  const r = resolveRound(battleWith(), { player: valid(3000), opponent: valid(7500) }, opts);
  assert.equal(r.order, 'sequential');
  assert.deepEqual(r.attacks.map((a) => a.attacker), ['player', 'opponent']);
  assert.equal(r.skipped, null);
  assert.equal(r.state.hp.opponent, 100 - 13); // 10 × 1 × 1.3
  assert.equal(r.state.hp.player, 100 - 10);
  assert.equal(r.state.result, null);
});

test('両者有効：CPU のほうが速ければ CPU が先攻', () => {
  const r = resolveRound(battleWith(), { player: valid(9000), opponent: valid(4000) }, opts);
  assert.deepEqual(r.attacks.map((a) => a.attacker), ['opponent', 'player']);
});

test('先攻の攻撃で相手HPが0なら後攻の攻撃はなし（決着）', () => {
  const r = resolveRound(battleWith({ player: 5, opponent: 5 }), { player: valid(3000), opponent: valid(4000) }, opts);
  assert.equal(r.attacks.length, 1);
  assert.equal(r.attacks[0].attacker, 'player');
  assert.equal(r.skipped, 'opponent');
  assert.equal(r.state.hp.player, 5, '後攻の攻撃は発生しない');
  assert.deepEqual(r.state.result, { outcome: 'player', reason: 'ko' });
});

test('先攻の攻撃後も相手HPが残れば後攻が攻撃し、それで決着することもある', () => {
  const r = resolveRound(battleWith({ player: 5, opponent: 100 }), { player: valid(3000), opponent: valid(4000) }, opts);
  assert.equal(r.attacks.length, 2);
  assert.equal(r.state.hp.player, 0);
  assert.deepEqual(r.state.result, { outcome: 'opponent', reason: 'ko' });
});

// ---------- 同時攻撃 ----------

test('回答時間が完全に同じなら同時攻撃（両者のダメージを適用）', () => {
  const r = resolveRound(battleWith(), { player: valid(7500), opponent: valid(7500, 4) }, opts);
  assert.equal(r.order, 'simultaneous');
  assert.equal(r.attacks.length, 2);
  assert.equal(r.state.hp.opponent, 90);
  assert.equal(r.state.hp.player, 87);
  assert.equal(r.state.result, null, '両方HPが残れば次のお題');
});

test('同時攻撃で両方HP0なら引き分け', () => {
  const r = resolveRound(battleWith({ player: 5, opponent: 5 }), { player: valid(7500), opponent: valid(7500) }, opts);
  assert.equal(r.state.hp.player, 0);
  assert.equal(r.state.hp.opponent, 0);
  assert.deepEqual(r.state.result, { outcome: 'draw', reason: 'double-ko' });
});

test('同時攻撃で片方だけHP0なら生き残った側の勝ち', () => {
  const r = resolveRound(battleWith({ player: 50, opponent: 5 }), { player: valid(7500), opponent: valid(7500) }, opts);
  assert.equal(r.skipped, null, '同時攻撃では攻撃がスキップされない');
  assert.equal(r.state.hp.player, 40);
  assert.deepEqual(r.state.result, { outcome: 'player', reason: 'ko' });
});

// ---------- 片方だけ有効 ----------

test('片方だけ有効なら、有効な側だけ攻撃（相手は無効）', () => {
  const r = resolveRound(battleWith(), { player: invalid(1000), opponent: valid(9000) }, opts);
  assert.equal(r.order, 'single');
  assert.deepEqual(r.attacks.map((a) => a.attacker), ['opponent']);
  assert.equal(r.state.hp.player, 100 - 9); // 10 × 1 × 0.9 = 9
  assert.equal(r.state.hp.opponent, 100);
});

test('片方だけ有効なら、有効な側だけ攻撃（相手は時間切れ）', () => {
  const r = resolveRound(battleWith(), { player: valid(7500), opponent: timeout() }, opts);
  assert.deepEqual(r.attacks.map((a) => a.attacker), ['player']);
});

test('無効回答は速くても攻撃しない', () => {
  const r = resolveRound(battleWith(), { player: invalid(100, 10), opponent: timeout() }, opts);
  assert.equal(r.attacks.length, 0);
});

// ---------- 無攻撃 ----------

test('両方時間切れ・両方無効・片方無効＋片方時間切れ は、いずれも無攻撃', () => {
  for (const answers of [
    { player: timeout(), opponent: timeout() },
    { player: invalid(1000), opponent: invalid(2000) },
    { player: invalid(1000), opponent: timeout() },
    { player: timeout(), opponent: invalid(2000) },
  ]) {
    const r = resolveRound(battleWith(), answers, opts);
    assert.equal(r.order, 'none');
    assert.equal(r.attacks.length, 0);
    assert.equal(r.state.noAttackStreak, 1);
    assert.equal(r.state.result, null);
  }
});

test('3問連続で無攻撃なら引き分け（種類が混ざっていても数える）', () => {
  let state = battleWith();
  state = resolveRound(state, { player: timeout(), opponent: timeout() }, opts).state;
  state = resolveRound(state, { player: invalid(1000), opponent: invalid(2000) }, opts).state;
  assert.equal(state.result, null);
  state = resolveRound(state, { player: invalid(1000), opponent: timeout() }, opts).state;
  assert.equal(state.noAttackStreak, 3);
  assert.deepEqual(state.result, { outcome: 'draw', reason: 'no-attack' });
});

test('攻撃が発生したら無攻撃カウントは0に戻る', () => {
  let state = battleWith();
  state = resolveRound(state, { player: timeout(), opponent: timeout() }, opts).state;
  state = resolveRound(state, { player: timeout(), opponent: timeout() }, opts).state;
  state = resolveRound(state, { player: valid(5000), opponent: timeout() }, opts).state;
  assert.equal(state.noAttackStreak, 0);
  state = resolveRound(state, { player: timeout(), opponent: timeout() }, opts).state;
  state = resolveRound(state, { player: timeout(), opponent: timeout() }, opts).state;
  assert.equal(state.result, null);
});

// ---------- その他 ----------

test('問題数が数えられ、元の状態は変更されない', () => {
  const before = battleWith();
  const r = resolveRound(before, { player: valid(3000), opponent: valid(4000) }, opts);
  assert.equal(r.state.round, 1);
  assert.equal(before.round, 0);
  assert.equal(before.hp.opponent, 100);
});

test('決着後は resolveRound できない', () => {
  const done = battleWith({ player: 100, opponent: 0 }, { result: { outcome: 'player', reason: 'ko' } });
  let threw = false;
  try { resolveRound(done, { player: timeout(), opponent: timeout() }, opts); } catch { threw = true; }
  assert.ok(threw);
});

test('やめた側の負けになる（forfeit）', () => {
  const state = forfeit(battleWith(), 'player');
  assert.deepEqual(state.result, { outcome: 'opponent', reason: 'forfeit' });
});
