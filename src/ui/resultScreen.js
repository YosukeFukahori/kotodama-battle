import { findCpu } from '../cpu/enemies.js';
import { h, button } from './dom.js';

const OUTCOME_LABEL = {
  win: '勝利',
  lose: '敗北',
  draw: '引き分け',
};

export const resultScreen = {
  render({ navigate, params }) {
    const cpu = findCpu(params.cpuId);
    const outcome = OUTCOME_LABEL[params.outcome] ? params.outcome : 'draw';

    return h('section', { class: 'screen screen--result' },
      h('div', { class: `result result--${outcome}` },
        h('h1', { class: 'result__label' }, OUTCOME_LABEL[outcome]),
        cpu && h('p', { class: 'result__vs' }, `vs CPU：${cpu.label}`),
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
