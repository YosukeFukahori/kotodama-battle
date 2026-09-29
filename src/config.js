// ゲームバランスや動作に関わる定数はすべてここに集約する。
// 値の根拠は docs/SPEC.md、調整はシミュレーター（tools/sim/）で確認する。

export const CONFIG = Object.freeze({
  version: '0.1.0',

  battle: Object.freeze({
    timeLimitSec: 15,
    maxHp: 100,
    // この問題数だけ連続で、どちらからも有効な攻撃が発生しなかったら引き分け
    drawAfterNoAttackRounds: 3,
    // ラウンド進行の時間（ミリ秒）。ROUND → READY → FIGHT! → 回答受付 → 判定タイム → 次のラウンド
    // FIGHT! の開始と同時にお題表示・入力可・タイマー開始。判定タイムはスキップ不可
    timing: Object.freeze({
      roundLabelMs: 700,
      readyMs: 700,
      fightMs: 500,
      revealMs: 3000,
    }),
  }),

  effects: Object.freeze({
    // 判定タイムで、有効な回答の実際の文字数に応じて出す追加表示（minLength 以上。長い順に判定）
    longWord: Object.freeze([
      Object.freeze({ minLength: 16, text: '言霊炸裂!!', level: 3 }),
      Object.freeze({ minLength: 12, text: 'SUPER LONG!', level: 2 }),
      Object.freeze({ minLength: 8, text: 'LONG WORD!', level: 1 }),
    ]),
  }),

  prompt: Object.freeze({
    // お題にするのは、出題用プール内に候補がこの数以上ある「最初×最後の文字」の組み合わせだけ
    // （答えがほぼ1語しかないお題を避け、CPU が毎回同じ語を答えないようにするため）
    minCandidates: 2,
  }),

  word: Object.freeze({
    // 回答として認める最小の読みの文字数
    minLength: 2,
  }),

  damage: Object.freeze({
    base: 11,
    // 文字数補正 = lengthBase + n × lengthCoef + n² × lengthQuadCoef（n = ダメージ計算用文字数 - minLength）
    // 2次の項で、長い言葉ほど加速度的にダメージが増える
    minLength: 2,
    lengthBase: 0.71,
    lengthCoef: 0.12,
    lengthQuadCoef: 0.007,
    // MAX_DAMAGE_LENGTH：ダメージ計算に使う文字数の上限。
    // これより長い言葉も回答としては有効（表示も実際の文字数）。ダメージだけこの文字数で計算する
    maxDamageLength: 20,
    // 速度補正 = maxTimeMul - (回答時間 / 制限時間) × (maxTimeMul - minTimeMul)
    // 速さの影響は控えめ（即答でも短い言葉は大ダメージにならない）
    maxTimeMul: 1.30,
    minTimeMul: 0.90,
  }),

  storage: Object.freeze({
    key: 'kotodama.save',
    schemaVersion: 1,
    // 保存する直近の試合履歴の件数（モードごと）
    historyLimit: 30,
  }),
});
