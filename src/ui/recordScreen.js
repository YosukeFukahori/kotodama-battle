import { h, button } from './dom.js';

// 実装順序1：表示枠のみ。保存・読み込みは実装順序5で storage.js と接続する。

function statRow(label, value) {
  return h('div', { class: 'stat' },
    h('dt', { class: 'stat__label' }, label),
    h('dd', { class: 'stat__value' }, value),
  );
}

export const recordScreen = {
  render({ navigate }) {
    return h('section', { class: 'screen screen--record' },
      h('header', { class: 'screen-header' },
        h('h1', {}, '戦績'),
      ),
      h('section', { class: 'panel' },
        h('h2', { class: 'panel__title' }, 'CPU戦'),
        h('dl', { class: 'stats' },
          statRow('勝ち', '—'),
          statRow('負け', '—'),
          statRow('引き分け', '—'),
        ),
        h('p', { class: 'note' }, 'CPU戦は練習モードです。レートには影響しません。'),
      ),
      h('section', { class: 'panel panel--muted' },
        h('h2', { class: 'panel__title' }, 'ランダムマッチ'),
        h('p', { class: 'note' }, '今後実装予定です。対人レーティングはここでのみ変動します。'),
      ),
      h('div', { class: 'screen-footer' },
        button('もどる', () => navigate('title'), { variant: 'ghost' }),
      ),
    );
  },
};
