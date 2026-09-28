import { CONFIG } from '../config.js';
import { h, button } from './dom.js';

export const titleScreen = {
  render({ navigate, params }) {
    return h('section', { class: 'screen screen--title' },
      h('div', { class: 'title-hero' },
        h('h1', { class: 'title-logo' }, '言霊バトル'),
        h('p', { class: 'title-tagline' }, '長く、速く。言葉で打ち倒せ。'),
      ),
      params.notice && h('p', { class: 'notice', role: 'status' }, params.notice),
      h('nav', { class: 'menu', 'aria-label': 'メインメニュー' },
        button('バトル', () => navigate('select')),
        button('戦績', () => navigate('record'), { variant: 'secondary' }),
      ),
      h('p', { class: 'version' }, `Ver.${CONFIG.version}`,
        h('br'),
        '辞書データ：',
        h('a', { href: 'THIRD_PARTY_LICENSES.md', target: '_blank', rel: 'noopener' }, 'SudachiDict（Apache License 2.0）'),
      ),
    );
  },
};
