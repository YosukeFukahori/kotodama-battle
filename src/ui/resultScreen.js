import { findCpu } from '../cpu/enemies.js';
import { h, button } from './dom.js';
import { OUTCOME_LABEL, reasonText } from './labels.js';

export const resultScreen = {
  render({ navigate, params }) {
    const cpu = findCpu(params.cpuId);
    const outcome = OUTCOME_LABEL[params.outcome] ? params.outcome : 'draw';
    const reason = reasonText(outcome, params.reason);

    return h('section', { class: 'screen screen--result' },
      h('div', { class: `result result--${outcome}` },
        h('h1', { class: 'result__label' }, OUTCOME_LABEL[outcome]),
        reason && h('p', { class: 'result__reason' }, reason),
        cpu && h('p', { class: 'result__vs' }, `vs CPU：${cpu.label}${params.rounds ? `・${params.rounds}問目で決着` : ''}`),
        h('p', { class: 'note' }, 'CPU戦のため、レートは変動しません。'),
      ),
      h('nav', { class: 'menu', 'aria-label': '次の操作' },
        cpu && button('もう一度', () => navigate('battle', { cpuId: cpu.id })),
        button('難易度を選び直す', () => navigate('select'), { variant: 'secondary' }),
        button('戦績を見る', () => navigate('record'), { variant: 'ghost' }),
        button('タイトルへ', () => navigate('title'), { variant: 'ghost' }),
      ),
    );
  },
};
