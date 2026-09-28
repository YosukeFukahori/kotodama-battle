// CPUの定義。強さは回答時間・選ぶ単語の長さ・時間切れ率だけで調整する。
// 値はすべて仮（docs/SPEC.md §4）。

export const CPU_LIST = Object.freeze([
  Object.freeze({
    id: 'easy',
    label: 'かんたん',
    description: 'ゆっくり答える。短い言葉が多い。',
    answerTimeSec: [8, 13],
    lengthPreference: 'short',
    timeoutRate: 0.25,
  }),
  Object.freeze({
    id: 'normal',
    label: 'ふつう',
    description: 'ほどよい速さ。長さもほどほど。',
    answerTimeSec: [5, 9],
    lengthPreference: 'normal',
    timeoutRate: 0.1,
  }),
  Object.freeze({
    id: 'hard',
    label: 'むずかしい',
    description: '素早く長い言葉で攻めてくる。',
    answerTimeSec: [3, 6],
    lengthPreference: 'long',
    timeoutRate: 0.03,
  }),
]);

export function findCpu(id) {
  return CPU_LIST.find((cpu) => cpu.id === id) ?? null;
}
