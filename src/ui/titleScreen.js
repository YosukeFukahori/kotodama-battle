import { CONFIG } from '../config.js';
import { h, button } from './dom.js';

export const titleScreen = {
  render({ navigate }) {
    return h('section', { class: 'screen screen--title' },
      h('div', { class: 'title-hero' },
        h('h1', { class: 'title-logo' }, '言霊バトル'),
        h('p', { class: 'title-tagline' }, '長く、速く。言葉で打ち倒せ。'),
      ),
      h('nav', { class: 'menu', 'aria-label': 'メインメニュー' },
        button('バトル', () => navigate('select')),
        button('戦績', () => navigate('record'), { variant: 'secondary' }),
      ),
      h('p', { class: 'version' }, `Ver.${CONFIG.version}`),
    );
  },
};
