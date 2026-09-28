// 画面で共通に使う表示文言。

export const OUTCOME_LABEL = Object.freeze({
  win: '勝利',
  lose: '敗北',
  draw: '引き分け',
});

/** 決着理由の説明（結果画面用）。 */
export function reasonText(outcome, reason) {
  switch (reason) {
    case 'ko': return outcome === 'win' ? '相手のHPを0にした！' : 'HPが0になった…';
    case 'double-ko': return '相打ち（両者のHPが同時に0）';
    case 'no-attack': return '3問連続でどちらも攻撃できなかった';
    case 'forfeit': return '途中でやめたため敗北';
    case 'abandon': return '途中で離脱したため敗北';
    default: return '';
  }
}

/** 決着理由の短い表記（履歴一覧用）。 */
export function reasonShort(reason) {
  switch (reason) {
    case 'ko': return 'KO';
    case 'double-ko': return '相打ち';
    case 'no-attack': return '無攻撃';
    case 'forfeit': return 'やめた';
    case 'abandon': return '離脱';
    default: return '';
  }
}
