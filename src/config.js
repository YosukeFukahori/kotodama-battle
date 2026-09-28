// ゲームバランスや動作に関わる定数はすべてここに集約する。
// 値はすべて仮。バランス確認で調整する（docs/SPEC.md 参照）。

export const CONFIG = Object.freeze({
  version: '0.1.0',

  battle: Object.freeze({
    timeLimitSec: 15,
    maxHp: 100,
    // 両者時間切れがこの回数連続したら引き分け
    drawAfterDoubleTimeouts: 3,
  }),

  damage: Object.freeze({
    base: 10,
    // 長さ補正 = 1 + (読みの文字数 - minLength) × lengthCoef
    minLength: 2,
    lengthCoef: 0.15,
    // 時間補正 = maxTimeMul - (回答秒数 / 制限時間) × (maxTimeMul - minTimeMul)
    maxTimeMul: 1.5,
    minTimeMul: 0.5,
  }),

  storage: Object.freeze({
    key: 'kotodama.save',
    schemaVersion: 1,
  }),
});
