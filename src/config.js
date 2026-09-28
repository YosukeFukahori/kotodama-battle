// ゲームバランスや動作に関わる定数はすべてここに集約する。
// 値はすべて仮。バランス確認で調整する（docs/SPEC.md 参照）。

export const CONFIG = Object.freeze({
  version: '0.1.0',

  battle: Object.freeze({
    timeLimitSec: 15,
    maxHp: 100,
    // この問題数だけ連続で、どちらからも有効な攻撃が発生しなかったら引き分け
    drawAfterNoAttackRounds: 3,
  }),

  word: Object.freeze({
    // 回答として認める最小の読みの文字数
    minLength: 2,
  }),

  damage: Object.freeze({
    base: 10,
    // 長さ補正 = 1 + (読みの文字数 - minLength) × lengthCoef
    minLength: 2,
    lengthCoef: 0.15,
    // 時間補正 = maxTimeMul - (回答時間 / 制限時間) × (maxTimeMul - minTimeMul)
    maxTimeMul: 1.5,
    minTimeMul: 0.5,
  }),

  storage: Object.freeze({
    key: 'kotodama.save',
    schemaVersion: 1,
    // 保存する直近の試合履歴の件数（モードごと）
    historyLimit: 30,
  }),
});
