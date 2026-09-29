import { test, assert } from './harness.js';
import { scheduleRound, nextRoundAt, delayFight } from '../src/core/roundSchedule.js';
import { CONFIG } from '../src/config.js';

const TIMING = { roundLabelMs: 700, readyMs: 700, fightMs: 500, revealMs: 3000 };
const LIMIT = 15000;

test('config の演出時間（ROUND 0.7秒・READY 0.7秒・FIGHT 0.5秒・判定 3秒）', () => {
  assert.deepEqual({ ...CONFIG.battle.timing }, TIMING);
});

test('時刻表：ROUND → READY → FIGHT! → 締め切り', () => {
  const s = scheduleRound(1000, TIMING, LIMIT);
  assert.equal(s.roundAt, 1000);
  assert.equal(s.readyAt, 1700);
  assert.equal(s.fightAt, 2400);
  assert.equal(s.fightEndAt, 2900);
  assert.equal(s.deadlineAt, 2400 + LIMIT, '15秒タイマーは FIGHT! の時刻から始まる');
});

test('同じ開始時刻なら誰が計算しても同じ時刻表になる（対人戦で両者を揃えるため）', () => {
  assert.deepEqual(scheduleRound(5000, TIMING, LIMIT), scheduleRound(5000, TIMING, LIMIT));
});

test('判定タイムの表示が終わる時刻（次のラウンドへ進む時刻）', () => {
  assert.equal(nextRoundAt(10000, TIMING), 13000);
});

test('準備が間に合わなかったら FIGHT 以降だけを遅らせる', () => {
  const s = scheduleRound(0, TIMING, LIMIT);
  const late = delayFight(s, 3000, LIMIT, TIMING);
  assert.equal(late.readyAt, 700);
  assert.equal(late.fightAt, 3000);
  assert.equal(late.fightEndAt, 3500);
  assert.equal(late.deadlineAt, 3000 + LIMIT);
  assert.equal(delayFight(s, 1000, LIMIT, TIMING), s, '間に合っていればそのまま');
});
