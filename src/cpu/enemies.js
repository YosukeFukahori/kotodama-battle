// CPUの定義。強さは回答時間・選ぶ単語の文字数・時間切れ率だけで調整する（docs/SPEC.md §4）。
// 回答時間 ＝ 考える時間（thinkSec：平均・ばらつき・下限）＋ typingSecPerChar × 文字数
// 文字数は wordLength（平均・ばらつき）から狙う文字数を引き、出題用プールの候補から最も近い語を選ぶ。
// timeoutRate はわざと答えない確率。考える時間が長すぎて制限時間を過ぎた場合も時間切れになる。

export const CPU_LIST = Object.freeze([
  Object.freeze({
    id: 'easy',
    label: 'かんたん',
    description: 'ゆっくり答える。短い言葉が多い。',
    thinkSec: Object.freeze({ mean: 5.5, sd: 1.8, min: 2.0 }),
    typingSecPerChar: 0.45,
    wordLength: Object.freeze({ mean: 3.5, sd: 1.0 }),
    timeoutRate: 0.10,
  }),
  Object.freeze({
    id: 'normal',
    label: 'ふつう',
    description: 'ほどよい速さ。長さもほどほど。',
    thinkSec: Object.freeze({ mean: 4.4, sd: 1.2, min: 1.5 }),
    typingSecPerChar: 0.35,
    wordLength: Object.freeze({ mean: 6, sd: 1.5 }),
    timeoutRate: 0.06,
  }),
  Object.freeze({
    id: 'hard',
    label: 'むずかしい',
    description: '素早く、できるだけ長い言葉で攻めてくる。',
    thinkSec: Object.freeze({ mean: 2.4, sd: 0.7, min: 0.9 }),
    typingSecPerChar: 0.24,
    wordLength: Object.freeze({ mean: 8.5, sd: 1.5 }),
    timeoutRate: 0.03,
  }),
]);

export function findCpu(id) {
  return CPU_LIST.find((cpu) => cpu.id === id) ?? null;
}
