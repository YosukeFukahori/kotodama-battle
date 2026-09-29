// ラウンドの時刻表（docs/SPEC.md §3.7）。DOM・タイマーに依存しない。
//
// 各段階の開始時刻を「ラウンド開始時刻 ＋ 設定時間」で決める。
// CPU戦では端末の時計（performance.now()）で開始時刻を決めるが、
// 将来の対人戦ではサーバーが決めた開始時刻を両プレイヤーに配り、同じ時刻表で進める。

/**
 * @param {number} startAt ラウンド開始時刻（ミリ秒）
 * @param {{ roundLabelMs: number, readyMs: number, fightMs: number }} timing
 * @param {number} timeLimitMs 回答の制限時間
 * @returns {{ roundAt: number, readyAt: number, fightAt: number, fightEndAt: number, deadlineAt: number }}
 *   fightAt：お題表示・入力可・タイマー開始の時刻、deadlineAt：回答の締め切り
 */
export function scheduleRound(startAt, timing, timeLimitMs) {
  const roundAt = startAt;
  const readyAt = roundAt + timing.roundLabelMs;
  const fightAt = readyAt + timing.readyMs;
  return Object.freeze({
    roundAt,
    readyAt,
    fightAt,
    fightEndAt: fightAt + timing.fightMs,
    deadlineAt: fightAt + timeLimitMs,
  });
}

/**
 * 判定タイムの表示が終わり、次のラウンド（または結果画面）へ進む時刻。
 * @param {number} revealAt 判定結果を表示した時刻
 */
export function nextRoundAt(revealAt, timing) {
  return revealAt + timing.revealMs;
}

/**
 * 回答受付の開始が遅れた場合（辞書の読み込み待ちなど）に、FIGHT 以降の時刻をずらした時刻表を返す。
 * 対人戦では両者の準備完了をサーバーが待ってから開始時刻を配るので、この調整は CPU 戦のみ。
 */
export function delayFight(schedule, fightAt, timeLimitMs, timing) {
  if (fightAt <= schedule.fightAt) return schedule;
  return Object.freeze({
    ...schedule,
    fightAt,
    fightEndAt: fightAt + timing.fightMs,
    deadlineAt: fightAt + timeLimitMs,
  });
}
