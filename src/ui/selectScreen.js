import { CPU_LIST } from '../cpu/enemies.js';
import { h, button } from './dom.js';

export const selectScreen = {
  render({ navigate }) {
    const items = CPU_LIST.map((cpu) =>
      h('li', {},
        h('button', {
          type: 'button',
          class: `cpu-card cpu-card--${cpu.id}`,
          onClick: () => navigate('battle', { cpuId: cpu.id }),
        },
          h('span', { class: 'cpu-card__label' }, cpu.label),
          h('span', { class: 'cpu-card__desc' }, cpu.description),
        ),
      ),
    );

    return h('section', { class: 'screen screen--select' },
      h('header', { class: 'screen-header' },
        h('h1', {}, '難易度を選ぶ'),
        h('p', { class: 'note' }, 'CPU戦は練習モードです。レートは変動しません。'),
      ),
      h('ul', { class: 'cpu-list' }, items),
      h('div', { class: 'screen-footer' },
        button('もどる', () => navigate('title'), { variant: 'ghost' }),
      ),
    );
  },
};
