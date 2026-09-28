import { findCpu } from '../cpu/enemies.js';
import { h, button } from './dom.js';

const OUTCOME_LABEL = {
  win: '勝利',
  lose: '敗北',
  draw: '引き分け',
};

function reasonText(outcome, reason) {
  switch (reason) {
    case 'ko': return outcome === 'win' ? '相手のHPを0にした！' : 'HPが0になった…';
    case 'double-ko': return '相打ち（両者のHPが同時に0）';
    case 'no-attack': return '3問連続でどちらも攻撃できなかった';
    case 'forfeit': return '途中でやめたため敗北';
    default: return '';
  }
}

export const resultScreen = {
  render({ navigate, params }) {
    const cpu = findCpu(params.cpuId);
    const outcome = OUTCOME_LABEL[params.outcome] ? params.outcome : 'draw';
    const reason = reasonText(outcome, params.reason);

    return h('section', { class: 'screen screen--result' },
      h('div', { class: `result result--${outcome}` },
        h('h1', { class: 'result__label' }, OUTCOME_LABEL[outcome]),
        reason && h('p', { class: 'result__reason' }, reason),
        cpu && h('p', { class: 'result__vs' }, `vs CPU：${cpu.label}${params.rounds ? `・${params.rounds}問` : ''}`),
        h('p', { class: 'note' }, 'CPU戦のため、レートは変動しません。'),
      ),
      h('nav', { class: 'menu', 'aria-label': '次の操作' },
        cpu && button('もう一度', () => navigate('battle', { cpuId: cpu.id })),
        button('難易度を選び直す', () => navigate('select'), { variant: 'secondary' }),
        button('タイトルへ', () => navigate('title'), { variant: 'ghost' }),
      ),
    );
  },
};
