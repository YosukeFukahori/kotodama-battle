// CPUの定義。強さは回答時間・選ぶ単語の文字数・時間切れ率だけで調整する（docs/SPEC.md §4）。
// 回答時間 ＝ 考える時間（thinkSec：平均・ばらつき・下限）＋ typingSecPerChar × 文字数
// 文字数は wordLength（平均・ばらつき）から狙う文字数を引き、出題用プールの候補から最も近い語を選ぶ。
// timeoutRate はわざと答えない確率。考える時間が長すぎて制限時間を過ぎた場合も時間切れになる。

export const CPU_LIST = Object.freeze([
  Object.freeze({
    id: 'easy',
    label: 'かんたん',
    description: 'ゆっくり答える。短い言葉が多い。',
    thinkSec: Object.freeze({ mean: 6.0, sd: 2.0, min: 2.5 }),
    typingSecPerChar: 0.5,
    wordLength: Object.freeze({ mean: 3, sd: 0.8 }),
    timeoutRate: 0.12,
  }),
  Object.freeze({
    id: 'normal',
    label: 'ふつう',
    description: 'ほどよい速さ。長さもほどほど。',
    thinkSec: Object.freeze({ mean: 5.0, sd: 1.6, min: 2.0 }),
    typingSecPerChar: 0.4,
    wordLength: Object.freeze({ mean: 4.5, sd: 1.2 }),
    timeoutRate: 0.1,
  }),
  Object.freeze({
    id: 'hard',
    label: 'むずかしい',
    description: '素早く、やや長めの言葉で攻めてくる。',
    thinkSec: Object.freeze({ mean: 4.2, sd: 1.2, min: 1.8 }),
    typingSecPerChar: 0.35,
    wordLength: Object.freeze({ mean: 6, sd: 1.5 }),
    timeoutRate: 0.06,
  }),
]);

export function findCpu(id) {
  return CPU_LIST.find((cpu) => cpu.id === id) ?? null;
}
